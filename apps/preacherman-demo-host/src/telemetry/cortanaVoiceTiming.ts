import { localServiceUrl } from "../serviceConfig";

export type CortanaVoiceMilestone =
  | "wake"
  | "asr"
  | "first_audio"
  | "first_motion"
  | "fallback"
  | "complete";

export interface CortanaVoiceTimingEvent {
  readonly traceId: string;
  readonly elapsedMs: number;
  readonly conversationEpoch: number;
  readonly interactionEpoch?: number;
  readonly captureMode: "pushToTalk" | "handsFree";
  readonly trigger?: "wake_control" | "voice_control" | "hands_free_restart";
  readonly driver?: "speech2motion" | "audio2face";
  readonly fallbackReason?: "tts_timeout" | "tts_error" | "tts_empty";
  readonly completion?: "stream" | "speech_synthesis";
}

const eventNames: Record<CortanaVoiceMilestone, string> = {
  wake: "cortana_voice_wake",
  asr: "cortana_voice_asr",
  first_audio: "cortana_voice_first_audio",
  first_motion: "cortana_voice_first_motion",
  fallback: "cortana_voice_fallback",
  complete: "cortana_voice_complete",
};

export function captureCortanaVoiceTiming(
  milestone: CortanaVoiceMilestone,
  event: CortanaVoiceTimingEvent,
): void {
  if (import.meta.env.VITE_POSTHOG_TIMING_ENABLED !== "true") return;
  void fetch(localServiceUrl("/api/telemetry/cortana-voice"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event: eventNames[milestone],
      traceId: event.traceId,
      elapsedMs: Math.max(0, Math.round(event.elapsedMs)),
      conversationEpoch: event.conversationEpoch,
      interactionEpoch: event.interactionEpoch,
      captureMode: event.captureMode,
      trigger: event.trigger,
      driver: event.driver,
      fallbackReason: event.fallbackReason,
      completion: event.completion,
    }),
  }).catch(() => { /* Timing telemetry is optional and must never affect voice. */ });
}
