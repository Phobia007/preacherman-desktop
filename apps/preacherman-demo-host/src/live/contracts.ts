export const LIVE_INTERACTION_SCHEMA_VERSION = "0.1" as const;

export type LiveInteractionSchemaVersion = typeof LIVE_INTERACTION_SCHEMA_VERSION;
export type InteractionMode = "idle" | "listening" | "thinking" | "speaking" | "recovering" | "error";
export type LiveConnectionState = "closed" | "opening" | "open" | "degraded" | "reconnecting" | "failed";
export type InteractionGenerationState =
  | "requested"
  | "generating"
  | "synthesizing"
  | "playing"
  | "completed"
  | "interrupted"
  | "cancelled"
  | "failed";
export type TaskRunState =
  | "running"
  | "awaiting_input"
  | "needs_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type PlaybackState = "idle" | "queued" | "playing" | "interrupted" | "completed" | "cleared";

export interface TurnRoutingSnapshot {
  readonly snapshot_id: string;
  readonly captured_at: string;
  readonly front_agent_adapter_id: string;
  readonly speech_adapter_id: string;
  readonly voice_ref: string;
  readonly locale: string;
  readonly live_contract_version: LiveInteractionSchemaVersion;
  readonly avatar_policy_version: string;
}

export interface InteractionSession {
  readonly session_id: string;
  readonly created_at: string;
  readonly status: "active" | "ended";
  readonly interaction_epoch: number;
  readonly current_connection_id: string | null;
  readonly turn_ids: readonly string[];
  readonly active_task_run_ids: readonly string[];
}

export interface LiveConnection {
  readonly connection_id: string;
  readonly session_id: string;
  readonly state: LiveConnectionState;
  readonly opened_at?: string;
  readonly closed_at?: string;
  readonly reconnects_connection_id?: string;
}

export interface InteractionTurn {
  readonly turn_id: string;
  readonly session_id: string;
  readonly state: "open" | "completed" | "cancelled";
  readonly routing_snapshot: TurnRoutingSnapshot;
  readonly generation_ids: readonly string[];
  readonly task_run_ids: readonly string[];
}

export interface InteractionGeneration {
  readonly generation_id: string;
  readonly turn_id: string;
  readonly response_id: string;
  readonly interaction_epoch: number;
  readonly state: InteractionGenerationState;
  readonly audio_stream_id?: string;
  readonly performance_id?: string;
}

export interface TaskRun {
  readonly task_run_id: string;
  readonly turn_id: string;
  readonly state: TaskRunState;
  readonly objective: string;
  readonly progress: number;
}

export interface GeneratedSegment {
  readonly segment_id: string;
  readonly text: string;
}

export interface GeneratedResponseRecord {
  readonly response_id: string;
  readonly generation_id: string;
  readonly segments: readonly GeneratedSegment[];
  readonly full_text: string;
  readonly status: "completed" | "interrupted" | "cancelled" | "failed";
}

export interface SynthesizedSegment {
  readonly segment_id: string;
  readonly audio_start_ms: number;
  readonly audio_end_ms: number;
}

export interface SynthesizedSpeechRecord {
  readonly response_id: string;
  readonly audio_stream_id: string;
  readonly segments: readonly SynthesizedSegment[];
  readonly duration_ms: number;
  readonly status: "completed" | "cancelled" | "failed";
}

export interface HeardBoundary {
  readonly response_id: string;
  readonly audio_stream_id: string;
  readonly played_until_ms: number;
  readonly committed_segment_ids: readonly string[];
  readonly partial_segment_id: string | null;
  readonly interrupted: boolean;
}

export interface PlaybackLedgerEntry {
  readonly event_id: string;
  readonly audio_stream_id: string;
  readonly clock_epoch: number;
  readonly played_from_ms: number;
  readonly played_until_ms: number;
  readonly heard_text_delta: string;
  readonly committed_segment_ids: readonly string[];
  readonly partial_segment_id: string | null;
}

export interface PlaybackLedger {
  readonly session_id: string;
  readonly entries: readonly PlaybackLedgerEntry[];
  readonly heard_boundaries: readonly HeardBoundary[];
}

export interface ConversationContextTurnProjection {
  readonly turn_id: string;
  readonly user_text: string;
  readonly assistant_response_id: string | null;
  readonly assistant_heard_text: string;
  readonly committed_segment_ids: readonly string[];
  readonly interrupted: boolean;
}

