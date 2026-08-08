const HOST_PLUGIN_ID = "preacherman-host";
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const CALLER_FIELDS = new Set(["pluginId", "callerPluginId", "ownerPluginId", "providerPluginId"]);

export const AIRI_ECOSYSTEM_KIT_DEFINITIONS = Object.freeze([
  {
    name: "widget",
    version: "1.0.0",
    description: "Register and manage host-rendered AIRI widgets.",
    capabilities: ["register", "list", "get", "update", "remove", "report-error", "clear-error"],
  },
  {
    name: "gamelet",
    version: "1.0.0",
    description: "Register interactive modules and manage isolated Gamelet sessions.",
    capabilities: [
      "register", "unregister", "discover", "start", "action", "get-session", "list-sessions",
      "pause", "resume", "stop", "destroy",
    ],
  },
  {
    name: "provider",
    version: "1.0.0",
    description: "Register and invoke host-configured LLM, ASR, TTS, and Vision providers.",
    capabilities: ["register-adapter", "unregister-adapter", "catalog", "get", "test", "list-models", "invoke"],
  },
  {
    name: "connection",
    version: "1.0.0",
    description: "Register external service adapters and inspect their host-managed state.",
    capabilities: ["register-adapter", "unregister-adapter", "catalog", "list", "status", "history"],
  },
  {
    name: "computer-vision",
    version: "1.0.0",
    description: "Register Vision and Computer Use adapters and request bounded host operations.",
    capabilities: [
      "register-adapter", "unregister-adapter", "register-computer-adapter", "unregister-computer-adapter",
      "catalog", "list", "status", "test", "invoke", "computer-status", "test-computer",
      "observe", "inspect-dom", "request-action", "logs",
    ],
  },
  {
    name: "memory",
    version: "1.0.0",
    description: "Access plugin-scoped Persona, session, long-term memory, and recent conversation operations.",
    capabilities: [
      "access-policy", "create-persona", "list-personas", "selected-persona", "select-persona",
      "update-persona", "delete-persona", "remember", "recall", "delete-memory",
      "recent-conversations", "audit",
    ],
  },
]);

function facadeError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

function requirePluginId(value, label = "Plugin id") {
  if (typeof value !== "string" || !PLUGIN_ID_PATTERN.test(value)) {
    throw facadeError("INVALID_ECOSYSTEM_CALLER", `${label} must use lowercase letters, numbers, and hyphens.`);
  }
  return value;
}

function requireObject(value, label = "Binding input") {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw facadeError("INVALID_ECOSYSTEM_INPUT", `${label} must be an object.`);
  }
  return value;
}

function pluginInput(input, context, label) {
  const value = requireObject(input, label);
  for (const field of CALLER_FIELDS) {
    if (Object.hasOwn(value, field)) {
      throw facadeError(
        "CALLER_ID_IN_BODY_FORBIDDEN",
        `${label} cannot supply ${field}; the host captures plugin identity from the Binding context.`,
        403,
      );
    }
  }
  return { value, callerPluginId: requirePluginId(context?.callerPluginId, "Binding caller plugin id") };
}

function requireRuntime(runtime, methods, label) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError(`${label} runtime is required.`);
  }
  for (const method of methods) {
    if (typeof runtime[method] !== "function") throw new TypeError(`${label} runtime requires ${method}().`);
  }
  return runtime;
}

function ensureHostKit(kits, definition, hostPluginId) {
  let current;
  try {
    current = kits.get(definition.name);
  } catch (error) {
    if (error?.code !== "KIT_NOT_FOUND") throw error;
    return { kit: kits.register(definition, { providerId: hostPluginId }), created: true };
  }
  const hostProvidesKit = current.providers?.some((provider) => provider.pluginId === hostPluginId);
  const missing = definition.capabilities.filter((capability) => !current.capabilities.includes(capability));
  if (current.version !== definition.version || !hostProvidesKit || missing.length > 0) {
    throw facadeError(
      "ECOSYSTEM_KIT_CONFLICT",
      `Host AIRI kit ${definition.name}@${definition.version} conflicts with the registered Kit definition.`,
      409,
      { actualVersion: current.version, hostProvidesKit: Boolean(hostProvidesKit), missingCapabilities: missing },
    );
  }
  return { kit: current, created: false };
}

