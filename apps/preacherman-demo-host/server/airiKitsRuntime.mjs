const KIT_PHASES = new Set(["registered", "ready", "stopped", "error"]);

export const CORE_KIT_DEFINITIONS = Object.freeze([
  {
    name: "tools",
    version: "1.0.0",
    description: "Register, discover, remove, and invoke tools through the host.",
    capabilities: ["register", "unregister", "list", "call"],
  },
  {
    name: "task",
    version: "1.0.0",
    description: "Create and control persistent Preacherman TaskRun records.",
    capabilities: ["create", "get", "list", "cancel", "retry"],
  },
  {
    name: "ledger",
    version: "1.0.0",
    description: "Append and read auditable task, tool-call, and artifact records.",
    capabilities: ["append", "get", "list", "write-artifact"],
  },
]);

function runtimeError(code, message, statusCode = 400, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function requireName(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw runtimeError("INVALID_KIT_INPUT", `${label} must use lowercase letters, numbers, and hyphens.`);
  }
  return value;
}

function parseVersion(value, label = "Version") {
  if (typeof value !== "string") throw runtimeError("INVALID_KIT_VERSION", `${label} must be a semantic version.`);
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw runtimeError("INVALID_KIT_VERSION", `${label} must use major.minor.patch format.`);
  return match.slice(1).map(Number);
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function isVersionCompatible(version, range = "*") {
  const current = parseVersion(version);
  if (range === "*" || range === undefined) return true;
  if (typeof range !== "string") throw runtimeError("INVALID_KIT_VERSION", "Version range must be a string.");
  if (range.startsWith("^")) {
    const minimum = parseVersion(range.slice(1), "Version range");
    const maximum = minimum[0] > 0
      ? [minimum[0] + 1, 0, 0]
      : minimum[1] > 0 ? [0, minimum[1] + 1, 0] : [0, 0, minimum[2] + 1];
    return compareVersion(current, minimum) >= 0 && compareVersion(current, maximum) < 0;
  }
  if (range.startsWith("~")) {
    const minimum = parseVersion(range.slice(1), "Version range");
    const maximum = [minimum[0], minimum[1] + 1, 0];
    return compareVersion(current, minimum) >= 0 && compareVersion(current, maximum) < 0;
  }
  return compareVersion(current, parseVersion(range, "Version range")) === 0;
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw runtimeError("INVALID_KIT_INPUT", "Kit definition must be an object.");
  }
  const name = requireName(definition.name, "Kit name");
  parseVersion(definition.version);
  if (typeof definition.description !== "string" || !definition.description.trim()) {
    throw runtimeError("INVALID_KIT_INPUT", `Kit ${name} requires a description.`);
  }
  if (!Array.isArray(definition.capabilities) || definition.capabilities.length === 0) {
    throw runtimeError("INVALID_KIT_INPUT", `Kit ${name} requires at least one capability.`);
  }
  const capabilities = [...new Set(definition.capabilities.map((capability) => requireName(capability, "Kit capability")))];
  return { name, version: definition.version, description: definition.description.trim(), capabilities };
}

function publicKit(record) {
  return structuredClone({
    ...record.definition,
    phase: record.phase,
    lifecycle: record.lifecycle,
    providers: [...record.providers.values()],
    consumers: [...record.consumers.values()],
  });
}

