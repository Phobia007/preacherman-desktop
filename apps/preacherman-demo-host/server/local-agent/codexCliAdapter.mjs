import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access as fsAccess, realpath as fsRealpath, stat as fsStat } from "node:fs/promises";
import path from "node:path";

const AUTH_STATUSES = new Set(["ready", "login-required", "unknown", "error"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const SAFE_ENV_KEYS = new Set([
  "APPDATA", "CODEX_HOME", "HOME", "HTTPS_PROXY", "HTTP_PROXY", "LANG", "LC_ALL", "LOCALAPPDATA",
  "NO_PROXY", "PATH", "PATHEXT", "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMROOT", "TEMP", "TERM", "TMP",
  "USERPROFILE", "WINDIR",
]);
const DEFAULT_LIMITS = Object.freeze({
  maxEvents: 1_000,
  maxLineBytes: 128 * 1024,
  maxStderrBytes: 64 * 1024,
  maxStdoutBytes: 2 * 1024 * 1024,
  maxTextBytes: 16 * 1024,
});

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function redact(text, maxBytes = 4_096) {
  const source = String(text ?? "")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/gi, "[REDACTED]")
    .replace(/((?:api[_-]?key|authorization|bearer|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
  return Buffer.byteLength(source, "utf8") <= maxBytes ? source : `${Buffer.from(source).subarray(0, maxBytes).toString("utf8")}…`;
}

function safeEnvironment(source) {
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (SAFE_ENV_KEYS.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  }
  return env;
}

function isWithin(root, target, platform = process.platform) {
  const normalize = (value) => platform === "win32" ? value.toLowerCase() : value;
  const relative = path.relative(normalize(root), normalize(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function validateWorkspace(workspace, allowedRoots, { realpathImpl, statImpl, platform }) {
  if (typeof workspace !== "string" || !workspace.trim()) throw codedError("LOCAL_AGENT_INVALID_WORKSPACE", "A workspace is required.");
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    throw codedError("LOCAL_AGENT_WORKSPACE_NOT_ALLOWED", "No trusted workspace roots are configured.");
  }
  let resolved;
  try {
    resolved = await realpathImpl(workspace);
    const info = await statImpl(resolved);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    throw codedError("LOCAL_AGENT_INVALID_WORKSPACE", "The selected workspace does not exist or is not a directory.");
  }
  const roots = await Promise.all(allowedRoots.map(async (root) => {
    try {
      return await realpathImpl(root);
    } catch {
      return null;
    }
  }));
  if (!roots.some((root) => root && isWithin(root, resolved, platform))) {
    throw codedError("LOCAL_AGENT_WORKSPACE_NOT_ALLOWED", "The selected workspace is outside the trusted roots.");
  }
  return resolved;
}

function collectProcess(child, { maxBytes = 32 * 1024, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let totalBytes = 0;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const onData = (target) => (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        child.kill("SIGTERM");
        finish(reject, codedError("LOCAL_AGENT_PROBE_LIMIT", "Local agent probe exceeded its output limit."));
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout?.on("data", onData("stdout"));
    child.stderr?.on("data", onData("stderr"));
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code, signal) => finish(resolve, { code, signal, stdout, stderr }));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(reject, codedError("LOCAL_AGENT_PROBE_TIMEOUT", "Local agent probe timed out."));
    }, timeoutMs);
    timer.unref?.();
  });
}

function parseVersion(text) {
  return /(?:codex(?:-cli)?\s+)?v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/i.exec(text)?.[1] ?? null;
}

function selectDiscoveredExecutable(output, platform) {
  const candidates = String(output ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (platform !== "win32") return candidates[0] ?? null;
  // Avoid npm .cmd/.ps1 wrappers: Local Runner must never require a shell.
  return candidates.find((candidate) => /\.(?:exe|com)$/i.test(candidate) && !/\\WindowsApps\\/i.test(candidate))
    ?? candidates.find((candidate) => /\.(?:exe|com)$/i.test(candidate))
    ?? null;
}

async function npmCodexExecutable(envSource, platform) {
  if (platform !== "win32") return null;
  const appData = envSource?.APPDATA;
  if (typeof appData !== "string" || !appData.trim()) return null;
  const candidate = path.join(appData, "npm", "node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
  try {
    await fsAccess(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function safeWorkspacePath(candidate, workspace, platform) {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  const absolute = path.isAbsolute(candidate) ? path.normalize(candidate) : path.resolve(workspace, candidate);
  if (!isWithin(workspace, absolute, platform)) return null;
  return path.relative(workspace, absolute) || ".";
}

function mapCodexEvent(payload, workspace, platform, maxTextBytes) {
  const externalType = typeof payload?.type === "string" ? payload.type : "unknown";
  if (externalType === "thread.started") {
    return { type: "session", externalRunId: typeof payload.thread_id === "string" ? payload.thread_id : null };
  }
  if (externalType === "turn.started") return { type: "progress", phase: "turn-started" };
  if (externalType === "turn.completed") return { type: "progress", phase: "turn-completed" };
  if (externalType === "turn.failed" || externalType === "error") {
    return { type: "error", message: redact(payload.message ?? payload.error?.message ?? "Codex reported an execution error.", maxTextBytes) };
  }
  if (["item.started", "item.updated", "item.completed"].includes(externalType) && payload.item && typeof payload.item === "object") {
    const item = payload.item;
    if (item.type === "agent_message") {
      return { type: "message", phase: externalType.slice(5), text: redact(item.text ?? item.content ?? "", maxTextBytes) };
    }
    if (item.type === "reasoning") {
      return { type: "reasoning", phase: externalType.slice(5), text: redact(item.text ?? item.content ?? "", maxTextBytes) };
    }
    if (item.type === "command_execution") {
      return {
        type: "action",
        action: "command",
        phase: externalType.slice(5),
        command: redact(String(item.command ?? "").split(/\s+/)[0] || "command", 256),
        status: typeof item.status === "string" ? item.status : null,
        exitCode: Number.isInteger(item.exit_code) ? item.exit_code : null,
      };
    }
    if (item.type === "file_change") {
      const rawChanges = Array.isArray(item.changes) ? item.changes : [];
      const files = rawChanges
        .map((change) => safeWorkspacePath(change?.path, workspace, platform))
        .filter(Boolean)
        .slice(0, 100);
      return { type: "action", action: "file-change", phase: externalType.slice(5), files, omittedUnsafePaths: rawChanges.length - files.length };
    }
    if (item.type === "mcp_tool_call") {
      return { type: "action", action: "mcp-tool", phase: externalType.slice(5), tool: redact(item.tool ?? item.name ?? "unknown", 256), status: item.status ?? null };
    }
  }
  return { type: "generic", externalType };
}

export function createCodexCliAdapter({
  allowedWorkspaceRoots,
  envSource = process.env,
  limits = {},
  now = () => new Date().toISOString(),
  platform = process.platform,
  probeTimeoutMs = 10_000,
  runTimeoutMs = 2 * 60 * 60 * 1_000,
  killGraceMs = 2_000,
  realpathImpl = fsRealpath,
  spawnImpl = nodeSpawn,
  statImpl = fsStat,
  whichImpl = async (name) => {
    const command = process.platform === "win32" ? "where.exe" : "which";
    const result = await collectProcess(nodeSpawn(command, [name], { env: safeEnvironment(process.env), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
    if (result.code !== 0) return null;
    return selectDiscoveredExecutable(result.stdout, process.platform);
  },
} = {}) {
  const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };
  const runs = new Map();
  let closed = false;

  async function detect() {
    let executable;
    try {
      executable = await whichImpl("codex");
    } catch (error) {
      return { installed: false, version: null, executable: null, error: redact(errorMessage(error)) };
    }
    if (typeof executable !== "string" || !executable.trim()) return { installed: false, version: null, executable: null };
    const candidates = [executable];
    const npmExecutable = await npmCodexExecutable(envSource, platform);
    if (npmExecutable && !candidates.some((candidate) => candidate?.toLowerCase() === npmExecutable.toLowerCase())) candidates.push(npmExecutable);
    let lastError;
    for (const candidate of candidates) try {
      const result = await collectProcess(spawnImpl(candidate, ["--version"], {
        env: safeEnvironment(envSource), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      }), { timeoutMs: probeTimeoutMs });
      if (result.code === 0) return { installed: true, version: parseVersion(result.stdout), executable: candidate };
      lastError = "Codex version probe failed.";
    } catch (error) {
      lastError = redact(errorMessage(error));
    }
    return { installed: false, version: null, executable: null, error: lastError };
  }

  async function authStatus() {
    const detection = await detect();
    if (!detection.installed) return { status: "unknown", reason: "not-installed" };
    try {
      const result = await collectProcess(spawnImpl(detection.executable, ["login", "status"], {
        env: safeEnvironment(envSource), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      }), { timeoutMs: probeTimeoutMs });
      const output = `${result.stdout}\n${result.stderr}`;
      if (result.code === 0 && /logged in|authenticated/i.test(output)) return { status: "ready", reason: "cli-authenticated" };
      if (/not logged in|login required|please log in|unauthenticated/i.test(output)) return { status: "login-required", reason: "cli-login-required" };
      return { status: result.code === 0 ? "unknown" : "error", reason: result.code === 0 ? "unrecognized-status" : "probe-failed" };
    } catch (error) {
      return { status: "error", reason: redact(errorMessage(error)) };
    }
  }

  function capabilities() {
    return {
      progress: true,
      cancel: true,
      resume: false,
      steer: false,
      approval: false,
      artifacts: true,
      workspaceWrite: true,
    };
  }

  function appendEvent(run, event) {
    const normalized = { cursor: ++run.cursor, at: now(), ...event };
    run.events.push(normalized);
    if (run.events.length > effectiveLimits.maxEvents) {
      run.events.shift();
      run.droppedEventCount += 1;
    }
  }

  function terminate(run, reason) {
    if (!run.child || TERMINAL_STATUSES.has(run.status)) return;
    run.terminationReason = reason;
    run.child.kill("SIGTERM");
    run.killTimer = setTimeout(() => {
      if (!TERMINAL_STATUSES.has(run.status)) run.child.kill("SIGKILL");
    }, killGraceMs);
    run.killTimer.unref?.();
  }

  function failForLimit(run, message) {
    if (run.terminationReason) return;
    run.failure = { code: "output-limit", message };
    appendEvent(run, { type: "error", code: "output-limit", message });
    terminate(run, "output-limit");
  }

  function attachRunStreams(run) {
    let stdoutBuffer = "";
    function parseLine(line) {
      if (!line.trim()) return;
      if (Buffer.byteLength(line, "utf8") > effectiveLimits.maxLineBytes) {
        failForLimit(run, "Codex emitted an overlong JSONL line.");
        return;
      }
      try {
        const mapped = mapCodexEvent(JSON.parse(line), run.workspace, platform, effectiveLimits.maxTextBytes);
        if (mapped.externalRunId) run.externalRunId = mapped.externalRunId;
        if (mapped.type === "message" && mapped.phase === "completed") run.summary = mapped.text;
        if (mapped.type === "error") run.protocolFailed = true;
        if (mapped.type === "generic") run.unknownEventCount += 1;
        appendEvent(run, mapped);
      } catch {
        run.malformedEventCount += 1;
        appendEvent(run, { type: "parser-warning", code: "invalid-jsonl" });
      }
    }
    run.child.stdout?.on("data", (chunk) => {
      run.stdoutBytes += chunk.length;
      if (run.stdoutBytes > effectiveLimits.maxStdoutBytes) {
        failForLimit(run, "Codex stdout exceeded the configured limit.");
        return;
      }
      stdoutBuffer += chunk.toString("utf8");
      if (Buffer.byteLength(stdoutBuffer, "utf8") > effectiveLimits.maxLineBytes && !stdoutBuffer.includes("\n")) {
        failForLimit(run, "Codex emitted an overlong JSONL line.");
        return;
      }
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) parseLine(line);
    });
    run.flushStdout = () => {
      if (stdoutBuffer) parseLine(stdoutBuffer);
      stdoutBuffer = "";
    };
    run.child.stderr?.on("data", (chunk) => {
      run.stderrBytes += chunk.length;
      const text = `${run.stderrTail}${chunk.toString("utf8")}`;
      run.stderrTail = redact(Buffer.from(text).subarray(-effectiveLimits.maxStderrBytes).toString("utf8"), effectiveLimits.maxStderrBytes);
    });
  }

  async function start({ taskId, objective, workspace, policy = {} } = {}) {
    if (closed) throw codedError("LOCAL_AGENT_CLOSED", "Local agent adapter is closed.");
    if (typeof taskId !== "string" || !taskId.trim()) throw codedError("LOCAL_AGENT_INVALID_TASK", "A taskId is required.");
    if (typeof objective !== "string" || !objective.trim() || Buffer.byteLength(objective, "utf8") > 64 * 1024) {
      throw codedError("LOCAL_AGENT_INVALID_OBJECTIVE", "Objective must be between 1 byte and 64 KB.");
    }
    if (policy && (policy.sandbox !== undefined && policy.sandbox !== "workspace-write")) {
      throw codedError("LOCAL_AGENT_UNSAFE_POLICY", "Codex local runs only support the workspace-write sandbox preset.");
    }
    const resolvedWorkspace = await validateWorkspace(workspace, allowedWorkspaceRoots, { realpathImpl, statImpl, platform });
    const detection = await detect();
    if (!detection.installed) throw codedError("LOCAL_AGENT_NOT_INSTALLED", "Codex CLI is not installed or could not be verified.");
    const auth = await authStatus();
    if (!AUTH_STATUSES.has(auth.status) || auth.status !== "ready") {
      throw codedError(auth.status === "login-required" ? "LOCAL_AGENT_LOGIN_REQUIRED" : "LOCAL_AGENT_NOT_READY", "Codex CLI is not authenticated and ready.");
    }

    const runId = randomUUID();
    const args = ["exec", "--json", "--color", "never", "--sandbox", "workspace-write", "--cd", resolvedWorkspace, "-"];
    const child = spawnImpl(detection.executable, args, {
      cwd: resolvedWorkspace,
      env: safeEnvironment(envSource),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const run = {
      runId, taskId, child, workspace: resolvedWorkspace, status: "running", startedAt: now(), completedAt: null,
      cursor: 0, events: [], droppedEventCount: 0, malformedEventCount: 0, unknownEventCount: 0,
      stdoutBytes: 0, stderrBytes: 0, stderrTail: "", summary: null, externalRunId: null,
      failure: null, protocolFailed: false, terminationReason: null, killTimer: null, timeoutTimer: null,
    };
    runs.set(runId, run);
    appendEvent(run, { type: "lifecycle", status: "running" });
    attachRunStreams(run);
    child.once("error", (error) => {
      run.failure = { code: "spawn-error", message: redact(errorMessage(error)) };
    });
    child.once("close", (code, signal) => {
      clearTimeout(run.timeoutTimer);
      clearTimeout(run.killTimer);
      run.flushStdout?.();
      run.completedAt = now();
      if (run.terminationReason === "cancelled") run.status = "cancelled";
      else if (run.terminationReason === "timeout") {
        run.status = "failed";
        run.failure = { code: "timeout", message: "Codex execution timed out." };
      } else if (run.terminationReason === "output-limit") run.status = "failed";
      else if (run.failure || run.protocolFailed || code !== 0 || signal) {
        run.status = "failed";
        run.failure ??= { code: "process-exit", message: `Codex exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}.` };
      } else run.status = "succeeded";
      appendEvent(run, { type: "lifecycle", status: run.status, exitCode: code, signal: signal ?? null, error: run.failure?.message ?? null });
    });
    run.timeoutTimer = setTimeout(() => {
      if (TERMINAL_STATUSES.has(run.status)) return;
      appendEvent(run, { type: "error", code: "timeout", message: "Codex execution timed out." });
      terminate(run, "timeout");
    }, runTimeoutMs);
    run.timeoutTimer.unref?.();
    child.stdin?.end(objective);
    return { runId, taskId, status: run.status, startedAt: run.startedAt, workspace: resolvedWorkspace };
  }

  function requireRun(runId) {
    const run = runs.get(runId);
    if (!run) throw codedError("LOCAL_AGENT_RUN_NOT_FOUND", `Unknown local agent run: ${runId}`);
    return run;
  }

  async function events(runId, cursor = 0) {
    const run = requireRun(runId);
    const normalizedCursor = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
    return {
      runId,
      taskId: run.taskId,
      status: run.status,
      externalRunId: run.externalRunId,
      summary: run.summary,
      failure: run.failure,
      events: run.events.filter((event) => event.cursor > normalizedCursor),
      nextCursor: run.cursor,
      droppedEventCount: run.droppedEventCount,
      malformedEventCount: run.malformedEventCount,
      unknownEventCount: run.unknownEventCount,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  async function cancel(runId) {
    const run = requireRun(runId);
    if (TERMINAL_STATUSES.has(run.status)) return { runId, status: run.status, cancelled: false };
    appendEvent(run, { type: "lifecycle", status: "cancelling" });
    terminate(run, "cancelled");
    return { runId, status: "cancelling", cancelled: true };
  }

  async function close() {
    closed = true;
    for (const run of runs.values()) {
      if (!TERMINAL_STATUSES.has(run.status)) terminate(run, "cancelled");
    }
  }

  return {
    id: "codex-cli",
    label: "Codex CLI",
    kind: "local-subscription-agent",
    detect,
    authStatus,
    capabilities,
    start,
    events,
    cancel,
    close,
  };
}

export const localAgentEnvironmentAllowlist = Object.freeze([...SAFE_ENV_KEYS]);
