import assert from "node:assert/strict";
import test from "node:test";
import { createPreachermanDomObservationRuntime } from "../server/preachermanDomObservationRuntime.mjs";

function snapshot(overrides = {}) {
  return {
    url: "http://127.0.0.1:1420/__surfaces/workspace",
    title: "Preacherman Desktop Demo",
    surface: "workspace",
    capturedAt: "2026-08-08T10:00:00.000Z",
    nodes: [{ tag: "button", role: "button", name: "Confirm and run", selector: "button:nth-of-type(1)", disabled: false, visible: true, depth: 4 }],
    truncated: false,
    ...overrides,
  };
}

test("real browser DOM snapshots support bounded observation and inspection without text or values", () => {
  let time = 1_000;
  const runtime = createPreachermanDomObservationRuntime({ clock: () => time, now: () => "2026-08-08T10:00:00.000Z" });
  assert.equal(runtime.status().phase, "external-runtime-required");
  assert.equal(runtime.ingest(snapshot()).status, "ready");
  assert.equal(runtime.status().adapter.pluginId, "preacherman-web-dom");
  assert.match(runtime.observe({ callerPluginId: "preacherman-ui", target: { kind: "web", id: snapshot().url } }).result.summary, /1 structural DOM nodes/);
  const inspected = runtime.inspectDom({ callerPluginId: "fixture-plugin", target: { kind: "web", id: snapshot().url }, selector: "Confirm" });
  assert.equal(inspected.result.nodes[0].name, "Confirm and run");
  assert.equal("text" in inspected.result.nodes[0], false);
  assert.equal("value" in inspected.result.nodes[0], false);
  assert.deepEqual(runtime.logs().map(({ type }) => type), ["inspect-dom", "observe"]);

  time += 16_000;
  assert.equal(runtime.status().phase, "external-runtime-required");
  assert.throws(() => runtime.observe({ callerPluginId: "preacherman-ui", target: { kind: "web", id: snapshot().url } }), { code: "DOM_SNAPSHOT_REQUIRED", statusCode: 409 });
});

test("DOM snapshot ingestion rejects secrets, user text, unknown URLs, and oversized structures", () => {
  const runtime = createPreachermanDomObservationRuntime();
  assert.throws(() => runtime.ingest(snapshot({ nodes: [{ ...snapshot().nodes[0], value: "secret" }] })), /value is not allowed/);
  assert.throws(() => runtime.ingest(snapshot({ nodes: [{ ...snapshot().nodes[0], text: "private conversation" }] })), /text is not allowed/);
  assert.throws(() => runtime.ingest(snapshot({ url: "https://example.com/__surfaces/workspace" })), { code: "DOM_TARGET_OUT_OF_SCOPE", statusCode: 403 });
  assert.throws(() => runtime.ingest(snapshot({ nodes: Array.from({ length: 201 }, () => snapshot().nodes[0]) })), /at most 200 nodes/);
});

test("DOM observation accepts the dedicated PREACHERMAN preview origin", () => {
  const runtime = createPreachermanDomObservationRuntime();
  const previewSnapshot = snapshot({ url: "http://127.0.0.1:1421/__surfaces/workspace" });
  assert.equal(runtime.ingest(previewSnapshot).status, "ready");
  assert.match(
    runtime.observe({ callerPluginId: "preacherman-ui", target: { kind: "web", id: previewSnapshot.url } }).result.summary,
    /1 structural DOM nodes/,
  );
});
