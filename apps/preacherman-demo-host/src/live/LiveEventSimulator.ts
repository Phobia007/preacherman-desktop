import type {
  AnyLiveEvent,
  ConversationContextProjection,
  ConversationContextTurnProjection,
  GeneratedResponseRecord,
  HeardBoundary,
  InteractionGenerationState,
  InteractionMode,
  InterruptionEffect,
  InterruptionTransactionResult,
  LiveConnectionState,
  LiveControlCommand,
  LiveEvent,
  LiveEventDisposition,
  LiveEventPayloadMap,
  LiveEventType,
  PlaybackLedger,
  PlaybackLedgerEntry,
  PlaybackState,
  TaskRunState,
  TurnRoutingSnapshot,
} from "./contracts";

type EventScope<T extends LiveEventType> = Omit<
  LiveEvent<T>,
  | "event_id"
  | "event_type"
  | "schema_version"
  | "session_id"
  | "sequence"
  | "interaction_epoch"
  | "occurred_at"
  | "monotonic_time_ms"
  | "causation_event_id"
  | "correlation_id"
  | "payload"
>;

interface MutableGeneration {
  generationId: string;
  turnId: string;
  responseId: string;
  audioStreamId: string | null;
  performanceId: string | null;
  epoch: number;
  state: InteractionGenerationState;
  generatedResponse: GeneratedResponseRecord | null;
}

interface MutableTaskRun {
  taskRunId: string;
  turnId: string;
  state: TaskRunState;
  objective: string;
  progress: number;
}

interface MutableContextTurn {
  turnId: string;
  userText: string;
  assistantResponseId: string | null;
  assistantHeardText: string;
  committedSegmentIds: string[];
  interrupted: boolean;
}

export interface LiveEventSimulatorOptions {
  readonly sessionId?: string;
  readonly connectionId?: string;
  readonly now?: () => string;
  readonly monotonicNow?: () => number;
  readonly createId?: (kind: string) => string;
}

export interface LiveEventSimulatorSnapshot {
  readonly session_id: string;
  readonly session_status: "active" | "ended";
  readonly connection_id: string;
  readonly connection_state: LiveConnectionState;
  readonly interaction_epoch: number;
  readonly interaction_mode: InteractionMode;
  readonly playback_state: PlaybackState;
  readonly current_turn_id: string | null;
  readonly active_generation_id: string | null;
  readonly turn_routing_snapshots: readonly TurnRoutingSnapshot[];
  readonly generations: ReadonlyArray<{
    readonly generation_id: string;
    readonly turn_id: string;
    readonly response_id: string;
    readonly state: InteractionGenerationState;
    readonly interaction_epoch: number;
  }>;
  readonly generated_response_records: readonly GeneratedResponseRecord[];
  readonly task_runs: ReadonlyArray<{
    readonly task_run_id: string;
    readonly turn_id: string;
    readonly state: TaskRunState;
    readonly progress: number;
  }>;
  readonly turn_history: readonly string[];
  readonly applied_event_ids: readonly string[];
  readonly quarantined_events: ReadonlyArray<{
    readonly event_id: string;
    readonly reason: "stale_epoch" | "stale_generation" | "sequence_conflict" | "invalid_scope";
  }>;
  readonly buffered_event_ids: readonly string[];
  readonly playback_ledger: PlaybackLedger;
  readonly conversation_context: ConversationContextProjection;
  readonly last_interruption: InterruptionTransactionResult | null;
}

const INTERRUPTION_EFFECTS: readonly InterruptionEffect[] = [
  "interaction_epoch.increment",
  "local_audio.stop",
  "heard_boundary.capture",
  "viseme.zero",
  "gesture.fast_recover",
  "speech_synthesis.cancel",
  "assistant_generation.cancel",
  "heard_boundary.update",
  "conversation_context.truncate",
  "late_generation_events.quarantine",
  "avatar.listening",
  "input_audio.continue",
];

function isGenerationScoped(event: AnyLiveEvent): boolean {
  return event.event_type.startsWith("assistant.")
    || event.event_type.startsWith("speech.")
    || event.event_type.startsWith("playback.")
    || event.event_type.startsWith("avatar.");
}

function generationIdOf(event: AnyLiveEvent): string | null {
  return event.generation_id ?? null;
}

