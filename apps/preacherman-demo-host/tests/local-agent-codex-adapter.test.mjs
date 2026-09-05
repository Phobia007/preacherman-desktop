import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCodexCliAdapter, localAgentEnvironmentAllowlist } from "../server/local-agent/index.mjs";

const fixture = fileURLToPath(new URL("./fixtures/local-agent-codex-fixture.mjs", import.meta.url));

async function eventually(read, predicate, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for local agent state.");
}

async function harness(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "preacherman-local-agent-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  let auth = options.auth ?? "ready";
  const spawnImpl = (command, args, spawnOptions) => {
    calls.push({ command, args: [...args], options: { ...spawnOptions, env: { ...spawnOptions.env } } });
    return spawn(process.execPath, [fixture, ...args], {
      ...spawnOptions,
      env: { ...spawnOptions.env, FIXTURE_AUTH: auth === "required" ? "required" : "ready" },
    });
  };
  const adapter = createCodexCliAdapter({
    allowedWorkspaceRoots: [root],
    envSource: { ...process.env, OPENAI_API_KEY: "must-not-leak", PREACHERMAN_GATEWAY_TOKEN: "must-not-leak" },
    spawnImpl,
    whichImpl: async () => "C:\\trusted\\codex.exe",
    realpathImpl: realpath,
    runTimeoutMs: options.runTimeoutMs ?? 2_000,
    killGraceMs: 50,
    limits: options.limits,
  });
  t.after(() => adapter.close());
  return { adapter, calls, root, workspace, setAuth(value) { auth = value; } };
}

test("Codex adapter discovers version and reports public CLI login status without reading credentials", async (t) => {
  const { adapter, setAuth } = await harness(t);
  assert.deepEqual(await adapter.detect(), { installed: true, version: "9.8.7", executable: "C:\\trusted\\codex.exe" });
  assert.deepEqual(await adapter.authStatus(), { status: "ready", reason: "cli-authenticated" });
  setAuth("required");
  assert.deepEqual(await adapter.authStatus(), { status: "login-required", reason: "cli-login-required" });
  assert.equal(adapter.capabilities().workspaceWrite, true);
  assert.equal(adapter.capabilities().resume, false);
});

test("Windows discovery falls back from an inaccessible app alias to the official npm native binary without a shell", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "preacherman-codex-discovery-"));
  const executable = path.join(root, "npm", "node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
  await mkdir(path.dirname(executable), { recursive: true });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(executable, "fixture"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const adapter = createCodexCliAdapter({
    allowedWorkspaceRoots: [root],
    platform: "win32",
    envSource: { ...process.env, APPDATA: root, LOCALAPPDATA: "" },
    whichImpl: async () => "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\codex.exe",
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      if (command.includes("WindowsApps")) {
        const child = spawn(process.execPath, ["-e", "process.exit(1)"], options);
        queueMicrotask(() => child.emit("error", Object.assign(new Error("spawn EPERM"), { code: "EPERM" })));
        return child;
      }
      return spawn(process.execPath, [fixture, ...args], { ...options, env: { ...options.env, FIXTURE_AUTH: "ready" } });
    },
  });
  t.after(() => adapter.close());
  const detected = await adapter.detect();
  assert.equal(detected.installed, true);
  assert.equal(detected.executable, executable);
  assert.ok(calls.every((call) => call.options.shell === false));
});

test("Windows discovery checks installed native locations when PATH lookup is empty or fails", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "preacherman-codex-local-"));
  t.after(() => rm(root, {recursive:true,force:true}));
  const executable = path.join(root, "OpenAI", "CodexCLI", "codex.exe");
  await mkdir(path.dirname(executable), {recursive:true});
  await import("node:fs/promises").then(({writeFile})=>writeFile(executable, "fixture"));
  for (const whichImpl of [async()=>null, async()=>{throw new Error("PATH unavailable");}]) {
    const adapter=createCodexCliAdapter({platform:"win32",envSource:{...process.env,APPDATA:"",LOCALAPPDATA:root},whichImpl,
      spawnImpl:(_command,args,options)=>spawn(process.execPath,[fixture,...args],options)});
    try { assert.equal((await adapter.detect()).executable,executable); } finally {await adapter.close();}
  }
});

