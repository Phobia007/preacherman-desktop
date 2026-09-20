import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/audio/microphoneMeter.ts", import.meta.url), "utf8");
function harness() {
  const frames = new Map(), states = [], samples = [], requests = [], contexts = [];
  let id = 0, signal = false;
  class Context {
    state = "running";
    destination = {};
    constructor() { contexts.push(this); }
    async resume() {}
    async close() { this.state = "closed"; }
    createAnalyser() {
      return { fftSize: 1024, disconnect() {}, getFloatTimeDomainData(array) {
        for (let i = 0; i < array.length; i++) array[i] = signal ? Math.sin(i * .3) * .08 : 0;
      } };
    }
    createMediaStreamSource(stream) {
      this.stream = stream;
      return { connect: node => { assert.notEqual(node, this.destination, "Never monitor the microphone through speakers"); }, disconnect() {} };
    }
  }
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, Float32Array, Math, AudioContext: Context,
    navigator: { mediaDevices: { getUserMedia: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) } },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: key => frames.delete(key),
  });
  const meter = new exports.MicrophoneMeter(frame => samples.push(frame), (state, error) => states.push({ state, error }));
  return { exports, meter, requests, contexts, frames, states, samples, signal: value => { signal = value; },
    tick: time => { const entry = frames.entries().next().value; if (entry) { frames.delete(entry[0]); entry[1](time); } } };
}
function microphone() {
  const handlers = new Map();
  const track = { readyState: "live", stopped: false, stop() { this.stopped = true; this.readyState = "ended"; },
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  return { getTracks: () => [track], getAudioTracks: () => [track], track,
    unplug() { track.readyState = "ended"; handlers.get("ended")?.(); } };
}

test("Silence, quiet room noise and DC offset stay still; live voice drives five unequal bars", () => {
  const { exports } = harness();
  for (const amplitude of [0, .001]) {
    const quiet = Float32Array.from({ length: 1024 }, (_, i) => Math.sin(i * .2) * amplitude);
    assert.equal(exports.voiceFrame(quiet, 10).speaking, false);
    assert.deepEqual([...exports.voiceFrame(quiet, 100).heights], [...exports.REST_HEIGHTS]);
  }
  assert.equal(exports.voiceFrame(new Float32Array(1024).fill(.5), 10).speaking, false);
  const voice = Float32Array.from({ length: 1024 }, (_, i) => Math.sin(i * .2) * .08);
  const first = exports.voiceFrame(voice, 10), next = exports.voiceFrame(voice, 90);
  assert.equal(first.speaking, true);
  assert.equal(first.heights.length, 5);
  assert.equal(new Set(first.heights).size, 5);
  assert.notDeepEqual([...first.heights], [...next.heights]);
  assert.ok(first.heights.every(height => height >= 4 && height <= 32));
});

test("Microphone requires an explicit start, uses the selected input and stops every resource", async () => {
  const h = harness(), mic = microphone();
  assert.equal(h.requests.length, 0);
  const start = h.meter.start("headset-input");
  assert.equal(h.requests[0].options.audio.deviceId.exact, "headset-input");
  assert.equal(h.requests[0].options.video, false);
  h.requests[0].resolve(mic);
  assert.equal(await start, true);
  h.tick(50);
  assert.equal(h.samples.at(-1).speaking, false);
  h.signal(true); h.tick(100);
  assert.equal(h.samples.at(-1).speaking, true);
  h.signal(false); h.tick(160);
  assert.equal(h.samples.at(-1).speaking, false);
  h.meter.stop();
  assert.ok(mic.track.stopped);
  assert.equal(h.contexts[0].state, "closed");
  assert.equal(h.frames.size, 0);
  assert.equal(h.states.at(-1).state, "idle");
});

test("Stopping during a permission prompt discards the late stream without starting audio", async () => {
  const h = harness(), mic = microphone();
  const start = h.meter.start();
  h.meter.stop();
  h.requests[0].resolve(mic);
  assert.equal(await start, false);
  assert.ok(mic.track.stopped);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.states.at(-1).state, "idle");
});

test("Rapid input changes only retain the latest requested microphone", async () => {
  const h = harness(), first = microphone(), second = microphone();
  const a = h.meter.start("a"), b = h.meter.start("b");
  h.requests[1].resolve(second);
  assert.equal(await b, true);
  h.requests[0].resolve(first);
  assert.equal(await a, false);
  assert.ok(first.track.stopped);
  assert.equal(h.contexts.length, 1);
  assert.equal(h.contexts[0].stream, second);
  h.meter.dispose();
  assert.ok(second.track.stopped);
});

test("Denied permission remains recoverable; unplugging terminates capture", async () => {
  const h = harness();
  const start = h.meter.start();
  h.requests[0].reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
  assert.equal(await start, false);
  assert.match(h.states.at(-1).error, /Allow microphone/);
  const mic = microphone(), retry = h.meter.start();
  h.requests[1].resolve(mic); await retry;
  mic.unplug();
  assert.equal(h.states.at(-1).state, "error");
  assert.match(h.states.at(-1).error, /disconnected/);
  assert.equal(h.contexts[0].state, "closed");
  assert.equal(h.frames.size, 0);
});

test("Minimizing pauses visual sampling; unmounting also cancels pending capture", async () => {
  const h = harness(), mic = microphone(), start = h.meter.start();
  h.requests[0].resolve(mic); await start;
  h.meter.setVisible(false);
  assert.equal(h.frames.size, 0);
  h.meter.setVisible(true);
  assert.equal(h.frames.size, 1);
  h.meter.dispose();
  assert.equal(h.frames.size, 0);
  assert.ok(mic.track.stopped);
  const other = harness(), late = microphone(), pending = other.meter.start();
  other.meter.dispose();
  const stateCount = other.states.length;
  other.requests[0].resolve(late); await pending;
  assert.ok(late.track.stopped);
  assert.equal(other.states.length, stateCount);
});

test("Output selection calls the real sink API and rejects unsupported non-default outputs", async () => {
  const { exports } = harness(), calls = [];
  await exports.selectOutput({ setSinkId: async id => { calls.push(id); } }, "headphones");
  assert.deepEqual(calls, ["headphones"]);
  await exports.selectOutput({}, "");
  await assert.rejects(exports.selectOutput({}, "headphones"), /system default/);
});
