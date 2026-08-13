import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir as fsMkdir, readFile as fsReadFile, realpath as fsRealpath, stat as fsStat, writeFile as fsWriteFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PINNED_HARNESS_VERSION = "0.1.0-rc.5";
const DEFAULT_HARNESS_ROOT = "D:\\deepseek-harness";
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const SAFE_ENV_KEYS = new Set([
  "APPDATA", "HOME", "HTTPS_PROXY", "HTTP_PROXY", "LANG", "LC_ALL", "LOCALAPPDATA", "NO_PROXY", "PATH",
  "PATHEXT", "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMROOT", "TEMP", "TERM", "TMP", "USERPROFILE", "WINDIR",
]);
const DEFAULT_LIMITS = Object.freeze({
  maxEvents: 1_000,
  maxLineBytes: 128 * 1024,
  maxStderrBytes: 64 * 1024,
  maxStdoutBytes: 2 * 1024 * 1024,
  maxTextBytes: 64 * 1024,
});

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function truncateUtf8(value, maxBytes) {
  const source = String(value ?? "");
  if (Buffer.byteLength(source, "utf8") <= maxBytes) return source;
  return `${Buffer.from(source).subarray(0, Math.max(0, maxBytes - 3)).toString("utf8")}...`;
}

function redact(value, maxBytes = 4_096) {
  return truncateUtf8(String(value ?? "")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/gi, "[REDACTED]")
    .replace(/((?:api[_-]?key|authorization|bearer|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]"), maxBytes);
}

function safeEnvironment(source, fixed = {}) {
  const env = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (SAFE_ENV_KEYS.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  }
  // This first-party composition currently routes through DeepSeek Official.
  // The credential is deliberately forwarded to the child, but never projected into events.
  if (typeof source?.DEEPSEEK_API_KEY === "string" && source.DEEPSEEK_API_KEY.trim()) {
    env.DEEPSEEK_API_KEY = source.DEEPSEEK_API_KEY;
  }
  Object.assign(env, fixed);
  return env;
}

function isWithin(root, target, platform = process.platform) {
  const normalize = (value) => platform === "win32" ? value.toLowerCase() : value;
  const relative = path.relative(normalize(root), normalize(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function existingDirectory(candidate, realpathImpl, statImpl) {
  try {
    const resolved = await realpathImpl(candidate);
    return (await statImpl(resolved)).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

async function validateWorkspace(workspace, allowedRoots, { realpathImpl, statImpl, platform }) {
  if (typeof workspace !== "string" || !workspace.trim()) throw codedError("LOCAL_AGENT_INVALID_WORKSPACE", "A workspace is required.");
  const resolved = await existingDirectory(workspace, realpathImpl, statImpl);
  if (!resolved) throw codedError("LOCAL_AGENT_INVALID_WORKSPACE", "The selected workspace does not exist or is not a directory.");
  const roots = await Promise.all((allowedRoots ?? []).map((root) => existingDirectory(root, realpathImpl, statImpl)));
  if (!roots.some((root) => root && isWithin(root, resolved, platform))) {
    throw codedError("LOCAL_AGENT_WORKSPACE_NOT_ALLOWED", "The selected workspace is outside the trusted roots.");
  }
  return resolved;
}

async function readJson(file, readFileImpl) {
  return JSON.parse(await readFileImpl(file, "utf8"));
}

function withTimeout(promise, timeoutMs, code, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(codedError(code, message)), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

class AcpConnection {
  constructor(run, { appendEvent, failForLimit, limits }) {
    this.run = run;
    this.appendEvent = appendEvent;
    this.failForLimit = failForLimit;
    this.limits = limits;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    run.child.stdout.on("data", (chunk) => this.onData(chunk));
    run.child.stdout.on("end", () => this.onEnd());
  }

  request(method, params) {
    if (!this.run.child.stdin.writable) return Promise.reject(codedError("LOCAL_AGENT_ACP_CLOSED", "Harness ACP connection is closed."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params) {
    if (this.run.child.stdin.writable) this.write({ jsonrpc: "2.0", method, params });
  }

  respond(id, result) {
    if (this.run.child.stdin.writable) this.write({ jsonrpc: "2.0", id, result });
  }

  write(frame) {
    this.run.child.stdin.write(`${JSON.stringify(frame)}\n`);
  }

  onData(chunk) {
    this.run.stdoutBytes += chunk.length;
    if (this.run.stdoutBytes > this.limits.maxStdoutBytes) {
      this.failForLimit(this.run, "Harness ACP stdout exceeded the configured limit.");
      return;
    }
    this.buffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.buffer, "utf8") > this.limits.maxLineBytes && !this.buffer.includes("\n")) {
      this.failForLimit(this.run, "Harness emitted an overlong ACP frame.");
      return;
    }
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.onLine(line);
  }

  onLine(line) {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, "utf8") > this.limits.maxLineBytes) {
      this.failForLimit(this.run, "Harness emitted an overlong ACP frame.");
      return;
    }
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      this.run.malformedEventCount += 1;
      this.appendEvent(this.run, { type: "parser-warning", code: "invalid-acp-json" });
      return;
    }
    if (frame && frame.id !== undefined && frame.method === undefined) {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      if (frame.error) pending.reject(codedError("LOCAL_AGENT_ACP_ERROR", redact(frame.error.message ?? "Harness ACP request failed.")));
      else pending.resolve(frame.result ?? {});
      return;
    }
    if (frame?.method === "session/update") {
      const update = frame.params?.update;
      if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        const text = redact(update.content.text, this.limits.maxTextBytes);
        this.run.summary = truncateUtf8(`${this.run.summary ?? ""}${text}`, this.limits.maxTextBytes);
        this.appendEvent(this.run, { type: "message", phase: "committed", text });
      } else {
        this.run.unknownEventCount += 1;
      }
      return;
    }
    if (frame?.method === "session/request_permission" && frame.id !== undefined) {
      void this.handlePermission(frame.id, frame.params ?? {});
      return;
    }
    this.run.unknownEventCount += 1;
  }

  async handlePermission(id, params) {
    const options = Array.isArray(params.options) ? params.options
      .filter((option) => option && typeof option.optionId === "string")
      .map((option) => ({ optionId: option.optionId, name: redact(option.name ?? "Option", 256), kind: option.kind ?? "unknown" }))
      : [];
    const request = {
      runId: this.run.runId,
      taskId: this.run.taskId,
      permissionId: randomUUID(),
      toolCallId: typeof params.toolCall?.toolCallId === "string" ? params.toolCall.toolCallId : null,
      title: redact(params.toolCall?.title ?? "Harness requested permission.", 512),
      options,
    };
    this.run.status = "waiting_for_approval";
    this.appendEvent(this.run, { type: "approval", phase: "requested", ...request });
    let selected = null;
    try {
      let resolveDecision;
      const externalDecision = new Promise((resolve) => { resolveDecision = resolve; });
      this.run.pendingApprovals.set(request.permissionId, { request, resolve: resolveDecision });
      const decisionSource = this.run.approvalHandler
        ? Promise.race([Promise.resolve(this.run.approvalHandler(request)), externalDecision])
        : externalDecision;
      const decision = await withTimeout(
        decisionSource,
        this.run.approvalTimeoutMs,
        "LOCAL_AGENT_APPROVAL_TIMEOUT",
        "Harness approval request timed out.",
      );
      const requestedOptionId = typeof decision === "string" ? decision : decision?.optionId;
      const allowed = options.find((option) => option.optionId === requestedOptionId && option.kind === "allow_once");
      const rejected = options.find((option) => option.optionId === requestedOptionId && option.kind === "reject_once");
      selected = allowed ?? rejected ?? null;
    } catch (error) {
      this.appendEvent(this.run, { type: "approval", phase: "error", message: redact(errorMessage(error)) });
    } finally {
      this.run.pendingApprovals.delete(request.permissionId);
    }
    this.run.status = "running";
    this.appendEvent(this.run, { type: "approval", phase: "resolved", outcome: selected?.kind === "allow_once" ? "allowed" : "rejected" });
    this.respond(id, selected ? { outcome: { outcome: "selected", optionId: selected.optionId } } : { outcome: { outcome: "cancelled" } });
  }

  onEnd() {
    if (this.buffer.trim()) this.onLine(this.buffer);
    this.buffer = "";
    const error = codedError("LOCAL_AGENT_ACP_CLOSED", "Harness ACP connection closed.");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export function createDeepSeekHarnessAdapter({
  allowedWorkspaceRoots,
  approvalHandler,
  approvalTimeoutMs = 5 * 60 * 1_000,
  envSource = process.env,
  harnessRoot = DEFAULT_HARNESS_ROOT,
  limits = {},
  now = () => new Date().toISOString(),
  platform = process.platform,
  readFileImpl = fsReadFile,
  mkdirImpl = fsMkdir,
  realpathImpl = fsRealpath,
  runTimeoutMs = 2 * 60 * 60 * 1_000,
  startTimeoutMs = 30_000,
  killGraceMs = 2_000,
  spawnImpl = nodeSpawn,
  statImpl = fsStat,
  writeFileImpl = fsWriteFile,
  runtimeStateRoot = path.join(os.tmpdir(), "preacherman-native-agent"),
  compositionTemplate,
  gatewayScript,
  gatewayCredentialFile,
  gatewayUrl,
} = {}) {
  const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };
  const runs = new Map();
  let closed = false;

  async function currentEnvironment() {
    const resolved = typeof envSource === "function" ? await envSource() : envSource;
    return resolved && typeof resolved === "object" ? resolved : {};
  }

  async function resolveInstallation() {
    const root = await existingDirectory(harnessRoot, realpathImpl, statImpl);
    if (!root) return { installed: false, version: null, executable: null, reason: "harness-root-missing" };
    const packageFile = path.join(root, "package.json");
    const bin = path.join(root, "packages", "examples", "acp-demo", "src", "bin.ts");
    const builtBin = path.join(root, "packages", "examples", "acp-demo", "lib", "bin.js");
    const config = path.join(root, "examples", "acp-agent", "cordis.yml");
    const loader = path.join(root, "node_modules", "tsx", "dist", "loader.mjs");
    const tsconfig = path.join(root, "tsconfig.json");
    const includePlugin = path.join(root, "vendor", "include", "lib", "index.js");
    try {
      const manifest = await readJson(packageFile, readFileImpl);
      await statImpl(config);
      const hasBuiltBin = await statImpl(builtBin).then((entry) => entry.isFile(), () => false);
      if (!hasBuiltBin) await Promise.all([statImpl(bin), statImpl(loader), statImpl(tsconfig)]);
      if (compositionTemplate) await Promise.all([statImpl(compositionTemplate), statImpl(includePlugin)]);
      if (manifest.version !== PINNED_HARNESS_VERSION) {
        return { installed: false, version: typeof manifest.version === "string" ? manifest.version : null, executable: null, reason: "incompatible-version" };
      }
      return { installed: true, version: manifest.version, executable: process.execPath, root, bin: hasBuiltBin ? builtBin : bin, config, loader, tsconfig, includePlugin, built: hasBuiltBin };
    } catch (error) {
      return { installed: false, version: null, executable: null, reason: "incomplete-installation", error: redact(errorMessage(error)) };
    }
  }

  async function detect() {
    const result = await resolveInstallation();
    if (!result.installed) return result;
    return { installed: true, version: result.version, executable: result.executable, protocol: "acp-stdio", pinnedVersion: PINNED_HARNESS_VERSION };
  }

  async function authStatus() {
    const installation = await resolveInstallation();
    if (!installation.installed) return { status: "unknown", reason: installation.reason ?? "not-installed" };
    const environment = await currentEnvironment();
    if (typeof environment.DEEPSEEK_API_KEY !== "string" || !environment.DEEPSEEK_API_KEY.trim()) {
      return { status: "configuration-required", reason: "deepseek-api-key-missing" };
    }
    return { status: "ready", reason: "deepseek-provider-configured" };
  }

  function capabilities() {
    return {
      progress: false,
      cancel: true,
      resume: false,
      steer: false,
      approval: true,
      artifacts: false,
      workspaceWrite: true,
      mcp: Boolean(compositionTemplate && gatewayScript && gatewayCredentialFile && gatewayUrl),
      committedMessages: true,
    };
  }

  function appendEvent(run, event) {
    run.events.push({ cursor: ++run.cursor, at: now(), ...event });
    if (run.events.length > effectiveLimits.maxEvents) {
      run.events.shift();
      run.droppedEventCount += 1;
    }
  }

  function waitForExit(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => child.once("close", resolve));
  }

  function stopProcess(run) {
    if (run.stopPromise) return run.stopPromise;
    run.stopPromise = (async () => {
      if (run.child.exitCode !== null || run.child.signalCode !== null) return;
      run.child.stdin.end();
      const graceful = await Promise.race([
        waitForExit(run.child).then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), killGraceMs)),
      ]);
      if (!graceful && run.child.exitCode === null && run.child.signalCode === null) run.child.kill("SIGTERM");
      const terminated = await Promise.race([
        waitForExit(run.child).then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), killGraceMs)),
      ]);
      if (!terminated && run.child.exitCode === null && run.child.signalCode === null) run.child.kill("SIGKILL");
      await waitForExit(run.child);
    })();
    return run.stopPromise;
  }

  function failForLimit(run, message) {
    if (run.terminationReason) return;
    run.terminationReason = "output-limit";
    run.failure = { code: "output-limit", message };
    appendEvent(run, { type: "error", code: "output-limit", message });
    void stopProcess(run);
  }

  async function start({
    taskId, objective, workspace, policy = {},
    provider = "deepseek-official", model = "deepseek-v4-pro", providerId, modelId,
  } = {}) {
    if (closed) throw codedError("LOCAL_AGENT_CLOSED", "Local agent adapter is closed.");
    if (typeof taskId !== "string" || !taskId.trim()) throw codedError("LOCAL_AGENT_INVALID_TASK", "A taskId is required.");
    if (typeof objective !== "string" || !objective.trim() || Buffer.byteLength(objective, "utf8") > 64 * 1024) {
      throw codedError("LOCAL_AGENT_INVALID_OBJECTIVE", "Objective must be between 1 byte and 64 KB.");
    }
    if (policy?.sandbox !== undefined && policy.sandbox !== "workspace-write") {
      throw codedError("LOCAL_AGENT_UNSAFE_POLICY", "Preacherman Native only supports the workspace-write sandbox preset.");
    }
    const selectedProvider = providerId ?? provider;
    const selectedModel = modelId ?? model;
    if (selectedProvider !== "deepseek-official" || selectedModel !== "deepseek-v4-pro") {
      throw codedError("LOCAL_AGENT_UNSUPPORTED_MODEL", "The pinned Harness profile only supports deepseek-official/deepseek-v4-pro.");
    }
    const resolvedWorkspace = await validateWorkspace(workspace, allowedWorkspaceRoots, { realpathImpl, statImpl, platform });
    const installation = await resolveInstallation();
    if (!installation.installed) throw codedError("LOCAL_AGENT_NOT_INSTALLED", "The pinned DeepSeek Harness runtime is not installed or compatible.");
    const environment = await currentEnvironment();
    if (typeof environment.DEEPSEEK_API_KEY !== "string" || !environment.DEEPSEEK_API_KEY.trim()) {
      throw codedError("LOCAL_AGENT_CONFIGURATION_REQUIRED", "DeepSeek Harness requires a configured model provider.");
    }

    const runId = randomUUID();
    const runStateRoot = path.resolve(runtimeStateRoot, runId);
    const dshHome = path.join(runStateRoot, "dsh-home");
    const agentsHome = path.join(runStateRoot, "agents-home");
    await Promise.all([mkdirImpl(dshHome, { recursive: true }), mkdirImpl(agentsHome, { recursive: true })]);
    let launchConfig = installation.config;
    if (compositionTemplate) {
      const rawTemplate = await readJson(compositionTemplate, readFileImpl);
      const replacements = {
        HARNESS_INCLUDE_PLUGIN_URL: pathToFileURL(installation.includePlugin).href,
        HARNESS_MCP_CLIENT_URL: pathToFileURL(path.join(installation.root, "packages", "mcp", "mcp-client", "lib", "index.js")).href,
        HARNESS_ACP_BASE_CONFIG_URL: pathToFileURL(installation.config).href,
        PROVIDER_ID: selectedProvider,
        MODEL_ID: selectedModel,
        HARNESS_SESSION_ROOT: path.join(runStateRoot, "sessions"),
        HARNESS_NODE_EXECUTABLE: process.execPath,
        PREACHERMAN_MCP_GATEWAY_SCRIPT: gatewayScript,
        PREACHERMAN_MCP_GATEWAY_URL: typeof gatewayUrl === "function" ? await gatewayUrl() : gatewayUrl,
        PREACHERMAN_MCP_BOOTSTRAP_FILE: gatewayCredentialFile,
        WORKSPACE_ROOT: resolvedWorkspace,
      };
      const replaceValue = (value) => {
        if (Array.isArray(value)) return value.map(replaceValue);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceValue(child)]));
        if (typeof value !== "string") return value;
        return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
          const replacement = replacements[key];
          if (typeof replacement !== "string" || !replacement) throw codedError("LOCAL_AGENT_PROFILE_INVALID", `Missing trusted Harness launch value: ${key}`);
          return replacement;
        });
      };
      launchConfig = path.join(runStateRoot, "preacherman-native.json");
      await writeFileImpl(launchConfig, JSON.stringify(replaceValue(rawTemplate)), { encoding: "utf8", mode: 0o600 });
    }
    const args = installation.built
      ? [installation.bin, "--config", launchConfig]
      : ["--import", pathToFileURL(installation.loader).href, installation.bin, "--config", launchConfig];
    const child = spawnImpl(installation.executable, args, {
      cwd: installation.root,
      env: safeEnvironment(environment, {
        DSH_PERMISSION_MODE: "workspace-write",
        DSH_HOME: dshHome,
        DSH_AGENTS_HOME: agentsHome,
        TSX_TSCONFIG_PATH: installation.tsconfig,
      }),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const run = {
      runId, taskId, child, workspace: resolvedWorkspace, status: "submitting", startedAt: now(), completedAt: null,
      cursor: 0, events: [], droppedEventCount: 0, malformedEventCount: 0, unknownEventCount: 0,
      stdoutBytes: 0, stderrBytes: 0, stderrTail: "", summary: null, externalRunId: null,
      failure: null, terminationReason: null, stopPromise: null, timeoutTimer: null,
      approvalHandler, approvalTimeoutMs, pendingApprovals: new Map(), provider: selectedProvider, model: selectedModel,
    };
    runs.set(runId, run);
    appendEvent(run, { type: "lifecycle", status: "submitting" });
    child.stderr.on("data", (chunk) => {
      run.stderrBytes += chunk.length;
      const combined = `${run.stderrTail}${chunk.toString("utf8")}`;
      run.stderrTail = redact(Buffer.from(combined).subarray(-effectiveLimits.maxStderrBytes).toString("utf8"), effectiveLimits.maxStderrBytes);
    });
    child.once("error", (error) => {
      run.failure ??= { code: "spawn-error", message: redact(errorMessage(error)) };
    });
    child.once("close", (code, signal) => {
      clearTimeout(run.timeoutTimer);
      if (!TERMINAL_STATUSES.has(run.status) && !["submitting", "cancelling"].includes(run.status)) {
        run.status = "failed";
        run.failure ??= { code: "process-exit", message: `Harness exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}.` };
        run.completedAt = now();
        appendEvent(run, { type: "lifecycle", status: "failed", exitCode: code, signal: signal ?? null, error: run.failure.message });
      }
    });
    const connection = new AcpConnection(run, { appendEvent, failForLimit, limits: effectiveLimits });
    run.connection = connection;
    try {
      await withTimeout(connection.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "Preacherman", version: "0.1.0" },
      }), startTimeoutMs, "LOCAL_AGENT_START_TIMEOUT", "Harness ACP initialization timed out.");
      const session = await withTimeout(connection.request("session/new", {
        cwd: resolvedWorkspace,
        additionalDirectories: [],
        mcpServers: [],
      }), startTimeoutMs, "LOCAL_AGENT_START_TIMEOUT", "Harness ACP session creation timed out.");
      if (typeof session?.sessionId !== "string" || !session.sessionId) throw codedError("LOCAL_AGENT_ACP_ERROR", "Harness returned no ACP session id.");
      run.externalRunId = session.sessionId;
      run.status = "running";
      appendEvent(run, { type: "session", externalRunId: session.sessionId });
      appendEvent(run, { type: "lifecycle", status: "running" });
    } catch (error) {
      run.terminationReason = "startup-failed";
      await stopProcess(run).catch(() => undefined);
      runs.delete(runId);
      const safe = codedError(error?.code ?? "LOCAL_AGENT_START_FAILED", redact(errorMessage(error)));
      throw safe;
    }

    run.timeoutTimer = setTimeout(() => {
      if (TERMINAL_STATUSES.has(run.status)) return;
      run.terminationReason = "timeout";
      run.failure = { code: "timeout", message: "Harness execution timed out." };
      appendEvent(run, { type: "error", code: "timeout", message: run.failure.message });
      void connection.notify("session/cancel", { sessionId: run.externalRunId });
      void stopProcess(run).then(() => {
        run.status = "failed";
        run.completedAt = now();
        appendEvent(run, { type: "lifecycle", status: "failed", error: run.failure.message });
      });
    }, runTimeoutMs);
    run.timeoutTimer.unref?.();

    void connection.request("session/prompt", {
      sessionId: run.externalRunId,
      prompt: [{ type: "text", text: objective }],
    }).then(async (response) => {
      if (run.terminationReason) return;
      if (response?.stopReason !== "end_turn") {
        run.failure = { code: "agent-stop", message: `Harness stopped with reason ${redact(response?.stopReason ?? "unknown", 128)}.` };
        run.status = response?.stopReason === "cancelled" ? "cancelled" : "failed";
      } else run.status = "succeeded";
      clearTimeout(run.timeoutTimer);
      run.completedAt = now();
      await stopProcess(run).catch((error) => {
        run.status = "failed";
        run.failure = { code: "process-cleanup", message: redact(errorMessage(error)) };
      });
      appendEvent(run, { type: "lifecycle", status: run.status, error: run.failure?.message ?? null });
    }).catch(async (error) => {
      if (run.terminationReason) return;
      run.status = "failed";
      run.failure = { code: "acp-error", message: redact(errorMessage(error)) };
      run.completedAt = now();
      clearTimeout(run.timeoutTimer);
      await stopProcess(run).catch(() => undefined);
      appendEvent(run, { type: "lifecycle", status: "failed", error: run.failure.message });
    });

    return { runId, taskId, status: run.status, startedAt: run.startedAt, workspace: resolvedWorkspace, externalRunId: run.externalRunId, provider: selectedProvider, model: selectedModel };
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
      runId, taskId: run.taskId, status: run.status, externalRunId: run.externalRunId,
      summary: run.summary, failure: run.failure,
      events: run.events.filter((event) => event.cursor > normalizedCursor), nextCursor: run.cursor,
      droppedEventCount: run.droppedEventCount, malformedEventCount: run.malformedEventCount,
      unknownEventCount: run.unknownEventCount, startedAt: run.startedAt, completedAt: run.completedAt,
    };
  }

  async function cancel(runId) {
    const run = requireRun(runId);
    if (TERMINAL_STATUSES.has(run.status)) return { runId, status: run.status, cancelled: false };
    run.terminationReason = "cancelled";
    for (const pending of run.pendingApprovals.values()) pending.resolve({ reject: true });
    run.status = "cancelling";
    appendEvent(run, { type: "lifecycle", status: "cancelling" });
    try {
      run.connection.notify("session/cancel", { sessionId: run.externalRunId });
    } finally {
      clearTimeout(run.timeoutTimer);
      await stopProcess(run);
      run.status = "cancelled";
      run.completedAt = now();
      appendEvent(run, { type: "lifecycle", status: "cancelled" });
    }
    return { runId, status: "cancelled", cancelled: true };
  }

  function decideApproval(runId, permissionId, optionId) {
    const run = requireRun(runId);
    const pending = run.pendingApprovals.get(permissionId);
    if (!pending) throw codedError("LOCAL_AGENT_APPROVAL_NOT_FOUND", "The Harness approval request is no longer pending.");
    const selectedOptionId = optionId === undefined
      ? pending.request.options.find((option) => option.kind === "allow_once")?.optionId
      : optionId;
    if (selectedOptionId !== null && !pending.request.options.some((option) => option.optionId === selectedOptionId && option.kind === "allow_once")) {
      throw codedError("LOCAL_AGENT_INVALID_APPROVAL", "Only an offered allow-once option may be approved.");
    }
    if (selectedOptionId === null) {
      const reject = pending.request.options.find((option) => option.kind === "reject_once");
      pending.resolve(reject ? { optionId: reject.optionId } : { reject: true });
    } else pending.resolve({ optionId: selectedOptionId });
    return { runId, permissionId, accepted: true };
  }

  async function approve(runId, permissionId, optionId) {
    return decideApproval(runId, permissionId, optionId);
  }

  async function reject(runId, permissionId) {
    return decideApproval(runId, permissionId, null);
  }

  async function close() {
    closed = true;
    await Promise.all([...runs.values()].filter((run) => !TERMINAL_STATUSES.has(run.status)).map(async (run) => {
      run.terminationReason = "cancelled";
      for (const pending of run.pendingApprovals.values()) pending.resolve({ reject: true });
      run.connection?.notify("session/cancel", { sessionId: run.externalRunId });
      await stopProcess(run);
      run.status = "cancelled";
      run.completedAt = now();
      appendEvent(run, { type: "lifecycle", status: "cancelled" });
    }));
  }

  return {
    id: "preacherman-native",
    label: "Preacherman Native",
    kind: "local-native-agent",
    detect,
    authStatus,
    capabilities,
    start,
    events,
    cancel,
    approve,
    reject,
    close,
  };
}

export const deepSeekHarnessPinnedVersion = PINNED_HARNESS_VERSION;
export const deepSeekHarnessEnvironmentAllowlist = Object.freeze([...SAFE_ENV_KEYS, "DEEPSEEK_API_KEY", "DSH_PERMISSION_MODE"]);