test("Codex adapter uses a non-shell argv array, stdin objective, validated workspace, workspace-write, and env allowlist", async (t) => {
  const { adapter, calls, workspace } = await harness(t);
  const objective = "fixture:success ; --dangerously-bypass-approvals-and-sandbox";
  const started = await adapter.start({ taskId: "task-1", objective, workspace, policy: { sandbox: "workspace-write" } });
  const final = await eventually(() => adapter.events(started.runId, 0), (value) => value.status === "succeeded");
  const execCall = calls.find((call) => call.args[0] === "exec");
  assert.ok(execCall);
  assert.deepEqual(execCall.args, ["exec", "--json", "--color", "never", "--sandbox", "workspace-write", "--cd", await realpath(workspace), "-"]);
  assert.equal(execCall.options.shell, false);
  assert.equal(execCall.args.includes(objective), false);
  assert.equal(execCall.options.env.OPENAI_API_KEY, undefined);
  assert.equal(execCall.options.env.PREACHERMAN_GATEWAY_TOKEN, undefined);
  assert.ok(Object.keys(execCall.options.env).every((key) => localAgentEnvironmentAllowlist.includes(key.toUpperCase())));
  assert.equal(final.externalRunId, "fixture-thread");
  assert.equal(final.summary, "Fixture completed.");
  assert.equal(final.unknownEventCount, 1);
  const command = final.events.find((event) => event.action === "command");
  assert.doesNotMatch(command.command, /super-secret/);
  const change = final.events.find((event) => event.action === "file-change");
  assert.deepEqual(change.files, ["safe.txt"]);
  assert.equal(change.omittedUnsafePaths, 1);
});

test("Codex adapter rejects untrusted workspaces and unsafe sandbox policy", async (t) => {
  const { adapter, workspace } = await harness(t);
  await assert.rejects(() => adapter.start({ taskId: "task-1", objective: "fixture:success", workspace: tmpdir() }), { code: "LOCAL_AGENT_WORKSPACE_NOT_ALLOWED" });
  await assert.rejects(() => adapter.start({ taskId: "task-1", objective: "fixture:success", workspace, policy: { sandbox: "danger-full-access" } }), { code: "LOCAL_AGENT_UNSAFE_POLICY" });
});

test("Codex adapter preserves malformed JSONL as bounded parser warnings and maps nonzero exits honestly", async (t) => {
  const { adapter, workspace } = await harness(t);
  const malformed = await adapter.start({ taskId: "task-malformed", objective: "fixture:malformed", workspace });
  const malformedFinal = await eventually(() => adapter.events(malformed.runId, 0), (value) => value.status === "succeeded");
  assert.equal(malformedFinal.malformedEventCount, 1);
  assert.ok(malformedFinal.events.some((event) => event.code === "invalid-jsonl"));

  const failed = await adapter.start({ taskId: "task-failed", objective: "fixture:nonzero", workspace });
  const failedFinal = await eventually(() => adapter.events(failed.runId, 0), (value) => value.status === "failed");
  assert.equal(failedFinal.failure.code, "process-exit");
  assert.match(failedFinal.failure.message, /code 7/);
});

test("Codex adapter enforces JSONL output limits", async (t) => {
  const { adapter, workspace } = await harness(t, { limits: { maxLineBytes: 1_024, maxStdoutBytes: 4_096 } });
  const started = await adapter.start({ taskId: "task-limit", objective: "fixture:oversized", workspace });
  const final = await eventually(() => adapter.events(started.runId, 0), (value) => value.status === "failed");
  assert.equal(final.failure.code, "output-limit");
  assert.ok(final.events.some((event) => event.code === "output-limit"));
});

test("Codex adapter cancellation terminates the child and maps the run to cancelled", async (t) => {
  const { adapter, workspace } = await harness(t);
  const started = await adapter.start({ taskId: "task-cancel", objective: "fixture:hang", workspace });
  await eventually(() => adapter.events(started.runId, 0), (value) => value.events.some((event) => event.phase === "turn-started"));
  assert.equal((await adapter.cancel(started.runId)).cancelled, true);
  const final = await eventually(() => adapter.events(started.runId, 0), (value) => value.status === "cancelled");
  assert.ok(final.events.some((event) => event.status === "cancelled"));
});

test("Codex adapter maps execution timeout separately from cancellation", async (t) => {
  const { adapter, workspace } = await harness(t, { runTimeoutMs: 80 });
  const started = await adapter.start({ taskId: "task-timeout", objective: "fixture:hang", workspace });
  const final = await eventually(() => adapter.events(started.runId, 0), (value) => value.status === "failed");
  assert.equal(final.failure.code, "timeout");
});
