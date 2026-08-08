import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");

async function loadVoiceFixtureRuntime(t) {
  const [coordinatorSource, contextSource] = await Promise.all([
    readFile(join(packageRoot, "src", "live", "LiveCoordinator.ts"), "utf8"),
    readFile(join(packageRoot, "src", "live", "LiveCoordinatorContext.tsx"), "utf8"),
  ]);
  const controllerSource = contextSource.match(/export type AvatarInteractionState[\s\S]*?(?=\nconst AvatarInteractionContext)/)?.[0];
  assert.ok(controllerSource, "avatar interaction controller must remain independently testable");
  const transpile = (source) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-voice-avatar-"));
  const modulePath = join(temporaryDirectory, "fixture-runtime.mjs");
  await writeFile(modulePath, `${transpile(coordinatorSource)}\n${transpile(controllerSource)}`, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
}

test("a microphone-free transcript fixture drives the complete avatar response lifecycle", async (t) => {
  const { AvatarInteractionController, LiveCoordinator } = await loadVoiceFixtureRuntime(t);
  const avatar = new AvatarInteractionController();
  const coordinator = new LiveCoordinator();
  const states = [];
  const transcripts = [];
  avatar.subscribe((state) => states.push(state));

  coordinator.connectPresentationAdapter({
    speak: async () => {
      avatar.setState("speaking");
      await Promise.resolve();
      avatar.setState("idle");
    },
    stopSpeech: () => avatar.setState("idle"),
  });
  coordinator.onFinalTranscript((transcript) => {
    transcripts.push(transcript);
    avatar.setState("thinking");
    coordinator.requestSpeech(`Fixture reply to ${transcript}`, "en");
  });

  avatar.setState("listening");
  coordinator.deliverFinalTranscript("run the shared agent flow");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(transcripts, ["run the shared agent flow"]);
  assert.deepEqual(states, ["listening", "thinking", "speaking", "idle"]);
});

test("Home and Lab mount the shared conversation and avatar surfaces", async () => {
  const [app, styles] = await Promise.all([
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);

  assert.match(app, /const homeContent[\s\S]*?<CortanaModelStage ariaLabel="Activated Cortana model" \/>[\s\S]*?<VoiceSessionControl[\s\S]*?<ABTaskConsole/);
  assert.match(app, /const labContent[\s\S]*?<CortanaModelStage ariaLabel="Cortana voice and avatar lab model" \/>[\s\S]*?<VoiceSessionControl/);
  assert.match(styles, /\.demo-host--home > \.ab-task-console\s*\{[\s\S]*right:\s*auto;[\s\S]*left:\s*72px;/);
});

test("voice and model components share explicit four-state avatar control without task cancellation", async () => {
  const [context, voice, model] = await Promise.all([
    readFile(join(packageRoot, "src", "live", "LiveCoordinatorContext.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "realtime", "VoiceSessionControl.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "gallery", "CortanaModelStage.tsx"), "utf8"),
  ]);

  assert.match(context, /"idle" \| "listening" \| "thinking" \| "speaking"/);
  assert.match(voice, /setAvatarState\("listening"\)/);
  assert.match(voice, /beginThinking\(\)/);
  assert.match(voice, /setAvatarState\("speaking"\)/);
  assert.match(voice, /setAvatarState\("idle"\)/);
  assert.match(model, /interactionState === "thinking"/);
  assert.match(model, /data-avatar-state=\{interactionState\}/);
  assert.match(voice, /coordinator\.stopSpeech\(\)/);
  assert.doesNotMatch(voice, /cancelTask/);
  assert.match(voice, /coordinator\.onConversationEpoch/);
  assert.match(voice, /activeAsrEpoch/);
  assert.match(voice, /activeSpeechEpoch/);
  assert.match(voice, /coordinator\.deliverFinalTranscript\(finalText, conversationEpoch\)/);
});
