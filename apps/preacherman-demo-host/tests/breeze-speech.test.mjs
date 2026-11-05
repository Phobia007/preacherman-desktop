import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
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
function adapter(previewDirectory) {
  const requests = [];
  const service = createBreezeSpeech({ previewDirectory, request: async (url, options) => {
    requests.push({ url, ...options });
    if (url.endsWith("/v1/voices")) return Response.json([{ id: "warm", saved: true, description: "Warm voice", metadata: { characterId: "cortana", language: "en" } }, { id: "temporary", saved: false }]);
    return new Response(wav());
  } });
  return { service, requests };
}

test("cold startup is shared with early voice reads and manual reconnect without opening a browser", async t => {
  let online = false, launches = 0, spawned;
  const ready = new Promise(resolve => { spawned = resolve; });
  const child = new EventEmitter(); child.kill = () => child.emit("close", 1);
  const service = createBreezeSpeech({ platform: "win32", root: join(tmpdir(), "Preacherman Runtime", "breeze"), accessImpl: async () => {},
    request: async () => { if (!online) throw Error("offline"); return Response.json([{ id: "cortana", saved: true }]); },
    spawnImpl(command, args, options) {
      launches++;
      assert.equal(command, "powershell.exe");
      assert.equal(args.at(-1), "-NoBrowser");
      assert.equal(args.at(-2), join(tmpdir(), "Preacherman Runtime", "breeze", "Start-Breeze.ps1"));
      assert.equal(options.windowsHide, true); assert.equal(options.shell, false);
      spawned(); return child;
    },
  });
  t.after(() => service.close());
  const automatic = service.connect();
  const manual = service.connect();
  const cancellation = new AbortController();
  const cancelled = service.voices(cancellation.signal);
  cancellation.abort(); await assert.rejects(cancelled, { name: "AbortError" });
  let earlyResolved = false;
  const early = service.voices().then(value => { earlyResolved = true; return value; });
  await ready; assert.equal(earlyResolved, false); assert.equal(launches, 1);
  online = true; child.emit("close", 0);
  for (const voices of await Promise.all([automatic, manual, early])) assert.equal(voices[0].id, "breeze:cortana");
  await service.connect(); assert.equal(launches, 1, "a healthy existing service is reused");
});

test("startup failure releases the shared attempt and allows a bounded retry", async t => {
  let online = false, launches = 0, killed = 0;
  const service = createBreezeSpeech({ platform: "win32", startupTimeoutMs: 10, accessImpl: async () => {},
    request: async () => { if (!online) throw Error("offline"); return Response.json([]); },
    spawnImpl() {
      launches++; const child = new EventEmitter(); child.kill = () => { killed++; child.emit("close", 1); };
      if (launches === 2) setImmediate(() => { online = true; child.emit("close", 0); });
      return child;
    },
  });
  t.after(() => service.close());
  await assert.rejects(service.connect(), /could not start|timed out/);
  assert.equal(killed, 1);
  assert.deepEqual(await service.connect(), []); assert.equal(launches, 2);
});

test("closing during the initial probe never launches a late child", async () => {
  let failProbe;
  const probe = new Promise((_, reject) => { failProbe = reject; });
  const service = createBreezeSpeech({ platform: "win32", accessImpl: async () => {}, request: () => probe,
    spawnImpl() { assert.fail("closed service must not launch Breeze"); },
  });
  const pending = service.connect();
  await service.close(); failProbe(Error("offline"));
  await assert.rejects(pending, /closed/);
});

