import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("the pinned VAD model and matching WASM are packaged locally with licenses", async () => {
  const root = new URL("../public/speech/silero/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  for (const [file, digest] of Object.entries(manifest.files)) assert.equal(createHash("sha256").update(await readFile(new URL(file, root))).digest("hex"), digest);
  for (const file of ["SILERO-LICENSE.txt", "ONNXRUNTIME-LICENSE.txt"]) assert.match(await readFile(new URL(file, root), "utf8"), /MIT License/);
});

test("detector terminates its worker on initialization abort, backlog and runtime errors", async () => {
  let source = await readFile(new URL("../src/audio/SileroVad.ts", import.meta.url), "utf8");
  source = source.replace('new URL("./sileroVad.worker.ts", import.meta.url)', '"worker.js"');
  const workers = [], errors = [], results = [], exports = {};
  class Worker { constructor() { workers.push(this); } terminate() { this.terminated = true; } postMessage() {} }
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Worker, URL, setTimeout, clearTimeout, location: { href: "http://tauri.localhost" } });
  const vad = new exports.SileroVad((...args) => results.push(args), message => errors.push(message));
  const cancelled = new AbortController();
  const starting = vad.start(cancelled.signal); cancelled.abort(); await assert.rejects(starting);
  assert.equal(workers[0].terminated, true);
  const ready = vad.start(new AbortController().signal); workers[1].onmessage({ data: { ready: true } }); await ready;
  vad.push(new Float32Array(512)); workers[1].onmessage({ data: { block: new Float32Array(512), probability: 0.9 } }); assert.equal(results.length, 1);
  for (let i = 0; i < 25; i++) vad.push(new Float32Array(512));
  assert.equal(workers[1].terminated, true); assert.equal(errors.length, 1);
  const again = vad.start(new AbortController().signal); workers[2].onmessage({ data: { ready: true } }); await again;
  workers[2].onerror(); assert.equal(workers[2].terminated, true); assert.equal(errors.length, 2);
  vad.close();
});
