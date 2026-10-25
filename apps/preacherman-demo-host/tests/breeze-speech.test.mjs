import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBreezeSpeech } from "../server/breezeSpeech.mjs";
import { createCharacterConversation } from "../server/characterConversation.mjs";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

function wav() {
  const b = Buffer.alloc(524); b.write("RIFF"); b.writeUInt32LE(0xffffffff, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(0xffffffff, 40);
  for (let i = 44; i < b.length; i += 2) b.writeInt16LE(500, i);
  return b;
}
function adapter() {
  const requests = [];
  const service = createBreezeSpeech({ request: async (url, options) => {
    requests.push({ url, ...options });
    if (url.endsWith("/v1/voices")) return Response.json([{ id: "warm", saved: true, description: "Warm voice" }, { id: "temporary", saved: false }]);
    return new Response(wav());
  } });
  return { service, requests };
}
test("Breeze exposes saved voices only and completes streaming WAV headers without changing PCM", async () => {
  const { service, requests } = adapter();
  assert.deepEqual((await service.voices()).map(v => v.id), ["breeze:warm"]);
  const audio = Buffer.from((await service.synthesize({ text: "你好", voiceId: "warm" })).audio, "base64");
  assert.equal(audio.readUInt32LE(4), audio.length - 8); assert.equal(audio.readUInt32LE(40), audio.length - 44);
  assert.deepEqual(audio.subarray(44), wav().subarray(44));
  assert.deepEqual(JSON.parse(requests[1].body), { input: "你好", voice: "warm", instructions: "", response_format: "wav", seed: 42 });
  assert.equal(requests[1].redirect, "error");
  await assert.rejects(service.synthesize({ text: "hi", voiceId: "../../other" }), /Select a saved/);
});
test("Breeze fails on removed voices, malformed audio and cancellation without falling back to another voice", async () => {
  const missing = createBreezeSpeech({ request: async () => new Response("missing", { status: 404 }) });
  await assert.rejects(missing.synthesize({ text: "hi", voiceId: "gone" }), /no longer available/);
  const broken = createBreezeSpeech({ request: async () => new Response("not audio") });
  await assert.rejects(broken.synthesize({ text: "hi", voiceId: "warm" }), /invalid WAV/);
  const cancellation = new AbortController();
  const pending = createBreezeSpeech({ request: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
  const output = pending.synthesize({ text: "hi", voiceId: "warm" }, cancellation.signal); cancellation.abort();
  await assert.rejects(output, { name: "AbortError" });
});
test("shared Breeze library displays every voice while Apply, playback and restart preserve each character's independent choice", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = []; let offline = false;
  const voices = Array.from({ length: 15 }, (_, i) => ({ id: `breeze:voice_${i}`, voiceId: `voice_${i}`, name: `Voice ${i}`, provider: "breeze", source: "breeze", model: "Breeze-TTS-2", hasPreview: true }));
  const breeze = { voices: async () => { if (offline) throw Error("offline"); return voices; }, synthesize: async input => { if (offline) throw Error("offline"); calls.push(input); return { audio: wav().toString("base64") }; } };
  const args = { file: join(directory, "characters.json"), connections: { status: async () => ({ active: null }) }, breeze, windowsSpeech: { synthesize: async () => ({ audio: "windows" }) } };
  const service = createCharacterConversation(args);
  const imported = (await service.addVoice("cortana", { name: "Existing preview", preview: `data:audio/wav;base64,${wav().toString("base64")}` })).voices.find(v => v.provider !== "breeze");
  assert.equal((await service.voiceSettings("cortana")).voices.length, 16);
  await service.previewVoice("cortana", "breeze:voice_0");
  assert.deepEqual(calls.at(-1), { text: "Hello, it's nice to meet you. This is my voice. I'm ready to chat whenever you are.", voiceId: "voice_0" });
  assert.equal((await service.voiceSettings("cortana")).selectedVoiceId, null);
  await service.applyVoice("cortana", "breeze:voice_0"); await service.applyVoice("zima", "breeze:voice_1");
  const restarted = createCharacterConversation(args);
  await restarted.synthesize("cortana", { text: "one" }); await restarted.synthesize("zima", { text: "two" });
  assert.deepEqual(calls.slice(-2), [{ text: "one", voiceId: "voice_0" }, { text: "two", voiceId: "voice_1" }]);
  assert.equal((await restarted.voiceSettings("cortana")).connectionStatus, "connected");
  await assert.rejects(service.applyVoice("cortana", "breeze:missing"), /available voice/);
  await assert.rejects(service.removeVoice("cortana", "breeze:voice_0"), /Shared Breeze/);
  offline = true;
  const state = await service.voiceSettings("cortana"); assert.equal(state.selectedVoiceId, "breeze:voice_0"); assert.equal(state.connectionStatus, "offline");
  await assert.rejects(service.synthesize("cortana", { text: "No fallback" }), /offline/);
  await service.applyVoice("cortana", imported.id);
  assert.equal((await service.synthesize("cortana", { text: "Existing draft preview behavior" })).audio, "windows");
  assert.doesNotMatch(await readFile(args.file, "utf8"), /base64/);
});
test("desktop HTTP routes apply a Breeze voice and return its audio using the character's stored selection", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-http-"));
  const { service: breeze, requests } = adapter();
  const server = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: directory }, breezeSpeech: breeze });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const address = await server.listen(0);
  const call = async (route, body) => {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/characters/cortana/voice${route}`, { method: body ? "POST" : "GET", headers: { Origin: "http://127.0.0.1:1420", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(res.status, 200); return res.json();
  };
  assert.equal((await call("")).voices[0].id, "breeze:warm");
  assert.match((await call("/preview?id=breeze%3Awarm")).audio, /^data:audio\/wav;base64,/);
  assert.equal(JSON.parse(requests.at(-1).body).input, "Hello, it's nice to meet you. This is my voice. I'm ready to chat whenever you are.");
  assert.equal((await call("/apply", { id: "breeze:warm" })).service.provider, "breeze");
  assert.equal((await call("/synthesize", { text: "A desktop reply" })).provider, "breeze");
  assert.equal(JSON.parse(requests.at(-1).body).voice, "warm");
  assert.equal(JSON.parse(requests.at(-1).body).input, "A desktop reply");
});
