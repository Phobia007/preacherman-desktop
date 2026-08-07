/** Correlation keys shared by synthesis, playback, and lifecycle events. */
export interface PresentationIdentity {
  /** Identifies one assistant output generation. */
  readonly generationId: string;
  /** Identifies the audio stream produced for the generation. */
  readonly audioStreamId: string;
  /** Monotonically increasing interaction epoch used to reject stale work. */
  readonly interactionEpoch: number;
  /** Optional TaskRun correlation only. The runtime never controls task lifecycle. */
  readonly taskId?: string;
}

/** Input accepted when a new presentation generation becomes active. */
export interface OpenGenerationOptions {
  readonly generationId?: string;
  readonly audioStreamId?: string;
  /** Must be greater than every epoch previously opened by this runtime. */
  readonly interactionEpoch?: number;
  /** Optional TaskRun correlation only. The runtime never aborts the task. */
  readonly taskId?: string;
}

/** A text segment queued for synthesis within one generation. */
export interface PresentationSegment extends PresentationIdentity {
  readonly segmentId: string;
  /** Zero-based order within the generation. */
  readonly sequence: number;
  readonly text: string;
  readonly locale?: string;
}

/** Input used to append one independently synthesized segment. */
export interface EnqueueSegmentInput {
  readonly segmentId?: string;
  readonly text: string;
  readonly locale?: string;
}

/** A synthesized item ready for the injected playback boundary. */
export interface PresentationPlaybackItem<TAudio> {
  readonly identity: PresentationIdentity;
  readonly segment: PresentationSegment;
  readonly audio: TAudio;
}

/** Terminal state of a presentation generation. */
export type PresentationOutcome =
  | {
      readonly status: "completed";
      readonly identity: PresentationIdentity;
    }
  | {
      readonly status: "interrupted";
      readonly identity: PresentationIdentity;
      readonly reason: string;
    };

/** Observable runtime events used by UI, captions, and avatar adapters. */
export type PresentationEvent<TAudio> =
  | { readonly type: "generation-started"; readonly identity: PresentationIdentity }
  | { readonly type: "synthesis-started"; readonly segment: PresentationSegment }
  | { readonly type: "synthesis-completed"; readonly item: PresentationPlaybackItem<TAudio> }
  | { readonly type: "playback-started"; readonly item: PresentationPlaybackItem<TAudio> }
  | { readonly type: "playback-ended"; readonly item: PresentationPlaybackItem<TAudio> }
  | {
      readonly type: "playback-interrupted";
      readonly item: PresentationPlaybackItem<TAudio>;
      readonly reason: string;
    }
  | {
      readonly type: "segment-discarded";
      readonly segment: PresentationSegment;
      readonly reason: "interrupted" | "stale";
    }
  | {
      readonly type: "phase-failed";
      readonly phase: "synthesis" | "playback";
      readonly segment: PresentationSegment;
      readonly error: unknown;
    }
  | { readonly type: "presentation-ended"; readonly identity: PresentationIdentity }
  | {
      readonly type: "presentation-interrupted";
      readonly identity: PresentationIdentity;
      readonly reason: string;
    };

/** External media boundaries owned by the application/provider adapter. */
export interface PresentationRuntimeOptions<TAudio> {
  /** May run concurrently for multiple segments. Abort is scoped to presentation only. */
  readonly synthesize: (
    segment: PresentationSegment,
    signal: AbortSignal,
  ) => Promise<TAudio | null>;
  /** Called serially in segment sequence order. */
  readonly play: (
    item: PresentationPlaybackItem<TAudio>,
    signal: AbortSignal,
  ) => Promise<void>;
}

/** Handle for appending and completing one active generation. */
export interface PresentationGenerationHandle {
  readonly identity: PresentationIdentity;
  readonly done: Promise<PresentationOutcome>;
  /** Starts synthesis immediately. Playback remains ordered by the returned sequence. */
  enqueue(input: EnqueueSegmentInput): PresentationSegment;
  /** Closes input and resolves after every accepted segment has finished presenting. */
  complete(): Promise<PresentationOutcome>;
  /** Interrupts only this presentation generation, never its correlated TaskRun. */
  interrupt(reason?: string): void;
}

