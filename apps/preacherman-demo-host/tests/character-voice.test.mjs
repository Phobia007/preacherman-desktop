import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createCharacterConversation } from "../server/characterConversation.mjs";
import { validateSpeechAudio, createWindowsSpeech } from "../server/windowsSpeech.mjs";
import { createLocalSpeechRecognition } from "../server/localSpeechRecognition.mjs";

const sessionId = "test-session-00000001";
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-character-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  let active = { mode: "cli", agentId: "codex-cli", model: "default" };
  const codex = { chat: async input => { calls.push(input); return { text: "A real provider reply.", source: "codex-cli" }; } };
  const connections = { status: async () => ({ active, connections: [], presets: [] }) };
  const args = { file: join(directory, "characters.json"), connections, codex,
    listAgents: async () => [{ id: "codex-cli", installed: true, auth: { state: "ready" }, label: "Codex CLI" }] };
  return { service: createCharacterConversation(args), args, calls, setDefault: value => { active = value; } };
}
test("characters snapshot execution independently, persist identity and isolate conversation context", async t => {
  const f = await fixture(t);
  const cortana = await f.service.profile("cortana");
  assert.equal(cortana.name, "Cortana"); assert.equal(cortana.memorySpaceId, "character:cortana");
  assert.deepEqual(cortana.enabledSkillIds, []);
  await f.service.chat("cortana", { text: "Remember ORBIT", sessionId });
  await f.service.chat("cortana", { text: "What did I say?", sessionId });
  assert.equal(f.calls[1].messages.length, 3);
  assert.match(f.calls[1].personaInstructions, /You are Cortana/);
  assert.match(f.calls[1].personaInstructions, /voice-only/);
  await f.service.chat("jubilee-midnight-mutant", { text: "Hello", sessionId });
  assert.equal(f.calls[2].messages.length, 1); assert.match(f.calls[2].personaInstructions, /You are Jubilee/);
  f.setDefault(null);
  assert.equal((await f.service.settings("cortana")).active.agentId, "codex-cli");
  await f.service.local("jubilee-midnight-mutant", null);
  assert.equal((await f.service.settings("cortana")).active.agentId, "codex-cli");
  assert.equal((await createCharacterConversation(f.args).settings("jubilee-midnight-mutant")).active, null);
  await assert.rejects(f.service.chat("jubilee-midnight-mutant", { text: "Hello", sessionId }), /execution mode/);
});
test("failed, cancelled and changed-provider replies cannot contaminate memory", async t => {
  const f = await fixture(t);
  const cancellation = new AbortController();
  f.args.codex.chat = async () => { cancellation.abort(); return { text: "late" }; };
  await assert.rejects(f.service.chat("cortana", { text: "Cancel me", sessionId }, cancellation.signal));
  f.args.codex.chat = async input => { f.calls.push(input); return { text: "hello" }; };
  await f.service.chat("cortana", { text: "Fresh", sessionId });
  assert.equal(f.calls.at(-1).messages.length, 1);
  f.args.codex.chat = async () => { await f.service.local("cortana", null); return { text: "stale" }; };
  await assert.rejects(f.service.chat("cortana", { text: "Switch", sessionId }), /Execution mode changed/);
  await assert.rejects(f.service.profile("../../private"), /Unknown character/);
});

test("interrupted replies retain completed speech only, including replies cancelled before delivery", async t => {
  const f = await fixture(t);
  f.args.codex.chat = async input => { f.calls.push(input); return { text: "Heard sentence. Secret unheard continuation." }; };
  const first = await f.service.chat("cortana", { text: "First", sessionId });
  await f.service.chat("cortana", { text: "Interrupt", sessionId, playback: { replyId: first.replyId, heardCharacters: 15, interrupted: true } });
  assert.match(f.calls[1].messages[1].content, /^Heard sentence\./);
  assert.doesNotMatch(f.calls[1].messages[1].content, /Secret unheard/);
  assert.match(f.calls[1].messages[1].content, /interrupted/);
  const replyId = "client-turn-0000000001";
  await f.service.chat("cortana", { text: "Lost response", sessionId, replyId });
  await f.service.chat("cortana", { text: "Next", sessionId, playback: { replyId, heardCharacters: 0, interrupted: true } });
  assert.doesNotMatch(f.calls.at(-1).messages.at(-2).content, /Heard sentence|Secret unheard/);
  await assert.rejects(f.service.chat("cortana", { text: "Invalid", sessionId, playback: { replyId, heardCharacters: -1, interrupted: true } }), /acknowledgement/);
});

