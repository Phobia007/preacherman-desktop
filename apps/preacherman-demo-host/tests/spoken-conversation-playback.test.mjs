import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function fixture() {
  const audio = {};
  runInNewContext(ts.transpileModule(await readFile(new URL("../src/audio/spokenAudio.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: audio, Intl });
  let source = await readFile(new URL("../src/audio/SpokenConversation.ts", import.meta.url), "utf8");
  source = source.replace('new URL("./voiceCapture.worklet.js?no-inline", import.meta.url)', '"capture.js"');
  const motions = [], faces = [], stoppedMotions = [], stopReasons = [];
  const motion = {};
  runInNewContext(ts.transpileModule(await readFile(new URL("../src/motion/SpokenMotionPlayback.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: motion, require: () => ({ speechMotionRuntime: { start: async options => { motions.push(options); return true; },
    startFaceStream(options) { const record = { ...options, chunks: [] }; faces.push(record); return { firstFrame: Promise.resolve(true), append(pcm) { record.chunks.push(pcm); }, finish() { record.finished = true; } }; },
    cancel: (epoch, reason) => { stoppedMotions.push(epoch); stopReasons.push(reason); } }, motionStrength: { natural: 0.55 } }), AbortController, setTimeout, clearTimeout });
  const exports = {}, states = [], contexts = [], frames = new Set();
  let character = "cortana", sequence = 0;
  class Meter { starts = 0; stops = 0; start() { this.starts++; return Promise.resolve(true); } stop() { this.stops++; } dispose() {} }
  class Context {
    state = "running";
    currentTime = 0;
    destination = {};
    sources = [];
    constructor() { contexts.push(this); }
    async resume() {}
    async close() { this.state = "closed"; }
    async decodeAudioData() { return { duration: 1, length: 24000, sampleRate: 24000, numberOfChannels: 1, getChannelData: () => new Float32Array(24000).fill(.25) }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
      this.sources.push(source); return source;
    }
    createAnalyser() { return { fftSize: 512, connect() {}, disconnect() {}, getFloatTimeDomainData() {} }; }
  }
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => name.endsWith("/SpokenMotionPlayback") ? motion : name.endsWith("/characterMotion") ? { defaultCharacterMotion: id => ({ characterId: id, supported: true, enabled: true, style: "natural" }) } : name === "./spokenAudio" ? { ...audio, speechWav: () => "audio" } : {
      MicrophoneMeter: Meter, selectOutput: async () => {}, voiceFrame: () => ({}),
    },
    AbortController, AbortSignal, crypto: { randomUUID: () => "session" }, setTimeout, clearTimeout,
    requestAnimationFrame() { frames.add(++sequence); return sequence; }, cancelAnimationFrame(id) { frames.delete(id); },
    window: { dispatchEvent() {} }, CustomEvent: class {}, AudioContext: Context,
    atob: value => Buffer.from(value, "base64").toString("binary"), performance,
  });
  const voice = new exports.SpokenConversation(() => {}, state => states.push(state), () => character, () => ({ input: "", output: "" }), () => {});
  return { voice, audio, states, contexts, frames, motions, faces, stoppedMotions, stopReasons, setCharacter(value) { character = value; } };
}

test("natural audio completion and barge-in select different motion release envelopes", async () => {
  for (const interrupted of [false, true]) {
    const { voice, contexts, stopReasons } = await fixture();
    const cancel = new AbortController();
    voice.request = async () => ({ audio: "YXVkaW8=" });
    const running = voice.speak("Hello there.", cancel.signal, "cortana");
    try {
      await tick();
      if (interrupted) { cancel.abort(); await assert.rejects(running); }
      else { contexts[0].sources[0].onended(); await running; }
      assert.ok(stopReasons.length > 0);
      assert.ok(stopReasons.every(reason => reason === (interrupted ? "audio-stopped" : "audio-ended")));
    } finally { cancel.abort(); await running.catch(() => {}); voice.dispose(); }
  }
});

test("sentence chunks preserve English sentences, decimal values and Chinese punctuation", async () => {
  const { audio } = await fixture();
  assert.deepEqual(Array.from(audio.spokenSentences("Ready now. I can help you next!", "en")), ["Ready now.", "I can help you next!"]);
  assert.deepEqual(Array.from(audio.spokenSentences("你好。我们开始吧！", "zh")), ["你好。", "我们开始吧！"]);
  assert.equal(audio.spokenSentences("The value is 1.25 today.", "en").length, 1);
  assert.equal(audio.spokenSentences("  ", "unknown").length, 0);
});

test("first sentence plays before later synthesis completes with only one following request", async () => {
  const { voice, contexts } = await fixture();
  const requests = [], playback = [];
  voice.request = (path, body, signal) => {
    const pending = deferred(); requests.push({ path, body, signal, ...pending }); return pending.promise;
  };
  voice.playAudio = (audio, _context, signal) => {
    const pending = deferred(); playback.push({ audio, signal, ...pending }); return pending.promise;
  };
  const cancel = new AbortController();
  const running = voice.speak("First sentence. Second sentence. Third sentence.", cancel.signal, "cortana", "cortana-en");
  try {
    assert.equal(requests.length, 1);
    requests[0].resolve({ audio: "first" }); await tick();
    assert.equal(playback[0].audio, "first"); assert.equal(requests.length, 2);
    assert.equal(requests[1].body.text, "Second sentence.");
    requests[1].resolve({ audio: "second" }); await tick();
    assert.equal(requests.length, 2); assert.equal(playback.length, 1);
    playback[0].resolve(); await tick();
    assert.equal(playback[1].audio, "second"); assert.equal(requests.length, 3);
    requests[2].resolve({ audio: "third" }); playback[1].resolve(); await tick();
    assert.equal(playback[2].audio, "third"); playback[2].resolve();
    await running;
    assert.ok(requests.every(request => request.path.includes("/cortana/")));
    assert.ok(requests.every(request => request.body.voiceId === "cortana-en"));
    assert.equal(contexts.length, 1); assert.equal(contexts[0].state, "closed");
  } finally { cancel.abort(); requests.forEach(request => request.resolve({ audio: "cancel" })); playback.forEach(part => part.resolve()); await running.catch(() => {}); voice.dispose(); }
});

test("cancel stops active playback, aborts prefetched synthesis and releases audio resources", async () => {
  const { voice, contexts, frames } = await fixture();
  const requests = [];
  voice.request = (_path, _body, signal) => {
    requests.push(signal);
    if (requests.length === 1) return Promise.resolve({ audio: "YXVkaW8=" });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  };
  const cancel = new AbortController();
  const running = voice.speak("First sentence. Second sentence. Third sentence.", cancel.signal, "cortana");
  try {
    await tick();
    assert.equal(requests.length, 2); assert.equal(contexts[0].sources[0].started, true);
    cancel.abort(); await assert.rejects(running, /abort/i);
    assert.equal(requests[1].aborted, true); assert.equal(contexts[0].sources[0].stopped, true);
    assert.equal(contexts[0].sources[0].disconnected, true); assert.equal(contexts[0].state, "closed");
    assert.equal(frames.size, 0); assert.equal(voice.playback, null);
  } finally { cancel.abort(); await running.catch(() => {}); voice.dispose(); }
});

test("a failed prefetched sentence is consumed after playback without starting another request", async () => {
  const { voice, contexts } = await fixture();
  const playing = deferred();
  let requests = 0;
  voice.request = async () => {
    requests++;
    if (requests === 1) return { audio: "first" };
    throw new Error("Next sentence failed");
  };
  voice.playAudio = () => playing.promise;
  const cancel = new AbortController();
  const running = voice.speak("First sentence. Second sentence. Third sentence.", cancel.signal, "cortana");
  try {
    await tick(); assert.equal(requests, 2);
    playing.resolve(); await assert.rejects(running, /Next sentence failed/);
    assert.equal(requests, 2); assert.equal(contexts[0].state, "closed");
  } finally { cancel.abort(); playing.resolve(); await running.catch(() => {}); voice.dispose(); }
});

test("a synthesis failure produces one error state without synthesizing the error again", async () => {
  const { voice, states } = await fixture();
  let synthesis = 0;
  voice.request = async path => {
    if (path.endsWith("/execution")) return { active: {} };
    if (path.includes("/status?")) return { language: "zh-CN", voiceLanguage: "en" };
    if (path.endsWith("/recognize")) return { accepted: true, text: "你好" };
    if (path.endsWith("/conversation")) return { text: "Hello there.", voiceLanguage: "en" };
    if (path.endsWith("/synthesize")) { synthesis++; throw new Error("Breeze unavailable"); }
    throw new Error("Unexpected request");
  };
  try {
    await voice.start(); await voice.reply([new Float32Array(512)], voice.cancellation.signal);
    assert.equal(synthesis, 1); assert.equal(voice.active, false); assert.equal(states.at(-1), "error");
  } finally { voice.dispose(); }
});

test("session character and output language stay independent of the recognition language", async () => {
  const { voice, setCharacter } = await fixture();
  const chats = [], spoken = [];
  let accepted = true;
  voice.request = async (path, body) => {
    if (path.endsWith("/execution")) return { active: {} };
    if (path.includes("/status?")) return { language: "zh-CN", voiceLanguage: "en" };
    if (path.endsWith("/recognize")) { assert.equal(body.language, "zh-CN"); return { accepted, text: accepted ? "你好" : "" }; }
    chats.push(path); return { text: "Hello from Cortana.", voiceLanguage: "en", voiceId: "cortana-en" };
  };
  voice.speak = async (text, _signal, id, voiceId) => spoken.push({ text, id, voiceId });
  try {
    await voice.start(); setCharacter("clove-t-pose");
    await voice.reply([new Float32Array(512)], voice.cancellation.signal);
    assert.equal(chats[0], "/api/characters/cortana/conversation");
    assert.equal(spoken[0].id, "cortana");
    assert.equal(spoken[0].voiceId, "cortana-en");
    accepted = false; await voice.reply([new Float32Array(512)], voice.cancellation.signal);
    assert.match(spoken[1].text, /didn't catch/); assert.equal(spoken[1].id, "cortana");
    assert.equal(spoken[1].voiceId, undefined);
  } finally { voice.dispose(); }
});

test("neural segmentation rejects clicks, preserves onset and accepts repeated interrupted turns", async () => {
  const { audio } = await fixture();
  let starts = 0; const phrases = [];
  const detector = new audio.ConversationPhrase(() => starts++, blocks => phrases.push(blocks));
  const push = (probability, frames) => { for (let n = 0; n < frames; n++) detector.push(new Float32Array(512), probability); };
  push(0, 100); push(0.95, 2); push(0, 25);
  assert.equal(starts, 0); assert.equal(phrases.length, 0);
  for (let turn = 0; turn < 3; turn++) {
    push(0.9, 5); assert.equal(starts, turn);
    push(0.9, 1); assert.equal(starts, turn + 1);
    push(0.5, 5); push(0, 20); assert.equal(phrases.length, turn);
    push(0, 1); assert.equal(phrases.length, turn + 1);
    assert.ok(phrases[turn].length >= 32);
  }
});

test("barge-in stops sound and pending synthesis without reopening the mic or losing the next turn", async () => {
  const { voice, contexts, states, frames } = await fixture();
  const chats = [], syntheses = [];
  voice.request = async (path, body, signal) => {
    if (path.endsWith("/execution")) return { active: {} };
    if (path.includes("/status?")) return { language: "zh-CN", voiceLanguage: "en" };
    if (path.endsWith("/recognize")) return { accepted: true, text: "A new spoken turn" };
    if (path.endsWith("/conversation")) { chats.push(body); return { text: "First sentence. Unheard sentence.", voiceLanguage: "en" }; }
    syntheses.push(signal);
    if (syntheses.length % 2) return { audio: "YXVkaW8=" };
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  };
  try {
    await voice.start();
    const stops = voice.meter.stops;
    for (let n = 0; n < 3; n++) {
      const running = voice.reply([new Float32Array(512)], voice.cancellation.signal);
      await tick(); assert.equal(states.at(-1), "speaking");
      voice.interrupt();
      assert.equal(contexts.at(-1).sources[0].stopped, true);
      assert.equal(states.at(-1), "listening");
      await running;
      assert.equal(voice.active, true); assert.equal(voice.meter.starts, 1); assert.equal(voice.meter.stops, stops);
      assert.equal(syntheses.at(-1).aborted, true); assert.equal(frames.size, 0);
    }
    assert.equal(chats[1].playback.interrupted, true); assert.equal(chats[1].playback.heardCharacters, 0);
    assert.equal(states.includes("error"), false);
  } finally { voice.dispose(); }
  assert.equal(voice.active, false); assert.ok(contexts.every(context => context.state === "closed"));
});

test("an aborted provider response arriving late never starts playback or changes the new turn", async () => {
  const { voice, states } = await fixture();
  const provider = deferred(); let spoken = 0;
  voice.request = async path => {
    if (path.endsWith("/execution")) return { active: {} };
    if (path.includes("/status?")) return { language: "zh-CN" };
    if (path.endsWith("/recognize")) return { accepted: true, text: "Hello" };
    return provider.promise;
  };
  voice.speak = async () => { spoken++; };
  try {
    await voice.start(); const running = voice.reply([new Float32Array(512)], voice.cancellation.signal);
    await tick(); voice.interrupt(); provider.resolve({ text: "Stale reply" }); await running;
    assert.equal(spoken, 0); assert.equal(states.at(-1), "listening"); assert.equal(voice.active, true);
  } finally { voice.dispose(); }
});


test("speech motion uses decoded duration and audio clock, cancels even after all frames arrived", async () => {
  const { voice, contexts, motions, faces, stoppedMotions } = await fixture();
  const cancel = new AbortController();
  voice.request = async () => ({ audio: "YXVkaW8=" });
  voice.motion = { characterId: "cortana", supported: true, enabled: true, style: "natural" };
  const running = voice.speak("Hello there.", cancel.signal, "cortana");
  try {
    await tick();
    assert.equal(motions.length, 1); assert.equal(motions[0].duration, 1);
    assert.equal(motions[0].characterId, "cortana"); assert.equal(motions[0].text, "Hello there.");
    contexts[0].currentTime = 0.64; assert.equal(motions[0].playbackTime(), 0.64);
    assert.equal(faces.length, 1); assert.equal(faces[0].profile, "preacherman-arkit");
    assert.equal(faces[0].playbackTime(), .64); assert.equal(faces[0].finished, true);
    assert.equal(faces[0].chunks.reduce((n, pcm) => n + pcm.length, 0), 16000);
    assert.equal(faces[0].chunks[0][0], 8192);
    cancel.abort(); await assert.rejects(running);
    assert.ok(stoppedMotions.includes(motions[0].interactionEpoch));
    assert.equal(motions[0].signal.aborted, true);
    assert.equal(faces[0].signal.aborted, true);
  } finally { cancel.abort(); await running.catch(() => {}); voice.dispose(); }
});

test("Cortana lips still follow speech when body gestures are disabled; other rigs stay unchanged", async () => {
  for (const characterId of ["cortana", "zima"]) {
    const { voice, contexts, faces, motions } = await fixture();
    const cancel = new AbortController(); voice.request = async () => ({ audio: "YXVkaW8=" });
    voice.motion = { characterId, supported: true, enabled: false, style: "natural" };
    const running = voice.speak("Hello.", cancel.signal, characterId);
    try {
      await tick(); assert.equal(motions.length, 0); assert.equal(faces.length, characterId === "cortana" ? 1 : 0);
      assert.equal(contexts[0].sources[0].started, true);
    } finally { cancel.abort(); await running.catch(() => {}); voice.dispose(); }
  }
});
