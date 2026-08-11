import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { build } from "esbuild";

const packageRoot = join(import.meta.dirname, "..");
const panelPath = join(packageRoot, "src", "homerail", "HomeRailFusionPanel.tsx");
const stylePath = join(packageRoot, "src", "homerail", "homerail-fusion-panel.css");

async function loadPanelModule() {
  const result = await build({
    bundle: true,
    entryPoints: [panelPath],
    format: "esm",
    platform: "node",
    target: "node22",
    outdir: "out",
    write: false,
  });
  const javascript = result.outputFiles.find((file) => file.path.endsWith(".js"));
  assert.ok(javascript);
  return import(`data:text/javascript;base64,${Buffer.from(javascript.text).toString("base64")}`);
}

test("one acceptance action runs the real Proposal to Artifact API sequence", async () => {
  const { runHomeRailFusionAcceptance } = await loadPanelModule();
  const calls = [];
  const serviceRequest = async (path, init) => {
    calls.push({ path, init });
    if (path === "/api/execution/providers/status") return { providers: [{
      id: "homerail", state: "ready", message: "Ready", profile: "profile-1",
      runtime: { connectedNodes: 1, connectedWorkers: 0 }, workflow: { id: "preacherman-complex-task-v1", revision: 2 },
    }] };
    if (path === "/api/agent/turn") return { action: "propose_task", proposal: { proposalId: "proposal-1", objective: "Complex objective" } };
    if (path.endsWith("/confirm")) return { run: { taskId: "task-1", status: "running", attempts: [{ attempt: 1 }] } };
    if (path === "/api/tasks/task-1") return { task: {
      taskId: "task-1", status: "succeeded",
      execution: { kind: "homerail-dag", workflowId: "preacherman-complex-task-v1", workflowRevision: 2, canonicalHash: "a".repeat(64) },
      attempts: [{ attempt: 1, externalRunId: "run-1" }],
    } };
    if (path === "/api/tasks/task-1/artifacts") return { artifacts: [
      { artifactId: "plan", name: "plan.json", status: "ready", sha256: "b".repeat(64), sizeBytes: 120 },
      { artifactId: "verification", name: "verification.json", status: "ready", sha256: "c".repeat(64), sizeBytes: 80 },
    ] };
    throw new Error(`Unexpected request: ${path}`);
  };
  const steps = [];
  const result = await runHomeRailFusionAcceptance(serviceRequest, { pollIntervalMs: 0, timeoutMs: 1_000, onStep: (...step) => steps.push(step) });
  assert.equal(result.taskId, "task-1");
  assert.equal(result.externalRunId, "run-1");
  assert.equal(result.artifacts.length, 2);
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/execution/providers/status",
    "/api/agent/turn",
    "/api/agent/proposals/proposal-1/confirm",
    "/api/agent/proposals/proposal-1/confirm",
    "/api/tasks/task-1",
    "/api/tasks/task-1/artifacts",
  ]);
  assert.deepEqual(steps.filter(([, state]) => state === "passed").map(([id]) => id), ["connection", "proposal", "idempotency", "execution", "artifacts"]);
});

test("acceptance fails before proposal creation when the real provider is not ready", async () => {
  const { runHomeRailFusionAcceptance } = await loadPanelModule();
  const calls = [];
  await assert.rejects(
    runHomeRailFusionAcceptance(async (path) => {
      calls.push(path);
      return { providers: [{ id: "homerail", state: "configuration-required", message: "Runtime profile missing." }] };
    }, { pollIntervalMs: 0 }),
    /Runtime profile missing/,
  );
  assert.deepEqual(calls, ["/api/execution/providers/status"]);
});

test("diagnostics use connected Nodes, expose one owner action, and honor both themes", async () => {
  const [source, styles, theme] = await Promise.all([
    readFile(panelPath, "utf8"),
    readFile(stylePath, "utf8"),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);
  assert.match(source, /connectedNodes[^]*data-airi-control="execution\.acceptance"/);
  assert.match(source, /zero is normal while idle|空闲为 0 属正常/);
  assert.match(source, /Task → Attempt → Run/);
  assert.match(source, /sourceEvent[^]*sourceIndex/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  for (const token of ["surface", "text", "muted", "border", "border-strong", "focus", "loading", "error"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
    assert.match(theme, new RegExp(`--demo-theme-${token}:`));
  }
});