export function createKitRegistry({ definitions = [], now = () => new Date().toISOString() } = {}) {
  const records = new Map();

  function getRecord(name) {
    const record = records.get(name);
    if (!record) throw runtimeError("KIT_NOT_FOUND", `Unknown AIRI kit: ${name}`, 404);
    return record;
  }

  function register(definition, { providerId, phase = "ready" } = {}) {
    const normalized = normalizeDefinition(definition);
    if (!KIT_PHASES.has(phase)) throw runtimeError("INVALID_KIT_PHASE", `Invalid AIRI kit phase: ${phase}`);
    if (records.has(normalized.name)) throw runtimeError("KIT_ALREADY_REGISTERED", `AIRI kit is already registered: ${normalized.name}`, 409);
    const timestamp = now();
    const record = {
      definition: normalized,
      phase,
      lifecycle: [{ phase: "registered", at: timestamp }, ...(phase === "registered" ? [] : [{ phase, at: timestamp }])],
      providers: new Map(),
      consumers: new Map(),
    };
    records.set(normalized.name, record);
    if (providerId) attachProvider(providerId, normalized.name, normalized.version);
    return publicKit(record);
  }

  function unregister(name) {
    const record = getRecord(name);
    records.delete(name);
    return publicKit({
      ...record,
      phase: "stopped",
      lifecycle: [...record.lifecycle, { phase: "stopped", at: now() }],
    });
  }

  function setPhase(name, phase) {
    if (!KIT_PHASES.has(phase)) throw runtimeError("INVALID_KIT_PHASE", `Invalid AIRI kit phase: ${phase}`);
    const record = getRecord(name);
    if (record.phase !== phase) {
      record.phase = phase;
      record.lifecycle.push({ phase, at: now() });
    }
    return publicKit(record);
  }

  function assertCompatible(name, range = "*") {
    const record = getRecord(name);
    if (!isVersionCompatible(record.definition.version, range)) {
      throw runtimeError(
        "KIT_VERSION_INCOMPATIBLE",
        `AIRI kit ${name}@${record.definition.version} does not satisfy ${range}.`,
        409,
      );
    }
    return publicKit(record);
  }

  function attachProvider(pluginId, name, version) {
    requireName(pluginId, "Plugin id");
    const record = getRecord(name);
    if (version !== record.definition.version) {
      throw runtimeError("KIT_VERSION_INCOMPATIBLE", `Provider ${pluginId} offers ${name}@${version}; host requires ${record.definition.version}.`, 409);
    }
    parseVersion(version, "Provider version");
    record.providers.set(pluginId, { pluginId, version, attachedAt: now() });
    return publicKit(record);
  }

  function attachConsumer(pluginId, name, versionRange = "*") {
    requireName(pluginId, "Plugin id");
    const record = getRecord(name);
    assertCompatible(name, versionRange);
    record.consumers.set(pluginId, { pluginId, versionRange, attachedAt: now() });
    return publicKit(record);
  }

  function assertConsumer(pluginId, name, versionRange = "*") {
    requireName(pluginId, "Plugin id");
    const record = getRecord(name);
    const consumer = record.consumers.get(pluginId);
    if (!consumer) {
      throw runtimeError("KIT_CONSUMER_REQUIRED", `Plugin ${pluginId} must require AIRI kit ${name} before invoking it.`, 403);
    }
    if (!isVersionCompatible(record.definition.version, consumer.versionRange)
      || !isVersionCompatible(record.definition.version, versionRange)) {
      throw runtimeError(
        "KIT_CONSUMER_VERSION_FORBIDDEN",
        `Plugin ${pluginId} cannot invoke AIRI kit ${name}@${record.definition.version} with ${versionRange}.`,
        403,
      );
    }
    return publicKit(record);
  }

  function discover({ capability, pluginId } = {}) {
    return [...records.values()]
      .filter((record) => !capability || record.definition.capabilities.includes(capability))
      .filter((record) => !pluginId || record.providers.has(pluginId) || record.consumers.has(pluginId))
      .map(publicKit)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function removePlugin(pluginId) {
    let removed = 0;
    for (const record of records.values()) {
      removed += Number(record.providers.delete(pluginId));
      removed += Number(record.consumers.delete(pluginId));
    }
    return removed;
  }

  for (const definition of definitions) register(definition, { providerId: "preacherman-host" });

  return { assertCompatible, assertConsumer, attachConsumer, attachProvider, discover, get: (name) => publicKit(getRecord(name)), register, removePlugin, setPhase, unregister };
}

export function createBindingRegistry({ kits }) {
  if (!kits) throw runtimeError("INVALID_KIT_INPUT", "Binding registry requires a Kit Registry.");
  const bindings = new Map();
  const keyFor = (kit, operation) => `${kit}::${operation}`;

  function bind({ pluginId, kit, operation, versionRange = "*", handler }) {
    requireName(pluginId, "Plugin id");
    requireName(operation, "Binding operation");
    const kitRecord = kits.assertCompatible(kit, versionRange);
    if (!kitRecord.capabilities.includes(operation)) {
      throw runtimeError("KIT_OPERATION_NOT_FOUND", `AIRI kit ${kit} does not define operation ${operation}.`, 404);
    }
    if (typeof handler !== "function") throw runtimeError("INVALID_KIT_INPUT", "Binding handler must be a function.");
    const key = keyFor(kit, operation);
    if (bindings.has(key)) throw runtimeError("BINDING_ALREADY_REGISTERED", `Binding already exists: ${key}`, 409);
    const binding = { pluginId, kit, operation, versionRange, handler };
    bindings.set(key, binding);
    return structuredClone({ pluginId, kit, operation, versionRange });
  }

  function unbind(kit, operation, pluginId) {
    const key = keyFor(kit, operation);
    const binding = bindings.get(key);
    if (!binding) throw runtimeError("BINDING_NOT_FOUND", `Missing AIRI binding: ${key}`, 404);
    if (pluginId && binding.pluginId !== pluginId) {
      throw runtimeError("BINDING_OWNER_MISMATCH", `Plugin ${pluginId} does not own binding ${key}.`, 403);
    }
    bindings.delete(key);
    return { pluginId: binding.pluginId, kit, operation, versionRange: binding.versionRange };
  }

  async function executeBinding({ callerPluginId, trustedCaller, kit, operation, versionRange, input, context }) {
    kits.assertCompatible(kit, versionRange);
    const key = keyFor(kit, operation);
    const binding = bindings.get(key);
    if (!binding) throw runtimeError("BINDING_NOT_FOUND", `Missing AIRI binding: ${key}`, 404);
    kits.assertCompatible(kit, binding.versionRange);
    try {
      return await binding.handler(input, {
        ...context,
        kit,
        operation,
        callerPluginId,
        providerPluginId: binding.pluginId,
        trustedCaller,
      });
    } catch (cause) {
      throw runtimeError(
        "BINDING_EXECUTION_FAILED",
        `AIRI binding failed: ${key}: ${cause instanceof Error ? cause.message : String(cause)}`,
        500,
        cause,
      );
    }
  }

  function splitInvocationContext(context) {
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      throw runtimeError("INVALID_KIT_INPUT", "Binding context must be an object.");
    }
    const { versionRange = "*", ...handlerContext } = context;
    return { handlerContext, versionRange };
  }

  async function invokeAs(callerPluginId, kit, operation, input, context = {}) {
    requireName(callerPluginId, "Caller plugin id");
    const { handlerContext, versionRange } = splitInvocationContext(context);
    kits.assertConsumer(callerPluginId, kit, versionRange);
    return executeBinding({
      callerPluginId,
      trustedCaller: false,
      kit,
      operation,
      versionRange,
      input,
      context: handlerContext,
    });
  }

  async function invokeTrusted(callerPluginId, kit, operation, input, context = {}) {
    requireName(callerPluginId, "Trusted caller id");
    const { handlerContext, versionRange } = splitInvocationContext(context);
    return executeBinding({
      callerPluginId,
      trustedCaller: true,
      kit,
      operation,
      versionRange,
      input,
      context: handlerContext,
    });
  }

  // Compatibility bridge for current host call sites. Plugin calls already pass
  // callerPluginId and therefore take the consumer-authorized path. New host
  // integrations should use invokeTrusted() explicitly.
  function invoke({ kit, operation, versionRange = "*", input, context = {} }) {
    const callerPluginId = context?.callerPluginId;
    const invocationContext = { ...context, versionRange };
    delete invocationContext.callerPluginId;
    return callerPluginId
      ? invokeAs(callerPluginId, kit, operation, input, invocationContext)
      : invokeTrusted("preacherman-host", kit, operation, input, invocationContext);
  }

  function list({ pluginId, kit } = {}) {
    return [...bindings.values()]
      .filter((binding) => !pluginId || binding.pluginId === pluginId)
      .filter((binding) => !kit || binding.kit === kit)
      .map(({ handler: _handler, ...binding }) => structuredClone(binding))
      .sort((left, right) => keyFor(left.kit, left.operation).localeCompare(keyFor(right.kit, right.operation)));
  }

  function removePlugin(pluginId) {
    let removed = 0;
    for (const [key, binding] of bindings) {
      if (binding.pluginId === pluginId) {
        bindings.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return { bind, invoke, invokeAs, invokeTrusted, list, removePlugin, unbind };
}

export function createAiriKitsRuntime({ definitions = CORE_KIT_DEFINITIONS, now } = {}) {
  const kits = createKitRegistry({ definitions, now });
  const bindings = createBindingRegistry({ kits });
  return {
    bindings,
    kits,
    removePlugin(pluginId) {
      return { bindings: bindings.removePlugin(pluginId), associations: kits.removePlugin(pluginId) };
    },
  };
}