function hasValidScope(event: AnyLiveEvent): boolean {
  if (event.schema_version !== "0.1" || event.sequence < 1 || event.interaction_epoch < 0) return false;
  if (event.event_type.startsWith("live.connection.")) return "connection_id" in event;
  if (event.event_type.startsWith("user.")) return "connection_id" in event && "turn_id" in event;
  if (event.event_type.startsWith("task.")) return "turn_id" in event && "task_run_id" in event;
  if (event.event_type.startsWith("assistant.")) {
    return "turn_id" in event && "generation_id" in event && "response_id" in event;
  }
  if (event.event_type.startsWith("speech.") || event.event_type.startsWith("playback.")) {
    return "turn_id" in event
      && "generation_id" in event
      && "response_id" in event
      && "audio_stream_id" in event;
  }
  return "turn_id" in event
    && "generation_id" in event
    && "response_id" in event
    && "audio_stream_id" in event
    && "performance_id" in event;
}

export class LiveEventSimulator {
  private readonly now: () => string;
  private readonly monotonicNow: () => number;
  private readonly createId: (kind: string) => string;
  private readonly sessionId: string;
  private sessionStatus: "active" | "ended" = "active";
  private connectionId: string;
  private connectionState: LiveConnectionState = "open";
  private interactionEpoch = 0;
  private interactionMode: InteractionMode = "idle";
  private playbackState: PlaybackState = "idle";
  private currentTurnId: string | null = null;
  private activeGenerationId: string | null = null;
  private readonly turnHistory: string[] = [];
  private readonly turnRouting = new Map<string, TurnRoutingSnapshot>();
  private readonly generations = new Map<string, MutableGeneration>();
  private readonly cancelledGenerations = new Set<string>();
  private readonly taskRuns = new Map<string, MutableTaskRun>();
  private readonly contextTurns = new Map<string, MutableContextTurn>();
  private readonly ledgerEntries: PlaybackLedgerEntry[] = [];
  private readonly heardBoundaries: HeardBoundary[] = [];
  private readonly seenEventIds = new Set<string>();
  private readonly appliedEventIds: string[] = [];
  private readonly quarantinedEvents: Array<{
    event_id: string;
    reason: "stale_epoch" | "stale_generation" | "sequence_conflict" | "invalid_scope";
  }> = [];
  private readonly lastAppliedSequence = new Map<string, number>();
  private readonly createdSequence = new Map<string, number>();
  private readonly bufferedEvents = new Map<string, Map<number, AnyLiveEvent>>();
  private lastInterruption: InterruptionTransactionResult | null = null;

  constructor(options: LiveEventSimulatorOptions = {}) {
    let id = 0;
    let monotonic = 0;
    this.now = options.now ?? (() => "2026-08-02T00:00:00.000Z");
    this.monotonicNow = options.monotonicNow ?? (() => {
      monotonic += 10;
      return monotonic;
    });
    this.createId = options.createId ?? ((kind) => `${kind}:sim-${++id}`);
    this.sessionId = options.sessionId ?? "session:sim";
    this.connectionId = options.connectionId ?? "connection:sim-1";
  }

  createEvent<T extends LiveEventType>(
    eventType: T,
    scope: EventScope<T>,
    payload: LiveEventPayloadMap[T],
    options: {
      readonly eventId?: string;
      readonly correlationId?: string;
      readonly causationEventId?: string;
      readonly sequence?: number;
      readonly interactionEpoch?: number;
    } = {},
  ): LiveEvent<T> {
    const correlationId = options.correlationId ?? this.defaultCorrelationId(eventType, scope);
    const sequence = options.sequence ?? ((this.createdSequence.get(correlationId) ?? 0) + 1);
    this.createdSequence.set(correlationId, Math.max(sequence, this.createdSequence.get(correlationId) ?? 0));
    return {
      ...scope,
      event_id: options.eventId ?? this.createId("live-event"),
      event_type: eventType,
      schema_version: "0.1",
      session_id: this.sessionId,
      sequence,
      interaction_epoch: options.interactionEpoch ?? this.interactionEpoch,
      occurred_at: this.now(),
      monotonic_time_ms: this.monotonicNow(),
      ...(options.causationEventId ? { causation_event_id: options.causationEventId } : {}),
      correlation_id: correlationId,
      payload,
    } as LiveEvent<T>;
  }

