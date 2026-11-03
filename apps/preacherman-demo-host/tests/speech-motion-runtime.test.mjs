import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import restPose from "../../../asset-library/digital-humans/assets/realtime-performance/v1/rigs/KQ-default.json" with { type: "json" };

async function fixture() {
  const sockets = [], events = [];
  class Socket {
    constructor() { sockets.push(this); }
    send() {}
    close() { this.onclose?.(); }
    receive(response) { this.response = response; this.onmessage?.({ data: new ArrayBuffer(0) }); }
  }
  const exports = {};
  runInNewContext(ts.transpileModule(await readFile(new URL("../src/motion/SpeechMotionRuntime.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, require: name => name.endsWith(".json") ? restPose : {
    localServiceWebSocketUrl: () => "ws://fixture", decodeMotionResponse: () => sockets.at(-1).response,
    encodeMotionStart() {}, encodeMotionBody() {}, encodeMotionEnd() {}, speechMotionKeywords: () => [],
  }, WebSocket: Socket, crypto, window: { setTimeout, clearTimeout }, ArrayBuffer, Float32Array });
  const runtime = new exports.SpeechMotionRuntime(); runtime.subscribe(e => events.push(e));
  return { runtime, sockets, events };
}

test("cancel settles a pending first frame and stale socket data never reaches the new character", async () => {
  const { runtime, sockets, events } = await fixture(); const signal = new AbortController().signal;
  try {
    const first = runtime.start({ text: "Hello", duration: 2, characterId: "cortana", interactionEpoch: 1, signal });
    const second = runtime.start({ text: "Hi", duration: 2, characterId: "ai-moe-deepseek", interactionEpoch: 2, signal });
    assert.equal(await first, false);
    sockets[0].receive({ className: "Speech2MotionV3ResponseChunkBody", data: new Uint8Array(60) });
    assert.equal(events.filter(e => e.type === "frames").length, 0);
    runtime.cancel(1); assert.equal(events.filter(e => e.type === "cancelled").length, 1);
    runtime.cancel(2); assert.equal(await second, false);
  } finally { runtime.cancel(); }
});

test("completed network streams remain cancellable; malformed matrices are rejected", async () => {
  const { runtime, sockets, events } = await fixture(); const signal = new AbortController().signal;
  try {
    for (const invalid of [false, true]) {
      const pending = runtime.start({ text: "Hello", duration: 2, characterId: "cortana", interactionEpoch: 3, signal });
      const socket = sockets.at(-1);
      socket.receive({ className: "Speech2MotionV3ResponseChunkStart", dtype: "float32", restPoseId: restPose.id, jointNames: ["Head"], blendshapeNames: [], timelineStartFrame: 0 });
      const data = new Float32Array(15); if (invalid) data[0] = NaN;
      socket.receive({ className: "Speech2MotionV3ResponseChunkBody", data: new Uint8Array(data.buffer) });
      if (!invalid) socket.receive({ className: "Speech2MotionV3ResponseChunkEnd" });
      assert.equal(await pending, !invalid);
      runtime.cancel(3); assert.equal(events.at(-1).type, "cancelled");
    }
    assert.ok(events.some(e => e.type === "failed"));
  } finally { runtime.cancel(); }
});
