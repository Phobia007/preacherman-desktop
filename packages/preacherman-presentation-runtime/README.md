# @preacherman/presentation-runtime

Dependency-free scheduling for Preacherman's synthesized speech presentation. It owns generation identity, concurrent synthesis, ordered playback, interruption, stale-result isolation, and lifecycle events. It does not own AI generation, TaskRun execution, provider credentials, UI, or avatar rendering.

## Usage

```ts
import { createPresentationRuntime } from "@preacherman/presentation-runtime";

const runtime = createPresentationRuntime({
  synthesize: (segment, signal) => ttsProvider.synthesize(segment.text, signal),
  play: (item, signal) => audioPlayer.play(item.audio, signal),
});

runtime.subscribe((event) => {
  if (event.type === "playback-started") avatar.startSpeaking();
  if (event.type === "playback-ended") avatar.stopSpeaking();
});

const generation = runtime.openGeneration({
  generationId: "generation-42",
  audioStreamId: "audio-42",
  interactionEpoch: 7,
  taskId: "task-9", // correlation only; interruption never cancels this task
});

generation.enqueue({ text: "The first sentence.", locale: "en-US" });
generation.enqueue({ text: "The second sentence.", locale: "en-US" });
await generation.complete();
```

Each `enqueue` starts synthesis immediately. Results may arrive in any order, but `play` is called serially in segment sequence order. `runtime.interruptPresentation()` aborts current synthesis and playback. A later completion from the interrupted generation emits `segment-discarded` and is never played.

## Integration boundary

- Map the live contract's `generation_id`, `audio_stream_id`, and `interaction_epoch` to the camel-case identity fields.
- Drive captions and avatar state from `playback-started`, `playback-ended`, and `playback-interrupted`, not synthesis completion.
- Keep TaskRun cancellation outside this package. `taskId` is metadata for correlation only.
- Call `dispose()` when the owning coordinator is released.

See [PROVENANCE.md](./PROVENANCE.md) for the Preacherman behavioral reference used to shape this package.
