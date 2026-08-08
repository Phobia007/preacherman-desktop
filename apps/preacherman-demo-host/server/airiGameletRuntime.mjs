import { randomUUID } from "node:crypto";

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SESSION_PHASES = new Set(["active", "completed"]);
const DEFAULT_JSON_LIMITS = Object.freeze({ maximumBytes: 64 * 1024, maximumDepth: 16, maximumNodes: 4_096 });

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

function cloneJson(value, label, {
  maximumBytes = DEFAULT_JSON_LIMITS.maximumBytes,
  maximumDepth = DEFAULT_JSON_LIMITS.maximumDepth,
  maximumNodes = DEFAULT_JSON_LIMITS.maximumNodes,
} = {}) {
  let nodes = 0;
  const ancestors = new Set();
  function visit(candidate, depth) {
    nodes += 1;
    if (nodes > maximumNodes) throw gameletError("GAMELET_JSON_LIMIT", `${label} exceeds ${maximumNodes} JSON nodes.`, 413);
    if (depth > maximumDepth) throw gameletError("GAMELET_JSON_LIMIT", `${label} exceeds JSON depth ${maximumDepth}.`, 413);
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw gameletError("INVALID_GAMELET_STATE", `${label} contains a non-finite number.`, 500);
      return;
    }
    if (typeof candidate !== "object") throw gameletError("INVALID_GAMELET_STATE", `${label} must contain only JSON values.`, 500);
    if (ancestors.has(candidate)) throw gameletError("INVALID_GAMELET_STATE", `${label} contains a circular reference.`, 500);
    const prototype = Object.getPrototypeOf(candidate);
    if (!Array.isArray(candidate) && prototype !== Object.prototype && prototype !== null) {
      throw gameletError("INVALID_GAMELET_STATE", `${label} must contain only plain JSON objects.`, 500);
    }
    ancestors.add(candidate);
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        if (!(index in candidate)) throw gameletError("INVALID_GAMELET_STATE", `${label} contains a sparse array.`, 500);
        visit(candidate[index], depth + 1);
      }
    } else {
      for (const child of Object.values(candidate)) visit(child, depth + 1);
    }
    ancestors.delete(candidate);
  }
  visit(value, 0);
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (cause) {
    throw gameletError("INVALID_GAMELET_STATE", `${label} must be valid JSON.`, 500, cause);
  }
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
    throw gameletError("GAMELET_JSON_LIMIT", `${label} exceeds ${maximumBytes} bytes.`, 413);
  }
  return JSON.parse(serialized);
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
  for (const hook of ["pause", "resume", "stop", "destroy"]) {
    if (adapter[hook] !== undefined && typeof adapter[hook] !== "function") {
      throw gameletError("INVALID_GAMELET_INPUT", `Gamelet ${id} adapter ${hook} must be a function.`);
    }
  }
  return adapter;
}

