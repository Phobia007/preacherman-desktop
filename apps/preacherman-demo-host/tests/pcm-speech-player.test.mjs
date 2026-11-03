import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const exports = {};
runInNewContext(ts.transpileModule(await readFile(new URL("../src/audio/PcmSpeechPlayer.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const sources = [], received = []; let controller, cancelled = false, started = 0, ended = 0;
  const context = { currentTime: 0, createBuffer: (_channels, length, sampleRate) => ({ duration: length / sampleRate, copyToChannel(pcm) { this.pcm = pcm; } }),
    createBufferSource() { const source = { connect() {}, disconnect() { this.disconnected = true; }, start(at) { this.at = at; }, stop() { this.stopped = true; } }; sources.push(source); return source; } };
  const body = new ReadableStream({ start(value) { controller = value; }, cancel() { cancelled = true; } });
  const player = new exports.PcmSpeechPlayer(context, {}), abort = new AbortController();
  const run = player.play(body, abort.signal, { samples: pcm => received.push(...pcm), start: () => started++, inputEnded: () => ended++ });
  const finishSources = () => { for (const source of sources) if (!source.finished) { source.finished = true; source.onended?.(); } };
  return { player, context, sources, controller, received, abort, run, finishSources, get started() { return started; }, get ended() { return ended; }, get cancelled() { return cancelled; } };
}
test("PCM plays before EOF, joins odd byte chunks exactly, and drains the final tail", async () => {
  const f = fixture();
  try {
    const pcm = Buffer.alloc(24000 * 2); for (let i = 0; i < 24000; i++) pcm.writeInt16LE(i - 12000, i * 2);
    f.controller.enqueue(pcm.subarray(0, 1)); f.controller.enqueue(pcm.subarray(1, 16000)); await tick();
    assert.equal(f.started, 1); assert.equal(f.ended, 0); assert.equal(f.sources.length, 1);
    f.controller.enqueue(pcm.subarray(16000)); f.controller.close(); await tick();
    assert.equal(f.ended, 1); assert.equal(f.received.length, 24000);
    for (let i = 0; i < 24000; i++) assert.equal(f.received[i], (i - 12000) / 32768);
    assert.equal(f.sources.reduce((sum, s) => sum + s.buffer.pcm.length, 0), 24000);
    f.finishSources(); await f.run; assert.ok(f.sources.every(s => s.disconnected));
  } finally { f.abort.abort(); await f.run.catch(() => {}); }
});
test("underrun gaps do not advance the animation clock; barge-in stops queued sound and input immediately", async () => {
  const f = fixture();
  try {
    f.controller.enqueue(new Uint8Array(15360)); await tick();
    f.context.currentTime = .175; assert.ok(Math.abs(f.player.time - .16) < .001);
    f.context.currentTime = 1; f.finishSources(); assert.ok(Math.abs(f.player.time - .32) < .001);
    f.controller.enqueue(new Uint8Array(4800)); await tick();
    assert.ok(Math.abs(f.player.time - .32) < .001);
    f.context.currentTime = 1.065; assert.ok(Math.abs(f.player.time - .37) < .001);
    f.abort.abort(); assert.equal(f.sources[1].stopped, true); await assert.rejects(f.run);
    assert.equal(f.cancelled, true); assert.ok(f.sources.every(s => s.disconnected));
  } finally { f.abort.abort(); await f.run.catch(() => {}); }
});
test("truncated or failed PCM streams stop already scheduled audio instead of reporting completion", async () => {
  for (const failed of [false, true]) {
    const f = fixture();
    try {
      f.controller.enqueue(new Uint8Array(15361)); await tick();
      if (failed) f.controller.error(new Error("Connection lost")); else f.controller.close();
      await assert.rejects(f.run, /complete sample|Connection lost/);
      assert.equal(f.ended, 0); assert.equal(f.sources[0].stopped, true);
    } finally { f.abort.abort(); await f.run.catch(() => {}); }
  }
});
