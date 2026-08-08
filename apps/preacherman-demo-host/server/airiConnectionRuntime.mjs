const CONNECTION_STATES = new Set([
  "configuration-required",
  "external-runtime-required",
  "disconnected",
  "testing",
  "connecting",
  "connected",
  "disconnecting",
  "error",
]);

export const AIRI_CONNECTION_CATALOG = Object.freeze([
  {
    id: "discord",
    name: "Discord",
    description: "Connect an AIRI adapter to a Discord bot account.",
    fields: [{ name: "botToken", type: "string", secret: true, required: true }],
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect an AIRI adapter to a Telegram bot account.",
    fields: [{ name: "botToken", type: "string", secret: true, required: true }],
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Connect an AIRI adapter to an authenticated YouTube live chat.",
    fields: [
      { name: "videoId", type: "string", secret: false, required: true },
      { name: "accessToken", type: "string", secret: true, required: true },
    ],
  },
  {
    id: "minecraft",
    name: "Minecraft",
    description: "Connect an AIRI adapter to a Minecraft RCON endpoint.",
    fields: [
      { name: "host", type: "string", secret: false, required: true },
      { name: "port", type: "number", secret: false, required: true, minimum: 1, maximum: 65_535 },
      { name: "password", type: "string", secret: true, required: true },
    ],
  },
  {
    id: "factorio",
    name: "Factorio",
    description: "Connect an AIRI adapter to a Factorio RCON endpoint.",
    fields: [
      { name: "host", type: "string", secret: false, required: true },
      { name: "port", type: "number", secret: false, required: true, minimum: 1, maximum: 65_535 },
      { name: "password", type: "string", secret: true, required: true },
    ],
  },
]);

function connectionError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function cloneCatalogEntry(entry) {
  return structuredClone(entry);
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw connectionError("INVALID_CONNECTION_INPUT", `${label} must use lowercase letters, numbers, and hyphens.`);
  }
  return value;
}

function validateConfiguration(catalog, input, current) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw connectionError("INVALID_CONNECTION_INPUT", "Connection configuration must be an object.");
  }
  const fields = new Map(catalog.fields.map((field) => [field.name, field]));
  const next = { ...current };
  for (const [name, value] of Object.entries(input)) {
    const field = fields.get(name);
    if (!field) throw connectionError("INVALID_CONNECTION_INPUT", `Unknown ${catalog.id} configuration field: ${name}.`);
    if (value === null || value === "") {
      delete next[name];
      continue;
    }
    if (field.type === "string" && typeof value !== "string") {
      throw connectionError("INVALID_CONNECTION_INPUT", `${catalog.id}.${name} must be a string.`);
    }
    if (field.type === "number" && (!Number.isInteger(value) || value < field.minimum || value > field.maximum)) {
      throw connectionError(
        "INVALID_CONNECTION_INPUT",
        `${catalog.id}.${name} must be an integer between ${field.minimum} and ${field.maximum}.`,
      );
    }
    next[name] = value;
  }
  return next;
}

function isConfigured(record) {
  return record.catalog.fields
    .filter((field) => field.required)
    .every((field) => record.configuration[field.name] !== undefined);
}

function prerequisiteState(record) {
  if (!isConfigured(record)) return "configuration-required";
  if (!record.registration) return "external-runtime-required";
  return "disconnected";
}

function safeConfiguration(record) {
  const values = {};
  const secrets = {};
  for (const field of record.catalog.fields) {
    if (field.secret) secrets[field.name] = record.configuration[field.name] !== undefined;
    else if (record.configuration[field.name] !== undefined) values[field.name] = record.configuration[field.name];
  }
  return { values, secrets };
}

function publicSnapshot(record) {
  return structuredClone({
    id: record.catalog.id,
    name: record.catalog.name,
    description: record.catalog.description,
    status: record.status,
    connected: record.connected,
    configured: isConfigured(record),
    configuration: safeConfiguration(record),
    adapter: record.registration ? { pluginId: record.registration.pluginId } : null,
    lastTest: record.lastTest,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  });
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw connectionError("INVALID_CONNECTION_ADAPTER", "Connection adapter must be an object.");
  }
  for (const operation of ["test", "connect", "disconnect"]) {
    if (typeof adapter[operation] !== "function") {
      throw connectionError("INVALID_CONNECTION_ADAPTER", `Connection adapter requires ${operation}().`);
    }
  }
  if (adapter.dispose !== undefined && typeof adapter.dispose !== "function") {
    throw connectionError("INVALID_CONNECTION_ADAPTER", "Connection adapter dispose must be a function.");
  }
  return adapter;
}

