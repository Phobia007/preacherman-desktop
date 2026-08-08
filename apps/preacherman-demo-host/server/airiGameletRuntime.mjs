import { randomUUID } from "node:crypto";

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SESSION_PHASES = new Set(["active", "completed"]);

function gameletError(code, message, statusCode = 400, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function requireName(value, label) {
  if (typeof value !== "string" || !NAME_PATTERN.test(value)) {
    throw gameletError("INVALID_GAMELET_INPUT", `${label} must use lowercase letters, numbers, and hyphens.`);
  }
  return value;
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw gameletError("INVALID_GAMELET_STATE", `${label} must be structured-cloneable.`, 500, cause);
  }
}

function withTimeout(operation, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(gameletError(
      "GAMELET_TIMEOUT",
      `${label} timed out after ${timeoutMs} ms.`,
      504,
    )), timeoutMs);
  });
  return Promise.race([Promise.resolve(operation), timeout]).finally(() => clearTimeout(timer));
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw gameletError("INVALID_GAMELET_INPUT", "Gamelet definition must be an object.");
  }
  const id = requireName(definition.id, "Gamelet id");
  if (typeof definition.version !== "string" || !/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} requires a semantic version.`);
  }
  if (typeof definition.title !== "string" || !definition.title.trim()) {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} requires a title.`);
  }
  if (typeof definition.description !== "string" || !definition.description.trim()) {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} requires a description.`);
  }
  if (!Array.isArray(definition.actions) || definition.actions.length === 0) {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} requires at least one declared action.`);
  }
  const actionTypes = new Set();
  const actions = definition.actions.map((action) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} has an invalid action declaration.`);
    }
    const type = requireName(action.type, "Gamelet action type");
    if (actionTypes.has(type)) throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} declares action ${type} twice.`);
    actionTypes.add(type);
    return clone(action, `Gamelet ${id} action ${type}`);
  });
  return {
    id,
    version: definition.version,
    title: definition.title.trim(),
    description: definition.description.trim(),
    actions,
  };
}

