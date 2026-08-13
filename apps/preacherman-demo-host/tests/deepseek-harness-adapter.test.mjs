import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDeepSeekHarnessAdapter, deepSeekHarnessPinnedVersion } from "../server/local-agent/deepSeekHarnessAdapter.mjs";

const fixture = fileURLToPath(new URL("./fixtures/deepseek-harness-acp-fixture.mjs", import.meta.url));

async function eventually(read, predicate, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Timed out waiting for adapter state.");
}

async function harness(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "preacherman-harness-fixture-"));
  const workspace = path.join(root, "workspace");
  const harnessRoot = path.join(root, "runtime");
  const bin = path.join(harnessRoot, "packages", "examples", "acp-demo", "src", "bin.ts");
  const builtBin = path.join(harnessRoot, "packages", "examples", "acp-demo", "lib", "bin.js");
  const config = path.join(harnessRoot, "examples", "acp-agent", "cordis.yml");
  const loader = path.join(harnessRoot, "node_modules", "tsx", "dist", "loader.mjs");
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(path.dirname(bin), { recursive: true }),
    mkdir(path.dirname(config), { recursive: true }),
    mkdir(path.dirname(loader), { recursive: true }),
    ...(options.built ? [mkdir(path.dirname(builtBin), { recursive: true })] : []),
  ]);
  await Promise.all([
    copyFile(fixture, bin),
    ...(options.built ? [copyFile(fixture, builtBin)] : []),
    writeFile(config, "fixture: true\n"),
    writeFile(loader, "// fixture loader\n"),
    writeFile(path.join(harnessRoot, "tsconfig.json"), "{}\n"),
    writeFile(path.join(harnessRoot, "package.json"), JSON.stringify({ version: deepSeekHarnessPinnedVersion })),
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));
  const spawnCalls = [];
  const adapter = createDeepSeekHarnessAdapter({
    allowedWorkspaceRoots: [workspace],
    harnessRoot,
    envSource: { ...process.env, DEEPSEEK_API_KEY: "sk-fixture-secret" },
    spawnImpl(command, args, spawnOptions) {
      spawnCalls.push({ command, args, options: spawnOptions });
      return options.spawnImpl ? options.spawnImpl(command, args, spawnOptions) : spawn(command, [options.built ? builtBin : bin], spawnOptions);
    },
    ...options.adapter,
  });
  return { adapter, workspace: await realpath(workspace), root, harnessRoot, spawnCalls };
}

test("DeepSeek Harness adapter detects the pinned runtime and reports provider configuration honestly", async (t) => {
  const { adapter } = await harness(t);
  assert.deepEqual(await adapter.detect(), {
    installed: true,
    version: deepSeekHarnessPinnedVersion,
    executable: process.execPath,
    protocol: "acp-stdio",
    pinnedVersion: deepSeekHarnessPinnedVersion,
  });
  assert.equal((await adapter.authStatus()).status, "ready");
  assert.deepEqual(adapter.capabilities(), {
    progress: false, cancel: true, resume: false, steer: false, approval: true,
    artifacts: false, workspaceWrite: true, mcp: false, committedMessages: true,
  });

  const missing = await harness(t, { adapter: { envSource: { ...process.env, DEEPSEEK_API_KEY: "" } } });
  assert.deepEqual(await missing.adapter.authStatus(), { status: "configuration-required", reason: "deepseek-api-key-missing" });
});

