import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createLocalSpeechRecognition } from "../server/localSpeechRecognition.mjs";

function fixture(options = {}) {
  const children = [], inputs = [];
  let respond = true;
  const speech = createLocalSpeechRecognition({ timeoutMs: 100, ...options, spawnImpl() {
    const child = new EventEmitter(); children.push(child);
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.stopped = true; queueMicrotask(() => child.emit("close", 0)); };
    child.stdin = new Writable({ write(chunk, encoding, done) {
      const input = JSON.parse(String(chunk)); inputs.push(input); done();
      if (respond) queueMicrotask(() => child.stdout.write(JSON.stringify({ id: input.id,
        result: input.action === "status" ? { available: true } : { accepted: true, text: "Recognized locally", confidence: 0.8 } }) + "\n"));
    } });
    return child;
  } });
  const wav = Buffer.alloc(46); wav.write("RIFF"); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
  return { speech, children, inputs, audio: wav.toString("base64"), pause: () => { respond = false; } };
}

test("local recognizer reuses one worker across languages and closes its owned child", async t => {
  const f = fixture(); t.after(() => f.speech.close());
  await f.speech.status();
  assert.equal((await f.speech.recognize({ audio: f.audio, language: "zh-CN" })).text, "Recognized locally");
  assert.equal((await f.speech.recognize({ audio: f.audio, language: "en-US" })).text, "Recognized locally");
  assert.equal(f.children.length, 1);
  assert.deepEqual(f.inputs.map(input => input.action), ["status", "recognize", "recognize"]);
  assert.deepEqual(f.inputs.slice(1).map(input => input.language), ["zh", "en"]);
  assert.equal(f.children[0].stdin.writableEnded, false);
  f.speech.close(); assert.equal(f.children[0].stopped, true);
  await assert.rejects(f.speech.status(), /closed/);
  await assert.rejects(f.speech.recognize({ audio: f.audio }), /closed/);
});

test("idle recognizer releases its model worker and starts a fresh worker when needed", async t => {
  const f = fixture({ idleMs: 10 }); t.after(() => f.speech.close());
  await f.speech.recognize({ audio: f.audio });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.children[0].stopped, true);
  await f.speech.recognize({ audio: f.audio });
  assert.equal(f.children.length, 2);
  assert.deepEqual(f.inputs.map(input => input.action), ["status", "recognize", "status", "recognize"]);
});

test("closing during recognition rejects promptly and cannot admit new work", async t => {
  const f = fixture(); t.after(() => f.speech.close());
  await f.speech.status(); f.pause();
  const pending = f.speech.recognize({ audio: f.audio });
  await new Promise(resolve => setImmediate(resolve));
  f.speech.close();
  await assert.rejects(pending, /closed/);
  assert.equal(f.children[0].stopped, true);
  await assert.rejects(f.speech.recognize({ audio: f.audio }), /closed/);
});

test("invalid, oversized and mismatched responses stop the worker rather than poisoning later turns", async t => {
  for (const response of ["not-json\n", "x".repeat(65537), JSON.stringify({ id: -1, result: {} }) + "\n"]) {
    const f = fixture(); t.after(() => f.speech.close());
    await f.speech.status(); f.pause();
    const pending = f.speech.recognize({ audio: f.audio });
    await new Promise(resolve => setImmediate(resolve));
    f.children[0].stdout.write(response);
    await assert.rejects(pending, /invalid response|response limit|could not run/);
    assert.equal(f.children[0].stopped, true);
  }
});

test("pre-cancelled calls never launch a worker or use a cached successful status", async t => {
  const f = fixture(); t.after(() => f.speech.close());
  const cancellation = new AbortController(); cancellation.abort();
  await assert.rejects(f.speech.status(cancellation.signal)); assert.equal(f.children.length, 0);
  await f.speech.status();
  await assert.rejects(f.speech.status(cancellation.signal)); assert.equal(f.inputs.length, 1);
  await assert.rejects(f.speech.recognize({ audio: f.audio }, cancellation.signal)); assert.equal(f.inputs.length, 1);
});