function normalizeAdapterResult(result, label, limits) {
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
  if (events.length > limits.maxAdapterEvents) {
    throw gameletError("GAMELET_EVENT_LIMIT", `${label} returned more than ${limits.maxAdapterEvents} events.`, 413);
  }
  return {
    state: cloneJson(result.state, `${label} state`, {
      maximumBytes: limits.maxStateBytes,
      maximumDepth: limits.maxJsonDepth,
      maximumNodes: limits.maxJsonNodes,
    }),
    status,
    events: cloneJson(events, `${label} events`, {
      maximumBytes: limits.maxEventBytes,
      maximumDepth: limits.maxJsonDepth,
      maximumNodes: limits.maxJsonNodes,
    }),
  };
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
  maxStateBytes = 64 * 1024,
  maxEventBytes = 16 * 1024,
  maxJsonDepth = 16,
  maxJsonNodes = 4_096,
  maxAdapterEvents = 32,
  maxHistoryEntries = 64,
  maxSessionEvents = 256,
  now = () => new Date().toISOString(),
  createId = randomUUID,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new TypeError("Gamelet timeout must be an integer between 10 and 120000 milliseconds.");
  }
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 1_000) {
    throw new TypeError("Gamelet session limit must be an integer between 1 and 1000.");
  }
  for (const [label, value, maximum] of [
    ["state byte limit", maxStateBytes, 4 * 1024 * 1024],
    ["event byte limit", maxEventBytes, 1024 * 1024],
    ["JSON depth limit", maxJsonDepth, 64],
    ["JSON node limit", maxJsonNodes, 100_000],
    ["adapter event limit", maxAdapterEvents, 1_000],
    ["history entry limit", maxHistoryEntries, 10_000],
    ["session event limit", maxSessionEvents, 10_000],
  ]) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
      throw new TypeError(`Gamelet ${label} must be an integer between 1 and ${maximum}.`);
    }
  }
  const limits = {
    maxStateBytes,
    maxEventBytes,
    maxJsonDepth,
    maxJsonNodes,
    maxAdapterEvents,
  };
  const registrations = new Map();
  const sessions = new Map();

  function appendEvent(session, event, at) {
    session.events.push({ ...event, sequence: session.nextEventSequence, at });
    session.nextEventSequence += 1;
    if (session.events.length > maxSessionEvents) session.events.splice(0, session.events.length - maxSessionEvents);
  }

  function appendHistory(session, action, state, at) {
    session.history.push({
      sequence: session.nextHistorySequence,
      at,
      action,
      state: clone(state, "Gamelet history state"),
    });
    session.nextHistorySequence += 1;
    if (session.history.length > maxHistoryEntries) session.history.splice(0, session.history.length - maxHistoryEntries);
  }

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
    if ([...sessions.values()].filter((session) => session.status === "active" || session.status === "paused").length >= maxSessions) {
      throw gameletError("GAMELET_SESSION_LIMIT", `Gamelet session limit reached (${maxSessions}).`, 429);
    }
    const id = String(createId());
    const createdAt = now();
    const safeInput = cloneJson(input, "Gamelet input", {
      maximumBytes: maxStateBytes,
      maximumDepth: maxJsonDepth,
      maximumNodes: maxJsonNodes,
    });
    const result = normalizeAdapterResult(await callAdapter(
      registration.adapter.create({ input: safeInput, sessionId: id, pluginId }),
      `Gamelet ${gameletId} create`,
    ), `Gamelet ${gameletId} create`, limits);
    const session = {
      id,
      gameletId,
      ownerPluginId: pluginId,
      providerPluginId: registration.pluginId,
      status: result.status,
      createdAt,
      updatedAt: createdAt,
      state: result.state,
      history: [],
      events: [],
      nextHistorySequence: 0,
      nextEventSequence: 1,
    };
    appendHistory(session, null, result.state, createdAt);
    appendEvent(session, { type: "session.created" }, createdAt);
    appendEvent(session, { type: "session.started" }, createdAt);
    for (const event of result.events) appendEvent(session, event, createdAt);
    if (result.status === "completed") appendEvent(session, { type: "session.completed" }, createdAt);
    sessions.set(id, session);
    return publicSession(session);
  }

  async function startSession(options) {
    return createSession(options);
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
    const safeAction = cloneJson(action, "Gamelet action", {
      maximumBytes: maxEventBytes,
      maximumDepth: maxJsonDepth,
      maximumNodes: maxJsonNodes,
    });
    const result = normalizeAdapterResult(await callAdapter(
      registration.adapter.send({
        state: clone(session.state, "Gamelet state"),
        action: safeAction,
        sessionId,
        pluginId,
      }),
      `Gamelet ${session.gameletId} action ${action.type}`,
    ), `Gamelet ${session.gameletId} action ${action.type}`, limits);
    const updatedAt = now();
    session.state = result.state;
    session.status = result.status;
    session.updatedAt = updatedAt;
    appendHistory(session, safeAction, result.state, updatedAt);
    appendEvent(session, { type: "action.accepted", action: safeAction }, updatedAt);
    for (const event of result.events) appendEvent(session, event, updatedAt);
    if (result.status === "completed") appendEvent(session, { type: "session.completed" }, updatedAt);
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

  async function pauseSession({ pluginId, sessionId }) {
    const session = requireOwnedSession(sessionId, pluginId);
    if (session.status !== "active") {
      throw gameletError("GAMELET_SESSION_NOT_ACTIVE", `Gamelet session ${sessionId} is ${session.status}.`, 409);
    }
    const registration = requireRegistration(session.gameletId);
    if (registration.adapter.pause) {
      await callAdapter(registration.adapter.pause({
        state: clone(session.state, "Gamelet state"), sessionId, pluginId,
      }), `Gamelet ${session.gameletId} pause`);
    }
    const updatedAt = now();
    session.status = "paused";
    session.updatedAt = updatedAt;
    appendEvent(session, { type: "session.paused" }, updatedAt);
    return publicSession(session);
  }

  async function resumeSession({ pluginId, sessionId }) {
    const session = requireOwnedSession(sessionId, pluginId);
    if (session.status !== "paused") {
      throw gameletError("GAMELET_SESSION_NOT_PAUSED", `Gamelet session ${sessionId} is ${session.status}.`, 409);
    }
    const registration = requireRegistration(session.gameletId);
    if (registration.adapter.resume) {
      await callAdapter(registration.adapter.resume({
        state: clone(session.state, "Gamelet state"), sessionId, pluginId,
      }), `Gamelet ${session.gameletId} resume`);
    }
    const updatedAt = now();
    session.status = "active";
    session.updatedAt = updatedAt;
    appendEvent(session, { type: "session.resumed" }, updatedAt);
    return publicSession(session);
  }

  async function stopSession({ pluginId, sessionId, reason = "requested" }) {
    const session = requireOwnedSession(sessionId, pluginId);
    if (session.status === "stopped") return publicSession(session);
    if (typeof reason !== "string" || !reason.trim() || Buffer.byteLength(reason, "utf8") > 512) {
      throw gameletError("INVALID_GAMELET_INPUT", "Gamelet stop reason must be a non-empty string of at most 512 bytes.");
    }
    const registration = registrations.get(session.gameletId);
    if (registration?.adapter.stop) {
      await callAdapter(registration.adapter.stop({
        state: clone(session.state, "Gamelet state"), sessionId, pluginId, reason,
      }), `Gamelet ${session.gameletId} stop`);
    }
    const updatedAt = now();
    session.status = "stopped";
    session.updatedAt = updatedAt;
    appendEvent(session, { type: "session.stopped", reason }, updatedAt);
    return publicSession(session);
  }

  async function destroySession({ pluginId, sessionId, reason = "requested" }) {
    const session = requireOwnedSession(sessionId, pluginId);
    if (typeof reason !== "string" || !reason.trim() || Buffer.byteLength(reason, "utf8") > 512) {
      throw gameletError("INVALID_GAMELET_INPUT", "Gamelet destroy reason must be a non-empty string of at most 512 bytes.");
    }
    const registration = registrations.get(session.gameletId);
    if (registration?.adapter.stop && session.status !== "stopped") {
      await callAdapter(registration.adapter.stop({
        state: clone(session.state, "Gamelet state"), sessionId, pluginId, reason,
      }), `Gamelet ${session.gameletId} stop before destroy`);
    }
    if (registration?.adapter.destroy) {
      await callAdapter(registration.adapter.destroy({
        state: clone(session.state, "Gamelet state"), sessionId, pluginId, reason,
      }), `Gamelet ${session.gameletId} destroy`);
    }
    const updatedAt = now();
    session.status = "destroyed";
    session.updatedAt = updatedAt;
    appendEvent(session, { type: "session.destroyed", reason }, updatedAt);
    const destroyed = publicSession(session);
    sessions.delete(sessionId);
    return destroyed;
  }

  async function cleanupSessions(targets, reason) {
    await Promise.allSettled(targets.map(async (session) => {
      const registration = registrations.get(session.gameletId);
      if (registration?.adapter.stop && session.status !== "stopped") {
        try {
          await callAdapter(registration.adapter.stop({
            state: clone(session.state, "Gamelet state"),
            sessionId: session.id,
            pluginId: session.ownerPluginId,
            reason,
          }), `Gamelet ${session.gameletId} cleanup`);
        } catch {
          // Destruction remains best-effort even when stopping a plugin resource fails.
        }
      }
      if (registration?.adapter.destroy) {
        try {
          await callAdapter(registration.adapter.destroy({
            state: clone(session.state, "Gamelet state"),
            sessionId: session.id,
            pluginId: session.ownerPluginId,
            reason,
          }), `Gamelet ${session.gameletId} destroy cleanup`);
        } catch {
          // Plugin removal cannot retain an unreachable session after hook failure.
        }
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

  return {
    close,
    createSession,
    destroySession,
    discover,
    getSession,
    listSessions,
    pauseSession,
    register,
    removePlugin,
    resumeSession,
    sendAction,
    startSession,
    stopSession,
    unregister,
  };
}
