import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";

async function start(dataDir) {
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  return { service, baseUrl: `http://127.0.0.1:${port}` };
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

test("external connection settings survive a real local-service restart without returning secrets", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-connections-http-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));

  const first = await start(dataDir);
  const configured = await request(first.baseUrl, "/api/connections/youtube/configure", {
    method: "POST",
    body: JSON.stringify({ configuration: { accessToken: "youtube-secret", videoId: "video-7" } }),
  });
  assert.equal(configured.response.status, 200);
  assert.equal(configured.body.connection.configuration.secrets.accessToken, true);
  assert.equal(JSON.stringify(configured.body).includes("youtube-secret"), false);
  await first.service.close();

  const restarted = await start(dataDir);
  t.after(() => restarted.service.close());
  const listed = await request(restarted.baseUrl, "/api/connections");
  const youtube = listed.body.connections.find((connection) => connection.id === "youtube");
  assert.equal(youtube.configuration.values.videoId, "video-7");
  assert.equal(youtube.configuration.secrets.accessToken, true);
  assert.equal(youtube.status, "external-runtime-required");
  assert.equal(JSON.stringify(youtube).includes("youtube-secret"), false);
});