test("desktop listen remains available while Breeze starts or fails", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-startup-"));
  let started = 0, rejectStartup;
  const pending = new Promise((_, reject) => { rejectStartup = reject; });
  const warning = t.mock.method(console, "warn", () => {});
  const server = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: directory }, autoStartBreeze: true,
    breezeSpeech: { connect() { started++; return pending; }, close() {} },
  });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const address = await server.listen(0);
  assert.ok(address.port); assert.equal(started, 1);
  rejectStartup(Error("installation missing")); await new Promise(resolve => setImmediate(resolve));
  assert.equal(warning.mock.callCount(), 1); assert.equal(server.server.listening, true);
});
test("Breeze exposes saved voices only and completes streaming WAV headers without changing PCM", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-adapter-"));
  const { service, requests } = adapter(directory);
  t.after(async () => { service.close(); await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual((await service.voices()).map(v => v.id), ["breeze:warm"]);
  const audio = Buffer.from((await service.synthesize({ text: "你好", voiceId: "warm" })).audio, "base64");
  assert.equal(audio.readUInt32LE(4), audio.length - 8); assert.equal(audio.readUInt32LE(40), audio.length - 44);
  assert.deepEqual(audio.subarray(44), wav().subarray(44));
  assert.deepEqual(JSON.parse(requests[1].body), { input: "你好", voice: "warm", instructions: "", response_format: "wav", seed: 42 });
  assert.equal(requests[1].redirect, "error");
  await assert.rejects(service.synthesize({ text: "hi", voiceId: "../../other" }), /Select a saved/);
});
test("Breeze fails on removed voices, malformed audio and cancellation without falling back to another voice", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-errors-"));
  const missing = createBreezeSpeech({ previewDirectory: join(directory, "missing"), request: async () => new Response("missing", { status: 404 }) });
  await assert.rejects(missing.synthesize({ text: "hi", voiceId: "gone" }), /no longer available/);
  const broken = createBreezeSpeech({ previewDirectory: join(directory, "broken"), request: async () => new Response("not audio") });
  await assert.rejects(broken.synthesize({ text: "hi", voiceId: "warm" }), /invalid WAV/);
  const cancellation = new AbortController();
  const pending = createBreezeSpeech({ previewDirectory: join(directory, "pending"), request: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
  t.after(async () => { missing.close(); broken.close(); pending.close(); await rm(directory, { recursive: true, force: true }); });
  const output = pending.synthesize({ text: "hi", voiceId: "warm" }, cancellation.signal); cancellation.abort();
  await assert.rejects(output, { name: "AbortError" });
});
test("Breeze voices stay with their character while Apply, playback and restart preserve independent choices", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = []; let offline = false;
  const voices = Array.from({ length: 15 }, (_, i) => ({ id: `breeze:voice_${i}`, voiceId: `voice_${i}`, name: `Voice ${i}`, characterId: "cortana", language: "en", provider: "breeze", source: "breeze", model: "Breeze-TTS-2", hasPreview: true }));
  voices.push({ ...voices[0], id: "breeze:zima", voiceId: "zima", name: "ZIMA", characterId: "zima" });
  voices.push({ ...voices[0], id: "breeze:unassigned", voiceId: "unassigned", characterId: null });
  const breeze = {
    voices: async () => { if (offline) throw Error("offline"); return voices; },
    synthesize: async input => { if (offline) throw Error("offline"); calls.push(input); return { audio: wav().toString("base64") }; },
    preview: async (voice, signal) => breeze.synthesize({ text: "Hello, it's nice to meet you. This is my voice. I'm ready to chat whenever you are.", voiceId: voice.voiceId }, signal),
  };
  const args = { file: join(directory, "characters.json"), connections: { status: async () => ({ active: null }) }, breeze, windowsSpeech: { synthesize: async () => ({ audio: "windows" }) } };
  const service = createCharacterConversation(args);
  const imported = (await service.addVoice("cortana", { name: "Existing preview", preview: `data:audio/wav;base64,${wav().toString("base64")}` })).voices.find(v => v.provider !== "breeze");
  assert.equal((await service.voiceSettings("cortana")).voices.length, 16);
  assert.deepEqual((await service.voiceSettings("zima")).voices.map(v => v.id), ["breeze:zima"]);
  assert.equal((await service.voiceSettings("clove-t-pose")).voices.length, 0);
  assert.ok(!(await service.voiceSettings("cortana")).voices.some(v => ["breeze:zima", "breeze:unassigned"].includes(v.id)));
  for (const unavailable of ["breeze:zima", "breeze:unassigned"]) {
    await assert.rejects(service.previewVoice("cortana", unavailable), /not assigned/);
    await assert.rejects(service.applyVoice("cortana", unavailable), /available voice/);
  }
  assert.equal(calls.length, 0, "foreign or unassigned previews never reach synthesis");
  await service.previewVoice("cortana", "breeze:voice_0");
  assert.deepEqual(calls.at(-1), { text: "Hello, it's nice to meet you. This is my voice. I'm ready to chat whenever you are.", voiceId: "voice_0" });
  assert.equal((await service.voiceSettings("cortana")).selectedVoiceId, null);
  await service.applyVoice("cortana", "breeze:voice_0"); await service.applyVoice("zima", "breeze:zima");
  const restarted = createCharacterConversation(args);
  await restarted.synthesize("cortana", { text: "one" }); await restarted.synthesize("zima", { text: "two" });
  assert.deepEqual(calls.slice(-2), [{ text: "one", voiceId: "voice_0" }, { text: "two", voiceId: "zima" }]);
  assert.equal((await restarted.voiceSettings("cortana")).connectionStatus, "connected");
  await assert.rejects(service.applyVoice("cortana", "breeze:missing"), /available voice/);
  await assert.rejects(service.removeVoice("cortana", "breeze:voice_0"), /Shared Breeze/);
  voices[0].characterId = "zima";
  assert.equal((await service.voiceSettings("cortana")).selectedVoiceId, null, "a reassigned voice is not presented as this character's active choice");
  await assert.rejects(service.synthesize("cortana", { text: "Do not use a reassigned voice" }), /assigned to this character/);
  voices[0].characterId = "cortana";
  offline = true;
  const state = await service.voiceSettings("cortana"); assert.equal(state.selectedVoiceId, "breeze:voice_0"); assert.equal(state.connectionStatus, "offline");
  await assert.rejects(service.synthesize("cortana", { text: "No fallback" }), /offline/);
  await service.applyVoice("cortana", imported.id);
  assert.equal((await service.synthesize("cortana", { text: "Existing draft preview behavior" })).audio, "windows");
  assert.doesNotMatch(await readFile(args.file, "utf8"), /base64/);
});
test("desktop HTTP routes apply a Breeze voice and return its audio using the character's stored selection", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-breeze-http-"));
  const { service: breeze, requests } = adapter(join(directory, "cache"));
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

test("a stalled preview times out, releases the request and can be retried without caching a failure", async t => {
  let stalled = true, aborted = false;
  const service = createBreezeSpeech({ previewTimeoutMs: 20, request: async (_, { signal, body }) => {
    assert.equal(JSON.parse(body).max_new_tokens, 125);
    if (!stalled) return new Response(wav());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(wav())), 1000);
      signal.addEventListener("abort", () => { aborted = true; clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  } });
  t.after(() => service.close());
  const voice = { voiceId: "cortana", revision: "one" };
  await assert.rejects(service.preview(voice), error => error.statusCode === 504 && /timed out/.test(error.message));
  assert.equal(aborted, true);
  stalled = false;
  assert.ok((await service.preview(voice)).audio);
});

test("desktop streams the selected voice before synthesis ends and disconnect cancels upstream", async t => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-pcm-http-"));
  let input, upstream, generated = 0;
  const breeze = createBreezeSpeech({ platform: "test", request: async (url, options = {}) => {
    if (url.endsWith("/v1/voices")) return Response.json([{ id: "cortana", saved: true, metadata: { characterId: "cortana" } }]);
    input = JSON.parse(options.body); generated++;
    return new Response(new ReadableStream({ start(controller) {
      upstream = controller; controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true });
    } }));
  } });
  const server = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: directory }, breezeSpeech: breeze });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const address = await server.listen(0), abort = new AbortController();
  const url = `http://127.0.0.1:${address.port}/api/characters/cortana/voice/stream`;
  const post = voiceId => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Streaming reply", voiceId }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3000)]) });
  const wrong = await post("zima"); assert.equal(wrong.status, 409); await wrong.json(); assert.equal(generated, 0);
  const response = await post("cortana"), reader = response.body.getReader();
  try {
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /audio\/pcm/);
    assert.equal(input.response_format, "pcm"); assert.equal(input.voice, "cortana");
    assert.deepEqual(Array.from((await reader.read()).value), [1, 2, 3, 4]);
    upstream.enqueue(new Uint8Array([5, 6]));
    assert.deepEqual(Array.from((await reader.read()).value), [5, 6]);
    abort.abort(); await assert.rejects(reader.read());
  } finally { abort.abort(); await reader.cancel().catch(() => {}); reader.releaseLock(); }
});