  accept(event: AnyLiveEvent): LiveEventDisposition {
    if (this.seenEventIds.has(event.event_id)) {
      return { status: "duplicate", event_id: event.event_id };
    }
    this.seenEventIds.add(event.event_id);

    if (event.session_id !== this.sessionId || !hasValidScope(event)) {
      return this.quarantine(event, "invalid_scope");
    }

    const lastSequence = this.lastAppliedSequence.get(event.correlation_id) ?? 0;
    if (event.sequence <= lastSequence) {
      return this.quarantine(event, "sequence_conflict");
    }
    if (event.sequence > lastSequence + 1) {
      const streamBuffer = this.bufferedEvents.get(event.correlation_id) ?? new Map<number, AnyLiveEvent>();
      if (streamBuffer.has(event.sequence)) return this.quarantine(event, "sequence_conflict");
      streamBuffer.set(event.sequence, event);
      this.bufferedEvents.set(event.correlation_id, streamBuffer);
      return {
        status: "buffered",
        event_id: event.event_id,
        waiting_for_sequence: lastSequence + 1,
      };
    }

    const disposition = this.applyOrderedEvent(event);
    this.drainBufferedEvents(event.correlation_id);
    return disposition;
  }

  dispatchCommand(command: LiveControlCommand): boolean {
    if (command.session_id !== this.sessionId || this.sessionStatus === "ended") return false;
    switch (command.command_type) {
      case "interrupt_speech":
        if (command.generation_id !== this.activeGenerationId) return false;
        this.interruptActiveGeneration();
        return true;
      case "cancel_interaction_generation": {
        const generation = this.generations.get(command.generation_id);
        if (!generation || generation.state === "cancelled" || generation.state === "completed") return false;
        generation.state = "cancelled";
        this.cancelledGenerations.add(generation.generationId);
        if (this.activeGenerationId === generation.generationId) this.activeGenerationId = null;
        this.playbackState = "cleared";
        this.interactionMode = "idle";
        return true;
      }
      case "cancel_current_turn":
        if (this.currentTurnId !== command.turn_id) return false;
        if (this.activeGenerationId) {
          const generation = this.generations.get(this.activeGenerationId);
          if (generation) generation.state = "cancelled";
          this.cancelledGenerations.add(this.activeGenerationId);
          this.activeGenerationId = null;
        }
        this.interactionMode = "idle";
        this.playbackState = "cleared";
        return true;
      case "cancel_task_run": {
        const task = this.taskRuns.get(command.task_run_id);
        if (!task || task.state === "cancelled" || task.state === "completed" || task.state === "failed") {
          return false;
        }
        task.state = "cancelled";
        return true;
      }
      case "end_session":
        this.sessionStatus = "ended";
        this.connectionState = "closed";
        this.interactionMode = "idle";
        this.playbackState = "cleared";
        if (this.activeGenerationId) this.cancelledGenerations.add(this.activeGenerationId);
        this.generations.forEach((generation) => {
          if (!(["completed", "failed", "cancelled"] as InteractionGenerationState[]).includes(generation.state)) {
            generation.state = "cancelled";
          }
        });
        this.taskRuns.forEach((task) => {
          if (!(["completed", "failed", "cancelled"] as TaskRunState[]).includes(task.state)) {
            task.state = "cancelled";
          }
        });
        this.activeGenerationId = null;
        return true;
    }
  }

  reconnect(newConnectionId: string): void {
    const previousConnectionId = this.connectionId;
    this.connectionState = "reconnecting";
    this.connectionId = newConnectionId;
    this.connectionState = "open";
    if (previousConnectionId === newConnectionId) {
      throw new Error("LIVE_CONNECTION_ID_REUSED: reconnect must create a new connection");
    }
  }

