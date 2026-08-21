import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");

test("Cortana voice timing sends only fixed events through the local service boundary", async () => {
  const [telemetry, voice, server] = await Promise.all([
    readFile(join(hostRoot, "src", "telemetry", "cortanaVoiceTiming.ts"), "utf8"),
    readFile(join(hostRoot, "src", "realtime", "VoiceSessionControl.tsx"), "utf8"),
    readFile(join(hostRoot, "server", "preachermanServer.mjs"), "utf8"),
  ]);

  for (const eventName of [
    "cortana_voice_wake",
    "cortana_voice_asr",
    "cortana_voice_first_audio",
    "cortana_voice_first_motion",
    "cortana_voice_fallback",
    "cortana_voice_complete",
  ]) {
    assert.match(telemetry, new RegExp(`"${eventName}"`));
  }
  assert.match(telemetry, /VITE_POSTHOG_TIMING_ENABLED !== "true"/);
  assert.match(telemetry, /localServiceUrl\("\/api\/telemetry\/cortana-voice"\)/);
  assert.match(telemetry, /keepalive: true/);
  assert.match(telemetry, /\.catch\(\(\) =>/);
  assert.doesNotMatch(telemetry, /transcript|audio_base64|speech_text/);
  assert.match(server, /\/api\/telemetry\/cortana-voice/);

  assert.match(voice, /recordVoiceTiming\("asr"\)/);
  assert.match(voice, /recordVoiceTiming\("first_audio", \{ interactionEpoch \}\)/);
  assert.match(voice, /recordVoiceTiming\("first_motion", \{ interactionEpoch, driver \}\)/);
  assert.match(voice, /recordVoiceTiming\("fallback", \{ interactionEpoch, fallbackReason: reason \}\)/);
  assert.match(voice, /recordVoiceTiming\("complete", \{ interactionEpoch: expectedEpoch \?\? undefined, completion \}\)/);
});
