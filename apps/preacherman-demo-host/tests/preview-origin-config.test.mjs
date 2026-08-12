import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

test("an explicit local preview origin extends CORS and DOM observation without opening remote origins", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-preview-origin-"));
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir, PREACHERMAN_PREVIEW_ORIGINS: "http://127.0.0.1:1422" },
  });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const allowed = await fetch(`${baseUrl}/api/health`, { headers: { Origin: "http://127.0.0.1:1422" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:1422");

  const snapshot = await fetch(`${baseUrl}/api/computer-vision/dom-snapshot`, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:1422", "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, surface: "settings", capturedAt: new Date().toISOString(), nodes: [], truncated: false }),
  });
  assert.equal(snapshot.status, 202);

  const rejected = await fetch(`${baseUrl}/api/health`, { headers: { Origin: "https://example.com" } });
  assert.equal(rejected.status, 403);
});

test("preview origin configuration rejects non-local or non-origin values", () => {
  for (const origin of ["https://127.0.0.1:1422", "http://example.com:1422", "http://127.0.0.1:1422/path", "not-a-url"]) {
    assert.throws(
      () => createPreachermanServer({ env: { PREACHERMAN_PREVIEW_ORIGINS: origin } }),
      /PREACHERMAN_PREVIEW_ORIGINS/,
    );
  }
});
