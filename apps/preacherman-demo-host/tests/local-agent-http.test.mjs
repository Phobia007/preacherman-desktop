import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";
import { createLocalAgentRegistry } from "../server/local-agent/index.mjs";
import { createFixtureLocalAgentAdapter } from "./fixtures/local-agent-integration-adapter.mjs";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { Origin: "http://127.0.0.1:1420", "Content-Type": "application/json" } });
  return { response, body: await response.json() };
}

async function terminal(baseUrl, taskId) {
  for (let count = 0; count < 100; count += 1) {
    const { body } = await request(baseUrl, `/api/tasks/${taskId}`);
    if (["succeeded", "failed", "cancelled"].includes(body.task.status)) return body.task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Local Agent task did not finish.");
}

test("Local Agent HTTP route projects real adapter events, summary and artifact into TaskRun", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-local-http-"));
  const registry = createLocalAgentRegistry({ adapters: [createFixtureLocalAgentAdapter()] });
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir, PREACHERMAN_LOCAL_AGENT_ROOTS: process.cwd() }, localAgentRegistry: registry });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const agents = await request(baseUrl, "/api/execution/local-agents");
  assert.deepEqual(agents.body.agents.map((agent) => agent.id), ["fixture-cli"]);
  assert.equal(agents.body.agents[0].auth.state, "ready");
  assert.equal(agents.body.agents[0].executable, undefined);
  const workspaces = await request(baseUrl, "/api/execution/workspaces");
  const created = await request(baseUrl, "/api/tasks", { method: "POST", body: JSON.stringify({ objective: "Run fixture task", source: "local-agent-runner" }) });
  const started = await request(baseUrl, `/api/tasks/${created.body.task.taskId}/local-agent/start`, {
    method: "POST", body: JSON.stringify({ agentId: "fixture-cli", workspaceId: workspaces.body.workspaces[0].id, policy: "workspace-write" }),
  });
  assert.equal(started.response.status, 202);
  assert.equal(started.body.task.execution.adapter, "fixture-cli");
  const final = await terminal(baseUrl, created.body.task.taskId);
  assert.equal(final.status, "succeeded");
  assert.equal(final.attempts.at(-1).provider, "fixture-cli");
  assert.ok(final.events.some((event) => event.type === "local_agent_message"));
  assert.equal(final.artifact.name, "local-agent-result.json");
  assert.equal(final.artifact.content.summary, "Fixture local Agent completed.");
  assert.deepEqual(final.artifact.content.changedFiles, ["safe.txt"]);
});

test("Local Agent request cannot inject executable, args or env and cancel reaches adapter", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-local-cancel-"));
  const adapter = createFixtureLocalAgentAdapter();
  adapter.start = async ({ taskId }) => ({ runId: `hold-${taskId}`, taskId, status: "running" });
  adapter.events = async (runId, cursor = 0) => ({ runId, status: "running", events: [], nextCursor: cursor, summary: null });
  let cancelled;
  adapter.cancel = async (runId) => { cancelled = runId; return { runId, status: "cancelling", cancelled: true }; };
  const registry = createLocalAgentRegistry({ adapters: [adapter] });
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir, PREACHERMAN_LOCAL_AGENT_ROOTS: process.cwd() }, localAgentRegistry: registry });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const workspace = (await request(baseUrl, "/api/execution/workspaces")).body.workspaces[0];
  const created = await request(baseUrl, "/api/tasks", { method: "POST", body: JSON.stringify({ objective: "Hold", source: "local-agent-runner" }) });
  const injected = await request(baseUrl, `/api/tasks/${created.body.task.taskId}/local-agent/start`, { method: "POST", body: JSON.stringify({ agentId: "fixture-cli", workspaceId: workspace.id, policy: "workspace-write", executable: "calc.exe", args: [], env: {} }) });
  assert.equal(injected.response.status, 400);
  const started = await request(baseUrl, `/api/tasks/${created.body.task.taskId}/local-agent/start`, { method: "POST", body: JSON.stringify({ agentId: "fixture-cli", workspaceId: workspace.id, policy: "workspace-write" }) });
  const cancelledResponse = await request(baseUrl, `/api/tasks/${created.body.task.taskId}/commands`, { method: "POST", body: JSON.stringify({ type: "cancel" }) });
  assert.equal(cancelledResponse.response.status, 200);
  assert.equal(cancelled, started.body.task.execution.localRunId);
});
