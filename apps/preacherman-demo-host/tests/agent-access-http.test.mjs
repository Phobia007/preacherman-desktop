import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";

async function request(baseUrl, path, { token, ...options } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  return { response, body: await response.json() };
}

async function openSession(baseUrl, bootstrap, client = "fixture-agent") {
  const created = await request(baseUrl, "/api/mcp/gateway/bridge/sessions", {
    method: "POST", token: bootstrap, body: JSON.stringify({ client: { name: client, version: "1" }, transport: "stdio" }),
  });
  assert.equal(created.response.status, 200);
  return created.body.session;
}

async function call(baseUrl, session, name, args) {
  return request(baseUrl, `/api/mcp/gateway/bridge/sessions/${encodeURIComponent(session.id)}/calls`, {
    method: "POST", token: session.accessToken, body: JSON.stringify({ name, arguments: args }),
  });
}

test("real HTTP Gateway persists an owned approval task and blocks cross-principal access", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-agent-access-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const bootstrap = (await readFile(join(dataDir, "mcp-gateway.bootstrap"), "utf8")).trim();
  const first = await openSession(baseUrl, bootstrap, "first-agent");
  const created = await call(baseUrl, first, "preacherman.task.create", { objective: "Produce a reviewable local pitch artifact." });
  assert.equal(created.response.status, 200);
  const task = created.body.structuredContent;
  assert.equal(task.status, "waiting_for_approval");
  assert.ok(task.pendingApproval?.approvalId);

  const persisted = await request(baseUrl, `/api/tasks/${encodeURIComponent(task.taskId)}`);
  assert.equal(persisted.body.task.ownership.principalId, "local-mcp-agent");
  assert.equal(persisted.body.task.status, "waiting_for_approval");

  const forged = await call(baseUrl, first, "preacherman.task.get", { taskId: task.taskId, metadata: { principalId: "other" } });
  assert.equal(forged.response.status, 400);
  assert.equal(forged.body.error.includes("Identity field"), true);

  const rotated = await request(baseUrl, "/api/mcp/gateway/credentials/rotate", { method: "POST", body: "{}" });
  assert.equal(rotated.response.status, 200);
  const revokedCall = await call(baseUrl, first, "preacherman.task.get", { taskId: task.taskId });
  assert.equal(revokedCall.response.status, 401);
});

test("Settings Gateway test starts the real stdio MCP client and capabilities call", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-gateway-probe-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const templates = await request(baseUrl, "/api/mcp/gateway/templates");
  assert.deepEqual(templates.body.templates.map((entry) => entry.id), ["codex", "claude-code", "gemini-cli", "generic"]);
  assert.ok(templates.body.templates.every((entry) => !entry.configuration.includes("bootstrapCredential")));
  const tested = await request(baseUrl, "/api/mcp/gateway/test", { method: "POST", body: JSON.stringify({ client: "codex" }) });
  assert.equal(tested.response.status, 200);
  assert.equal(tested.body.result.ok, true);
  assert.equal(tested.body.result.state, "ready");
});

test("host-authenticated principals cannot read or cancel each other's TaskRuns", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-gateway-owners-"));
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir },
    gatewayAuthenticate: async ({ bootstrapCredential, client }) => {
      if (!bootstrapCredential?.startsWith("principal-")) return null;
      return {
        principalId: bootstrapCredential.slice("principal-".length),
        clientName: client?.name,
        grantedScopes: ["capabilities:read", "tasks:create", "tasks:read-own", "tasks:cancel-own", "tasks:retry-own", "tasks:steer-own", "artifacts:read-own", "ledger:read-own"],
      };
    },
  });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const alpha = await openSession(baseUrl, "principal-alpha-alpha-alpha-alpha", "alpha-agent");
  const bravo = await openSession(baseUrl, "principal-bravo-bravo-bravo-bravo", "bravo-agent");
  const created = await call(baseUrl, alpha, "preacherman.task.create", { objective: "Alpha owned task" });
  const taskId = created.body.structuredContent.taskId;
  const alphaGet = await call(baseUrl, alpha, "preacherman.task.get", { taskId });
  assert.equal(alphaGet.response.status, 200);
  const bravoGet = await call(baseUrl, bravo, "preacherman.task.get", { taskId });
  assert.equal(bravoGet.response.status, 404);
  const bravoCancel = await call(baseUrl, bravo, "preacherman.task.cancel", { taskId });
  assert.equal(bravoCancel.response.status, 404);
  const bravoList = await call(baseUrl, bravo, "preacherman.task.list", {});
  assert.deepEqual(bravoList.body.structuredContent.items, []);
});

test("external Agent approval executes a real task and returns events, artifact content, and Ledger evidence", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-gateway-flow-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const bootstrap = (await readFile(join(dataDir, "mcp-gateway.bootstrap"), "utf8")).trim();
  const session = await openSession(baseUrl, bootstrap, "approval-flow-agent");
  const created = await call(baseUrl, session, "preacherman.task.create", { objective: "Create an owned reviewable pitch artifact." });
  const pending = created.body.structuredContent;
  assert.equal(pending.status, "waiting_for_approval");

  const approved = await request(baseUrl, `/api/tasks/${encodeURIComponent(pending.taskId)}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "approve", approvalId: pending.pendingApproval.approvalId }),
  });
  assert.equal(approved.response.status, 200);

  let task;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const current = await call(baseUrl, session, "preacherman.task.get", { taskId: pending.taskId });
    task = current.body.structuredContent;
    if (["succeeded", "failed", "cancelled"].includes(task.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(task.status, "succeeded");

  const events = await call(baseUrl, session, "preacherman.task.events", { taskId: task.taskId, cursor: "0", limit: 100 });
  assert.equal(events.response.status, 200);
  assert.ok(events.body.structuredContent.events.some((event) => event.stage === "terminal"));

  const artifacts = await call(baseUrl, session, "preacherman.artifact.list", { taskId: task.taskId });
  assert.equal(artifacts.response.status, 200);
  assert.ok(artifacts.body.structuredContent.items.length > 0);
  const artifact = artifacts.body.structuredContent.items[0];
  assert.match(artifact.mediaType || artifact.mimeType, /json|text/);

  const content = await call(baseUrl, session, "preacherman.artifact.read", { taskId: task.taskId, artifactId: artifact.artifactId, offset: 0, limit: 65_536 });
  assert.equal(content.response.status, 200);
  assert.equal(typeof content.body.structuredContent.content, "string");
  assert.ok(content.body.structuredContent.content.length > 0);

  const ledger = await call(baseUrl, session, "preacherman.ledger.get", { taskId: task.taskId });
  assert.equal(ledger.response.status, 200);
  assert.equal(ledger.body.structuredContent.status, "succeeded");
  assert.ok(ledger.body.structuredContent.approvals.some((approval) => approval.status === "approved"));
  assert.ok(ledger.body.structuredContent.artifacts.length > 0);
});
