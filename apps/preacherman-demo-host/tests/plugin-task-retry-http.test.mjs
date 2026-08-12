import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";
const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "preacherman-plugin", "success");

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

test("plugin retry re-executes the original qualified tool and never starts PitchKit", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-plugin-retry-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const installed = await request(baseUrl, "/api/plugins/install", {
    method: "POST",
    body: JSON.stringify({ directory: fixture }),
  });
  assert.equal(installed.response.status, 201);

  const blocked = await request(baseUrl, "/api/plugins/tools/call", {
    method: "POST",
    body: JSON.stringify({ name: "fixture-plugin::recent_conversations", arguments: {}, approved: false }),
  });
  assert.equal(blocked.response.status, 403);

  const listed = await request(baseUrl, "/api/tasks?limit=10");
  const failed = listed.body.tasks.find((task) => task.toolCall?.qualifiedName === "fixture-plugin::recent_conversations");
  assert.equal(failed.source, "preacherman-plugin");
  assert.equal(failed.providerPluginId, "fixture-plugin");
  assert.equal(failed.status, "failed");

  const retried = await request(baseUrl, `/api/agent/runs/${encodeURIComponent(failed.taskId)}/retry`, {
    method: "POST",
    body: JSON.stringify({ approved: true }),
  });
  assert.equal(retried.response.status, 202);
  assert.equal(retried.body.run.status, "succeeded");
  assert.equal(retried.body.run.toolCall.qualifiedName, "fixture-plugin::recent_conversations");
  assert.equal(retried.body.run.artifact.name, "recent_conversations-result.json");
  assert.notEqual(retried.body.run.executor, "pitchkit");

  const invalidRetry = await request(baseUrl, `/api/agent/runs/${encodeURIComponent(retried.body.run.taskId)}/retry`, {
    method: "POST",
    body: JSON.stringify({ approved: true }),
  });
  assert.equal(invalidRetry.response.status, 409);
});

test("plugin retry without persisted arguments fails honestly instead of replaying empty input", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-plugin-retry-args-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  await request(baseUrl, "/api/plugins/install", { method: "POST", body: JSON.stringify({ directory: fixture }) });
  await request(baseUrl, "/api/plugins/tools/call", {
    method: "POST",
    body: JSON.stringify({ name: "fixture-plugin::echo", arguments: { value: "retry-secret" }, approved: false }),
  });
  const listed = await request(baseUrl, "/api/tasks?limit=10");
  const failed = listed.body.tasks.find((task) => task.toolCall?.qualifiedName === "fixture-plugin::echo");
  assert.deepEqual(failed.toolCall.parameterSummary.keys, ["value"]);

  const retried = await request(baseUrl, `/api/agent/runs/${encodeURIComponent(failed.taskId)}/retry`, {
    method: "POST",
    body: JSON.stringify({ approved: true }),
  });
  assert.equal(retried.response.status, 409);
  assert.match(retried.body.error, /arguments are not persisted/i);
});