  getSnapshot(): LiveEventSimulatorSnapshot {
    return {
      session_id: this.sessionId,
      session_status: this.sessionStatus,
      connection_id: this.connectionId,
      connection_state: this.connectionState,
      interaction_epoch: this.interactionEpoch,
      interaction_mode: this.interactionMode,
      playback_state: this.playbackState,
      current_turn_id: this.currentTurnId,
      active_generation_id: this.activeGenerationId,
      turn_routing_snapshots: [...this.turnRouting.values()].map((snapshot) => ({ ...snapshot })),
      generations: [...this.generations.values()].map((generation) => ({
        generation_id: generation.generationId,
        turn_id: generation.turnId,
        response_id: generation.responseId,
        state: generation.state,
        interaction_epoch: generation.epoch,
      })),
      generated_response_records: [...this.generations.values()]
        .flatMap((generation) => generation.generatedResponse ? [generation.generatedResponse] : [])
        .map((response) => ({
          ...response,
          segments: response.segments.map((segment) => ({ ...segment })),
        })),
      task_runs: [...this.taskRuns.values()].map((task) => ({
        task_run_id: task.taskRunId,
        turn_id: task.turnId,
        state: task.state,
        progress: task.progress,
      })),
      turn_history: [...this.turnHistory],
      applied_event_ids: [...this.appliedEventIds],
      quarantined_events: this.quarantinedEvents.map((event) => ({ ...event })),
      buffered_event_ids: [...this.bufferedEvents.values()].flatMap((events) =>
        [...events.values()].map((event) => event.event_id)),
      playback_ledger: {
        session_id: this.sessionId,
        entries: this.ledgerEntries.map((entry) => ({ ...entry })),
        heard_boundaries: this.heardBoundaries.map((boundary) => ({ ...boundary })),
      },
      conversation_context: {
        session_id: this.sessionId,
        turns: [...this.contextTurns.values()].map((turn): ConversationContextTurnProjection => ({
          turn_id: turn.turnId,
          user_text: turn.userText,
          assistant_response_id: turn.assistantResponseId,
          assistant_heard_text: turn.assistantHeardText,
          committed_segment_ids: [...turn.committedSegmentIds],
          interrupted: turn.interrupted,
        })),
      },
      last_interruption: this.lastInterruption
        ? {
            ...this.lastInterruption,
            heard_boundary: { ...this.lastInterruption.heard_boundary },
            effects: [...this.lastInterruption.effects],
          }
        : null,
    };
  }

  private applyOrderedEvent(event: AnyLiveEvent): LiveEventDisposition {
    this.lastAppliedSequence.set(event.correlation_id, event.sequence);
    const quarantineReason = this.generationQuarantineReason(event);
    if (quarantineReason) return this.quarantine(event, quarantineReason);
    this.applyEvent(event);
    this.appliedEventIds.push(event.event_id);
    return { status: "applied", event_id: event.event_id };
  }

  private generationQuarantineReason(
    event: AnyLiveEvent,
  ): "stale_epoch" | "stale_generation" | null {
    if (!isGenerationScoped(event)) return null;
    if (event.interaction_epoch !== this.interactionEpoch) return "stale_epoch";
    const generationId = generationIdOf(event);
    if (!generationId) return "stale_generation";
    if (this.cancelledGenerations.has(generationId)) return "stale_generation";
    if (
      this.activeGenerationId
      && this.activeGenerationId !== generationId
      && event.event_type !== "assistant.generation.requested"
    ) {
      return "stale_generation";
    }
    return null;
  }