export interface ConversationContextProjection {
  readonly session_id: string;
  readonly turns: readonly ConversationContextTurnProjection[];
}

export type BaselineEmotion =
  | "neutral"
  | "warm"
  | "confident"
  | "thoughtful"
  | "concerned"
  | "apologetic"
  | "celebratory";
export type GazePolicy = "user" | "thoughtful_drift" | "task_focus" | "environmental";
export type GestureDensity = "none" | "low" | "medium" | "high";
export type SpeakingStyle = "calm" | "conversational" | "concise" | "reassuring" | "energetic";

export interface AvatarResponsePerformancePlan {
  readonly plan_id: string;
  readonly response_id: string;
  readonly baseline_emotion: BaselineEmotion;
  readonly energy: number;
  readonly gaze_policy: GazePolicy;
  readonly gesture_density: GestureDensity;
  readonly speaking_style: SpeakingStyle;
}

export interface AvatarSegmentCue {
  readonly segment_id: string;
  readonly intent: string;
  readonly emphasis: number;
  readonly emotion_shift?: BaselineEmotion;
  readonly gaze_target?: "user" | "task" | "neutral" | "away";
  readonly gesture_intent?: string;
  readonly start_anchor: {
    readonly kind: "segment_start" | "audio_time";
    readonly offset_ms: number;
  };
}

export interface AvatarPerformanceDirectorInput {
  readonly session_id: string;
  readonly turn_id: string;
  readonly generation_id: string;
  readonly response_id: string;
  readonly performance_id: string;
  readonly interaction_epoch: number;
  readonly plan: AvatarResponsePerformancePlan;
  readonly cues: readonly AvatarSegmentCue[];
  readonly playback_clock: PlaybackClock;
}

export interface PlaybackClockSnapshot {
  readonly current_time_ms: number;
  readonly played_samples: number;
  readonly buffered_until_ms: number;
  readonly output_latency_ms: number;
  readonly playback_state: PlaybackState;
  readonly audio_stream_id: string | null;
  readonly clock_epoch: number;
}

export interface PlaybackClock {
  snapshot(): PlaybackClockSnapshot;
  subscribe(listener: (snapshot: PlaybackClockSnapshot) => void): () => void;
}

export type LiveControlCommand =
  | {
      readonly command_id: string;
      readonly command_type: "interrupt_speech";
      readonly session_id: string;
      readonly turn_id: string;
      readonly generation_id: string;
      readonly response_id: string;
      readonly audio_stream_id: string;
      readonly performance_id: string;
      readonly interaction_epoch: number;
      readonly reason: "user_speech" | "user_action";
    }
  | {
      readonly command_id: string;
      readonly command_type: "cancel_interaction_generation";
      readonly session_id: string;
      readonly turn_id: string;
      readonly generation_id: string;
      readonly interaction_epoch: number;
      readonly reason: string;
    }
  | {
      readonly command_id: string;
      readonly command_type: "cancel_current_turn";
      readonly session_id: string;
      readonly turn_id: string;
      readonly interaction_epoch: number;
      readonly reason: string;
    }
  | {
      readonly command_id: string;
      readonly command_type: "cancel_task_run";
      readonly session_id: string;
      readonly turn_id: string;
      readonly task_run_id: string;
      readonly reason: string;
    }
  | {
      readonly command_id: string;
      readonly command_type: "end_session";
      readonly session_id: string;
      readonly reason: string;
    };

interface LiveErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface LiveEventPayloadMap {
  readonly "user.speech.detected": {
    readonly confidence: number;
    readonly source: "vad" | "manual" | "provider";
    readonly barged_in: boolean;
  };
  readonly "user.speech.started": { readonly input_audio_stream_id: string };
  readonly "user.speech.delta": {
    readonly chunk_id: string;
    readonly byte_length: number;
    readonly duration_ms: number;
  };
  readonly "user.speech.stopped": { readonly reason: "vad" | "manual" | "connection_lost" };
  readonly "user.audio.committed": { readonly duration_ms: number };
  readonly "user.transcript.partial": { readonly text: string; readonly revision: number };
  readonly "user.transcript.final": { readonly text: string; readonly language?: string };

