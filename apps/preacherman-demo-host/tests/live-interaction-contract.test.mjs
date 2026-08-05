import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");

async function loadSimulator() {
  const source = await readFile(
    join(packageRoot, "src", "live", "LiveEventSimulator.ts"),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadContracts() {
  const source = await readFile(join(packageRoot, "src", "live", "contracts.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const ids = {
  turn: "turn:1",
  generation: "generation:1",
  response: "response:1",
  audio: "audio:1",
  performance: "performance:1",
  task: "task-run:1",
};

const routingSnapshot = {
  snapshot_id: "routing:1",
  captured_at: "2026-08-02T00:00:00.000Z",
  front_agent_adapter_id: "front:mock",
  speech_adapter_id: "speech:mock",
  voice_ref: "voice:mock",
  locale: "zh-CN",
  live_contract_version: "0.1",
  avatar_policy_version: "avatar-policy:1",
};

const playbackClock = (currentTimeMs = 0) => ({
  current_time_ms: currentTimeMs,
  played_samples: currentTimeMs * 24,
  buffered_until_ms: 800,
  output_latency_ms: 40,
  playback_state: "playing",
  audio_stream_id: ids.audio,
  clock_epoch: 1,
});

function generationScope() {
  return {
    turn_id: ids.turn,
    generation_id: ids.generation,
    response_id: ids.response,
  };
}

function speechScope() {
  return {
    ...generationScope(),
    audio_stream_id: ids.audio,
  };
}

function avatarScope() {
  return {
    ...speechScope(),
    performance_id: ids.performance,
  };
}

function apply(simulator, event) {
  const result = simulator.accept(event);
  assert.equal(result.status, "applied", `${event.event_type}: ${JSON.stringify(result)}`);
}

function startGeneration(simulator) {
  apply(
    simulator,
    simulator.createEvent(
      "assistant.generation.requested",
      generationScope(),
      { routing_snapshot: routingSnapshot },
    ),
  );
  apply(
    simulator,
    simulator.createEvent("assistant.generation.started", generationScope(), {}),
  );
}

function startSpeaking(simulator) {
  startGeneration(simulator);
  apply(
    simulator,
    simulator.createEvent("speech.synthesis.started", speechScope(), {
      voice_ref: "voice:mock",
      sample_rate_hz: 24000,
      channels: 1,
    }),
  );
  apply(
    simulator,
    simulator.createEvent("avatar.performance.started", avatarScope(), {
      initial_state: "speaking",
    }),
  );
  apply(
    simulator,
    simulator.createEvent("playback.started", speechScope(), {
      clock: playbackClock(),
    }),
  );
}

function userSpeechDetected(simulator, bargedIn = false) {
  return simulator.createEvent(
    "user.speech.detected",
    { connection_id: "connection:sim-1", turn_id: ids.turn },
    { confidence: 0.98, source: "vad", barged_in: bargedIn },
  );
}

function startTask(simulator) {
  apply(
    simulator,
    simulator.createEvent(
      "task.started",
      { turn_id: ids.turn, task_run_id: ids.task },
      { objective: "Prepare a document" },
    ),
  );
}

test("idle avatar enters listening when user speech begins", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();

  apply(simulator, userSpeechDetected(simulator));

  const snapshot = simulator.getSnapshot();
  assert.equal(snapshot.interaction_mode, "listening");
  assert.equal(snapshot.current_turn_id, ids.turn);
  assert.deepEqual(snapshot.turn_history, [ids.turn]);
});

test("v0.1 exposes the complete supplier-neutral event catalog", async () => {
  const { LIVE_EVENT_TYPES, LIVE_INTERACTION_SCHEMA_VERSION } = await loadContracts();
  assert.equal(LIVE_INTERACTION_SCHEMA_VERSION, "0.1");
  assert.equal(LIVE_EVENT_TYPES.length, 48);
  for (const required of [
    "user.speech.detected",
    "assistant.generation.interrupted",
    "speech.viseme.chunk",
    "playback.progress",
    "avatar.performance.cue",
    "task.needs_approval",
    "live.connection.restored",
  ]) {
    assert.ok(LIVE_EVENT_TYPES.includes(required));
  }
  assert.equal(LIVE_EVENT_TYPES.some((eventType) => /openai|realtime\./i.test(eventType)), false);
});

test("the first TurnRoutingSnapshot remains frozen for the life of the turn", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  startGeneration(simulator);
  const first = simulator.getSnapshot().turn_routing_snapshots[0];

  simulator.dispatchCommand({
    command_id: "command:cancel-generation",
    command_type: "cancel_interaction_generation",
    session_id: "session:sim",
    turn_id: ids.turn,
    generation_id: ids.generation,
    interaction_epoch: 0,
    reason: "retry",
  });
  const retryScope = {
    turn_id: ids.turn,
    generation_id: "generation:retry",
    response_id: "response:retry",
  };
  apply(
    simulator,
    simulator.createEvent(
      "assistant.generation.requested",
      retryScope,
      {
        routing_snapshot: {
          ...routingSnapshot,
          snapshot_id: "routing:mutated",
          speech_adapter_id: "speech:other",
        },
      },
    ),
  );

  assert.deepEqual(simulator.getSnapshot().turn_routing_snapshots, [first]);
});

test("user supplement while thinking interrupts only the active interaction generation", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  startGeneration(simulator);
  startTask(simulator);

  apply(simulator, userSpeechDetected(simulator, true));

  const snapshot = simulator.getSnapshot();
  assert.equal(snapshot.interaction_epoch, 1);
  assert.equal(snapshot.interaction_mode, "listening");
  assert.equal(snapshot.generations[0].state, "interrupted");
  assert.equal(snapshot.task_runs[0].state, "running");
});

test("barge-in while speaking follows the local interruption transaction order", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  startSpeaking(simulator);
  apply(
    simulator,
    simulator.createEvent("playback.progress", speechScope(), {
      clock: playbackClock(420),
      played_from_ms: 0,
      heard_text_delta: "我已经",
      committed_segment_ids: ["segment:1"],
      partial_segment_id: "segment:2",
    }),
  );

  apply(simulator, userSpeechDetected(simulator, true));

  const interruption = simulator.getSnapshot().last_interruption;
  assert.equal(interruption.heard_boundary.played_until_ms, 420);
  assert.deepEqual(interruption.effects, [
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
  ]);
});

