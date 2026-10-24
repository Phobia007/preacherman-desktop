import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterConversation } from "../server/characterConversation.mjs";

function audioPreview() {
  const buffer = Buffer.alloc(100); buffer.write("RIFF"); buffer.write("WAVE", 8);
  return "data:audio/wav;base64," + buffer.toString("base64");
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-voice-settings-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "characters.json");
  const args = { file, connections: { status: async () => ({ active: { mode: "cli", agentId: "codex-cli" } }) }, codex: {}, listAgents: async () => [] };
  return { service: createCharacterConversation(args), args, file };
}
test("voice service drafts persist per character without keys or changing execution", async t => {
  const { service, args } = await fixture(t);
  const draft = { provider: "dashscope", model: "chosen-later", region: "beijing", workspaceId: "workspace", apiKey: "must-not-persist" };
  await service.saveVoiceService("cortana", draft);
  const state = await createCharacterConversation(args).voiceSettings("cortana");
  assert.equal(state.service.model, "chosen-later"); assert.equal(state.connectionStatus, "not-connected");
  assert.equal(state.service.apiKey, undefined); assert.equal((await service.profile("cortana")).execution.agentId, "codex-cli");
  assert.equal((await service.voiceSettings("zima")).service.model, "");
  await assert.rejects(service.saveVoiceService("invalid", draft), /Unknown character/);
});
test("preview selection is separate from Apply and persists without audio in the identity file", async t => {
  const { service, args, file } = await fixture(t);
  let state = await service.addVoice("cortana", { name: "User voice", voiceId: "cloned-voice", preview: audioPreview() });
  const id = state.voices[0].id;
  assert.equal(state.selectedVoiceId, null); assert.equal(state.voices[0].hasPreview, true);
  assert.equal(state.voices[0].preview, undefined); assert.equal((await service.previewVoice("cortana", id)).audio, audioPreview());
  assert.equal((await service.voiceSettings("cortana")).selectedVoiceId, null);
  state = await service.applyVoice("cortana", id); assert.equal(state.selectedVoiceId, id);
  assert.equal((await createCharacterConversation(args).voiceSettings("cortana")).selectedVoiceId, id);
  assert.doesNotMatch(await readFile(file, "utf8"), /base64/);
  await assert.rejects(service.applyVoice("zima", id), /Choose an available voice/);
  state = await service.removeVoice("cortana", id); assert.equal(state.selectedVoiceId, null); assert.equal(state.voices.length, 0);
  await assert.rejects(service.previewVoice("cortana", id), /not found/);
});
test("audio imports reject non-audio, oversized payloads and invalid names", async t => {
  const { service } = await fixture(t);
  await assert.rejects(service.addVoice("cortana", { name: "", preview: audioPreview() }), /Give this voice/);
  await assert.rejects(service.addVoice("cortana", { name: "Bad", preview: "data:audio/wav;base64," + Buffer.from("not a wav file".repeat(5)).toString("base64") }), /supported audio/);
  await assert.rejects(service.addVoice("cortana", { name: "Huge", preview: "x".repeat(4 * 1024 * 1024 + 1) }), /under 3 MB/);
  assert.equal((await service.voiceSettings("cortana")).voices.length, 0);
});

test("voice collection and service forms use defined semantic colors in both appearances", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const css = (await Promise.all(["../src/surfaces/asset/asset-voice.css", "../src/settings/voice-service.css"].map(path => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  const tokens = [...new Set(css.match(/--demo-theme-[\w-]+/g))];
  for (const token of tokens) assert.ok(styles.split(token + ":").length >= 3, `${token} has light and dark values`);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /(?:color|background)\s*:\s*#[\da-f]+/i);
});
