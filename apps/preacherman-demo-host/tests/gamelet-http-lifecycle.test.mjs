import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

test("Gamelet HTTP lifecycle pauses, resumes, stops, and destroys a real server session", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-gamelet-http-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const created = await request(baseUrl, "/api/gamelets/sessions", {
    method: "POST",
    body: JSON.stringify({ gameletId: "tic-tac-toe" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.session.status, "active");
  const sessionId = created.body.session.id;

  const paused = await request(baseUrl, `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/pause`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(paused.response.status, 200);
  assert.equal(paused.body.session.status, "paused");

  const rejectedAction = await request(baseUrl, `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: { type: "place", cell: 0 } }),
  });
  assert.equal(rejectedAction.response.status, 409);

  const resumed = await request(baseUrl, `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/resume`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(resumed.body.session.status, "active");

  const stopped = await request(baseUrl, `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: "POST",
    body: JSON.stringify({ reason: "test-complete" }),
  });
  assert.equal(stopped.body.session.status, "stopped");

  const destroyed = await request(baseUrl, `/api/gamelets/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  assert.equal(destroyed.response.status, 200);
  assert.equal(destroyed.body.session.status, "destroyed");

  const afterDestroy = await request(baseUrl, `/api/gamelets/sessions/${encodeURIComponent(sessionId)}/resume`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(afterDestroy.response.status, 404);
});
