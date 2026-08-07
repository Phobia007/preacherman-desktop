import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("Agent A announces task start and summarizes a completed B artifact", async () => {
  const source = await readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8");
  assert.match(source, /taskStarted/);
  assert.match(source, /completionSummary/);
  assert.match(source, /run\.status !== "succeeded"/);
  assert.match(source, /preacherman:speak/);
  assert.doesNotMatch(source, /run\?\.status === "running"\) return/);
});

test("the chat can start a new conversation without erasing saved history", async () => {
  const [ledger, consoleSource] = await Promise.all([
    readFile(join(packageRoot, "src", "conversationLedger.ts"), "utf8"),
    readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8"),
  ]);
  assert.match(ledger, /export function beginNewConversation/);
  assert.match(ledger, /if \(messages\.length === 0\) return/);
  assert.match(consoleSource, /startNewConversation/);
  assert.match(consoleSource, /beginNewConversation\(\)/);
  assert.match(consoleSource, /newConversation/);
  assert.match(consoleSource, /disabled=\{busy \|\| hasActiveTask\}/);
});

test("the companion sends conversation history and exposes its reply source", async () => {
  const source = await readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8");
  assert.match(source, /history: \[\.\.\.messages, \{ role: "user", text \}\]/);
  assert.match(source, /TurnDiagnostics/);
  assert.match(source, /deepseek-unstructured/);
  assert.match(source, /fallbackReply/);
});

test("voice input exposes persisted push-to-talk and hands-free VAD modes", async () => {
  const source = await readFile(join(packageRoot, "src", "realtime", "VoiceSessionControl.tsx"), "utf8");
  assert.match(source, /VOICE_MODE_STORAGE_KEY/);
  assert.match(source, /pushToTalk/);
  assert.match(source, /handsFree/);
  assert.match(source, /server_vad/);
  assert.match(source, /threshold: 0\.2/);
  assert.match(source, /silence_duration_ms: 900/);
  assert.match(source, /isMeaningfulTranscript/);
  assert.match(source, /handsFreeActive/);
  assert.match(source, /preacherman:tts-finished/);
  assert.match(source, /awaitingAssistantReply/);
  assert.match(source, /onPointerDown=/);
  assert.match(source, /onClick=\{captureMode === "handsFree"/);
});
