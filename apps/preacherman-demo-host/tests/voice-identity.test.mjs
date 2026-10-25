import assert from "node:assert/strict";
import test from "node:test";
import { describeBreezeVoice } from "../server/voiceIdentity.mjs";

test("saved voice names resolve only to their corresponding character", () => {
  for (const [name, id] of [["Cortana", "cortana"], ["cortana_en_voice_v2", "cortana"], ["MASTER-CHIEF", "halo-mk-v-model"], ["Master Chief English", "halo-mk-v-model"], ["Pathfinder", "apex-legend-pathfinder"], ["clove", "clove-t-pose"], ["ZIMA", "zima"], ["2B-en", "nier-automata-2b"]]) {
    assert.equal(describeBreezeVoice({ id: name }).characterId, id, name);
  }
  assert.equal(describeBreezeVoice({ id: "demo_zh_warm", description: "Cortana", ref_text: "I am Cortana." }).characterId, null);
  assert.equal(describeBreezeVoice({ id: "cortanaish" }).characterId, null);
  assert.equal(describeBreezeVoice({ id: "master-chief", ref_text: "Cortana says hello." }).characterId, "halo-mk-v-model");
});

test("explicit character and language assignments override inferred names and transcripts", () => {
  assert.deepEqual(describeBreezeVoice({ id: "custom", ref_text: "你好，很高兴认识你。", metadata: { characterId: "cortana", language: "en-US" } }), { characterId: "cortana", language: "en", languageSource: "metadata" });
  assert.equal(describeBreezeVoice({ id: "cortana", metadata: { characterId: "missing" } }).characterId, null);
  assert.equal(describeBreezeVoice({ id: "clove", metadata: { language: "中文" } }).language, "zh");
  assert.equal(describeBreezeVoice({ id: "custom", ref_text: "Hello there.", metadata: { language: "fr" } }).language, "unknown");
});

test("timestamped English dialogue ignores Chinese headings and translated subtitle lines", () => {
  const ref_text = "音频时长：约三分钟\n说明：原声为英语，中文为对照译文。\n\n1. [00:00.0–00:01.7]\n… contender, and I am.\n……竞争者，而我是。\n\n2. [00:02.0–00:03.1]\nDo you like my new toys?\n你喜欢我的新玩具吗？";
  assert.deepEqual(describeBreezeVoice({ id: "pathfinder", ref_text }), { characterId: "apex-legend-pathfinder", language: "en", languageSource: "reference" });
  assert.equal(describeBreezeVoice({ id: "cortana", ref_text: "1. [00:25–00:29]\nI was put into service eight years ago.\n我是在八年前开始服役的。" }).language, "en");
});

test("Chinese dialogue and plain reference recordings retain their original language", () => {
  assert.equal(describeBreezeVoice({ id: "clove", ref_text: "来源：中文文字稿\n1. [00:05–00:11]\n[笑声]\n好家伙，我和不死鸟同队。\n\n2. [00:11–00:17]\n哎，盖可，你有想过教皮蛋用枪吗？" }).language, "zh");
  assert.equal(describeBreezeVoice({ id: "demo_zh_warm", ref_text: "你好，我是一位温和沉稳的讲述者。" }).language, "zh");
  assert.equal(describeBreezeVoice({ id: "cortana", ref_text: "Hello, this is my voice." }).language, "en");
  assert.equal(describeBreezeVoice({ id: "zima", ref_text: "1. [00:00–00:04] I am going home.\n我要回家了。" }).language, "en");
});

test("absent or conflicting spoken-language evidence remains unknown", () => {
  for (const ref_text of [undefined, "", "[music]", "1. [00:00–00:01]\n[noise]", "1. [00:00–00:01]\nHello there.\n2. [00:02–00:03]\n你好，欢迎回来。"])
    assert.equal(describeBreezeVoice({ id: "cortana", ref_text }).language, "unknown");
});