/** Stateful presentation boundary exposed to the Demo Host integration layer. */
export interface PresentationRuntime<TAudio> {
  /** Replaces any active generation and advances the stale-work isolation epoch. */
  openGeneration(options?: OpenGenerationOptions): PresentationGenerationHandle;
  /** Stops synthesis and playback for the active generation only. */
  interruptPresentation(reason?: string): void;
  /** Subscribes to synchronous lifecycle notifications. Listeners must not throw. */
  subscribe(listener: (event: PresentationEvent<TAudio>) => void): () => void;
  /** Interrupts owned media work and releases event listeners. */
  dispose(reason?: string): void;
}

interface ReadySegment<TAudio> {
  readonly status: "ready";
  readonly item: PresentationPlaybackItem<TAudio>;
}

interface SkippedSegment {
  readonly status: "skipped";
}

type SettledSegment<TAudio> = ReadySegment<TAudio> | SkippedSegment;

interface GenerationState<TAudio> {
  readonly identity: PresentationIdentity;
  readonly synthesisController: AbortController;
  readonly settledSegments: Map<number, SettledSegment<TAudio>>;
  readonly done: Promise<PresentationOutcome>;
  resolveDone: (outcome: PresentationOutcome) => void;
  nextSequence: number;
  nextSequenceToPlay: number;
  acceptingSegments: boolean;
  interrupted: boolean;
  settled: boolean;
  pumping: boolean;
  playback: {
    readonly item: PresentationPlaybackItem<TAudio>;
    readonly controller: AbortController;
  } | null;
}

