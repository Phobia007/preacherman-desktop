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
test("spoken phrases preserve lead-in, wait for silence, reject clicks and bound long utterances", async () => {
  const source = await readFile(new URL("../src/audio/spokenAudio.ts", import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, btoa: value => Buffer.from(value, "binary").toString("base64") });
  const voice = () => new Float32Array(512).fill(0.08), silence = () => new Float32Array(512);
  const phrase = new exports.SpokenPhrase();
  for (let i = 0; i < 100; i++) assert.equal(phrase.push(silence()), null);
  for (let i = 0; i < 15; i++) assert.equal(phrase.push(voice()), null);
  let result; for (let i = 0; i < 32; i++) result = phrase.push(silence());
  assert.ok(result.length > 15);
  const audio = exports.speechWav(result); assert.equal(validateSpeechAudio(audio), audio);
  assert.equal(phrase.push(voice()), null);
  const click = new exports.SpokenPhrase(); click.push(voice());
  for (let i = 0; i < 32; i++) result = click.push(silence());
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