test("playback acknowledgement survives cancellation of the following provider request", async t => {
  const f = await fixture(t);
  const first = await f.service.chat("cortana", { text: "First", sessionId });
  const cancel = new AbortController();
  f.args.codex.chat = async () => { cancel.abort(); return { text: "Discard this" }; };
  await assert.rejects(f.service.chat("cortana", { text: "Second", sessionId, playback: { replyId: first.replyId, heardCharacters: 0, interrupted: true } }, cancel.signal));
  f.args.codex.chat = async input => { f.calls.push(input); return { text: "New reply" }; };
  await f.service.chat("cortana", { text: "Third", sessionId });
  assert.doesNotMatch(f.calls.at(-1).messages[1].content, /A real provider reply/);
  assert.match(f.calls.at(-1).messages[1].content, /interrupted/);
});
test("spoken phrases preserve lead-in, wait for silence, reject clicks and bound long utterances", async () => {
  const source = await readFile(new URL("../src/audio/spokenAudio.ts", import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, btoa: value => Buffer.from(value, "binary").toString("base64") });
  const voice = () => new Float32Array(512).fill(0.08), silence = () => new Float32Array(512);
  const phrase = new exports.SpokenPhrase();
  for (let i = 0; i < 100; i++) assert.equal(phrase.push(silence()), null);
  for (let i = 0; i < 15; i++) assert.equal(phrase.push(voice()), null);
  for (let i = 0; i < 20; i++) assert.equal(phrase.push(silence()), null);
  let result = phrase.push(silence());
  assert.ok(result.length > 15);
  const audio = exports.speechWav(result); assert.equal(validateSpeechAudio(audio), audio);
  assert.equal(phrase.push(voice()), null);
  const click = new exports.SpokenPhrase(); click.push(voice());
  for (let i = 0; i < 21; i++) result = click.push(silence());
  assert.equal(result.length, 0);
  const long = new exports.SpokenPhrase();
  for (let i = 0; i < 625; i++) result = long.push(voice());
  assert.equal(result.length, 625);
  assert.throws(() => validateSpeechAudio(Buffer.from("not audio").toString("base64")), /PCM WAV/);
  const broken = Buffer.from(audio, "base64"); broken.writeUInt32LE(48000, 24);
  assert.throws(() => validateSpeechAudio(broken.toString("base64")), /PCM WAV/);
});
test("local speech fails explicitly outside Windows, never returns a fabricated transcript", async () => {
  const speech = createWindowsSpeech({ platform: "linux" });
  await assert.rejects(speech.status(), /unavailable/); speech.close();
});
test("Windows speech passes text as data and releases children on success, abort and timeout", async () => {
  const children = [], inputs = [], launches = [];
  let respond = true;
  const speech = createWindowsSpeech({ platform: "win32", timeoutMs: 30, spawnImpl(executable, args, options) {
    launches.push({ executable, args, options });
    const child = new EventEmitter(); children.push(child); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.stopped = true; queueMicrotask(() => child.emit("close", 0)); };
    child.stdin = new Writable({ write(chunk, encoding, done) {
      inputs.push(JSON.parse(String(chunk))); done();
      if (respond) queueMicrotask(() => { child.stdout.write('{"audio":"UklGRg=="}'); child.emit("close", 0); });
    } }); return child;
  } });
  const text = 'Literal $(Get-Process); "hello"';
  assert.equal((await speech.synthesize({ text })).audio, "UklGRg==");
  assert.equal(inputs[0].text, text); assert.ok(!launches[0].args.join(" ").includes(text));
  assert.equal(launches[0].options.windowsHide, true); assert.equal(launches[0].options.shell, false);
  respond = false;
  const cancel = new AbortController(), pending = speech.synthesize({ text: "cancel" }, cancel.signal); cancel.abort();
  await assert.rejects(pending, /cancelled/); assert.equal(children.at(-1).stopped, true);
  await assert.rejects(speech.synthesize({ text: "timeout" }), /timed out/); assert.equal(children.at(-1).stopped, true);
  speech.close();
});
test("voice chrome covers both themes without rendering transcript or reply content", async () => {
  const dock = await readFile(new URL("../src/audio/AudioDock.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/audio/audio-dock.css", import.meta.url), "utf8");
  assert.match(dock, /Start voice conversation/); assert.doesNotMatch(dock, /\{(?:transcript|reply|recognized)\}/);
  for (const token of ["text", "muted", "border-strong", "focus", "error", "member-loading"]) assert.ok(css.includes("--demo-theme-" + token));
  assert.match(css, /data-appearance="dark"/); assert.match(css, /prefers-reduced-motion/);
});

