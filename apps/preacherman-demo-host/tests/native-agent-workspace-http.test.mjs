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

function nativeFixture({ ready = true } = {}) {
  const adapter = createFixtureLocalAgentAdapter();
  adapter.id = "preacherman-native";
  adapter.label = "Preacherman Native";
  adapter.kind = "local-native-agent";
  adapter.detect = async () => ({ installed: true, version: "0.1.0-rc.5" });
  adapter.authStatus = async () => ready ? ({ status: "ready" }) : ({ status: "configuration-required" });
  adapter.capabilities = () => ({ progress: false, cancel: true, approval: true, workspaceWrite: true, artifacts: false, mcp: true });
  return adapter;
}

test("Agent Workspace persists approval before starting Preacherman Native", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-native-http-"));
  const adapter = nativeFixture();
  let starts = 0;
  const originalStart = adapter.start;
  adapter.start = async (input) => { starts += 1; return originalStart(input); };
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir, PREACHERMAN_LOCAL_AGENT_ROOTS: process.cwd() },
    localAgentRegistry: createLocalAgentRegistry({ adapters: [adapter] }),
  });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const catalog = await request(baseUrl, "/api/agent-workspace/catalog");
  assert.equal(catalog.body.agents[0].id, "preacherman-native");
  assert.equal(catalog.body.agents[0].providers[0].models[0].id, "deepseek-v4-pro");
  const turn = await request(baseUrl, "/api/agent-workspace/turn", {
    method: "POST",
    body: JSON.stringify({
      input: "Inspect the workspace and summarize it",
      locale: "en",
      selection: { agentId: "preacherman-native", providerId: "deepseek-official", modelId: "deepseek-v4-pro" },
      policy: "ask",
      workspaceId: catalog.body.workspaces[0].id,
    }),
  });
  assert.equal(turn.response.status, 200);
  assert.equal(turn.body.task.status, "waiting_for_approval");
  assert.equal(turn.body.task.attempts.length, 0);
  assert.equal(starts, 0);
  assert.equal(turn.body.task.executionSnapshot.providerId, "deepseek-official");

  const approved = await request(baseUrl, `/api/tasks/${turn.body.task.taskId}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "approve", approvalId: turn.body.proposal.approvalId }),
  });
  assert.equal(approved.response.status, 202);
  assert.equal(starts, 1);
  assert.equal(approved.body.task.execution.adapter, "preacherman-native");
});

test("Native status distinguishes model configuration and rejects unsupported combinations", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-native-status-"));
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir, PREACHERMAN_LOCAL_AGENT_ROOTS: process.cwd() },
    localAgentRegistry: createLocalAgentRegistry({ adapters: [nativeFixture({ ready: false })] }),
  });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const status = await request(baseUrl, "/api/execution/native/status");
  assert.equal(status.body.native.status, "configuration-required");
  assert.equal(status.body.native.harness.license, "MIT");
  const invalid = await request(baseUrl, "/api/agent-workspace/turn", {
    method: "POST",
    body: JSON.stringify({ input: "Run", selection: { agentId: "preacherman-native", providerId: "fake", modelId: "fake" }, policy: "ask", workspaceId: "workspace-1" }),
  });
  assert.equal(invalid.response.status, 400);
});