function normalizeAdapter(adapter, id) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} requires an adapter.`);
  }
  if (typeof adapter.create !== "function" || typeof adapter.send !== "function") {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} adapter requires create() and send().`);
  }
  if (adapter.stop !== undefined && typeof adapter.stop !== "function") {
    throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} adapter stop must be a function.`);
  }
  return adapter;
}

function normalizeAdapterResult(result, label) {
  if (!result || typeof result !== "object" || Array.isArray(result) || !("state" in result)) {
    throw gameletError("INVALID_GAMELET_STATE", `${label} must return an object containing state.`, 500);
  }
  const status = result.status ?? "active";
  if (!SESSION_PHASES.has(status)) {
    throw gameletError("INVALID_GAMELET_STATE", `${label} returned invalid status ${String(status)}.`, 500);
  }
  const events = result.events ?? [];
  if (!Array.isArray(events) || events.some((event) => !event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string")) {
    throw gameletError("INVALID_GAMELET_STATE", `${label} returned invalid events.`, 500);
  }
  return { state: clone(result.state, `${label} state`), status, events: clone(events, `${label} events`) };
}

function publicRegistration(record) {
  return clone({ ...record.definition, pluginId: record.pluginId }, `Gamelet ${record.definition.id}`);
}

function publicSession(session) {
  return clone({
    id: session.id,
    gameletId: session.gameletId,
    ownerPluginId: session.ownerPluginId,
    providerPluginId: session.providerPluginId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    state: session.state,
    history: session.history,
    events: session.events,
  }, `Gamelet session ${session.id}`);
}

function winnerFor(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export const BUILTIN_TIC_TAC_TOE_GAMELET = Object.freeze({
  pluginId: "preacherman-host",
  definition: {
    id: "tic-tac-toe",
    version: "1.0.0",
    title: "Tic-tac-toe",
    description: "A fully offline two-player tic-tac-toe Gamelet.",
    actions: [{
      type: "place",
      description: "Place the current player's mark in an empty cell numbered 0 through 8.",
      input: { cell: "integer:0..8" },
    }],
  },
  adapter: {
    create() {
      return {
        status: "active",
        state: { board: Array(9).fill(null), currentPlayer: "X", moves: 0, outcome: "playing", winner: null },
        events: [{ type: "game.ready", currentPlayer: "X" }],
      };
    },
    send({ state, action }) {
      if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell > 8) {
        throw gameletError("GAMELET_ILLEGAL_ACTION", "Place action cell must be an integer from 0 through 8.");
      }
      if (state.board[action.cell] !== null) {
        throw gameletError("GAMELET_ILLEGAL_ACTION", `Cell ${action.cell} is already occupied.`);
      }
      const player = state.currentPlayer;
      const board = [...state.board];
      board[action.cell] = player;
      const moves = state.moves + 1;
      const winner = winnerFor(board);
      if (winner) {
        return {
          status: "completed",
          state: { board, currentPlayer: null, moves, outcome: "won", winner },
          events: [{ type: "mark.placed", cell: action.cell, player }, { type: "game.won", winner }],
        };
      }
      if (moves === 9) {
        return {
          status: "completed",
          state: { board, currentPlayer: null, moves, outcome: "draw", winner: null },
          events: [{ type: "mark.placed", cell: action.cell, player }, { type: "game.draw" }],
        };
      }
      const currentPlayer = player === "X" ? "O" : "X";
      return {
        status: "active",
        state: { board, currentPlayer, moves, outcome: "playing", winner: null },
        events: [{ type: "mark.placed", cell: action.cell, player }, { type: "turn.changed", currentPlayer }],
      };
    },
  },
});

export function createAiriGameletRuntime({
  includeBuiltin = true,
  timeoutMs = 2_000,
  maxSessions = 32,
  now = () => new Date().toISOString(),
  createId = randomUUID,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new TypeError("Gamelet timeout must be an integer between 10 and 120000 milliseconds.");
  }
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 1_000) {
    throw new TypeError("Gamelet session limit must be an integer between 1 and 1000.");
  }
  const registrations = new Map();
  const sessions = new Map();

  function register({ pluginId, definition, adapter }) {
    requireName(pluginId, "Plugin id");
    const normalized = normalizeDefinition(definition);
    if (registrations.has(normalized.id)) {
      throw gameletError("GAMELET_ALREADY_REGISTERED", `Gamelet is already registered: ${normalized.id}`, 409);
    }
    const record = { pluginId, definition: normalized, adapter: normalizeAdapter(adapter, normalized.id) };
    registrations.set(normalized.id, record);
    return publicRegistration(record);
  }

  function discover({ pluginId } = {}) {
    return [...registrations.values()]
      .filter((record) => !pluginId || record.pluginId === pluginId)
      .map(publicRegistration)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  function requireRegistration(gameletId) {
    const record = registrations.get(gameletId);
    if (!record) throw gameletError("GAMELET_NOT_FOUND", `Unknown AIRI Gamelet: ${gameletId}`, 404);
    return record;
  }

  function requireOwnedSession(sessionId, pluginId) {
    requireName(pluginId, "Plugin id");
    const session = sessions.get(sessionId);
    if (!session) throw gameletError("GAMELET_SESSION_NOT_FOUND", `Unknown Gamelet session: ${sessionId}`, 404);
    if (session.ownerPluginId !== pluginId) {
      throw gameletError("GAMELET_OWNER_MISMATCH", `Plugin ${pluginId} does not own Gamelet session ${sessionId}.`, 403);
    }
    return session;
  }

  async function callAdapter(operation, label) {
    try {
      return await withTimeout(operation, timeoutMs, label);
    } catch (cause) {
      if (typeof cause?.code === "string" && cause.code.startsWith("GAMELET_")) throw cause;
      throw gameletError("GAMELET_ADAPTER_FAILED", `${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`, 500, cause);
    }
  }

  async function createSession({ pluginId, gameletId, input = {} }) {
    requireName(pluginId, "Plugin id");
    const registration = requireRegistration(gameletId);
    if ([...sessions.values()].filter((session) => session.status === "active").length >= maxSessions) {
      throw gameletError("GAMELET_SESSION_LIMIT", `Gamelet session limit reached (${maxSessions}).`, 429);
    }
    const id = String(createId());
    const createdAt = now();
    const result = normalizeAdapterResult(await callAdapter(
      registration.adapter.create({ input: clone(input, "Gamelet input"), sessionId: id, pluginId }),
      `Gamelet ${gameletId} create`,
    ), `Gamelet ${gameletId} create`);
    const session = {
      id,
      gameletId,
      ownerPluginId: pluginId,
      providerPluginId: registration.pluginId,
      status: result.status,
      createdAt,
      updatedAt: createdAt,
      state: result.state,
      history: [{ sequence: 0, at: createdAt, action: null, state: clone(result.state, "Initial Gamelet state") }],
      events: [{ sequence: 1, at: createdAt, type: "session.created" }],
    };
    for (const event of result.events) session.events.push({ ...event, sequence: session.events.length + 1, at: createdAt });
    if (result.status === "completed") session.events.push({ sequence: session.events.length + 1, at: createdAt, type: "session.completed" });
    sessions.set(id, session);
    return publicSession(session);
  }

  async function sendAction({ pluginId, sessionId, action }) {
    const session = requireOwnedSession(sessionId, pluginId);
    if (session.status !== "active") {
      throw gameletError("GAMELET_SESSION_NOT_ACTIVE", `Gamelet session ${sessionId} is ${session.status}.`, 409);
    }
    if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string") {
      throw gameletError("GAMELET_ILLEGAL_ACTION", "Gamelet action must be an object with a type.");
    }
    const registration = requireRegistration(session.gameletId);
    if (!registration.definition.actions.some((declared) => declared.type === action.type)) {
      throw gameletError("GAMELET_ILLEGAL_ACTION", `Gamelet ${session.gameletId} does not declare action ${action.type}.`);
    }
    const result = normalizeAdapterResult(await callAdapter(
      registration.adapter.send({
        state: clone(session.state, "Gamelet state"),
        action: clone(action, "Gamelet action"),
        sessionId,
        pluginId,
      }),
      `Gamelet ${session.gameletId} action ${action.type}`,
    ), `Gamelet ${session.gameletId} action ${action.type}`);
    const updatedAt = now();
    session.state = result.state;
    session.status = result.status;
    session.updatedAt = updatedAt;
    session.history.push({
      sequence: session.history.length,
      at: updatedAt,
      action: clone(action, "Gamelet action"),
      state: clone(result.state, "Gamelet state"),
    });
    session.events.push({ sequence: session.events.length + 1, at: updatedAt, type: "action.accepted", action: clone(action, "Gamelet action") });
    for (const event of result.events) session.events.push({ ...event, sequence: session.events.length + 1, at: updatedAt });
    if (result.status === "completed") session.events.push({ sequence: session.events.length + 1, at: updatedAt, type: "session.completed" });
    return publicSession(session);
  }

  function getSession({ pluginId, sessionId }) {
    return publicSession(requireOwnedSession(sessionId, pluginId));
  }

  function listSessions({ pluginId }) {
    requireName(pluginId, "Plugin id");
    return [...sessions.values()]
      .filter((session) => session.ownerPluginId === pluginId)
      .map(publicSession)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async function stopSession({ pluginId, sessionId, reason = "requested" }) {
    const session = requireOwnedSession(sessionId, pluginId);
    if (session.status === "stopped") return publicSession(session);
    const registration = registrations.get(session.gameletId);
    if (registration?.adapter.stop) {
      await callAdapter(registration.adapter.stop({
        state: clone(session.state, "Gamelet state"), sessionId, pluginId, reason,
      }), `Gamelet ${session.gameletId} stop`);
    }
    const updatedAt = now();
    session.status = "stopped";
    session.updatedAt = updatedAt;
    session.events.push({ sequence: session.events.length + 1, at: updatedAt, type: "session.stopped", reason });
    return publicSession(session);
  }

  async function cleanupSessions(targets, reason) {
    await Promise.allSettled(targets.map(async (session) => {
      const registration = registrations.get(session.gameletId);
      if (registration?.adapter.stop && session.status !== "stopped") {
        await callAdapter(registration.adapter.stop({
          state: clone(session.state, "Gamelet state"),
          sessionId: session.id,
          pluginId: session.ownerPluginId,
          reason,
        }), `Gamelet ${session.gameletId} cleanup`);
      }
    }));
    for (const session of targets) sessions.delete(session.id);
  }

  async function removePlugin(pluginId) {
    requireName(pluginId, "Plugin id");
    const targets = [...sessions.values()].filter(
      (session) => session.ownerPluginId === pluginId || session.providerPluginId === pluginId,
    );
    await cleanupSessions(targets, "plugin-removed");
    let gamelets = 0;
    for (const [id, registration] of registrations) {
      if (registration.pluginId === pluginId) {
        registrations.delete(id);
        gamelets += 1;
      }
    }
    return { gamelets, sessions: targets.length };
  }

  async function unregister(gameletId, pluginId) {
    const registration = requireRegistration(gameletId);
    if (registration.pluginId !== pluginId) {
      throw gameletError("GAMELET_OWNER_MISMATCH", `Plugin ${pluginId} does not own Gamelet ${gameletId}.`, 403);
    }
    const targets = [...sessions.values()].filter((session) => session.gameletId === gameletId);
    await cleanupSessions(targets, "gamelet-unregistered");
    registrations.delete(gameletId);
    return publicRegistration(registration);
  }

  async function close() {
    const pluginIds = [...new Set([
      ...[...registrations.values()].map((record) => record.pluginId),
      ...[...sessions.values()].map((session) => session.ownerPluginId),
    ])];
    for (const pluginId of pluginIds) await removePlugin(pluginId);
  }

  if (includeBuiltin) register(BUILTIN_TIC_TAC_TOE_GAMELET);

  return { close, createSession, discover, getSession, listSessions, register, removePlugin, sendAction, stopSession, unregister };
}