test("old TTS, Avatar cue, and generation completion are isolated after a new epoch", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  startSpeaking(simulator);
  apply(simulator, userSpeechDetected(simulator, true));

  const oldAudio = simulator.createEvent(
    "speech.audio.chunk",
    speechScope(),
    { chunk_id: "chunk:late", offset_ms: 500, duration_ms: 100, encoded_byte_length: 9600 },
    { interactionEpoch: 0 },
  );
  const oldCue = simulator.createEvent(
    "avatar.performance.cue",
    avatarScope(),
    {
      cue: {
        segment_id: "segment:late",
        intent: "explain",
        emphasis: 0.5,
        gesture_intent: "explain",
        start_anchor: { kind: "audio_time", offset_ms: 500 },
      },
    },
    { interactionEpoch: 0 },
  );
  const oldCompleted = simulator.createEvent(
    "assistant.generation.completed",
    generationScope(),
    {
      response: {
        response_id: ids.response,
        generation_id: ids.generation,
        segments: [{ segment_id: "segment:late", text: "未播放内容" }],
        full_text: "未播放内容",
        status: "completed",
      },
    },
    { interactionEpoch: 0 },
  );

  assert.equal(simulator.accept(oldAudio).reason, "stale_epoch");
  assert.equal(simulator.accept(oldCue).reason, "stale_epoch");
  assert.equal(simulator.accept(oldCompleted).reason, "stale_epoch");
  assert.deepEqual(
    simulator.getSnapshot().quarantined_events.map((event) => event.reason),
    ["stale_epoch", "stale_epoch", "stale_epoch"],
  );
});

test("task progress survives voice interruption and explicit cancel_task_run stops it", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  startSpeaking(simulator);
  startTask(simulator);
  apply(simulator, userSpeechDetected(simulator, true));

  apply(
    simulator,
    simulator.createEvent(
      "task.progress",
      { turn_id: ids.turn, task_run_id: ids.task },
      { progress: 0.6, message: "Still running" },
      { interactionEpoch: 0 },
    ),
  );
  assert.deepEqual(simulator.getSnapshot().task_runs[0], {
    task_run_id: ids.task,
    turn_id: ids.turn,
    state: "running",
    progress: 0.6,
  });

  assert.equal(
    simulator.dispatchCommand({
      command_id: "command:cancel-task",
      command_type: "cancel_task_run",
      session_id: "session:sim",
      turn_id: ids.turn,
      task_run_id: ids.task,
      reason: "User explicitly cancelled the task",
    }),
    true,
  );
  assert.equal(simulator.getSnapshot().task_runs[0].state, "cancelled");
});