  readonly "assistant.generation.requested": { readonly routing_snapshot: TurnRoutingSnapshot };
  readonly "assistant.generation.started": { readonly opaque_provider_operation_ref?: string };
  readonly "assistant.text.delta": { readonly segment_id: string; readonly delta: string };
  readonly "assistant.segment.ready": {
    readonly segment: GeneratedSegment;
    readonly performance_cue?: AvatarSegmentCue;
  };
  readonly "assistant.generation.completed": { readonly response: GeneratedResponseRecord };
  readonly "assistant.generation.interrupted": { readonly heard_boundary: HeardBoundary };
  readonly "assistant.generation.cancelled": { readonly reason: string };
  readonly "assistant.generation.failed": LiveErrorPayload;

  readonly "speech.synthesis.started": {
    readonly voice_ref: string;
    readonly sample_rate_hz: number;
    readonly channels: number;
  };
  readonly "speech.audio.chunk": {
    readonly chunk_id: string;
    readonly offset_ms: number;
    readonly duration_ms: number;
    readonly encoded_byte_length: number;
  };
  readonly "speech.viseme.chunk": {
    readonly cues: ReadonlyArray<{
      readonly viseme: string;
      readonly offset_ms: number;
      readonly duration_ms: number;
      readonly weight: number;
    }>;
  };
  readonly "speech.synthesis.completed": { readonly record: SynthesizedSpeechRecord };
  readonly "speech.synthesis.cancelled": { readonly reason: string };
  readonly "speech.synthesis.failed": LiveErrorPayload;

  readonly "playback.queued": { readonly buffered_until_ms: number };
  readonly "playback.started": { readonly clock: PlaybackClockSnapshot };
  readonly "playback.progress": {
    readonly clock: PlaybackClockSnapshot;
    readonly played_from_ms: number;
    readonly heard_text_delta: string;
    readonly committed_segment_ids: readonly string[];
    readonly partial_segment_id: string | null;
  };
  readonly "playback.completed": { readonly heard_boundary: HeardBoundary };
  readonly "playback.interrupted": { readonly heard_boundary: HeardBoundary };
  readonly "playback.cleared": { readonly reason: string };

  readonly "avatar.performance.requested": {
    readonly plan: AvatarResponsePerformancePlan;
    readonly cues: readonly AvatarSegmentCue[];
  };
  readonly "avatar.performance.started": { readonly initial_state: string };
  readonly "avatar.performance.cue": { readonly cue: AvatarSegmentCue };
  readonly "avatar.performance.transitioned": {
    readonly from: string;
    readonly to: string;
    readonly transition_ms: number;
  };
  readonly "avatar.performance.settled": { readonly state: string };
  readonly "avatar.performance.interrupted": { readonly recovery_ms: number };
  readonly "avatar.performance.cancelled": { readonly reason: string };

  readonly "task.started": { readonly objective: string };
  readonly "task.progress": { readonly progress: number; readonly message: string };
  readonly "task.awaiting_input": { readonly question: string };
  readonly "task.needs_approval": {
    readonly approval_id: string;
    readonly action: string;
    readonly summary: string;
  };
  readonly "task.completed": { readonly summary: string };
  readonly "task.failed": LiveErrorPayload;
  readonly "task.cancelled": { readonly reason: string };

  readonly "live.connection.opening": {
    readonly transport: "peer_media" | "bidirectional_stream" | "mock";
  };
  readonly "live.connection.opened": { readonly resumed: boolean };
  readonly "live.connection.degraded": { readonly reason: string };
  readonly "live.connection.reconnecting": {
    readonly previous_connection_id: string;
    readonly attempt: number;
  };
  readonly "live.connection.restored": { readonly previous_connection_id: string };
  readonly "live.connection.closed": { readonly reason: string };
  readonly "live.connection.failed": LiveErrorPayload;
}

export type LiveEventType = keyof LiveEventPayloadMap;

