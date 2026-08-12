import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BUILTIN_TIC_TAC_TOE_GAMELET,
  createPreachermanGameletRuntime,
} from "../server/preachermanGameletRuntime.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

function fixture(options = {}) {
  let id = 0;
  let tick = 0;
  return createPreachermanGameletRuntime({
    createId: () => `game-${++id}`,
    now: () => `2026-08-08T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    ...options,
  });
}

test("built-in offline tic-tac-toe completes a real game with state and event history", async () => {
  const runtime = fixture();
  assert.deepEqual(runtime.discover().map(({ id }) => id), [BUILTIN_TIC_TAC_TOE_GAMELET.definition.id]);

  let session = await runtime.createSession({ pluginId: "demo-plugin", gameletId: "tic-tac-toe" });
  for (const cell of [0, 3, 1, 4, 2]) {
    session = await runtime.sendAction({
      pluginId: "demo-plugin",
      sessionId: session.id,
      action: { type: "place", cell },
    });
  }

  assert.equal(session.status, "completed");
  assert.equal(session.state.winner, "X");
  assert.equal(session.state.outcome, "won");
  assert.deepEqual(session.state.board, ["X", "X", "X", "O", "O", null, null, null, null]);
  assert.equal(session.history.length, 6);
  assert.deepEqual(session.history.map((entry) => entry.sequence), [0, 1, 2, 3, 4, 5]);
  assert.equal(session.events.some((event) => event.type === "game.won" && event.winner === "X"), true);
  assert.equal(session.events.at(-1).type, "session.completed");
  await assert.rejects(
    runtime.sendAction({ pluginId: "demo-plugin", sessionId: session.id, action: { type: "place", cell: 8 } }),
    { code: "GAMELET_SESSION_NOT_ACTIVE", statusCode: 409 },
  );
});

test("illegal actions and cross-plugin session access never mutate state", async () => {
  const runtime = fixture();
  const session = await runtime.createSession({ pluginId: "owner-plugin", gameletId: "tic-tac-toe" });
  await runtime.sendAction({ pluginId: "owner-plugin", sessionId: session.id, action: { type: "place", cell: 0 } });

  await assert.rejects(
    runtime.sendAction({ pluginId: "owner-plugin", sessionId: session.id, action: { type: "place", cell: 0 } }),
    { code: "GAMELET_ILLEGAL_ACTION", statusCode: 400 },
  );
  await assert.rejects(
    runtime.sendAction({ pluginId: "other-plugin", sessionId: session.id, action: { type: "place", cell: 1 } }),
    { code: "GAMELET_OWNER_MISMATCH", statusCode: 403 },
  );
  assert.throws(
    () => runtime.getSession({ pluginId: "other-plugin", sessionId: session.id }),
    { code: "GAMELET_OWNER_MISMATCH", statusCode: 403 },
  );

  const unchanged = runtime.getSession({ pluginId: "owner-plugin", sessionId: session.id });
  assert.equal(unchanged.state.moves, 1);
  assert.equal(unchanged.history.length, 2);
  assert.equal(runtime.listSessions({ pluginId: "other-plugin" }).length, 0);
});

test("adapter timeouts do not commit late state and active session limit is explicit", async () => {
  const runtime = fixture({ includeBuiltin: false, timeoutMs: 15, maxSessions: 1 });
  runtime.register({
    pluginId: "slow-provider",
    definition: {
      id: "slow-game",
      version: "1.0.0",
      title: "Slow game",
      description: "Timeout test adapter.",
      actions: [{ type: "wait" }],
    },
    adapter: {
      create: () => ({ state: { turns: 0 } }),
      send: () => new Promise(() => {}),
    },
  });
  const session = await runtime.createSession({ pluginId: "first-player", gameletId: "slow-game" });

  await assert.rejects(
    runtime.createSession({ pluginId: "second-player", gameletId: "slow-game" }),
    { code: "GAMELET_SESSION_LIMIT", statusCode: 429 },
  );
  await assert.rejects(
    runtime.sendAction({ pluginId: "first-player", sessionId: session.id, action: { type: "wait" } }),
    { code: "GAMELET_TIMEOUT", statusCode: 504 },
  );
  const unchanged = runtime.getSession({ pluginId: "first-player", sessionId: session.id });
  assert.deepEqual(unchanged.state, { turns: 0 });
  assert.equal(unchanged.history.length, 1);

  const stopped = await runtime.stopSession({
    pluginId: "first-player",
    sessionId: session.id,
    reason: "user-requested",
  });
  assert.equal(stopped.status, "stopped");
  assert.deepEqual(stopped.events.at(-1), {
    sequence: 3,
    at: "2026-08-08T00:00:01.000Z",
    type: "session.stopped",
    reason: "user-requested",
  });
  const replacement = await runtime.createSession({ pluginId: "second-player", gameletId: "slow-game" });
  assert.equal(replacement.status, "active");
});

test("removePlugin cleans provider and consumer sessions while ownership protects registration", async () => {
  const stopped = [];
  const destroyed = [];
  const runtime = fixture({ includeBuiltin: false });
  runtime.register({
    pluginId: "game-provider",
    definition: {
      id: "counter-game",
      version: "1.0.0",
      title: "Counter game",
      description: "Cleanup test adapter.",
      actions: [{ type: "increment" }],
    },
    adapter: {
      create: () => ({ state: { value: 0 } }),
      send: ({ state }) => ({ state: { value: state.value + 1 } }),
      stop: ({ sessionId, reason }) => { stopped.push({ sessionId, reason }); },
      destroy: ({ sessionId, reason }) => { destroyed.push({ sessionId, reason }); },
    },
  });
  const providerSession = await runtime.createSession({ pluginId: "game-provider", gameletId: "counter-game" });
  const consumerSession = await runtime.createSession({ pluginId: "consumer-plugin", gameletId: "counter-game" });
  await assert.rejects(
    runtime.unregister("counter-game", "consumer-plugin"),
    { code: "GAMELET_OWNER_MISMATCH", statusCode: 403 },
  );

  assert.deepEqual(await runtime.removePlugin("game-provider"), { gamelets: 1, sessions: 2 });
  assert.deepEqual(runtime.discover(), []);
  assert.equal(runtime.listSessions({ pluginId: "game-provider" }).length, 0);
  assert.equal(runtime.listSessions({ pluginId: "consumer-plugin" }).length, 0);
  assert.deepEqual(stopped.map(({ sessionId }) => sessionId).sort(), [consumerSession.id, providerSession.id].sort());
  assert.equal(stopped.every(({ reason }) => reason === "plugin-removed"), true);
  assert.deepEqual(destroyed.map(({ sessionId }) => sessionId).sort(), [consumerSession.id, providerSession.id].sort());
  assert.equal(destroyed.every(({ reason }) => reason === "plugin-removed"), true);
});

test("adapter output must remain JSON-safe and within byte, depth, node, and event limits", async () => {
  const definition = {
    id: "bounded-game",
    version: "1.0.0",
    title: "Bounded game",
    description: "Memory limit test adapter.",
    actions: [{ type: "update" }],
  };
  const expectCreateFailure = async (options, create, expected) => {
    const runtime = fixture({ includeBuiltin: false, ...options });
    runtime.register({ pluginId: "bounded-provider", definition, adapter: { create, send: () => ({ state: {} }) } });
    await assert.rejects(
      runtime.createSession({ pluginId: "bounded-player", gameletId: "bounded-game" }),
      expected,
    );
  };

  await expectCreateFailure({}, () => ({ state: { createdAt: new Date() } }), {
    code: "INVALID_GAMELET_STATE", statusCode: 500,
  });
  await expectCreateFailure({ maxStateBytes: 24 }, () => ({ state: { content: "x".repeat(64) } }), {
    code: "GAMELET_JSON_LIMIT", statusCode: 413,
  });
  await expectCreateFailure({ maxJsonDepth: 2 }, () => ({ state: { a: { b: { c: true } } } }), {
    code: "GAMELET_JSON_LIMIT", statusCode: 413,
  });
  await expectCreateFailure({ maxJsonNodes: 3 }, () => ({ state: { a: 1, b: 2, c: 3 } }), {
    code: "GAMELET_JSON_LIMIT", statusCode: 413,
  });
  await expectCreateFailure({ maxAdapterEvents: 1 }, () => ({
    state: {}, events: [{ type: "first" }, { type: "second" }],
  }), { code: "GAMELET_EVENT_LIMIT", statusCode: 413 });
});

test("session histories and event logs retain the newest bounded entries with monotonic sequences", async () => {
  const runtime = fixture({
    includeBuiltin: false,
    maxHistoryEntries: 3,
    maxSessionEvents: 4,
  });
  runtime.register({
    pluginId: "counter-provider",
    definition: {
      id: "bounded-counter",
      version: "1.0.0",
      title: "Bounded counter",
      description: "Ring history test adapter.",
      actions: [{ type: "increment" }],
    },
    adapter: {
      create: () => ({ state: { value: 0 }, events: [{ type: "counter.ready" }] }),
      send: ({ state }) => ({ state: { value: state.value + 1 }, events: [{ type: "counter.incremented" }] }),
    },
  });
  let session = await runtime.createSession({ pluginId: "counter-player", gameletId: "bounded-counter" });
  for (let index = 0; index < 5; index += 1) {
    session = await runtime.sendAction({
      pluginId: "counter-player",
      sessionId: session.id,
      action: { type: "increment" },
    });
  }

  assert.equal(session.state.value, 5);
  assert.deepEqual(session.history.map(({ sequence }) => sequence), [3, 4, 5]);
  assert.equal(session.events.length, 4);
  assert.deepEqual(session.events.map(({ sequence }) => sequence), [10, 11, 12, 13]);
  assert.deepEqual(session.events.map(({ type }) => type), ["action.accepted", "counter.incremented", "action.accepted", "counter.incremented"]);
});

test("start, pause, resume, stop, and destroy form a real isolated session lifecycle", async () => {
  const hooks = [];
  const runtime = fixture({ includeBuiltin: false });
  runtime.register({
    pluginId: "lifecycle-provider",
    definition: {
      id: "lifecycle-game",
      version: "1.0.0",
      title: "Lifecycle game",
      description: "Lifecycle contract test adapter.",
      actions: [{ type: "advance" }],
    },
    adapter: {
      create: () => { hooks.push("create"); return { state: { turns: 0 } }; },
      send: ({ state }) => ({ state: { turns: state.turns + 1 } }),
      pause: () => { hooks.push("pause"); },
      resume: () => { hooks.push("resume"); },
      stop: () => { hooks.push("stop"); },
      destroy: () => { hooks.push("destroy"); },
    },
  });

  let session = await runtime.startSession({ pluginId: "lifecycle-player", gameletId: "lifecycle-game" });
  assert.equal(session.status, "active");
  assert.deepEqual(session.events.slice(0, 2).map(({ type }) => type), ["session.created", "session.started"]);
  session = await runtime.pauseSession({ pluginId: "lifecycle-player", sessionId: session.id });
  assert.equal(session.status, "paused");
  await assert.rejects(
    runtime.sendAction({ pluginId: "lifecycle-player", sessionId: session.id, action: { type: "advance" } }),
    { code: "GAMELET_SESSION_NOT_ACTIVE", statusCode: 409 },
  );
  session = await runtime.resumeSession({ pluginId: "lifecycle-player", sessionId: session.id });
  assert.equal(session.status, "active");
  session = await runtime.sendAction({
    pluginId: "lifecycle-player", sessionId: session.id, action: { type: "advance" },
  });
  assert.equal(session.state.turns, 1);
  session = await runtime.stopSession({ pluginId: "lifecycle-player", sessionId: session.id, reason: "test-complete" });
  assert.equal(session.status, "stopped");
  const destroyed = await runtime.destroySession({
    pluginId: "lifecycle-player", sessionId: session.id, reason: "release-resources",
  });
  assert.equal(destroyed.status, "destroyed");
  assert.equal(destroyed.events.at(-1).type, "session.destroyed");
  assert.throws(
    () => runtime.getSession({ pluginId: "lifecycle-player", sessionId: session.id }),
    { code: "GAMELET_SESSION_NOT_FOUND", statusCode: 404 },
  );
  assert.deepEqual(hooks, ["create", "pause", "resume", "stop", "destroy"]);
});

test("Gamelet lifecycle never creates or mutates a TaskRun", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-gamelet-isolation-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const taskStore = createTaskStore({ file: join(directory, "tasks.json") });
  const task = {
    taskId: "existing-task",
    status: "succeeded",
    updatedAt: "2026-08-08T00:00:00.000Z",
    events: [{ sequence: 1, type: "completed" }],
  };
  await taskStore.create(task);
  const before = await taskStore.list(10);

  const runtime = fixture();
  const started = await runtime.startSession({ pluginId: "isolated-player", gameletId: "tic-tac-toe" });
  const paused = await runtime.pauseSession({ pluginId: "isolated-player", sessionId: started.id });
  await runtime.resumeSession({ pluginId: "isolated-player", sessionId: paused.id });
  await runtime.stopSession({ pluginId: "isolated-player", sessionId: paused.id });
  await runtime.destroySession({ pluginId: "isolated-player", sessionId: paused.id });

  assert.deepEqual(await taskStore.list(10), before);
  assert.equal((await taskStore.list(10)).length, 1);
});