test("offline recognition validates input, bounds workers and cancels without leaking children", async () => {
  const children = [], inputs = [], launches = [];
  let respond = true;
  const speech = createLocalSpeechRecognition({ timeoutMs: 30, spawnImpl(executable, args, options) {
    launches.push({ executable, args, options });
    const child = new EventEmitter(); children.push(child); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.stopped = true; queueMicrotask(() => child.emit("close", 0)); };
    child.stdin = new Writable({ write(chunk, encoding, done) {
      const input = JSON.parse(String(chunk)); inputs.push(input); done();
      if (respond) queueMicrotask(() => child.stdout.write(JSON.stringify({ id: input.id, result: input.action === "status" ? { available: true } : { accepted: true, text: "Hello", confidence: 0.7 } }) + "\n"));
    } }); return child;
  } });
  try {
    await assert.rejects(speech.recognize({ audio: "!invalid" }), /Invalid speech audio/); assert.equal(children.length, 0);
    assert.equal((await speech.status()).engine, "whisper");
    assert.equal(launches[0].options.shell, false); assert.equal(launches[0].options.windowsHide, true);
    assert.equal(launches[0].options.env.OMP_NUM_THREADS, "4");
    respond = false;
    const cancelled = new AbortController();
    const wav = Buffer.alloc(46); wav.write("RIFF"); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
    const audio = wav.toString("base64");
    const running = speech.recognize({ audio }, cancelled.signal); await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(speech.recognize({ audio }), /busy/);
    cancelled.abort(); await assert.rejects(running, /cancelled/); assert.equal(children.at(-1).stopped, true);
    await assert.rejects(speech.recognize({ audio }), /timed out/); assert.equal(children.at(-1).stopped, true);
    respond = true; assert.equal((await speech.recognize({ audio })).text, "Hello");
    assert.equal(inputs.at(-1).audio, audio); assert.ok(!launches.at(-1).args.join(" ").includes(audio));
  } finally { speech.close(); }
});

test("voice conversation uses engine acceptance and stops after repeated recognition misses", async () => {
  let source = await readFile(new URL("../src/audio/SpokenConversation.ts", import.meta.url), "utf8");
  source = source.replace('new URL("./voiceCapture.worklet.js?no-inline", import.meta.url)', '"capture.js"');
  const exports = {}, states = [], spoken = [], chats = [];
  class Meter { start() { return Promise.resolve(true); } stop() {} dispose() {} }
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: () => ({ MicrophoneMeter: Meter, speechWav: () => "audio" }),
    AbortController, AbortSignal, crypto: { randomUUID: () => "session" }, setTimeout, clearTimeout,
    cancelAnimationFrame() {}, window: { dispatchEvent() {} }, CustomEvent: class {},
  });
  const voice = new exports.SpokenConversation(() => {}, state => states.push(state), () => "cortana", () => ({ input: "", output: "" }), () => {});
  let recognized = { text: "Quiet speech", accepted: true, confidence: 0.1 };
  voice.request = async (path, body) => {
    if (path.endsWith("/execution")) return { active: {} };
    if (path.split("?")[0].endsWith("/status")) return { language: "zh-CN" };
    if (path.endsWith("/recognize")) return recognized;
    chats.push(body); return { text: "Real reply" };
  };
  voice.speak = async text => { spoken.push(text); };
  const blocks = [new Float32Array(512)], signal = new AbortController().signal;
  try {
    await voice.start(); await voice.reply(blocks, signal);
    assert.equal(chats.length, 1); assert.equal(spoken.at(-1), "Real reply");
    recognized = { text: "", accepted: false, confidence: 0 };
    await voice.reply(blocks, signal); assert.equal(voice.active, true);
    await voice.reply(blocks, signal); assert.equal(voice.active, false); assert.equal(states.at(-1), "error");
    assert.match(spoken.at(-1), /没有听清楚/); assert.equal(spoken.length, 2); assert.equal(chats.length, 1);
    await voice.start(); await voice.reply(blocks, signal); assert.equal(voice.active, true);
  } finally { voice.dispose(); }
});
