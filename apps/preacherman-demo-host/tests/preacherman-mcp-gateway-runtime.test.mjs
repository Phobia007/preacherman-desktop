import assert from "node:assert/strict";
import test from "node:test";

import {
  PreachermanMcpGatewayError,
  createPreachermanMcpGatewayRuntime,
} from "../server/mcp-gateway/preachermanMcpGatewayRuntime.mjs";
import {
  createPreachermanMcpGatewayAudit,
  redactMcpGatewayAuditValue,
} from "../server/mcp-gateway/preachermanMcpGatewayAudit.mjs";

function task(id, ownerPrincipalId, extra = {}) {
  return { id, ownerPrincipalId, status: "queued", ...extra };
}

function fixture(options = {}) {
  const tasks = [task("task_alice", "alice"), task("task_bob", "bob")];
  const calls = [];
  const bridge = {
    capabilities: async () => ({
      tools: { "preacherman.task.steer": { state: "configuration-required", reason: "Runner does not support steering." } },
      executionBackends: [{ id: "local", state: "ready", capabilities: { progress: true, approval: true, cancellation: true, retry: true, resume: false, steering: false, artifacts: true } }],
    }),
    task: {
      create: async ({ actor, input }) => {
        calls.push(["create", actor, input]);
        const created = task("task_new", actor.principalId, { title: input.title });
        tasks.push(created);
        return created;
      },
      get: async ({ input }) => tasks.find(({ id }) => id === input.taskId),
      list: async () => ({ items: tasks, nextCursor: null }),
      events: async ({ actor, input }) => ({ taskId: input.taskId, principalId: actor.principalId, events: [] }),
      cancel: async ({ input }) => ({ taskId: input.taskId, status: "cancelled" }),
      retry: async ({ input }) => ({ taskId: input.taskId, retryId: "task_retry" }),
      steer: async ({ input }) => ({ taskId: input.taskId, accepted: true }),
    },
    artifact: {
      list: async ({ input }) => ({ items: [{ id: "artifact_1", taskId: input.taskId, name: "result.txt", path: "D:/private/result.txt", content: "secret" }] }),
      read: async ({ input }) => ({ artifactId: input.artifactId, taskId: input.taskId, mimeType: "text/plain", content: "result" }),
    },
    ledger: { get: async ({ input }) => ({ taskId: input.taskId, summary: "done" }) },
  };
  return { runtime: createPreachermanMcpGatewayRuntime({ bridge, bootstrapCredential: "bootstrap-credential-for-tests", ...options }), tasks, calls };
}

async function session(runtime, overrides = {}) {
  return runtime.createSession({
    bootstrapCredential: "bootstrap-credential-for-tests",
    client: { name: "Codex CLI", version: "1.0" },
    transport: "stdio",
    ...overrides,
  });
}

test("session authentication yields a private token and derives principal/scopes from the host", async () => {
  const { runtime } = fixture({
    authenticate: async ({ bootstrapCredential }) => bootstrapCredential === "ok"
      ? { principalId: "alice", grantedScopes: ["capabilities:read", "tasks:create"] }
      : null,
  });
  await assert.rejects(runtime.createSession({ bootstrapCredential: "bad" }), { code: "UNAUTHENTICATED", statusCode: 401 });
  const opened = await runtime.createSession({ bootstrapCredential: "ok", client: { name: "Codex" } });
  assert.equal(opened.session.principalId, "alice");
  assert.equal(typeof opened.accessToken, "string");
  assert.equal("accessToken" in runtime.listSessions()[0], false);
  await assert.rejects(runtime.call({ sessionId: opened.session.sessionId, accessToken: "wrong", name: "preacherman.capabilities" }), { code: "UNAUTHENTICATED" });
});

test("scope checks and forbidden identity arguments fail before bridge invocation", async () => {
  const audit = createPreachermanMcpGatewayAudit();
  const { runtime, calls } = fixture({ audit, authenticate: async () => ({ principalId: "alice", grantedScopes: ["tasks:create"] }) });
  const opened = await runtime.createSession({ bootstrapCredential: "anything" });
  await assert.rejects(runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name: "preacherman.task.get", arguments: { taskId: "task_alice" } }), { code: "SCOPE_DENIED" });
  await assert.rejects(runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name: "preacherman.task.create", arguments: { objective: "Build", principalId: "bob" } }), { code: "INVALID_INPUT" });
  await assert.rejects(runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name: "preacherman.task.create", arguments: { objective: "Build", metadata: { scopes: ["admin"] } } }), { code: "INVALID_INPUT" });
  assert.equal(calls.length, 0);
  assert.deepEqual(audit.list().map(({ errorCode }) => errorCode), ["INVALID_INPUT", "INVALID_INPUT", "SCOPE_DENIED"]);
});

