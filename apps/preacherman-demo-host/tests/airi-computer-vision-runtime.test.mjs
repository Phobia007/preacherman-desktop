import assert from "node:assert/strict";
import test from "node:test";
import {
  AIRI_COMPUTER_VISION_CATALOG,
  createAiriComputerVisionRuntime,
} from "../server/airiComputerVisionRuntime.mjs";

const ONE_PIXEL_PNG = "iVBORw0KGgo=";

test("catalog declares four unavailable capabilities without pretending success", async () => {
  const runtime = createAiriComputerVisionRuntime();

  assert.deepEqual(runtime.catalog().map(({ id }) => id), [
    "screenshot", "camera-window", "cursor-monitor", "vision-analysis",
  ]);
  assert.deepEqual(AIRI_COMPUTER_VISION_CATALOG.map(({ id }) => id), runtime.catalog().map(({ id }) => id));
  assert.equal(runtime.list().every(({ phase }) => phase === "external-runtime-required"), true);
  assert.deepEqual(await runtime.test("screenshot"), { status: "external-runtime-required", capability: "screenshot" });
  assert.deepEqual(await runtime.invoke("screenshot", {}), {
    status: "external-runtime-required", capability: "screenshot", result: null,
  });
});

test("registered fake screenshot adapter is tested and invoked with a validated contract", async () => {
  const calls = [];
  const runtime = createAiriComputerVisionRuntime({ now: () => "2026-08-08T00:00:00.000Z" });
  runtime.registerAdapter({
    pluginId: "desktop-plugin",
    capability: "screenshot",
    adapter: {
      async test({ capability, signal }) {
        calls.push(["test", capability, signal instanceof AbortSignal]);
        return { ok: true };
      },
      async invoke({ capability, input, signal }) {
        calls.push(["invoke", capability, input, signal instanceof AbortSignal]);
        return {
          image: { mimeType: "image/png", data: ONE_PIXEL_PNG, width: 1, height: 1 },
          capturedAt: "2026-08-08T00:00:00.000Z",
        };
      },
    },
  });

  assert.equal((await runtime.test("screenshot")).status, "succeeded");
  const invoked = await runtime.invoke("screenshot", { displayId: "primary", format: "png", maxWidth: 1920 });
  assert.equal(invoked.status, "succeeded");
  assert.equal(invoked.result.image.width, 1);
  assert.deepEqual(calls, [
    ["test", "screenshot", true],
    ["invoke", "screenshot", { displayId: "primary", format: "png", maxWidth: 1920 }, true],
  ]);
  assert.equal(runtime.status("screenshot").phase, "ready");
});

test("input type and image size limits reject unsafe payloads before adapter invocation", async () => {
  let invoked = 0;
  const runtime = createAiriComputerVisionRuntime({ maxImageBytes: 3, maxInputBytes: 1_000 });
  runtime.registerAdapter({
    pluginId: "vision-plugin",
    capability: "vision-analysis",
    adapter: {
      async test() { return { ok: true }; },
      async invoke() { invoked += 1; return { summary: "unused" }; },
    },
  });

  await assert.rejects(
    runtime.invoke("vision-analysis", { image: { mimeType: "image/png", data: "AQIDBA==" } }),
    { code: "COMPUTER_VISION_INPUT_TOO_LARGE", statusCode: 413 },
  );
  await assert.rejects(
    runtime.invoke("camera-window", { source: "desktop" }),
    { code: "INVALID_COMPUTER_VISION_INPUT", statusCode: 400 },
  );
  await assert.rejects(
    runtime.invoke("cursor-monitor", { durationMs: 60_000 }),
    { code: "INVALID_COMPUTER_VISION_INPUT", statusCode: 400 },
  );
  assert.equal(invoked, 0);
});

test("invalid adapter results and secret-bearing errors are replaced with safe host errors", async () => {
  const runtime = createAiriComputerVisionRuntime();
  runtime.registerAdapter({
    pluginId: "unsafe-plugin",
    capability: "vision-analysis",
    adapter: {
      async test() { return { ok: true }; },
      async invoke() { throw new Error("provider api key sk-live-secret failed"); },
    },
  });

  const failed = await runtime.invoke("vision-analysis", {
    image: { mimeType: "image/png", data: ONE_PIXEL_PNG },
    prompt: "describe",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "COMPUTER_VISION_ADAPTER_FAILED");
  assert.equal(JSON.stringify(failed).includes("sk-live-secret"), false);

  await runtime.unregisterAdapter("vision-analysis", "unsafe-plugin");
  runtime.registerAdapter({
    pluginId: "invalid-plugin",
    capability: "vision-analysis",
    adapter: {
      async test() { return { ok: true }; },
      async invoke() { return { summary: "valid", apiKey: "must-not-escape" }; },
    },
  });
  const invalid = await runtime.invoke("vision-analysis", {
    image: { mimeType: "image/png", data: ONE_PIXEL_PNG },
  });
  assert.equal(invalid.error.code, "INVALID_ADAPTER_RESULT");
  assert.equal(JSON.stringify(invalid).includes("must-not-escape"), false);
});

test("invocation timeout aborts the adapter and remains a failed, explicit result", async () => {
  let aborted = false;
  const runtime = createAiriComputerVisionRuntime({ timeoutMs: 20 });
  runtime.registerAdapter({
    pluginId: "cursor-plugin",
    capability: "cursor-monitor",
    adapter: {
      async test() { return { ok: true }; },
      invoke({ signal }) {
        signal.addEventListener("abort", () => { aborted = true; }, { once: true });
        return new Promise(() => {});
      },
    },
  });

  const result = await runtime.invoke("cursor-monitor", { durationMs: 100 });
  assert.equal(aborted, true);
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "COMPUTER_VISION_TIMEOUT");
  assert.equal(result.error.statusCode, 504);
  assert.equal(runtime.status("cursor-monitor").phase, "error");
});

test("plugin ownership, removePlugin, and close dispose adapters exactly once", async () => {
  const disposed = [];
  const runtime = createAiriComputerVisionRuntime();
  const adapter = (id) => ({
    async test() { return { ok: true }; },
    async invoke() { return { image: { mimeType: "image/png", data: ONE_PIXEL_PNG, width: 1, height: 1 } }; },
    async dispose() { disposed.push(id); },
  });
  runtime.registerAdapter({ pluginId: "capture-plugin", capability: "screenshot", adapter: adapter("screenshot") });
  runtime.registerAdapter({ pluginId: "capture-plugin", capability: "camera-window", adapter: adapter("camera-window") });

  await assert.rejects(
    runtime.unregisterAdapter("screenshot"),
    { code: "INVALID_COMPUTER_VISION_ADAPTER", statusCode: 400 },
  );
  await assert.rejects(
    runtime.unregisterAdapter("screenshot", "other-plugin"),
    { code: "COMPUTER_VISION_ADAPTER_OWNER_MISMATCH", statusCode: 403 },
  );
  assert.deepEqual(await runtime.removePlugin("capture-plugin"), { adapters: 2 });
  assert.deepEqual(disposed, ["screenshot", "camera-window"]);
  assert.equal(runtime.status("screenshot").phase, "external-runtime-required");

  runtime.registerAdapter({ pluginId: "new-plugin", capability: "screenshot", adapter: adapter("new") });
  await runtime.close();
  await runtime.close();
  assert.equal(disposed.filter((id) => id === "new").length, 1);
  assert.throws(
    () => runtime.registerAdapter({ pluginId: "late-plugin", capability: "screenshot", adapter: adapter("late") }),
    { code: "COMPUTER_VISION_RUNTIME_CLOSED", statusCode: 409 },
  );
});
