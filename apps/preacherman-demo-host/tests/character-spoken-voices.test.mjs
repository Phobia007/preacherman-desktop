import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterConversation } from "../server/characterConversation.mjs";

const sessionId = "spoken-language-session-01";
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-spoken-voices-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "characters.json"), replies = [], synthesis = [];
  const voices = [["cortana", "cortana", "en"], ["clove", "clove-t-pose", "zh"], ["zima", "zima", "en"]]
    .map(([voiceId, characterId, language]) => ({ id: "breeze:" + voiceId, voiceId, characterId, language, provider: "breeze" }));
  let offline = false;
  const args = {
    file, connections: { status: async () => ({ active: { mode: "cli", agentId: "codex-cli", model: "default" } }) },
    codex: { chat: async input => { replies.push(input); return { text: "A reply.", source: "codex-cli" }; } },
    breeze: { voices: async () => { if (offline) throw Error("offline"); return voices; },
      synthesize: async input => { synthesis.push(input); return { audio: "own-voice", voiceId: input.voiceId }; } },
    windowsSpeech: { synthesize: async () => { throw Error("Unexpected generic voice"); } },
  };
  return { file, args, voices, replies, synthesis, service: createCharacterConversation(args), offline: () => { offline = true; } };
}

test("unique clones bind automatically to each character and survive restart without Apply", async t => {
  const f = await fixture(t);
  for (const voice of f.voices) {
    const state = await f.service.voiceSettings(voice.characterId);
    assert.equal(state.selectedVoiceId, voice.id);
    assert.equal(state.voiceLanguage, voice.language);
    assert.equal(state.service.provider, "breeze");
    await createCharacterConversation(f.args).synthesize(voice.characterId, { text: "Hello" });
    assert.equal(f.synthesis.at(-1).voiceId, voice.voiceId);
  }
  f.offline();
  await assert.rejects(f.service.synthesize("cortana", { text: "No fallback" }), /offline/);
});

test("spoken reply language follows the selected clone, independently of input language", async t => {
  const f = await fixture(t);
  assert.equal((await f.service.chat("cortana", { text: "你好，请介绍自己", sessionId })).voiceLanguage, "en");
  assert.match(f.replies.at(-1).personaInstructions, /Reply in English only/);
  assert.equal(f.replies.at(-1).voiceConversation, true);
  assert.equal((await f.service.chat("clove-t-pose", { text: "Please introduce yourself", sessionId })).voiceLanguage, "zh");
  assert.match(f.replies.at(-1).personaInstructions, /Reply in Simplified Chinese only/);
  assert.equal(f.replies.at(-1).messages.length, 1);
});

test("existing foreign assignments are repaired; multiple own options preserve explicit choices", async t => {
  const f = await fixture(t);
  await f.service.profile("cortana");
  const state = JSON.parse(await readFile(f.file, "utf8"));
  state.cortana.selectedVoiceId = "breeze:zima";
  state.cortana.voiceService = { provider: "breeze" };
  await writeFile(f.file, JSON.stringify(state));
  await f.service.synthesize("cortana", { text: "My own voice" });
  assert.equal(f.synthesis.at(-1).voiceId, "cortana");
  f.voices.push({ ...f.voices[0], id: "breeze:cortana_zh", voiceId: "cortana_zh", language: "zh" });
  await f.service.applyVoice("cortana", "breeze:cortana_zh");
  assert.equal((await f.service.voiceSettings("cortana")).selectedVoiceId, "breeze:cortana_zh");
  assert.equal((await f.service.chat("cortana", { text: "Hello", sessionId })).voiceLanguage, "zh");
  await f.service.synthesize("cortana", { text: "你好" });
  assert.equal(f.synthesis.at(-1).voiceId, "cortana_zh");
});

test("ambiguous own clones do not auto-select, and unassigned clones are never borrowed", async t => {
  const f = await fixture(t);
  f.voices.push({ ...f.voices[2], id: "breeze:zima_alt", voiceId: "zima_alt" });
  f.voices.push({ ...f.voices[0], id: "breeze:demo", voiceId: "demo", characterId: null });
  assert.equal((await f.service.voiceSettings("zima")).selectedVoiceId, null);
  await assert.rejects(f.service.synthesize("zima", { text: "Choose first" }), /Choose a voice assigned/);
  await assert.rejects(f.service.chat("zima", { text: "Choose first", sessionId }), /Choose a voice assigned/);
  assert.equal(f.replies.length, 0);
  const other = await f.service.voiceSettings("tifa-ff7re");
  assert.equal(other.selectedVoiceId, null);
  assert.deepEqual(other.voices, []);
});

test("verified clone selection determines synthesis even when an older profile has no provider", async t => {
  const f = await fixture(t);
  await f.service.voiceSettings("cortana");
  const state = JSON.parse(await readFile(f.file, "utf8"));
  delete state.cortana.voiceService;
  await writeFile(f.file, JSON.stringify(state));
  await f.service.synthesize("cortana", { text: "My voice" });
  assert.equal(f.synthesis.at(-1).voiceId, "cortana");
  await assert.rejects(f.service.synthesize("cortana", { text: "Stale voice", voiceId: "cortana_zh" }), /Voice selection changed/);
});

test("changing the selected voice during a reply rejects stale language before playback", async t => {
  const f = await fixture(t);
  f.voices.push({ ...f.voices[0], id: "breeze:cortana_zh", voiceId: "cortana_zh", language: "zh" });
  await f.service.applyVoice("cortana", "breeze:cortana");
  f.args.codex.chat = async () => { await f.service.applyVoice("cortana", "breeze:cortana_zh"); return { text: "Old English reply" }; };
  await assert.rejects(f.service.chat("cortana", { text: "Hello", sessionId }), /Voice selection changed/);
  assert.equal(f.synthesis.length, 0);
});
