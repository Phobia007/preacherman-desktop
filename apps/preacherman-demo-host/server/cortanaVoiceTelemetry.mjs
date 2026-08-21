const EVENT_NAMES = new Set([
  "cortana_voice_wake",
  "cortana_voice_asr",
  "cortana_voice_first_audio",
  "cortana_voice_first_motion",
  "cortana_voice_fallback",
  "cortana_voice_complete",
]);
const CAPTURE_MODES = new Set(["pushToTalk", "handsFree"]);
const TRIGGERS = new Set(["wake_control", "voice_control", "hands_free_restart"]);
const DRIVERS = new Set(["speech2motion", "audio2face"]);
const FALLBACK_REASONS = new Set(["tts_timeout", "tts_error", "tts_empty"]);
const COMPLETIONS = new Set(["stream", "speech_synthesis"]);
const INPUT_KEYS = new Set([
  "event",
  "traceId",
  "elapsedMs",
  "conversationEpoch",
  "interactionEpoch",
  "captureMode",
  "trigger",
  "driver",
  "fallbackReason",
  "completion",
]);

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function optionalEnum(value, values, field) {
  if (value === undefined) return undefined;
  if (!values.has(value)) throw invalid(`Cortana voice timing ${field} is invalid.`);
  return value;
}

function epoch(value, field, optional = false) {
  if (optional && value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw invalid(`Cortana voice timing ${field} is invalid.`);
  return value;
}

export function normalizeCortanaVoiceTiming(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Cortana voice timing input must be an object.");
  if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) throw invalid("Cortana voice timing input contains an unknown field.");
  if (!EVENT_NAMES.has(input.event)) throw invalid("Cortana voice timing event is invalid.");
  if (typeof input.traceId !== "string" || !/^voice_[0-9a-f-]{36}$/i.test(input.traceId)) throw invalid("Cortana voice timing traceId is invalid.");
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0 || input.elapsedMs > 3_600_000) throw invalid("Cortana voice timing elapsedMs is invalid.");
  if (!CAPTURE_MODES.has(input.captureMode)) throw invalid("Cortana voice timing captureMode is invalid.");
  const normalized = {
    event: input.event,
    traceId: input.traceId,
    elapsedMs: Math.round(input.elapsedMs),
    conversationEpoch: epoch(input.conversationEpoch, "conversationEpoch"),
    interactionEpoch: epoch(input.interactionEpoch, "interactionEpoch", true),
    captureMode: input.captureMode,
    trigger: optionalEnum(input.trigger, TRIGGERS, "trigger"),
    driver: optionalEnum(input.driver, DRIVERS, "driver"),
    fallbackReason: optionalEnum(input.fallbackReason, FALLBACK_REASONS, "fallbackReason"),
    completion: optionalEnum(input.completion, COMPLETIONS, "completion"),
  };
  if (input.event === "cortana_voice_first_motion" && !normalized.driver) throw invalid("Cortana first motion timing requires a driver.");
  if (input.event === "cortana_voice_fallback" && !normalized.fallbackReason) throw invalid("Cortana fallback timing requires a reason.");
  if (input.event === "cortana_voice_complete" && !normalized.completion) throw invalid("Cortana completion timing requires a completion mode.");
  return normalized;
}

export function createCortanaVoiceTelemetry({ env = process.env, fetchImpl = fetch } = {}) {
  const projectToken = typeof env.POSTHOG_PROJECT_TOKEN === "string" ? env.POSTHOG_PROJECT_TOKEN.trim() : "";
  const configuredHost = typeof env.POSTHOG_HOST === "string" && env.POSTHOG_HOST.trim()
    ? env.POSTHOG_HOST.trim()
    : "https://us.i.posthog.com";
  const captureUrl = new URL("/i/v0/e/", configuredHost);
  if (!["http:", "https:"].includes(captureUrl.protocol)) throw new Error("POSTHOG_HOST must use HTTP or HTTPS.");

  return {
    capture(input) {
      const event = normalizeCortanaVoiceTiming(input);
      if (!projectToken) return { accepted: false, reason: "disabled" };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_500);
      void fetchImpl(captureUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          api_key: projectToken,
          event: event.event,
          distinct_id: event.traceId,
          properties: {
            $process_person_profile: false,
            trace_id: event.traceId,
            elapsed_ms: event.elapsedMs,
            conversation_epoch: event.conversationEpoch,
            interaction_epoch: event.interactionEpoch,
            capture_mode: event.captureMode,
            trigger: event.trigger,
            driver: event.driver,
            fallback_reason: event.fallbackReason,
            completion: event.completion,
          },
        }),
      }).catch(() => { /* Optional telemetry never changes the voice flow. */ })
        .finally(() => clearTimeout(timeout));
      return { accepted: true };
    },
  };
}
