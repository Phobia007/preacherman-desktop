import assert from "node:assert/strict";
import test from "node:test";
import { createPreachermanExecutionClient } from "../server/preacherman-execution/preachermanExecutionClient.mjs";

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("Preacherman Execution Client owns the BaseResponse, auth header, and create-and-run contract", async () => {
  const calls = [];
  const client = createPreachermanExecutionClient({
    baseUrl: "http://127.0.0.1:19191/",
    token: "secret-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response(201, { success: true, message: "started", data: { run_id: "run-1" } });
    },
  });
  assert.deepEqual(await client.createAndRun({ workflow_id: "wf", prompt: "objective" }), { run_id: "run-1" });
  assert.equal(calls[0].url, "http://127.0.0.1:19191/api/runs/create-and-run");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
  assert.equal(JSON.parse(calls[0].init.body).workflow_id, "wf");
});

test("Preacherman Execution Client reports invalid responses and redacts credentials", async () => {
  const client = createPreachermanExecutionClient({
    token: "secret-token",
    fetchImpl: async () => response(403, { success: false, error: "Bearer secret-token denied" }),
  });
  await assert.rejects(client.runtimeStatus(), (error) => {
    assert.equal(error.code, "PREACHERMAN_EXECUTION_HTTP_ERROR");
    assert.equal(error.statusCode, 403);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test("Preacherman Execution Client probes an encrypted setting by ID without transporting provider credentials", async () => {
  const calls = [];
  const client = createPreachermanExecutionClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response(200, {
        success: true,
        message: "runtime detected",
        data: { available: true, preferred_harness: "codex_appserver", endpoints: { responses: { available: true, status: 200 } } },
      });
    },
  });

  const result = await client.detectModelRuntime("encrypted-setting-1");
  assert.equal(result.endpoints.responses.available, true);
  assert.equal(calls[0].url, "http://127.0.0.1:19191/api/llm/models/detect-runtime");
  assert.deepEqual(JSON.parse(calls[0].init.body), { setting_id: "encrypted-setting-1" });
  assert.doesNotMatch(JSON.stringify(calls), /api[_-]?key|sk-|provider-secret/i);
});

test("Preacherman Execution Client enforces a bounded timeout", async () => {
  const client = createPreachermanExecutionClient({
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })),
  });
  await assert.rejects(client.runtimeStatus(), { code: "PREACHERMAN_EXECUTION_TIMEOUT", statusCode: 504 });
});

test("Preacherman Execution Client consumes SSE as content-free reconciliation signals", async () => {
  const calls = [];
  const signals = [];
  const client = createPreachermanExecutionClient({
    token: "stream-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response([
        "event: dag:engine_started",
        "data: {\"private\":\"worker transcript\"}",
        "",
        "event: dag:artifact_ready",
        "data: {\"token\":\"must not escape\"}",
        "",
        "",
      ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    },
  });
  await client.watchRunEvents("run/one", { onSignal: (signal) => signals.push(signal) });
  assert.equal(calls[0].url, "http://127.0.0.1:19191/api/dag-status/run%2Fone/events");
  assert.equal(calls[0].init.headers.Authorization, "Bearer stream-secret");
  assert.deepEqual(signals, [{ event: "dag:engine_started" }, { event: "dag:artifact_ready" }]);
  assert.doesNotMatch(JSON.stringify(signals), /worker transcript|must not escape|stream-secret/);
});