export function createAiriConnectionRuntime({
  catalog = AIRI_CONNECTION_CATALOG,
  timeoutMs = 10_000,
  historyLimit = 200,
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new TypeError("Connection timeout must be an integer between 10 and 120000 milliseconds.");
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 10_000) {
    throw new TypeError("Connection history limit must be an integer between 1 and 10000.");
  }

  const records = new Map();
  const events = [];
  let eventSequence = 0;
  let closed = false;

  for (const definition of catalog) {
    const entry = cloneCatalogEntry(definition);
    requireIdentifier(entry.id, "Connection id");
    if (records.has(entry.id)) throw connectionError("DUPLICATE_CONNECTION", `Duplicate connection: ${entry.id}.`);
    records.set(entry.id, {
      catalog: entry,
      configuration: {},
      registration: null,
      session: undefined,
      connected: false,
      status: "configuration-required",
      lastTest: null,
      lastError: null,
      updatedAt: now(),
      pending: Promise.resolve(),
    });
  }

  function requireOpen() {
    if (closed) throw connectionError("CONNECTION_RUNTIME_CLOSED", "AIRI connection runtime is closed.", 409);
  }

  function getRecord(id) {
    const record = records.get(id);
    if (!record) throw connectionError("CONNECTION_NOT_FOUND", `Unknown AIRI connection: ${id}.`, 404);
    return record;
  }

  function addEvent(record, type, status, details = {}) {
    if (!CONNECTION_STATES.has(status)) throw new TypeError(`Invalid connection state: ${status}`);
    const event = {
      id: ++eventSequence,
      connectionId: record.catalog.id,
      type,
      status,
      at: now(),
      ...details,
    };
    events.push(event);
    if (events.length > historyLimit) events.splice(0, events.length - historyLimit);
    return event;
  }

  function setStatus(record, status, type, details) {
    record.status = status;
    record.updatedAt = now();
    addEvent(record, type, status, details);
  }

  function queue(record, operation) {
    const result = record.pending.then(operation, operation);
    record.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  async function withTimeout(operation, label) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(connectionError(
          "CONNECTION_TIMEOUT",
          `${label} timed out after ${timeoutMs} ms.`,
          504,
        ));
      }, timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function callAdapter(record, operation) {
    return withTimeout(
      (signal) => record.registration.adapter[operation]({
        service: record.catalog.id,
        configuration: structuredClone(record.configuration),
        session: record.session,
        signal,
      }),
      `${record.catalog.name} ${operation}`,
    );
  }

  function recordFailure(record, operation, error) {
    const code = error?.code === "CONNECTION_TIMEOUT" ? "CONNECTION_TIMEOUT" : "CONNECTION_ADAPTER_FAILED";
    const statusCode = code === "CONNECTION_TIMEOUT" ? 504 : 502;
    record.lastError = {
      code,
      message: code === "CONNECTION_TIMEOUT"
        ? `${record.catalog.name} ${operation} timed out.`
        : `${record.catalog.name} adapter ${operation} failed.`,
      statusCode,
      at: now(),
    };
    setStatus(record, "error", `${operation}-failed`, { code });
  }

  function catalogSnapshot() {
    return [...records.values()].map((record) => cloneCatalogEntry(record.catalog));
  }

  function list() {
    return [...records.values()].map(publicSnapshot);
  }

  function get(id) {
    return publicSnapshot(getRecord(id));
  }

  function configure(id, configuration) {
    requireOpen();
    const record = getRecord(id);
    if (record.connected || ["connecting", "disconnecting"].includes(record.status)) {
      throw connectionError("CONNECTION_ACTIVE", `Disconnect ${record.catalog.name} before changing its configuration.`, 409);
    }
    record.configuration = validateConfiguration(record.catalog, configuration, record.configuration);
    record.lastError = null;
    const status = prerequisiteState(record);
    setStatus(record, status, "configured");
    return publicSnapshot(record);
  }

  function registerAdapter({ pluginId, service, adapter }) {
    requireOpen();
    requireIdentifier(pluginId, "Plugin id");
    const record = getRecord(service);
    if (record.registration) {
      throw connectionError("CONNECTION_ADAPTER_EXISTS", `${record.catalog.name} already has an adapter.`, 409);
    }
    record.registration = { pluginId, adapter: validateAdapter(adapter) };
    record.lastError = null;
    setStatus(record, prerequisiteState(record), "adapter-registered", { pluginId });
    return publicSnapshot(record);
  }

  async function testConnection(id) {
    requireOpen();
    const record = getRecord(id);
    return queue(record, async () => {
      const prerequisite = prerequisiteState(record);
      if (prerequisite !== "disconnected") {
        setStatus(record, prerequisite, "test-skipped");
        return publicSnapshot(record);
      }
      const previousStatus = record.connected ? "connected" : "disconnected";
      setStatus(record, "testing", "test-started");
      try {
        const result = await callAdapter(record, "test");
        if (!result || result.ok !== true) throw connectionError("CONNECTION_TEST_REJECTED", "Adapter did not confirm the test.", 502);
        record.lastTest = { ok: true, at: now() };
        record.lastError = null;
        setStatus(record, previousStatus, "test-succeeded");
      } catch (error) {
        record.lastTest = { ok: false, at: now() };
        recordFailure(record, "test", error);
      }
      return publicSnapshot(record);
    });
  }

  async function connect(id) {
    requireOpen();
    const record = getRecord(id);
    return queue(record, async () => {
      if (record.connected) return publicSnapshot(record);
      const prerequisite = prerequisiteState(record);
      if (prerequisite !== "disconnected") {
        setStatus(record, prerequisite, "connect-skipped");
        return publicSnapshot(record);
      }
      setStatus(record, "connecting", "connect-started");
      try {
        const result = await callAdapter(record, "connect");
        if (!result || result.connected !== true) throw connectionError("CONNECTION_NOT_CONFIRMED", "Adapter did not confirm the connection.", 502);
        record.session = result.session;
        record.connected = true;
        record.lastError = null;
        setStatus(record, "connected", "connect-succeeded");
      } catch (error) {
        record.session = undefined;
        recordFailure(record, "connect", error);
      }
      return publicSnapshot(record);
    });
  }

  async function disconnect(id) {
    const record = getRecord(id);
    return queue(record, async () => {
      if (!record.connected) {
        if (!closed) setStatus(record, prerequisiteState(record), "disconnect-skipped");
        return publicSnapshot(record);
      }
      setStatus(record, "disconnecting", "disconnect-started");
      try {
        const result = await callAdapter(record, "disconnect");
        if (!result || result.disconnected !== true) throw connectionError("DISCONNECT_NOT_CONFIRMED", "Adapter did not confirm disconnection.", 502);
        record.session = undefined;
        record.connected = false;
        record.lastError = null;
        setStatus(record, "disconnected", "disconnect-succeeded");
      } catch (error) {
        recordFailure(record, "disconnect", error);
      }
      return publicSnapshot(record);
    });
  }

  async function disposeRegistration(record) {
    await record.pending;
    const registration = record.registration;
    if (!registration) return { disconnected: false, disposed: false };
    const wasConnected = record.connected;
    const disconnected = wasConnected
      ? (await disconnect(record.catalog.id)).status === "disconnected"
      : false;
    let disposed = false;
    if (typeof registration.adapter.dispose === "function") {
      try {
        await withTimeout(
          (signal) => registration.adapter.dispose({ service: record.catalog.id, signal }),
          `${record.catalog.name} adapter disposal`,
        );
        disposed = true;
      } catch (error) {
        addEvent(record, "adapter-dispose-failed", record.status, {
          code: error?.code === "CONNECTION_TIMEOUT" ? "CONNECTION_TIMEOUT" : "CONNECTION_ADAPTER_FAILED",
        });
      }
    }
    record.registration = null;
    record.session = undefined;
    record.connected = false;
    record.lastError = null;
    setStatus(record, prerequisiteState(record), "adapter-removed", { pluginId: registration.pluginId });
    return { disconnected, disposed };
  }

  async function unregisterAdapter(service, pluginId) {
    requireOpen();
    const record = getRecord(service);
    if (!record.registration) return publicSnapshot(record);
    if (pluginId && record.registration.pluginId !== pluginId) {
      throw connectionError("CONNECTION_ADAPTER_OWNER_MISMATCH", `${pluginId} does not own the ${service} adapter.`, 403);
    }
    await disposeRegistration(record);
    return publicSnapshot(record);
  }

  function history({ service, limit = historyLimit } = {}) {
    if (!Number.isInteger(limit) || limit < 1) throw connectionError("INVALID_CONNECTION_INPUT", "History limit must be a positive integer.");
    if (service) getRecord(service);
    return structuredClone(events.filter((event) => !service || event.connectionId === service).slice(-limit));
  }

  async function removePlugin(pluginId) {
    requireOpen();
    requireIdentifier(pluginId, "Plugin id");
    const owned = [...records.values()].filter((record) => record.registration?.pluginId === pluginId);
    let disconnected = 0;
    let disposed = 0;
    for (const record of owned) {
      const result = await disposeRegistration(record);
      disconnected += Number(result.disconnected);
      disposed += Number(result.disposed);
    }
    return { adapters: owned.length, disconnected, disposed };
  }

  async function close() {
    if (closed) return;
    for (const record of records.values()) await disposeRegistration(record);
    closed = true;
  }

  return {
    catalog: catalogSnapshot,
    close,
    configure,
    connect,
    disconnect,
    get,
    history,
    list,
    registerAdapter,
    removePlugin,
    status: get,
    test: testConnection,
    unregisterAdapter,
  };
}