  private applyEvent(event: AnyLiveEvent): void {
    if (event.turn_id) this.ensureTurn(event.turn_id);

    switch (event.event_type) {
      case "user.speech.detected":
        this.interactionMode = "listening";
        if (event.payload.barged_in && this.activeGenerationId) this.interruptActiveGeneration();
        return;
      case "user.speech.started":
        this.interactionMode = "listening";
        return;
      case "user.transcript.final": {
        const turn = this.contextTurns.get(event.turn_id);
        if (turn) turn.userText = event.payload.text;
        return;
      }
      case "assistant.generation.requested":
        if (!this.turnRouting.has(event.turn_id)) {
          this.turnRouting.set(event.turn_id, Object.freeze({ ...event.payload.routing_snapshot }));
        }
        this.generations.set(event.generation_id, {
          generationId: event.generation_id,
          turnId: event.turn_id,
          responseId: event.response_id,
          audioStreamId: null,
          performanceId: null,
          epoch: event.interaction_epoch,
          state: "requested",
          generatedResponse: null,
        });
        this.activeGenerationId = event.generation_id;
        this.interactionMode = "thinking";
        return;
      case "assistant.generation.started":
        this.updateGeneration(event.generation_id, { state: "generating" });
        this.interactionMode = "thinking";
        return;
      case "assistant.generation.completed":
        this.updateGeneration(event.generation_id, {
          generatedResponse: event.payload.response,
        });
        return;
      case "assistant.generation.interrupted":
        this.updateGeneration(event.generation_id, { state: "interrupted" });
        return;
      case "assistant.generation.cancelled":
        this.updateGeneration(event.generation_id, { state: "cancelled" });
        this.cancelledGenerations.add(event.generation_id);
        return;
      case "assistant.generation.failed":
        this.updateGeneration(event.generation_id, { state: "failed" });
        this.interactionMode = "error";
        return;
      case "speech.synthesis.started":
        this.updateGeneration(event.generation_id, {
          state: "synthesizing",
          audioStreamId: event.audio_stream_id,
        });
        return;
      case "playback.queued":
        this.playbackState = "queued";
        return;
      case "playback.started":
        this.updateGeneration(event.generation_id, {
          state: "playing",
          audioStreamId: event.audio_stream_id,
        });
        this.playbackState = "playing";
        this.interactionMode = "speaking";
        return;
      case "playback.progress":
        this.applyPlaybackProgress(event);
        return;
      case "playback.completed":
        this.heardBoundaries.push(event.payload.heard_boundary);
        this.updateGeneration(event.generation_id, { state: "completed" });
        this.playbackState = "completed";
        this.interactionMode = "idle";
        this.activeGenerationId = null;
        return;
      case "playback.interrupted":
        this.heardBoundaries.push(event.payload.heard_boundary);
        this.updateGeneration(event.generation_id, { state: "interrupted" });
        this.playbackState = "interrupted";
        this.interactionMode = "listening";
        return;
      case "playback.cleared":
        this.playbackState = "cleared";
        return;
      case "avatar.performance.started":
        this.updateGeneration(event.generation_id, { performanceId: event.performance_id });
        return;
      case "task.started":
        this.taskRuns.set(event.task_run_id, {
          taskRunId: event.task_run_id,
          turnId: event.turn_id,
          state: "running",
          objective: event.payload.objective,
          progress: 0,
        });
        return;
      case "task.progress": {
        const task = this.taskRuns.get(event.task_run_id);
        if (task && task.state === "running") task.progress = Math.max(task.progress, event.payload.progress);
        return;
      }
      case "task.awaiting_input":
        this.updateTask(event.task_run_id, "awaiting_input");
        return;
      case "task.needs_approval":
        this.updateTask(event.task_run_id, "needs_approval");
        return;
      case "task.completed":
        this.updateTask(event.task_run_id, "completed", 1);
        return;
      case "task.failed":
        this.updateTask(event.task_run_id, "failed");
        return;
      case "task.cancelled":
        this.updateTask(event.task_run_id, "cancelled");
        return;
      case "live.connection.opening":
        this.connectionState = "opening";
        return;
      case "live.connection.opened":
      case "live.connection.restored":
        this.connectionId = event.connection_id;
        this.connectionState = "open";
        return;
      case "live.connection.degraded":
        this.connectionState = "degraded";
        return;
      case "live.connection.reconnecting":
        this.connectionState = "reconnecting";
        return;
      case "live.connection.closed":
        this.connectionState = "closed";
        return;
      case "live.connection.failed":
        this.connectionState = "failed";
        return;
      default:
        return;
    }
  }

  private applyPlaybackProgress(event: LiveEvent<"playback.progress">): void {
    const entry: PlaybackLedgerEntry = {
      event_id: event.event_id,
      audio_stream_id: event.audio_stream_id,
      clock_epoch: event.payload.clock.clock_epoch,
      played_from_ms: event.payload.played_from_ms,
      played_until_ms: event.payload.clock.current_time_ms,
      heard_text_delta: event.payload.heard_text_delta,
      committed_segment_ids: [...event.payload.committed_segment_ids],
      partial_segment_id: event.payload.partial_segment_id,
    };
    this.ledgerEntries.push(entry);
    const turn = this.contextTurns.get(event.turn_id);
    if (!turn) return;
    turn.assistantResponseId = event.response_id;
    turn.assistantHeardText += event.payload.heard_text_delta;
    for (const segmentId of event.payload.committed_segment_ids) {
      if (!turn.committedSegmentIds.includes(segmentId)) turn.committedSegmentIds.push(segmentId);
    }
  }

