import assert from "node:assert/strict";
import test from "node:test";

import { createPresentationRuntime } from "../dist/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("parallel synthesis still plays segments in enqueue order", async () => {
  const pending = [deferred(), deferred(), deferred()];
  const synthesisStarted = [];
  const played = [];
  let activePlaybacks = 0;
  let maxActivePlaybacks = 0;
  const runtime = createPresentationRuntime({
    synthesize(segment) {
      synthesisStarted.push(segment.sequence);
      return pending[segment.sequence].promise;
    },
    async play(item) {
      activePlaybacks += 1;
      maxActivePlaybacks = Math.max(maxActivePlaybacks, activePlaybacks);
      played.push(item.segment.sequence);
      await nextTurn();
      activePlaybacks -= 1;
    },
  });

  const generation = runtime.openGeneration({
    generationId: "generation-1",
    audioStreamId: "audio-1",
    interactionEpoch: 1,
  });
  generation.enqueue({ text: "first" });
  generation.enqueue({ text: "second" });
  generation.enqueue({ text: "third" });
  const done = generation.complete();

  assert.deepEqual(synthesisStarted, [0, 1, 2]);
  pending[1].resolve("audio-second");
  pending[2].resolve("audio-third");
  await nextTurn();
  assert.deepEqual(played, []);

  pending[0].resolve("audio-first");
  assert.deepEqual(await done, {
    status: "completed",
    identity: generation.identity,
  });
  assert.deepEqual(played, [0, 1, 2]);
  assert.equal(maxActivePlaybacks, 1);
});

test("interrupt prevents a late result from reviving stale playback", async () => {
  const oldAudio = deferred();
  const played = [];
  const events = [];
  const runtime = createPresentationRuntime({
    synthesize(segment) {
      if (segment.generationId === "old-generation") return oldAudio.promise;
      return Promise.resolve(`audio:${segment.text}`);
    },
    async play(item) {
      played.push(item.segment.generationId);
    },
  });
  runtime.subscribe((event) => events.push(event));

  const oldGeneration = runtime.openGeneration({
    generationId: "old-generation",
    audioStreamId: "old-audio",
    interactionEpoch: 7,
  });
  oldGeneration.enqueue({ text: "obsolete" });
  oldGeneration.complete();

  const newGeneration = runtime.openGeneration({
    generationId: "new-generation",
    audioStreamId: "new-audio",
    interactionEpoch: 8,
  });
  newGeneration.enqueue({ text: "current" });
  await newGeneration.complete();

  oldAudio.resolve("late-obsolete-audio");
  await nextTurn();

  assert.deepEqual(played, ["new-generation"]);
  assert.equal((await oldGeneration.done).status, "interrupted");
  assert.equal(
    events.some((event) => event.type === "segment-discarded"
      && event.segment.generationId === "old-generation"),
    true,
  );
  assert.throws(
    () => runtime.openGeneration({ interactionEpoch: 7 }),
    /advance beyond the latest opened epoch/,
  );
});

test("stopping presentation does not abort its correlated task", async () => {
  const taskController = new AbortController();
  const playbackStarted = deferred();
  const runtime = createPresentationRuntime({
    async synthesize() {
      return "audio";
    },
    play(_item, signal) {
      playbackStarted.resolve();
      return new Promise((resolve) => {
        signal.addEventListener("abort", resolve, { once: true });
      });
    },
  });

  const generation = runtime.openGeneration({
    generationId: "generation-task-summary",
    audioStreamId: "audio-task-summary",
    interactionEpoch: 3,
    taskId: "task-still-running",
  });
  generation.enqueue({ text: "Background work is still running." });
  generation.complete();
  await playbackStarted.promise;

  runtime.interruptPresentation("user-barge-in");
  const outcome = await generation.done;

  assert.equal(outcome.status, "interrupted");
  assert.equal(outcome.reason, "user-barge-in");
  assert.equal(generation.identity.taskId, "task-still-running");
  assert.equal(taskController.signal.aborted, false);
});