test("DeepSeek Harness adapter resolves provider credentials at auth and start time without snapshotting old keys", async (t) => {
  let currentKey = "";
  const { adapter, workspace, spawnCalls } = await harness(t, { adapter: {
    envSource: async () => ({ ...process.env, DEEPSEEK_API_KEY: currentKey }),
  } });
  assert.equal((await adapter.authStatus()).status, "configuration-required");
  currentKey = "sk-runtime-first";
  assert.equal((await adapter.authStatus()).status, "ready");
  const first = await adapter.start({ taskId: "runtime-key-1", objective: "fixture:success", workspace, providerId: "deepseek-official", modelId: "deepseek-v4-pro" });
  await eventually(() => adapter.events(first.runId), (value) => value.status === "succeeded");
  assert.equal(spawnCalls[0].options.env.DEEPSEEK_API_KEY, "sk-runtime-first");
  currentKey = "sk-runtime-second";
  const second = await adapter.start({ taskId: "runtime-key-2", objective: "fixture:success", workspace });
  await eventually(() => adapter.events(second.runId), (value) => value.status === "succeeded");
  assert.equal(spawnCalls[1].options.env.DEEPSEEK_API_KEY, "sk-runtime-second");
  await assert.rejects(adapter.start({ taskId: "runtime-bad", objective: "no", workspace, providerId: "other", modelId: "other" }), { code: "LOCAL_AGENT_UNSUPPORTED_MODEL" });
});