  private interruptActiveGeneration(): void {
    if (!this.activeGenerationId) return;
    const generation = this.generations.get(this.activeGenerationId);
    if (!generation) return;
    const previousEpoch = this.interactionEpoch;
    const latestEntry = [...this.ledgerEntries]
      .reverse()
      .find((entry) => !generation.audioStreamId || entry.audio_stream_id === generation.audioStreamId);
    const turn = this.contextTurns.get(generation.turnId);
    const heardBoundary: HeardBoundary = {
      response_id: generation.responseId,
      audio_stream_id: generation.audioStreamId ?? "audio:none",
      played_until_ms: latestEntry?.played_until_ms ?? 0,
      committed_segment_ids: [...(turn?.committedSegmentIds ?? [])],
      partial_segment_id: latestEntry?.partial_segment_id ?? null,
      interrupted: true,
    };

    this.interactionEpoch += 1;
    generation.state = "interrupted";
    if (generation.generatedResponse) {
      generation.generatedResponse = {
        ...generation.generatedResponse,
        status: "interrupted",
      };
    }
    this.cancelledGenerations.add(generation.generationId);
    this.heardBoundaries.push(heardBoundary);
    if (turn) turn.interrupted = true;
    this.playbackState = "interrupted";
    this.interactionMode = "listening";
    this.activeGenerationId = null;
    this.lastInterruption = {
      previous_epoch: previousEpoch,
      current_epoch: this.interactionEpoch,
      heard_boundary: heardBoundary,
      effects: INTERRUPTION_EFFECTS,
    };
  }

  private ensureTurn(turnId: string): void {
    if (!this.turnHistory.includes(turnId)) this.turnHistory.push(turnId);
    this.currentTurnId = turnId;
    if (!this.contextTurns.has(turnId)) {
      this.contextTurns.set(turnId, {
        turnId,
        userText: "",
        assistantResponseId: null,
        assistantHeardText: "",
        committedSegmentIds: [],
        interrupted: false,
      });
    }
  }

  private updateGeneration(
    generationId: string,
    update: Partial<Pick<MutableGeneration, "state" | "audioStreamId" | "performanceId" | "generatedResponse">>,
  ): void {
    const generation = this.generations.get(generationId);
    if (generation) Object.assign(generation, update);
  }

  private updateTask(taskRunId: string, state: TaskRunState, progress?: number): void {
    const task = this.taskRuns.get(taskRunId);
    if (!task) return;
    task.state = state;
    if (progress !== undefined) task.progress = progress;
  }

  private defaultCorrelationId<T extends LiveEventType>(eventType: T, scope: EventScope<T>): string {
    if ("task_run_id" in scope) return `task:${String(scope.task_run_id)}`;
    if ("generation_id" in scope) return `generation:${String(scope.generation_id)}`;
    if (eventType.startsWith("user.") && "turn_id" in scope) return `input:${String(scope.turn_id)}`;
    if ("connection_id" in scope) return `connection:${String(scope.connection_id)}`;
    return `session:${this.sessionId}`;
  }

  private drainBufferedEvents(correlationId: string): void {
    const streamBuffer = this.bufferedEvents.get(correlationId);
    if (!streamBuffer) return;
    let nextSequence = (this.lastAppliedSequence.get(correlationId) ?? 0) + 1;
    while (streamBuffer.has(nextSequence)) {
      const event = streamBuffer.get(nextSequence);
      streamBuffer.delete(nextSequence);
      if (event) this.applyOrderedEvent(event);
      nextSequence = (this.lastAppliedSequence.get(correlationId) ?? 0) + 1;
    }
    if (streamBuffer.size === 0) this.bufferedEvents.delete(correlationId);
  }

  private quarantine(
    event: AnyLiveEvent,
    reason: "stale_epoch" | "stale_generation" | "sequence_conflict" | "invalid_scope",
  ): LiveEventDisposition {
    this.quarantinedEvents.push({ event_id: event.event_id, reason });
    return { status: "quarantined", event_id: event.event_id, reason };
  }
}
