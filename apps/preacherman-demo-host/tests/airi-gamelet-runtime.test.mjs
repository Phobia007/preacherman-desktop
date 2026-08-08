import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_TIC_TAC_TOE_GAMELET,
  createAiriGameletRuntime,
} from "../server/airiGameletRuntime.mjs";

function fixture(options = {}) {
  let id = 0;
  let tick = 0;
  return createAiriGameletRuntime({
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

  const stopped = await runtime.stopSession({ pluginId: "first-player", sessionId: session.id });
  assert.equal(stopped.status, "stopped");
  const replacement = await runtime.createSession({ pluginId: "second-player", gameletId: "slow-game" });
  assert.equal(replacement.status, "active");
});

test("removePlugin cleans provider and consumer sessions while ownership protects registration", async () => {
  const stopped = [];
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
});
