import assert from "node:assert/strict";
import test from "node:test";
import {
  createCortanaVoiceTelemetry,
  normalizeCortanaVoiceTiming,
} from "../server/cortanaVoiceTelemetry.mjs";

const baseEvent = {
  event: "cortana_voice_first_motion",
  traceId: "voice_8ac208be-80f6-4eef-8ab1-43bd9ea0a7a2",
  elapsedMs: 123.6,
  conversationEpoch: 4,
  interactionEpoch: 7,
  captureMode: "handsFree",
  trigger: "wake_control",
  driver: "audio2face",
};

test("Cortana telemetry rejects content and unknown timing fields", () => {
  assert.throws(
    () => normalizeCortanaVoiceTiming({ ...baseEvent, transcript: "private speech" }),
    /unknown field/,
  );
  assert.throws(
    () => normalizeCortanaVoiceTiming({ ...baseEvent, traceId: "not-a-trace" }),
    /traceId is invalid/,
  );
  assert.throws(
    () => normalizeCortanaVoiceTiming({ ...baseEvent, event: "cortana_voice_fallback", driver: undefined }),
    /requires a reason/,
  );
});

test("disabled Cortana telemetry validates locally without making a network request", () => {
  let requests = 0;
  const telemetry = createCortanaVoiceTelemetry({
    env: {},
    fetchImpl: async () => { requests += 1; },
  });
  assert.deepEqual(telemetry.capture(baseEvent), { accepted: false, reason: "disabled" });
  assert.equal(requests, 0);
});

test("enabled Cortana telemetry posts an anonymous event to the PostHog capture API", async () => {
  const requests = [];
  const telemetry = createCortanaVoiceTelemetry({
    env: {
      POSTHOG_PROJECT_TOKEN: "phc_test",
      POSTHOG_HOST: "https://eu.i.posthog.com",
    },
    fetchImpl: async (...request) => { requests.push(request); },
  });

  assert.deepEqual(telemetry.capture(baseEvent), { accepted: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0][0]), "https://eu.i.posthog.com/i/v0/e/");
  const payload = JSON.parse(requests[0][1].body);
  assert.equal(payload.api_key, "phc_test");
  assert.equal(payload.event, baseEvent.event);
  assert.equal(payload.distinct_id, baseEvent.traceId);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.elapsed_ms, 124);
  assert.equal(JSON.stringify(payload).includes("private speech"), false);
});