function validEpoch(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Creates a dependency-free presentation scheduler.
 *
 * Synthesis starts concurrently as segments arrive. Completed results are buffered by sequence,
 * then passed one at a time to `play`. Opening or interrupting a generation aborts presentation
 * work and makes later results stale. Task execution is deliberately outside this API boundary.
 */
export function createPresentationRuntime<TAudio>(
  options: PresentationRuntimeOptions<TAudio>,
): PresentationRuntime<TAudio> {
  const listeners = new Set<(event: PresentationEvent<TAudio>) => void>();
  let activeGeneration: GenerationState<TAudio> | null = null;
  let latestEpoch = -1;
  let disposed = false;

  function emit(event: PresentationEvent<TAudio>): void {
    for (const listener of [...listeners]) listener(event);
  }

  function isCurrent(state: GenerationState<TAudio>): boolean {
    return activeGeneration === state
      && state.identity.interactionEpoch === latestEpoch
      && !state.interrupted;
  }

  function settleCompleted(state: GenerationState<TAudio>): void {
    if (state.settled) return;
    state.settled = true;
    if (activeGeneration === state) activeGeneration = null;

    const outcome: PresentationOutcome = {
      status: "completed",
      identity: state.identity,
    };
    emit({ type: "presentation-ended", identity: state.identity });
    state.resolveDone(outcome);
  }

  async function pumpPlayback(state: GenerationState<TAudio>): Promise<void> {
    if (state.pumping) return;
    state.pumping = true;

    try {
      while (isCurrent(state)) {
        const settled = state.settledSegments.get(state.nextSequenceToPlay);
        if (!settled) break;

        state.settledSegments.delete(state.nextSequenceToPlay);
        state.nextSequenceToPlay += 1;
        if (settled.status === "skipped") continue;

        const controller = new AbortController();
        state.playback = { item: settled.item, controller };
        emit({ type: "playback-started", item: settled.item });

        try {
          await options.play(settled.item, controller.signal);
          if (isCurrent(state) && !controller.signal.aborted) {
            emit({ type: "playback-ended", item: settled.item });
          }
        } catch (error) {
          if (isCurrent(state) && !controller.signal.aborted) {
            emit({
              type: "phase-failed",
              phase: "playback",
              segment: settled.item.segment,
              error,
            });
          }
        } finally {
          if (state.playback?.item === settled.item) state.playback = null;
        }
      }

      if (
        isCurrent(state)
        && !state.acceptingSegments
        && state.nextSequenceToPlay === state.nextSequence
      ) {
        settleCompleted(state);
      }
    } finally {
      state.pumping = false;
    }
  }

  async function synthesizeSegment(
    state: GenerationState<TAudio>,
    segment: PresentationSegment,
  ): Promise<void> {
    emit({ type: "synthesis-started", segment });

    try {
      const audio = await options.synthesize(segment, state.synthesisController.signal);
      if (!isCurrent(state)) {
        emit({
          type: "segment-discarded",
          segment,
          reason: state.interrupted ? "interrupted" : "stale",
        });
        return;
      }

      if (audio === null) {
        state.settledSegments.set(segment.sequence, { status: "skipped" });
      } else {
        const item: PresentationPlaybackItem<TAudio> = {
          identity: state.identity,
          segment,
          audio,
        };
        state.settledSegments.set(segment.sequence, { status: "ready", item });
        emit({ type: "synthesis-completed", item });
      }
    } catch (error) {
      if (!isCurrent(state)) {
        emit({
          type: "segment-discarded",
          segment,
          reason: state.interrupted ? "interrupted" : "stale",
        });
        return;
      }

      state.settledSegments.set(segment.sequence, { status: "skipped" });
      emit({ type: "phase-failed", phase: "synthesis", segment, error });
    }

    await pumpPlayback(state);
  }

  function interruptGeneration(state: GenerationState<TAudio>, reason: string): void {
    if (state.interrupted || state.settled) return;
    state.interrupted = true;
    state.acceptingSegments = false;
    state.synthesisController.abort(reason);

    if (state.playback) {
      const { item, controller } = state.playback;
      controller.abort(reason);
      emit({ type: "playback-interrupted", item, reason });
    }

    if (activeGeneration === state) activeGeneration = null;
    const outcome: PresentationOutcome = {
      status: "interrupted",
      identity: state.identity,
      reason,
    };
    state.settled = true;
    emit({ type: "presentation-interrupted", identity: state.identity, reason });
    state.resolveDone(outcome);
  }

  function openGeneration(
    input: OpenGenerationOptions = {},
  ): PresentationGenerationHandle {
    if (disposed) throw new Error("Presentation runtime is disposed.");

    const interactionEpoch = input.interactionEpoch ?? latestEpoch + 1;
    if (!validEpoch(interactionEpoch)) {
      throw new RangeError("interactionEpoch must be a non-negative integer.");
    }
    if (interactionEpoch <= latestEpoch) {
      throw new RangeError("interactionEpoch must advance beyond the latest opened epoch.");
    }

    if (activeGeneration) interruptGeneration(activeGeneration, "superseded");
    latestEpoch = interactionEpoch;
    const identity: PresentationIdentity = {
      generationId: input.generationId ?? `generation-${interactionEpoch}`,
      audioStreamId: input.audioStreamId ?? `audio-${interactionEpoch}`,
      interactionEpoch,
      ...(input.taskId ? { taskId: input.taskId } : {}),
    };

    let resolveDone: (outcome: PresentationOutcome) => void = () => undefined;
    const done = new Promise<PresentationOutcome>((resolve) => {
      resolveDone = resolve;
    });
    const state: GenerationState<TAudio> = {
      identity,
      synthesisController: new AbortController(),
      settledSegments: new Map(),
      done,
      resolveDone,
      nextSequence: 0,
      nextSequenceToPlay: 0,
      acceptingSegments: true,
      interrupted: false,
      settled: false,
      pumping: false,
      playback: null,
    };

    activeGeneration = state;
    emit({ type: "generation-started", identity });

    return {
      identity,
      done,
      enqueue(inputSegment) {
        if (!state.acceptingSegments || state.interrupted || state.settled) {
          throw new Error("Presentation generation no longer accepts segments.");
        }

        const sequence = state.nextSequence;
        state.nextSequence += 1;
        const segment: PresentationSegment = {
          ...state.identity,
          segmentId: inputSegment.segmentId ?? `${identity.audioStreamId}:${sequence}`,
          sequence,
          text: inputSegment.text,
          ...(inputSegment.locale ? { locale: inputSegment.locale } : {}),
        };
        void synthesizeSegment(state, segment);
        return segment;
      },
      complete() {
        state.acceptingSegments = false;
        void pumpPlayback(state);
        return done;
      },
      interrupt(reason = "interrupted") {
        interruptGeneration(state, reason);
      },
    };
  }

  return {
    openGeneration,
    interruptPresentation(reason = "interrupted") {
      if (activeGeneration) interruptGeneration(activeGeneration, reason);
    },
    subscribe(listener) {
      if (disposed) throw new Error("Presentation runtime is disposed.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(reason = "disposed") {
      if (disposed) return;
      if (activeGeneration) interruptGeneration(activeGeneration, reason);
      disposed = true;
      listeners.clear();
    },
  };
}