test("connection replacement preserves the session, turn history, and TaskRun", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  apply(simulator, userSpeechDetected(simulator));
  startTask(simulator);
  const before = simulator.getSnapshot();

  simulator.reconnect("connection:sim-2");

  const after = simulator.getSnapshot();
  assert.equal(after.session_id, before.session_id);
  assert.notEqual(after.connection_id, before.connection_id);
  assert.deepEqual(after.turn_history, before.turn_history);
  assert.deepEqual(after.task_runs, before.task_runs);
});

test("conversation projection contains only audio that actually played", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  startGeneration(simulator);
  apply(
    simulator,
    simulator.createEvent("assistant.generation.completed", generationScope(), {
      response: {
        response_id: ids.response,
        generation_id: ids.generation,
        segments: [
          { segment_id: "segment:1", text: "你好" },
          { segment_id: "segment:2", text: "世界" },
        ],
        full_text: "你好世界",
        status: "completed",
      },
    }),
  );
  apply(
    simulator,
    simulator.createEvent("speech.synthesis.started", speechScope(), {
      voice_ref: "voice:mock",
      sample_rate_hz: 24000,
      channels: 1,
    }),
  );
  apply(
    simulator,
    simulator.createEvent("playback.started", speechScope(), { clock: playbackClock() }),
  );
  apply(
    simulator,
    simulator.createEvent("playback.progress", speechScope(), {
      clock: playbackClock(300),
      played_from_ms: 0,
      heard_text_delta: "你好",
      committed_segment_ids: ["segment:1"],
      partial_segment_id: null,
    }),
  );
  apply(simulator, userSpeechDetected(simulator, true));

  const projected = simulator.getSnapshot().conversation_context.turns[0];
  const auditRecord = simulator.getSnapshot().generated_response_records[0];
  assert.equal(projected.assistant_heard_text, "你好");
  assert.doesNotMatch(projected.assistant_heard_text, /世界/);
  assert.deepEqual(projected.committed_segment_ids, ["segment:1"]);
  assert.equal(projected.interrupted, true);
  assert.equal(auditRecord.full_text, "你好世界");
  assert.equal(auditRecord.status, "interrupted");
});

test("duplicate event IDs are idempotent", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  const event = userSpeechDetected(simulator);

  assert.equal(simulator.accept(event).status, "applied");
  assert.equal(simulator.accept(event).status, "duplicate");
  assert.deepEqual(simulator.getSnapshot().applied_event_ids, [event.event_id]);
});

test("sequence gaps buffer, drain in order, and quarantine conflicting reuse", async () => {
  const { LiveEventSimulator } = await loadSimulator();
  const simulator = new LiveEventSimulator();
  const correlationId = `input:${ids.turn}`;
  const second = simulator.createEvent(
    "user.transcript.partial",
    { connection_id: "connection:sim-1", turn_id: ids.turn },
    { text: "你", revision: 1 },
    { correlationId, sequence: 2 },
  );
  const first = simulator.createEvent(
    "user.speech.started",
    { connection_id: "connection:sim-1", turn_id: ids.turn },
    { input_audio_stream_id: "input-audio:1" },
    { correlationId, sequence: 1 },
  );

  assert.deepEqual(simulator.accept(second), {
    status: "buffered",
    event_id: second.event_id,
    waiting_for_sequence: 1,
  });
  assert.equal(simulator.accept(first).status, "applied");
  assert.deepEqual(simulator.getSnapshot().applied_event_ids, [first.event_id, second.event_id]);
  assert.deepEqual(simulator.getSnapshot().buffered_event_ids, []);

  const conflict = simulator.createEvent(
    "user.transcript.partial",
    { connection_id: "connection:sim-1", turn_id: ids.turn },
    { text: "different event", revision: 2 },
    { correlationId, sequence: 2 },
  );
  assert.equal(simulator.accept(conflict).reason, "sequence_conflict");
});
