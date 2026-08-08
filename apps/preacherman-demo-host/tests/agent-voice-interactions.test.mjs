import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");

async function loadCoordinator(t) {
  const source = await readFile(join(packageRoot, "src", "live", "LiveCoordinator.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-live-coordinator-"));
  const modulePath = join(temporaryDirectory, "LiveCoordinator.mjs");
  await writeFile(modulePath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
}

test("Agent A announces task start and summarizes a completed B artifact", async () => {
  const source = await readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8");
  assert.match(source, /taskStarted/);
  assert.match(source, /pluginTaskStarted/);
  assert.match(source, /proposal\.kind === "plugin-tool"/);
  assert.match(source, /runCompletionSummary/);
  assert.match(source, /completionSummary/);
  assert.match(source, /run\.status !== "succeeded"/);
  assert.match(source, /coordinator\.requestSpeech/);
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

test("the demo exposes one guided AIRI path from proposal to Ledger artifact", async () => {
  const [consoleSource, ledger, ledgerBoundary, app] = await Promise.all([
    readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "conversation", "ConversationLedgerScreen.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "conversationLedger.ts"), "utf8"),
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
  ]);
  assert.match(consoleSource, /tryDemo/);
  assert.match(consoleSource, /demoPrompt/);
  assert.match(consoleSource, /preacherman\.ledger-view/);
  assert.match(consoleSource, /openLocalSurface\("ledger"\)/);
  assert.match(ledgerBoundary, /\/api\/tasks\?limit=10/);
  assert.match(ledger, /task\.artifact\?\.path/);
  assert.match(app, /findAiriFeature\(featureId\)\?\.target/);
  assert.match(app, /openLocalSurface\(target\.surface\)/);
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
  assert.match(source, /coordinator\.onSpeechLifecycle/);
  assert.match(source, /awaitingAssistantReply/);
  assert.match(source, /onPointerDown=/);
  assert.match(source, /onClick=\{captureMode === "handsFree"/);
});

test("the Live Coordinator keeps speech, transcript, and task cancellation in separate scopes", async () => {
  const [coordinator, context, voice, consoleSource, app] = await Promise.all([
    readFile(join(packageRoot, "src", "live", "LiveCoordinator.ts"), "utf8"),
    readFile(join(packageRoot, "src", "live", "LiveCoordinatorContext.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "realtime", "VoiceSessionControl.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
  ]);

  assert.match(coordinator, /connectPresentationAdapter/);
  assert.match(coordinator, /stopSpeech\(\)/);
  assert.match(coordinator, /deliverFinalTranscript/);
  assert.match(coordinator, /connectTaskCancellationAdapter/);
  assert.match(coordinator, /cancelTask\(taskRunId/);
  assert.match(coordinator, /generationId/);
  assert.match(coordinator, /audioStreamId/);
  assert.match(coordinator, /interactionEpoch/);
  assert.match(coordinator, /beginConversationEpoch/);
  assert.match(coordinator, /onConversationEpoch/);
  assert.match(coordinator, /isConversationEpochCurrent/);
  assert.match(context, /LiveCoordinatorProvider/);
  assert.match(app, /<LiveCoordinatorProvider>/);

  assert.match(voice, /labels\.stopSpeaking/);
  assert.match(consoleSource, /labels\.stopTask/);
  assert.match(consoleSource, /coordinator\.beginConversationEpoch\(\)/);
  assert.doesNotMatch(voice, /preacherman:(?:speak|voice-transcript|tts-finished)/);
  assert.doesNotMatch(consoleSource, /preacherman:(?:speak|voice-transcript|tts-finished)/);
});

test("stopping presentation never cancels a TaskRun", async (t) => {
  const { LiveCoordinator } = await loadCoordinator(t);
  const coordinator = new LiveCoordinator();
  const calls = [];
  coordinator.connectPresentationAdapter({
    speak: async (request) => { calls.push(["speak", request]); },
    stopSpeech: (reason) => calls.push(["stop-speech", reason]),
  });
  coordinator.connectTaskCancellationAdapter({
    cancelTask: async (taskRunId) => { calls.push(["cancel-task", taskRunId]); },
  });

  assert.equal(coordinator.requestSpeech("Demo reply", "en", "task:1"), true);
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.reportSpeechLifecycle("playing");
  assert.equal(coordinator.stopSpeech(), true);
  assert.deepEqual(calls.map(([scope]) => scope), ["speak", "stop-speech"]);

  assert.equal(await coordinator.cancelTask("task:1"), true);
  assert.deepEqual(calls.map(([scope]) => scope), ["speak", "stop-speech", "cancel-task"]);
  assert.equal(calls[0][1].taskId, "task:1");
  assert.match(calls[0][1].generationId, /^generation_/);
  assert.match(calls[0][1].audioStreamId, /^audio_/);
});

test("the coordinator routes speech through the AIRI-derived Presentation Runtime", async () => {
  const source = await readFile(join(packageRoot, "src", "live", "LiveCoordinator.ts"), "utf8");
  const consoleSource = await readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8");
  assert.match(source, /createPresentationRuntime/);
  assert.match(source, /openGeneration/);
  assert.match(source, /interruptPresentation/);
  assert.match(consoleSource, /\/api\/tasks\/\$\{taskRunId\}\/commands/);
});

test("a new conversation advances the epoch and rejects stale transcript or presentation work", async (t) => {
  const { LiveCoordinator } = await loadCoordinator(t);
  const coordinator = new LiveCoordinator();
  const calls = [];
  const transcripts = [];
  const epochs = [];
  coordinator.connectPresentationAdapter({
    speak: async (request) => { calls.push(["speak", request.interactionEpoch]); },
    stopSpeech: (reason) => calls.push(["stop-speech", reason]),
  });
  coordinator.onFinalTranscript((transcript) => transcripts.push(transcript));
  coordinator.onConversationEpoch((epoch) => epochs.push(epoch));

  const oldAsrEpoch = coordinator.getConversationEpoch();
  assert.equal(coordinator.requestSpeech("Old reply", "en"), true);
  assert.equal(coordinator.getConversationEpoch(), oldAsrEpoch);
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.reportSpeechLifecycle("playing");
  const nextEpoch = coordinator.beginConversationEpoch();

  assert.equal(nextEpoch > oldAsrEpoch, true);
  assert.deepEqual(epochs, [nextEpoch]);
  assert.equal(coordinator.deliverFinalTranscript("stale transcript", oldAsrEpoch), false);
  assert.equal(coordinator.deliverFinalTranscript("current transcript", nextEpoch), true);
  assert.deepEqual(transcripts, ["current transcript"]);
  assert.deepEqual(calls.map(([scope]) => scope), ["speak", "stop-speech"]);
  assert.equal(calls[1][1], "new_request");
  assert.equal(coordinator.getSpeechLifecycle(), "idle");
});
