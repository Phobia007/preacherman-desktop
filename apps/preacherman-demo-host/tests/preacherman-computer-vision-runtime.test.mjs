import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PREACHERMAN_COMPUTER_VISION_CATALOG,
  createPreachermanComputerVisionRuntime,
} from "../server/preachermanComputerVisionRuntime.mjs";

const ONE_PIXEL_PNG = "iVBORw0KGgo=";

test("catalog declares four unavailable capabilities without pretending success", async () => {
  const runtime = createPreachermanComputerVisionRuntime();

  assert.deepEqual(runtime.catalog().map(({ id }) => id), [
    "screenshot", "camera-window", "cursor-monitor", "vision-analysis",
  ]);
  assert.deepEqual(PREACHERMAN_COMPUTER_VISION_CATALOG.map(({ id }) => id), runtime.catalog().map(({ id }) => id));
  assert.equal(runtime.list().every(({ phase }) => phase === "external-runtime-required"), true);
  assert.deepEqual(await runtime.test("screenshot"), { status: "external-runtime-required", capability: "screenshot" });
  assert.deepEqual(await runtime.invoke("screenshot", {}), {
    status: "external-runtime-required", capability: "screenshot", result: null,
  });
});

test("registered fake screenshot adapter is tested and invoked with a validated contract", async () => {
  const calls = [];
  const runtime = createPreachermanComputerVisionRuntime({ now: () => "2026-08-08T00:00:00.000Z" });
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
  const runtime = createPreachermanComputerVisionRuntime({ maxImageBytes: 3, maxInputBytes: 1_000 });
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
  const runtime = createPreachermanComputerVisionRuntime();
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
  const runtime = createPreachermanComputerVisionRuntime({ timeoutMs: 20 });
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
  const runtime = createPreachermanComputerVisionRuntime();
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

test("vision accepts scoped local images and explicit screenshot input without exposing local paths", async () => {
  const trusted = await mkdtemp(join(tmpdir(), "preacherman-vision-trusted-"));
  const outside = await mkdtemp(join(tmpdir(), "preacherman-vision-outside-"));
  const localImage = join(trusted, "fixture.png");
  const outsideImage = join(outside, "outside.png");
  await writeFile(localImage, Buffer.from("local-image-bytes"));
  await writeFile(outsideImage, Buffer.from("outside-image-bytes"));
  const inputs = [];
  const runtime = createPreachermanComputerVisionRuntime({ localImageRoots: [trusted] });
  runtime.registerAdapter({
    pluginId: "local-vision-plugin",
    capability: "vision-analysis",
    adapter: {
      async test() { return { ok: true }; },
      async invoke({ input }) {
        inputs.push(input);
        return { summary: "fixture analyzed", detections: [] };
      },
    },
  });

  assert.equal((await runtime.invoke("vision-analysis", { image: { localPath: localImage } })).status, "succeeded");
  assert.equal(inputs[0].image.mimeType, "image/png");
  assert.equal(Buffer.from(inputs[0].image.data, "base64").toString(), "local-image-bytes");
  assert.equal(JSON.stringify(inputs[0]).includes(localImage), false);

  assert.equal((await runtime.invoke("vision-analysis", {
    image: { mimeType: "image/png", data: ONE_PIXEL_PNG, source: "screenshot" },
  })).status, "succeeded");
  assert.equal(inputs[1].image.source, "screenshot");
  await assert.rejects(
    runtime.invoke("vision-analysis", { image: { localPath: outsideImage } }),
    { code: "LOCAL_IMAGE_OUT_OF_SCOPE", statusCode: 403 },
  );
});

test("Computer Use read operations are real, bounded to registered targets, and logged", async () => {
  const calls = [];
  let tick = 0;
  const runtime = createPreachermanComputerVisionRuntime({ clock: () => tick += 5 });
  runtime.registerComputerUseAdapter({
    pluginId: "desktop-runtime",
    targets: [{ kind: "web", id: "https://demo.example.test/work/path" }],
    adapter: {
      async test() { calls.push("test"); return { ok: true }; },
      async observe({ target }) {
        calls.push(["observe", target]);
        return { summary: "Work page is visible" };
      },
      async inspectDom({ selector, maxDepth }) {
        calls.push(["inspect-dom", selector, maxDepth]);
        return {
          url: "https://demo.example.test/work",
          title: "Work",
          nodes: [{ tag: "button", role: "button", name: "Run task", selector: "#run" }],
          truncated: false,
        };
      },
      async perform() { throw new Error("write should not run"); },
    },
  });

  assert.equal((await runtime.testComputerUse()).status, "succeeded");
  const target = { kind: "web", id: "https://demo.example.test/work/path" };
  assert.equal((await runtime.observe({ callerPluginId: "observer-plugin", target })).result.summary, "Work page is visible");
  assert.equal((await runtime.inspectDom({ callerPluginId: "observer-plugin", target, selector: "main", maxDepth: 4 })).result.nodes[0].role, "button");
  await assert.rejects(
    runtime.observe({ callerPluginId: "observer-plugin", target: { kind: "web", id: "https://demo.example.test/other" } }),
    { code: "COMPUTER_USE_TARGET_OUT_OF_SCOPE", statusCode: 403 },
  );
  assert.deepEqual(calls, [
    "test",
    ["observe", { kind: "web", id: "https://demo.example.test/work/path" }],
    ["inspect-dom", "main", 4],
  ]);
  assert.deepEqual(runtime.logs().map(({ type, status }) => [type, status]), [
    ["observe", "succeeded"],
    ["inspect-dom", "succeeded"],
  ]);
});

test("every Computer Use write needs host-verified one-time approval and logs no typed secret", async () => {
  const performed = [];
  const hostEvidence = { userGesture: "approval-1" };
  const runtime = createPreachermanComputerVisionRuntime({
    approvalVerifier: async ({ evidence }) => evidence === hostEvidence,
  });
  const target = { kind: "window", id: "preacherman-demo" };
  runtime.registerComputerUseAdapter({
    pluginId: "desktop-runtime",
    targets: [target],
    adapter: {
      async test() { return { ok: true }; },
      async observe() { return { summary: "visible" }; },
      async inspectDom() { return { nodes: [], truncated: false }; },
      async perform(context) {
        performed.push(context);
        return { performed: true, summary: "Text entered" };
      },
    },
  });

  const requested = runtime.requestAction({
    callerPluginId: "writer-plugin",
    target,
    action: { type: "type", selector: "#message", text: "api-key-secret-value" },
  });
  assert.equal(requested.status, "approval-required");
  assert.deepEqual(requested.approval.action, { type: "type", selector: "#message", textLength: 20 });
  assert.equal(JSON.stringify(runtime.listApprovals()).includes("api-key-secret-value"), false);
  await assert.rejects(
    runtime.approveAction({ approvalId: requested.approval.id, decision: "approve", evidence: "forged" }),
    { code: "COMPUTER_USE_APPROVAL_REJECTED", statusCode: 403 },
  );
  assert.equal(performed.length, 0);

  const approved = await runtime.approveAction({ approvalId: requested.approval.id, decision: "approve", evidence: hostEvidence });
  assert.equal(approved.status, "succeeded");
  assert.equal(performed.length, 1);
  assert.equal(performed[0].approvalId, requested.approval.id);
  assert.equal(performed[0].action.text, "api-key-secret-value");
  await assert.rejects(
    runtime.approveAction({ approvalId: requested.approval.id, decision: "approve", evidence: hostEvidence }),
    { code: "COMPUTER_USE_APPROVAL_CONSUMED", statusCode: 409 },
  );
  assert.equal(performed.length, 1);
  assert.equal(JSON.stringify(runtime.logs()).includes("api-key-secret-value"), false);
  assert.deepEqual(approved.approval.result, { performed: true });

  const concurrent = runtime.requestAction({
    callerPluginId: "writer-plugin",
    target,
    action: { type: "click", selector: "#send" },
  });
  const concurrentResults = await Promise.allSettled([
    runtime.approveAction({ approvalId: concurrent.approval.id, decision: "approve", evidence: hostEvidence }),
    runtime.approveAction({ approvalId: concurrent.approval.id, decision: "approve", evidence: hostEvidence }),
  ]);
  assert.deepEqual(concurrentResults.map(({ status }) => status).sort(), ["fulfilled", "rejected"]);
  assert.equal(performed.length, 2);
  assert.equal(runtime.perform, undefined);
  await assert.rejects(runtime.invoke("computer-use", {}), { code: "COMPUTER_VISION_NOT_FOUND", statusCode: 404 });
});

test("Computer Use approvals expire and plugin cleanup removes adapter and pending requests", async () => {
  let currentTime = 1_000;
  let disposed = 0;
  const runtime = createPreachermanComputerVisionRuntime({
    approvalTtlMs: 1_000,
    clock: () => currentTime,
    approvalVerifier: async () => true,
  });
  const target = { kind: "desktop", id: "primary" };
  runtime.registerComputerUseAdapter({
    pluginId: "desktop-runtime",
    targets: [target],
    adapter: {
      async test() { return { ok: true }; },
      async observe() { return { summary: "visible" }; },
      async inspectDom() { return { nodes: [], truncated: false }; },
      async perform() { return { performed: true, summary: "clicked" }; },
      async dispose() { disposed += 1; },
    },
  });
  const expired = runtime.requestAction({ callerPluginId: "writer-plugin", target, action: { type: "click", x: 1, y: 2 } });
  currentTime = 2_001;
  assert.equal(runtime.listApprovals()[0].status, "expired");
  await assert.rejects(
    runtime.approveAction({ approvalId: expired.approval.id, decision: "approve", evidence: {} }),
    { code: "COMPUTER_USE_APPROVAL_CONSUMED", statusCode: 409 },
  );

  runtime.requestAction({ callerPluginId: "writer-plugin", target, action: { type: "key", key: "Enter" } });
  assert.deepEqual(await runtime.removePlugin("desktop-runtime"), { adapters: 0, computerUseAdapters: 1 });
  assert.equal(disposed, 1);
  assert.equal(runtime.computerUseStatus().phase, "external-runtime-required");
  assert.equal(runtime.listApprovals({ status: "pending" }).length, 0);
});
