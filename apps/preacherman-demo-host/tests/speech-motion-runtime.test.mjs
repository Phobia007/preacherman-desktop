import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import restPose from "../../../asset-library/digital-humans/assets/realtime-performance/v1/rigs/KQ-default.json" with { type: "json" };

async function fixture() {
  const protocol = {};
  runInNewContext(ts.transpileModule(await readFile(new URL("../src/motion/audioFaceProtocol.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: protocol, TextEncoder, TextDecoder });
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
    decodeFaceResponse: () => sockets.at(-1).response, decodeFaceValues: protocol.decodeFaceValues,
    encodeFaceStart() {}, encodeFaceBody() {}, encodeFaceEnd() {},
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

test("float16 face frames keep the audio clock and character, reject invalid input and ignore late chunks", async () => {
  const { runtime, sockets, events } = await fixture();
  const cancel = new AbortController(); const clock = () => .4;
  try {
    const face = runtime.startFaceStream({ sampleRate: 16000, interactionEpoch: 8, characterId: "cortana", profile: "preacherman-arkit", playbackTime: clock, signal: cancel.signal });
    const socket = sockets.at(-1);
    socket.receive({ className: "Audio2FaceV1ResponseChunkStart", dtype: "float16", blendshapeNames: ["JawOpen", "MouthClose"] });
    assert.equal(events.at(-1).playbackTime, clock); assert.equal(events.at(-1).characterId, "cortana");
    socket.receive({ className: "Audio2FaceV1ResponseChunkBody", data: new Uint8Array([0, 56, 0, 0]) });
    assert.equal(await face.firstFrame, true); assert.deepEqual(Array.from(events.at(-1).values), [.5, 0]);
    socket.receive({ className: "Audio2FaceV1ResponseChunkEnd" });
    runtime.cancel(8); const count = events.length;
    socket.receive({ className: "Audio2FaceV1ResponseChunkBody", data: new Uint8Array([0, 60, 0, 0]) });
    assert.equal(events.length, count); assert.equal(events.at(-1).type, "face-cancelled");
    const invalid = runtime.startFaceStream({ sampleRate: 16000, interactionEpoch: 9, signal: cancel.signal });
    sockets.at(-1).receive({ className: "Audio2FaceV1ResponseChunkStart", dtype: "float16", blendshapeNames: ["JawOpen"] });
    sockets.at(-1).receive({ className: "Audio2FaceV1ResponseChunkBody", data: new Uint8Array([0, 124]) });
    assert.equal(await invalid.firstFrame, false); assert.equal(events.at(-1).type, "face-failed");
    cancel.abort(); const before = sockets.length;
    assert.equal(await runtime.startFaceStream({ sampleRate: 16000, interactionEpoch: 10, signal: cancel.signal }).firstFrame, false);
    assert.equal(sockets.length, before);
  } finally { cancel.abort(); runtime.cancel(); }
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