test("create injects immutable actor identity and validates returned ownership", async () => {
  const { runtime, calls } = fixture({ authenticate: async () => ({ principalId: "alice", grantedScopes: ["tasks:create"] }) });
  const opened = await runtime.createSession({ bootstrapCredential: "anything", client: { name: "Codex" } });
  const result = await runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name: "preacherman.task.create", arguments: { objective: "Build", title: "Demo" } });
  assert.equal(result.structuredContent.ownerPrincipalId, "alice");
  assert.equal(calls[0][1].principalId, "alice");
  assert.equal(Object.isFrozen(calls[0][1]), true);
});

test("all task, artifact, and ledger reads enforce owner isolation", async () => {
  const { runtime } = fixture({ authenticate: async () => ({ principalId: "alice", grantedScopes: ["tasks:read-own", "artifacts:read-own", "ledger:read-own"] }) });
  const opened = await runtime.createSession({ bootstrapCredential: "anything" });
  const invoke = (name, arguments_) => runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name, arguments: arguments_ });
  assert.equal((await invoke("preacherman.task.get", { taskId: "task_alice" })).structuredContent.id, "task_alice");
  await assert.rejects(invoke("preacherman.task.get", { taskId: "task_bob" }), { code: "OWNER_MISMATCH", statusCode: 403 });
  await assert.rejects(invoke("preacherman.artifact.list", { taskId: "task_bob" }), { code: "OWNER_MISMATCH" });
  await assert.rejects(invoke("preacherman.ledger.get", { taskId: "task_bob" }), { code: "OWNER_MISMATCH" });
  const listed = await invoke("preacherman.task.list", { limit: 20 });
  assert.deepEqual(listed.structuredContent.items.map(({ id }) => id), ["task_alice"]);
  const artifacts = await invoke("preacherman.artifact.list", { taskId: "task_alice" });
  assert.equal(artifacts.structuredContent.items[0].path, undefined);
  assert.equal(artifacts.structuredContent.items[0].content, undefined);
});

test("capabilities reflect handlers, current backend states, granted scope, and limits", async () => {
  const { runtime } = fixture({ authenticate: async () => ({ principalId: "alice", grantedScopes: ["capabilities:read", "tasks:read-own"] }) });
  const opened = await runtime.createSession({ bootstrapCredential: "anything" });
  const result = await runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name: "preacherman.capabilities" });
  const get = (name) => result.structuredContent.tools.find((tool) => tool.name === name);
  assert.deepEqual([get("preacherman.task.get").state, get("preacherman.task.get").availableToSession], ["ready", true]);
  assert.deepEqual([get("preacherman.task.create").state, get("preacherman.task.create").availableToSession], ["ready", false]);
  assert.equal(get("preacherman.task.steer").state, "configuration-required");
  assert.equal(result.structuredContent.executionBackends[0].capabilities.approval, true);
});

test("revocation, rotation, size limits, and stable errors are enforced", async () => {
  const { runtime } = fixture();
  const first = await session(runtime);
  const closed = runtime.closeSession(first.session.sessionId);
  assert.equal("accessToken" in closed, false);
  await assert.rejects(runtime.call({ sessionId: first.session.sessionId, accessToken: first.accessToken, name: "preacherman.capabilities" }), { code: "SESSION_REVOKED" });
  const second = await session(runtime);
  const rotated = runtime.rotateCredential("replacement-bootstrap-credential");
  assert.ok(rotated.revokedSessionCount >= 1);
  await assert.rejects(runtime.call({ sessionId: second.session.sessionId, accessToken: second.accessToken, name: "preacherman.capabilities" }), { code: "SESSION_REVOKED" });
  await assert.rejects(session(runtime), { code: "UNAUTHENTICATED" });

  const small = fixture({ maxInputBytes: 20 });
  const opened = await session(small.runtime);
  await assert.rejects(small.runtime.call({ sessionId: opened.session.sessionId, accessToken: opened.accessToken, name: "preacherman.task.create", arguments: { objective: "a long objective" } }), { code: "INPUT_TOO_LARGE" });
  const error = new PreachermanMcpGatewayError("EXAMPLE", "Safe message", { statusCode: 418 });
  assert.deepEqual(error.toJSON(), { code: "EXAMPLE", message: "Safe message", statusCode: 418, retryable: false });
});

test("audit recursively redacts credentials and does not retain prompt or artifact content", async () => {
  const written = [];
  const audit = createPreachermanMcpGatewayAudit({ write: async (record) => written.push(record) });
  await audit.record({ principalId: "alice", sessionId: "s1", toolName: "task.create", outcome: "failed", metadata: { authorization: "Bearer abcdefghijklmnop", nested: { apiKey: "sk-supersecret", prompt: "private prompt", harmless: "Bearer tokenvalue" } } });
  const encoded = JSON.stringify(written);
  assert.doesNotMatch(encoded, /abcdefgh|supersecret|private prompt|tokenvalue/);
  assert.match(encoded, /REDACTED/);
  assert.deepEqual(redactMcpGatewayAuditValue({ content: "secret body", safe: "hello" }), { content: "[REDACTED]", safe: "hello" });
});
