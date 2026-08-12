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

test("browser DOM bridge becomes a real read-only Computer Use target over HTTP", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-dom-http-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const previewPreflight = await fetch(`${baseUrl}/api/computer-vision/dom-snapshot`, {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:1421" },
  });
  assert.equal(previewPreflight.status, 204);
  assert.equal(previewPreflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:1421");

  const posted = await request(baseUrl, "/api/computer-vision/dom-snapshot", {
    method: "POST",
    body: JSON.stringify({
      schemaVersion: 1,
      surface: "workspace",
      capturedAt: new Date().toISOString(),
      nodes: [{
        tag: "button",
        role: "button",
        preachermanControl: ["task.confirm"],
        disabled: false,
        visible: true,
        path: "preacherman:task.confirm",
      }],
      truncated: false,
    }),
  });
  assert.equal(posted.response.status, 202);

  const dashboard = await request(baseUrl, "/api/computer-vision");
  assert.equal(dashboard.body.computerUse.phase, "ready");
  const target = dashboard.body.computerUse.targets.find((candidate) => candidate.kind === "web");
  assert.equal(target.id, `${origin}/__surfaces/workspace`);

  const observed = await request(baseUrl, "/api/computer-vision/computer-use/observe", {
    method: "POST",
    body: JSON.stringify({ target }),
  });
  assert.equal(observed.body.result.status, "succeeded");

  const inspected = await request(baseUrl, "/api/computer-vision/computer-use/inspect-dom", {
    method: "POST",
    body: JSON.stringify({ target, selector: "task.confirm", maxDepth: 8 }),
  });
  assert.equal(inspected.body.result.status, "succeeded");
  assert.equal(inspected.body.result.result.nodes[0].name, "task.confirm");
  assert.equal("text" in inspected.body.result.result.nodes[0], false);
  assert.equal("value" in inspected.body.result.result.nodes[0], false);
});