test("DeepSeek Harness adapter starts ACP with fixed argv, shell:false, an allowlisted workspace and bounded redacted events", async (t) => {
  const { adapter, workspace, root, spawnCalls } = await harness(t);
  const started = await adapter.start({ taskId: "task-1", objective: "fixture:success", workspace });
  const final = await eventually(() => adapter.events(started.runId), (value) => value.status === "succeeded");
  assert.equal(final.summary, "Fixture completed. token=[REDACTED]");
  assert.ok(final.events.some((event) => event.type === "session"));
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(spawnCalls[0].options.cwd, await realpath(path.join(root, "runtime")));
  assert.equal(spawnCalls[0].options.env.DSH_PERMISSION_MODE, "workspace-write");
  assert.equal(spawnCalls[0].args[0], "--import");
  assert.match(spawnCalls[0].args[1], /^file:\/\//);
  assert.equal(spawnCalls[0].options.env.TSX_TSCONFIG_PATH, path.join(root, "runtime", "tsconfig.json"));
  assert.match(spawnCalls[0].options.env.DSH_HOME, /preacherman-native-agent/);
  assert.match(spawnCalls[0].options.env.DSH_AGENTS_HOME, /preacherman-native-agent/);
  assert.equal(spawnCalls[0].options.env.DEEPSEEK_API_KEY, "sk-fixture-secret");
  assert.equal(JSON.stringify(final).includes("sk-fixture-secret"), false);
  await assert.rejects(adapter.start({ taskId: "escape", objective: "no", workspace: root }), { code: "LOCAL_AGENT_WORKSPACE_NOT_ALLOWED" });
  await assert.rejects(adapter.start({ taskId: "unsafe", objective: "no", workspace, policy: { sandbox: "danger-full-access" } }), { code: "LOCAL_AGENT_UNSAFE_POLICY" });
  await assert.rejects(adapter.start({ taskId: "model", objective: "no", workspace, provider: "other", model: "other" }), { code: "LOCAL_AGENT_UNSUPPORTED_MODEL" });
});

test("DeepSeek Harness adapter prefers the built ACP entry without a TypeScript loader", async (t) => {
  const { adapter, workspace, spawnCalls } = await harness(t, { built: true });
  const started = await adapter.start({ taskId: "built", objective: "fixture:success", workspace });
  await eventually(() => adapter.events(started.runId), (value) => value.status === "succeeded");
  assert.match(spawnCalls[0].args[0], /[\\/]lib[\\/]bin\.js$/);
  assert.equal(spawnCalls[0].args.includes("--import"), false);
  assert.equal(spawnCalls[0].options.shell, false);
});

test("DeepSeek Harness adapter routes one-shot approval through the host callback and never exposes raw tool input", async (t) => {
  let approval;
  const { adapter, workspace } = await harness(t, { adapter: {
    approvalHandler: async (request) => {
      approval = request;
      return { optionId: "allow" };
    },
  } });
  const started = await adapter.start({ taskId: "approval", objective: "fixture:approval", workspace });
  const final = await eventually(() => adapter.events(started.runId), (value) => value.status === "succeeded");
  assert.equal(final.summary, "approval:allow");
  assert.equal(approval.toolCallId, "fixture-tool-call");
  assert.equal(JSON.stringify(approval).includes("never-project-me"), false);
  assert.ok(final.events.some((event) => event.type === "approval" && event.phase === "resolved" && event.outcome === "allowed"));
});

test("DeepSeek Harness adapter fails closed when approval cannot be obtained", async (t) => {
  const { adapter, workspace } = await harness(t, { adapter: { approvalTimeoutMs: 30 } });
  const started = await adapter.start({ taskId: "approval-reject", objective: "fixture:approval", workspace });
  const final = await eventually(() => adapter.events(started.runId), (value) => value.status === "succeeded");
  assert.equal(final.summary, "approval:cancelled");
  assert.ok(final.events.some((event) => event.type === "approval" && event.outcome === "rejected"));
});

test("DeepSeek Harness adapter exposes pending approval for an explicit approve/reject decision", async (t) => {
  const { adapter, workspace } = await harness(t);
  const approved = await adapter.start({ taskId: "external-approve", objective: "fixture:approval", workspace });
  const waiting = await eventually(() => adapter.events(approved.runId), (value) => value.status === "waiting_for_approval");
  const request = waiting.events.find((event) => event.type === "approval" && event.phase === "requested");
  await adapter.approve(approved.runId, request.permissionId, "allow");
  assert.equal((await eventually(() => adapter.events(approved.runId), (value) => value.status === "succeeded")).summary, "approval:allow");

  const rejected = await adapter.start({ taskId: "external-reject", objective: "fixture:approval", workspace });
  const rejectedWaiting = await eventually(() => adapter.events(rejected.runId), (value) => value.status === "waiting_for_approval");
  const rejectedRequest = rejectedWaiting.events.find((event) => event.type === "approval" && event.phase === "requested");
  await adapter.reject(rejected.runId, rejectedRequest.permissionId);
  assert.equal((await eventually(() => adapter.events(rejected.runId), (value) => value.status === "succeeded")).summary, "approval:reject");
});

test("DeepSeek Harness adapter performs ACP cancellation and waits for process exit", async (t) => {
  const { adapter, workspace } = await harness(t);
  const started = await adapter.start({ taskId: "cancel", objective: "fixture:hang", workspace });
  assert.deepEqual(await adapter.cancel(started.runId), { runId: started.runId, status: "cancelled", cancelled: true });
  const final = await adapter.events(started.runId);
  assert.equal(final.status, "cancelled");
  assert.ok(final.events.some((event) => event.status === "cancelled"));
});

test("DeepSeek Harness adapter maps ACP errors, timeouts and output limits without false success", async (t) => {
  const { adapter, workspace } = await harness(t, { adapter: { runTimeoutMs: 80, limits: { maxStdoutBytes: 4_096, maxLineBytes: 2_048 } } });
  const failed = await adapter.start({ taskId: "error", objective: "fixture:error", workspace });
  const failedFinal = await eventually(() => adapter.events(failed.runId), (value) => value.status === "failed");
  assert.equal(failedFinal.failure.code, "acp-error");
  assert.equal(failedFinal.failure.message.includes("fixture-secret"), false);

  const oversized = await adapter.start({ taskId: "limit", objective: "fixture:oversized", workspace });
  const limitedFinal = await eventually(() => adapter.events(oversized.runId), (value) => value.failure?.code === "output-limit");
  assert.equal(limitedFinal.status === "succeeded", false);

  const hanging = await adapter.start({ taskId: "timeout", objective: "fixture:hang", workspace });
  const timedOut = await eventually(() => adapter.events(hanging.runId), (value) => value.status === "failed");
  assert.equal(timedOut.failure.code, "timeout");
});