function memoryHandler(getMemoryRuntime, operation) {
  return async (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, `Memory ${operation}`);
    const runtime = await getMemoryRuntime(callerPluginId);
    if (!runtime || typeof runtime !== "object") {
      throw facadeError("MEMORY_RUNTIME_UNAVAILABLE", `Memory runtime is unavailable for ${callerPluginId}.`, 503);
    }
    switch (operation) {
      case "access-policy": return runtime.getAccessPolicy();
      case "create-persona": return runtime.createPersona(value);
      case "list-personas": return runtime.listPersonas();
      case "selected-persona": return runtime.getSelectedPersona();
      case "select-persona": return runtime.selectPersona(value.personaId);
      case "update-persona": return runtime.updatePersona(value.personaId, value.patch);
      case "delete-persona": return runtime.deletePersona(value.personaId);
      case "remember": return runtime.remember(value);
      case "recall": return runtime.recall(value);
      case "delete-memory": return runtime.deleteMemory(value);
      case "recent-conversations": return runtime.readRecentConversations(value);
      case "audit": return runtime.listAuditEvents(value);
      default: throw facadeError("ECOSYSTEM_OPERATION_NOT_FOUND", `Unknown Memory operation: ${operation}.`, 404);
    }
  };
}

export function createAiriEcosystemBindingFacade({
  kits,
  bindings,
  widgetRuntime,
  gameletRuntime,
  providerRuntime,
  connectionRuntime,
  computerVisionRuntime,
  getMemoryRuntime,
  releaseMemoryRuntime,
  hostPluginId = HOST_PLUGIN_ID,
} = {}) {
  requirePluginId(hostPluginId, "Host plugin id");
  requireRuntime(kits, ["get", "register", "unregister", "ownedBy", "removePlugin"], "Kit Registry");
  requireRuntime(bindings, ["bind", "unbind", "removeKit", "removePlugin"], "Binding Registry");
  requireRuntime(widgetRuntime, ["register", "list", "get", "update", "remove", "reportError", "clearError", "removePlugin"], "Widget");
  requireRuntime(gameletRuntime, [
    "register", "unregister", "discover", "startSession", "sendAction", "getSession", "listSessions",
    "pauseSession", "resumeSession", "stopSession", "destroySession", "removePlugin",
  ], "Gamelet");
  requireRuntime(providerRuntime, ["registerAdapter", "unregisterAdapter", "catalog", "get", "test", "listModels", "invoke", "removePlugin"], "Provider");
  requireRuntime(connectionRuntime, ["registerAdapter", "unregisterAdapter", "catalog", "list", "status", "history", "removePlugin"], "Connection");
  requireRuntime(computerVisionRuntime, [
    "registerAdapter", "unregisterAdapter", "registerComputerUseAdapter", "unregisterComputerUseAdapter",
    "catalog", "list", "status", "test", "invoke", "computerUseStatus", "testComputerUse",
    "observe", "inspectDom", "requestAction", "logs", "removePlugin",
  ], "Computer/Vision");
  if (typeof getMemoryRuntime !== "function") throw new TypeError("getMemoryRuntime() is required.");
  if (releaseMemoryRuntime !== undefined && typeof releaseMemoryRuntime !== "function") {
    throw new TypeError("releaseMemoryRuntime must be a function.");
  }

  const createdKits = [];
  const registeredBindings = [];
  let closed = false;

  try {
    for (const definition of AIRI_ECOSYSTEM_KIT_DEFINITIONS) {
      const result = ensureHostKit(kits, definition, hostPluginId);
      if (result.created) createdKits.push(definition.name);
    }

    function bind(kit, operation, handler) {
      bindings.bind({ pluginId: hostPluginId, kit, operation, versionRange: "^1.0.0", handler });
      registeredBindings.push({ kit, operation });
    }

  bind("widget", "register", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Widget registration");
    return widgetRuntime.register({ ...value, pluginId: callerPluginId });
  });
  bind("widget", "list", (input, context) => {
    const { callerPluginId } = pluginInput(input, context, "Widget list");
    return widgetRuntime.list({ pluginId: callerPluginId });
  });
  for (const [operation, method] of [["get", "get"], ["update", "update"], ["remove", "remove"], ["report-error", "reportError"], ["clear-error", "clearError"]]) {
    bind("widget", operation, (input, context) => {
      const { value, callerPluginId } = pluginInput(input, context, `Widget ${operation}`);
      return widgetRuntime[method]({ ...value, pluginId: callerPluginId });
    });
  }

  bind("gamelet", "register", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Gamelet registration");
    return gameletRuntime.register({ ...value, pluginId: callerPluginId });
  });
  bind("gamelet", "unregister", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Gamelet unregister");
    return gameletRuntime.unregister(value.gameletId, callerPluginId);
  });
  bind("gamelet", "discover", (input, context) => {
    pluginInput(input, context, "Gamelet discovery");
    return gameletRuntime.discover();
  });
  const gameletCalls = [
    ["start", "startSession", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
    ["action", "sendAction", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
    ["get-session", "getSession", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
    ["list-sessions", "listSessions", ({ callerPluginId }) => ({ pluginId: callerPluginId })],
    ["pause", "pauseSession", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
    ["resume", "resumeSession", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
    ["stop", "stopSession", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
    ["destroy", "destroySession", ({ value, callerPluginId }) => ({ ...value, pluginId: callerPluginId })],
  ];
  for (const [operation, method, argumentsFor] of gameletCalls) {
    bind("gamelet", operation, (input, context) => gameletRuntime[method](argumentsFor(
      pluginInput(input, context, `Gamelet ${operation}`),
    )));
  }

  bind("provider", "register-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Provider adapter registration");
    return providerRuntime.registerAdapter({ ...value, pluginId: callerPluginId });
  });
  bind("provider", "unregister-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Provider adapter unregister");
    return providerRuntime.unregisterAdapter(value.providerId, callerPluginId);
  });
  bind("provider", "catalog", (input, context) => {
    const { value } = pluginInput(input, context, "Provider catalog");
    return providerRuntime.catalog(value);
  });
  bind("provider", "get", (input, context) => {
    const { value } = pluginInput(input, context, "Provider get");
    return providerRuntime.get(value.providerId);
  });
  bind("provider", "test", (input, context) => {
    const { value } = pluginInput(input, context, "Provider test");
    return providerRuntime.test(value.providerId, { capability: value.capability });
  });
  bind("provider", "list-models", (input, context) => {
    const { value } = pluginInput(input, context, "Provider model list");
    return providerRuntime.listModels(value.providerId);
  });
  bind("provider", "invoke", (input, context) => {
    const { value } = pluginInput(input, context, "Provider invocation");
    return providerRuntime.invoke(value.providerId, { capability: value.capability, input: value.input });
  });

  bind("connection", "register-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Connection adapter registration");
    return connectionRuntime.registerAdapter({ ...value, pluginId: callerPluginId });
  });
  bind("connection", "unregister-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Connection adapter unregister");
    return connectionRuntime.unregisterAdapter(value.service, callerPluginId);
  });
  for (const [operation, method] of [["catalog", "catalog"], ["list", "list"]]) {
    bind("connection", operation, (input, context) => {
      pluginInput(input, context, `Connection ${operation}`);
      return connectionRuntime[method]();
    });
  }
  bind("connection", "status", (input, context) => {
    const { value } = pluginInput(input, context, "Connection status");
    return connectionRuntime.status(value.service);
  });
  bind("connection", "history", (input, context) => {
    const { value } = pluginInput(input, context, "Connection history");
    return connectionRuntime.history(value);
  });

  bind("computer-vision", "register-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Computer/Vision adapter registration");
    return computerVisionRuntime.registerAdapter({ ...value, pluginId: callerPluginId });
  });
  bind("computer-vision", "unregister-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Computer/Vision adapter unregister");
    return computerVisionRuntime.unregisterAdapter(value.capability, callerPluginId);
  });
  bind("computer-vision", "register-computer-adapter", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Computer Use adapter registration");
    return computerVisionRuntime.registerComputerUseAdapter({ ...value, pluginId: callerPluginId });
  });
  bind("computer-vision", "unregister-computer-adapter", (input, context) => {
    const { callerPluginId } = pluginInput(input, context, "Computer Use adapter unregister");
    return computerVisionRuntime.unregisterComputerUseAdapter(callerPluginId);
  });
  for (const [operation, method] of [["catalog", "catalog"], ["list", "list"], ["computer-status", "computerUseStatus"], ["test-computer", "testComputerUse"]]) {
    bind("computer-vision", operation, (input, context) => {
      pluginInput(input, context, `Computer/Vision ${operation}`);
      return computerVisionRuntime[method]();
    });
  }
  for (const [operation, method] of [["status", "status"], ["test", "test"]]) {
    bind("computer-vision", operation, (input, context) => {
      const { value } = pluginInput(input, context, `Computer/Vision ${operation}`);
      return computerVisionRuntime[method](value.capability);
    });
  }
  bind("computer-vision", "invoke", (input, context) => {
    const { value } = pluginInput(input, context, "Computer/Vision invocation");
    return computerVisionRuntime.invoke(value.capability, value.input);
  });
  for (const [operation, method] of [["observe", "observe"], ["inspect-dom", "inspectDom"], ["request-action", "requestAction"]]) {
    bind("computer-vision", operation, (input, context) => {
      const { value, callerPluginId } = pluginInput(input, context, `Computer Use ${operation}`);
      return computerVisionRuntime[method]({ ...value, callerPluginId });
    });
  }
  bind("computer-vision", "logs", (input, context) => {
    const { value, callerPluginId } = pluginInput(input, context, "Computer Use logs");
    return computerVisionRuntime.logs({ ...value, callerPluginId });
  });

    for (const operation of AIRI_ECOSYSTEM_KIT_DEFINITIONS.find((definition) => definition.name === "memory").capabilities) {
      bind("memory", operation, memoryHandler(getMemoryRuntime, operation));
    }
  } catch (error) {
    for (const { kit, operation } of [...registeredBindings].reverse()) bindings.unbind(kit, operation, hostPluginId);
    for (const kit of [...createdKits].reverse()) kits.unregister(kit);
    throw error;
  }

  async function removePlugin(pluginId) {
    requirePluginId(pluginId);
    const cleanupOperations = [
      ["widget", () => widgetRuntime.removePlugin(pluginId)],
      ["gamelet", () => gameletRuntime.removePlugin(pluginId)],
      ["provider", () => providerRuntime.removePlugin(pluginId)],
      ["connection", () => connectionRuntime.removePlugin(pluginId)],
      ["computer-vision", () => computerVisionRuntime.removePlugin(pluginId)],
      ...(releaseMemoryRuntime ? [["memory", () => releaseMemoryRuntime(pluginId)]] : []),
    ];
    const settled = await Promise.allSettled(cleanupOperations.map(([, operation]) => Promise.resolve().then(operation)));
    const resources = Object.fromEntries(cleanupOperations.map(([name], index) => [name, settled[index].status === "fulfilled"
      ? { status: "removed", result: settled[index].value }
      : { status: "failed", error: settled[index].reason instanceof Error ? settled[index].reason.message : String(settled[index].reason) }]));

    const ownedKits = kits.ownedBy(pluginId).map((kit) => kit.name);
    const associations = {
      bindings: bindings.removePlugin(pluginId) + ownedKits.reduce((count, kit) => count + bindings.removeKit(kit), 0),
      kits: kits.removePlugin(pluginId),
    };
    if (settled.some((result) => result.status === "rejected")) {
      throw facadeError("ECOSYSTEM_PLUGIN_CLEANUP_FAILED", `One or more AIRI resources failed to clean up for ${pluginId}.`, 500, { resources, associations });
    }
    return { pluginId, resources, associations };
  }

  function close() {
    if (closed) return { bindings: 0, kits: 0 };
    for (const { kit, operation } of [...registeredBindings].reverse()) bindings.unbind(kit, operation, hostPluginId);
    for (const kit of [...createdKits].reverse()) kits.unregister(kit);
    closed = true;
    return { bindings: registeredBindings.length, kits: createdKits.length };
  }

  return {
    close,
    definitions: AIRI_ECOSYSTEM_KIT_DEFINITIONS,
    removePlugin,
    registeredBindings: () => registeredBindings.map((binding) => ({ ...binding, pluginId: hostPluginId })),
  };
}
