import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { contractsRoot } from "../scripts/lib/registry.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadServers() {
  const mockPath = join(contractsRoot, "scripts/mock-server.mjs");
  const ssePath = join(contractsRoot, "scripts/sse-fixture-server.mjs");
  assert.equal(await exists(mockPath), true, "HTTP mock server module must exist");
  assert.equal(await exists(ssePath), true, "SSE fixture server module must exist");
  return Promise.all([import("../scripts/mock-server.mjs"), import("../scripts/sse-fixture-server.mjs")]);
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("HTTP mock serves critical product flows from bundled examples", async () => {
  const [{ createMockServer }] = await loadServers();
  const server = await createMockServer();
  const baseUrl = await listen(server);

  try {
    const cases = [
      ["POST", "/api/v1/auth/login", 200],
      ["GET", "/api/v1/home", 200],
      ["POST", "/api/v1/task-runs", 202],
      ["GET", "/api/v1/test-runs/test_run_01/result", 200],
      ["POST", "/api/v1/uploads", 201],
    ];

    for (const [method, path, expectedStatus] of cases) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", "idempotency-key": "idem_test_01" },
        body: method === "GET" ? undefined : "{}",
      });
      assert.equal(response.status, expectedStatus, `${method} ${path}`);
      if (response.status !== 204) {
        const body = await response.json();
        assert.ok(Object.keys(body).length > 0, `${method} ${path} should return its example body`);
      }
      assert.match(response.headers.get("x-request-id"), /^req_/);
    }
  } finally {
    await close(server);
  }
});

test("HTTP mock returns stable error fixtures and a stable not-found response", async () => {
  const [{ createMockServer }] = await loadServers();
  const server = await createMockServer();
  const baseUrl = await listen(server);

  try {
    const validation = await fetch(`${baseUrl}/api/v1/task-runs?error=VALIDATION_FAILED`, { method: "POST" });
    assert.equal(validation.status, 422);
    assert.equal((await validation.json()).error.code, "VALIDATION_FAILED");

    const missing = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, "RESOURCE_NOT_FOUND");
  } finally {
    await close(server);
  }
});

test("SSE fixture server exposes normal, duplicate, resume, and cursor-expired scenarios", async () => {
  const [, { createSseFixtureServer }] = await loadServers();
  const server = createSseFixtureServer();
  const baseUrl = await listen(server);

  try {
    const normal = await fetch(`${baseUrl}/events?scenario=normal`);
    assert.equal(normal.status, 200);
    assert.match(normal.headers.get("content-type"), /^text\/event-stream/);
    const normalBody = await normal.text();
    assert.match(normalBody, /event: operation\.progress/);
    assert.match(normalBody, /event: operation\.succeeded/);

    const duplicateBody = await (await fetch(`${baseUrl}/events?scenario=duplicate`)).text();
    const duplicateIds = [...duplicateBody.matchAll(/^id: (.+)$/gm)].map((match) => match[1]);
    assert.ok(duplicateIds.length >= 2);
    assert.equal(duplicateIds[0], duplicateIds[1]);

    const resumeBody = await (await fetch(`${baseUrl}/events?scenario=resume&after_sequence=1`)).text();
    assert.match(resumeBody, /^id: operation:operation_01:2/m);
    assert.doesNotMatch(resumeBody, /^id: operation:operation_01:1/m);

    const expired = await fetch(`${baseUrl}/events?scenario=cursor-expired`);
    assert.equal(expired.status, 409);
    assert.equal((await expired.json()).error.code, "EVENT_CURSOR_EXPIRED");
  } finally {
    await close(server);
  }
});