export const LIVE_EVENT_TYPES = [
  "user.speech.detected",
  "user.speech.started",
  "user.speech.delta",
  "user.speech.stopped",
  "user.audio.committed",
  "user.transcript.partial",
  "user.transcript.final",
  "assistant.generation.requested",
  "assistant.generation.started",
  "assistant.text.delta",
  "assistant.segment.ready",
  "assistant.generation.completed",
  "assistant.generation.interrupted",
  "assistant.generation.cancelled",
  "assistant.generation.failed",
  "speech.synthesis.started",
  "speech.audio.chunk",
  "speech.viseme.chunk",
  "speech.synthesis.completed",
  "speech.synthesis.cancelled",
  "speech.synthesis.failed",
  "playback.queued",
  "playback.started",
  "playback.progress",
  "playback.completed",
  "playback.interrupted",
  "playback.cleared",
  "avatar.performance.requested",
  "avatar.performance.started",
  "avatar.performance.cue",
  "avatar.performance.transitioned",
  "avatar.performance.settled",
  "avatar.performance.interrupted",
  "avatar.performance.cancelled",
  "task.started",
  "task.progress",
  "task.awaiting_input",
  "task.needs_approval",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "live.connection.opening",
  "live.connection.opened",
  "live.connection.degraded",
  "live.connection.reconnecting",
  "live.connection.restored",
  "live.connection.closed",
  "live.connection.failed",
] as const satisfies readonly LiveEventType[];

export type UserInputEventType = Extract<LiveEventType, `user.${string}`>;
export type AssistantEventType = Extract<LiveEventType, `assistant.${string}`>;
export type SpeechEventType = Extract<LiveEventType, `speech.${string}`>;
export type PlaybackEventType = Extract<LiveEventType, `playback.${string}`>;
export type AvatarEventType = Extract<LiveEventType, `avatar.${string}`>;
export type TaskEventType = Extract<LiveEventType, `task.${string}`>;
export type ConnectionEventType = Extract<LiveEventType, `live.connection.${string}`>;
export type GenerationScopedEventType = AssistantEventType | SpeechEventType | PlaybackEventType | AvatarEventType;

interface LiveEventBase<T extends LiveEventType> {
  readonly event_id: string;
  readonly event_type: T;
  readonly schema_version: LiveInteractionSchemaVersion;
  readonly session_id: string;
  readonly connection_id?: string;
  readonly turn_id?: string;
  readonly generation_id?: string;
  readonly response_id?: string;
  readonly audio_stream_id?: string;
  readonly performance_id?: string;
  readonly task_run_id?: string;
  readonly sequence: number;
  readonly interaction_epoch: number;
  readonly occurred_at: string;
  readonly monotonic_time_ms: number;
  readonly causation_event_id?: string;
  readonly correlation_id: string;
  readonly payload: LiveEventPayloadMap[T];
}

type LiveEventScope<T extends LiveEventType> =
  T extends ConnectionEventType
    ? { readonly connection_id: string }
    : T extends UserInputEventType
      ? { readonly connection_id: string; readonly turn_id: string }
      : T extends AssistantEventType
        ? {
            readonly turn_id: string;
            readonly generation_id: string;
            readonly response_id: string;
          }
        : T extends SpeechEventType | PlaybackEventType
          ? {
              readonly turn_id: string;
              readonly generation_id: string;
              readonly response_id: string;
              readonly audio_stream_id: string;
            }
          : T extends AvatarEventType
            ? {
                readonly turn_id: string;
                readonly generation_id: string;
                readonly response_id: string;
                readonly audio_stream_id: string;
                readonly performance_id: string;
              }
            : T extends TaskEventType
              ? { readonly turn_id: string; readonly task_run_id: string }
              : never;

export type LiveEvent<T extends LiveEventType = LiveEventType> = T extends LiveEventType
  ? LiveEventBase<T> & LiveEventScope<T>
  : never;

export type AnyLiveEvent = {
  readonly [T in LiveEventType]: LiveEvent<T>;
}[LiveEventType];

export type LiveEventDisposition =
  | { readonly status: "applied"; readonly event_id: string }
  | { readonly status: "duplicate"; readonly event_id: string }
  | { readonly status: "buffered"; readonly event_id: string; readonly waiting_for_sequence: number }
  | {
      readonly status: "quarantined";
      readonly event_id: string;
      readonly reason: "stale_epoch" | "stale_generation" | "sequence_conflict" | "invalid_scope";
    };

export type InterruptionEffect =
  | "interaction_epoch.increment"
  | "local_audio.stop"
  | "heard_boundary.capture"
  | "viseme.zero"
  | "gesture.fast_recover"
  | "speech_synthesis.cancel"
  | "assistant_generation.cancel"
  | "heard_boundary.update"
  | "conversation_context.truncate"
  | "late_generation_events.quarantine"
  | "avatar.listening"
  | "input_audio.continue";

export interface InterruptionTransactionResult {
  readonly previous_epoch: number;
  readonly current_epoch: number;
  readonly heard_boundary: HeardBoundary;
  readonly effects: readonly InterruptionEffect[];
}
