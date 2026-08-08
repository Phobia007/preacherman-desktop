export const AIRI_PROVIDER_CAPABILITIES = Object.freeze(["chat", "asr", "tts", "vision", "image"]);
const PROVIDER_CAPABILITIES = new Set(AIRI_PROVIDER_CAPABILITIES);
const PROVIDER_STATES = Object.freeze({
  ready: "ready",
  configurationRequired: "configuration-required",
  adapterRequired: "adapter-required",
});

export const CORE_PROVIDER_DEFINITIONS = Object.freeze([
  {
    id: "deepseek",
    label: "DeepSeek",
    capabilities: ["chat"],
    requirements: [
      { key: "DEEPSEEK_API_KEY", label: "DeepSeek API key", secret: true, capabilities: ["chat"] },
      { key: "DEEPSEEK_MODEL", label: "DeepSeek model", secret: false, required: false, capabilities: ["chat"] },
    ],
  },
  {
    id: "dashscope",
    label: "DashScope",
    capabilities: ["asr", "tts"],
    requirements: [
      { key: "DASHSCOPE_API_KEY", label: "DashScope API key", secret: true, capabilities: ["asr", "tts"] },
      { key: "DASHSCOPE_WORKSPACE_ID", label: "DashScope workspace ID", secret: false, capabilities: ["asr"] },
    ],
  },
]);

function runtimeError(code, message, statusCode = 400, details = {}, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw runtimeError("INVALID_PROVIDER_INPUT", `${label} must use lowercase letters, numbers, and hyphens.`);
  }
  return value;
}

function normalizeCapabilities(value, label = "Provider capabilities") {
  if (!Array.isArray(value) || value.length === 0) {
    throw runtimeError("INVALID_PROVIDER_INPUT", `${label} must contain at least one capability.`);
  }
  return [...new Set(value.map((capability) => {
    if (!PROVIDER_CAPABILITIES.has(capability)) {
      throw runtimeError("INVALID_PROVIDER_CAPABILITY", `Unsupported AIRI provider capability: ${capability}`);
    }
    return capability;
  }))];
}

function normalizeDefinition(definition, ownerPluginId) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw runtimeError("INVALID_PROVIDER_INPUT", "Provider definition must be an object.");
  }
  const id = requireIdentifier(definition.id, "Provider id");
  const capabilities = normalizeCapabilities(definition.capabilities);
  if (typeof definition.label !== "string" || !definition.label.trim()) {
    throw runtimeError("INVALID_PROVIDER_INPUT", `Provider ${id} requires a label.`);
  }
  const requirements = (definition.requirements || []).map((requirement) => {
    if (!requirement || typeof requirement !== "object" || typeof requirement.key !== "string" || !/^[A-Z][A-Z0-9_]{1,127}$/.test(requirement.key)) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Provider ${id} has an invalid configuration requirement.`);
    }
    const appliesTo = requirement.capabilities === undefined
      ? capabilities
      : normalizeCapabilities(requirement.capabilities, `Requirement ${requirement.key} capabilities`);
    if (appliesTo.some((capability) => !capabilities.includes(capability))) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Requirement ${requirement.key} refers to an undeclared capability.`);
    }
    return {
      key: requirement.key,
      label: typeof requirement.label === "string" && requirement.label.trim() ? requirement.label.trim() : requirement.key,
      secret: requirement.secret !== false,
      required: requirement.required !== false,
      capabilities: appliesTo,
    };
  });
  return { id, label: definition.label.trim(), capabilities, requirements, ownerPluginId };
}

function sensitiveKey(key) {
  return /api[-_]?key|authorization|password|credential|secret|(^|[-_])(access|refresh)?[-_]?token$/i.test(key);
}

function redactText(value, secrets) {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

function sanitize(value, secrets, seen = new WeakSet()) {
  if (typeof value === "string") return redactText(value, secrets);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, secrets, seen));
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    clean[key] = sensitiveKey(key) ? "[REDACTED]" : sanitize(item, secrets, seen);
  }
  return clean;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createDeepSeekAdapter(fetchImpl) {
  return {
    async test({ config, signal }) {
      const response = await fetchImpl("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}` },
        signal,
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek returned HTTP ${response.status}.`);
      return { ok: true, message: "Connected" };
    },
    async invoke({ config, input, signal }) {
      const messages = Array.isArray(input?.messages) ? input.messages : [];
      if (messages.length === 0) throw runtimeError("INVALID_PROVIDER_INPUT", "DeepSeek chat requires at least one message.");
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model || config.DEEPSEEK_MODEL || "deepseek-v4-flash",
          messages,
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
          ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
        }),
        signal,
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek returned HTTP ${response.status}.`);
      return {
        content: payload?.choices?.[0]?.message?.content ?? null,
        model: payload?.model || input.model || config.DEEPSEEK_MODEL || "deepseek-v4-flash",
        usage: payload?.usage || null,
      };
    },
  };
}

export function createAiriProviderRuntime({
  definitions = CORE_PROVIDER_DEFINITIONS,
  getConfig = async () => ({}),
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
} = {}) {
  if (typeof getConfig !== "function") throw runtimeError("INVALID_PROVIDER_INPUT", "Provider runtime requires getConfig().");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw runtimeError("INVALID_PROVIDER_INPUT", "Provider timeout must be a positive number.");
  const providers = new Map();
  const adapters = new Map();

  for (const definition of definitions) {
    const normalized = normalizeDefinition(definition, null);
    if (providers.has(normalized.id)) throw runtimeError("PROVIDER_ALREADY_REGISTERED", `Provider already exists: ${normalized.id}`, 409);
    providers.set(normalized.id, normalized);
  }

  function getDefinition(providerId) {
    const definition = providers.get(providerId);
    if (!definition) throw runtimeError("PROVIDER_NOT_FOUND", `Unknown AIRI provider: ${providerId}`, 404);
    return definition;
  }

  function registerAdapter({ pluginId, providerId, provider, capabilities, test, invoke }) {
    requireIdentifier(pluginId, "Plugin id");
    let pendingDefinition;
    if (provider) {
      pendingDefinition = normalizeDefinition(provider, pluginId);
      if (providerId && providerId !== pendingDefinition.id) throw runtimeError("INVALID_PROVIDER_INPUT", "Provider id does not match its definition.");
      if (providers.has(pendingDefinition.id)) throw runtimeError("PROVIDER_ALREADY_REGISTERED", `Provider already exists: ${pendingDefinition.id}`, 409);
      providerId = pendingDefinition.id;
    }
    const definition = pendingDefinition || getDefinition(providerId);
    if (adapters.has(providerId)) throw runtimeError("PROVIDER_ADAPTER_ALREADY_REGISTERED", `Provider adapter already exists: ${providerId}`, 409);
    const supported = capabilities === undefined ? definition.capabilities : normalizeCapabilities(capabilities, "Adapter capabilities");
    if (supported.some((capability) => !definition.capabilities.includes(capability))) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Adapter ${providerId} declares a capability outside its provider catalog entry.`);
    }
    if (typeof test !== "function" && typeof invoke !== "function") {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Adapter ${providerId} must implement test or invoke.`);
    }
    if (pendingDefinition) providers.set(providerId, pendingDefinition);
    adapters.set(providerId, { pluginId, capabilities: supported, test, invoke });
    return { pluginId, providerId, capabilities: [...supported] };
  }

  function unregisterAdapter(providerId, pluginId) {
    const adapter = adapters.get(providerId);
    if (!adapter) throw runtimeError("PROVIDER_ADAPTER_NOT_FOUND", `Provider adapter is not registered: ${providerId}`, 404);
    if (pluginId && adapter.pluginId !== pluginId) {
      throw runtimeError("PROVIDER_ADAPTER_OWNER_MISMATCH", `Plugin ${pluginId} does not own provider adapter ${providerId}.`, 403);
    }
    adapters.delete(providerId);
    const definition = providers.get(providerId);
    if (definition?.ownerPluginId === adapter.pluginId) providers.delete(providerId);
    return { pluginId: adapter.pluginId, providerId, capabilities: [...adapter.capabilities] };
  }

  async function configuration(definition) {
    const source = await getConfig();
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw runtimeError("PROVIDER_CONFIG_FAILED", "Provider configuration source did not return an object.", 500);
    }
    const config = Object.fromEntries(definition.requirements
      .filter((requirement) => Object.hasOwn(source, requirement.key))
      .map((requirement) => [requirement.key, source[requirement.key]]));
    const secrets = definition.requirements
      .filter((requirement) => requirement.secret && typeof config[requirement.key] === "string")
      .map((requirement) => config[requirement.key])
      .filter(Boolean);
    return { config, secrets };
  }

  function capabilityState(definition, adapter, config, capability) {
    const missing = definition.requirements
      .filter((requirement) => requirement.required && requirement.capabilities.includes(capability) && !config[requirement.key])
      .map((requirement) => ({ key: requirement.key, label: requirement.label }));
    if (missing.length > 0) return { state: PROVIDER_STATES.configurationRequired, missing };
    if (!adapter || !adapter.capabilities.includes(capability)) return { state: PROVIDER_STATES.adapterRequired, missing: [] };
    return { state: PROVIDER_STATES.ready, missing: [] };
  }

  async function publicProvider(definition) {
    const adapter = adapters.get(definition.id);
    const { config } = await configuration(definition);
    return {
      id: definition.id,
      label: definition.label,
      sourcePluginId: definition.ownerPluginId,
      adapter: adapter ? { pluginId: adapter.pluginId, capabilities: [...adapter.capabilities] } : null,
      capabilities: Object.fromEntries(definition.capabilities.map((capability) => {
        const status = capabilityState(definition, adapter, config, capability);
        return [capability, { state: status.state, requirements: definition.requirements
          .filter((requirement) => requirement.capabilities.includes(capability))
          .map((requirement) => ({ key: requirement.key, label: requirement.label, required: requirement.required, configured: Boolean(config[requirement.key]) })) }];
      })),
    };
  }

  async function catalog({ capability } = {}) {
    if (capability !== undefined && !PROVIDER_CAPABILITIES.has(capability)) {
      throw runtimeError("INVALID_PROVIDER_CAPABILITY", `Unsupported AIRI provider capability: ${capability}`);
    }
    const visible = [...providers.values()].filter((definition) => !capability || definition.capabilities.includes(capability));
    return Promise.all(visible.sort((left, right) => left.id.localeCompare(right.id)).map(publicProvider));
  }

  async function resolveOperation(providerId, capability) {
    const definition = getDefinition(providerId);
    if (!PROVIDER_CAPABILITIES.has(capability) || !definition.capabilities.includes(capability)) {
      throw runtimeError("PROVIDER_CAPABILITY_NOT_FOUND", `Provider ${providerId} does not declare ${capability}.`, 404);
    }
    const adapter = adapters.get(providerId);
    const { config, secrets } = await configuration(definition);
    const status = capabilityState(definition, adapter, config, capability);
    if (status.state === PROVIDER_STATES.configurationRequired) {
      throw runtimeError(
        "PROVIDER_CONFIGURATION_REQUIRED",
        `Provider ${providerId} requires configuration for ${capability}.`,
        409,
        { state: status.state, missingRequirements: status.missing },
      );
    }
    if (status.state === PROVIDER_STATES.adapterRequired) {
      throw runtimeError("PROVIDER_ADAPTER_REQUIRED", `Provider ${providerId} requires an adapter for ${capability}.`, 409, { state: status.state });
    }
    return { adapter, config, definition, secrets };
  }

  async function callAdapter(providerId, capability, operation, input) {
    const { adapter, config, secrets } = await resolveOperation(providerId, capability);
    const handler = adapter[operation];
    if (typeof handler !== "function") {
      throw runtimeError(`PROVIDER_${operation.toUpperCase()}_UNSUPPORTED`, `Provider ${providerId} does not support ${operation}.`, 409);
    }
    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => handler({ capability, config, input, signal: controller.signal })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(runtimeError("PROVIDER_TIMEOUT", `Provider ${providerId} ${operation} timed out.`, 504));
          }, timeoutMs);
        }),
      ]);
      return sanitize(result, secrets);
    } catch (cause) {
      if (cause?.code === "PROVIDER_TIMEOUT" || cause?.code === "INVALID_PROVIDER_INPUT") throw cause;
      throw runtimeError(
        "PROVIDER_ADAPTER_FAILED",
        redactText(`Provider ${providerId} ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`, secrets),
        502,
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async function test(providerId, { capability } = {}) {
    const definition = getDefinition(providerId);
    const selected = capability || definition.capabilities[0];
    try {
      const result = await callAdapter(providerId, selected, "test");
      return { providerId, capability: selected, state: PROVIDER_STATES.ready, ...result };
    } catch (error) {
      if (error?.code !== "PROVIDER_CONFIGURATION_REQUIRED") throw error;
      return {
        providerId,
        capability: selected,
        state: PROVIDER_STATES.configurationRequired,
        ok: false,
        missingRequirements: error.missingRequirements,
      };
    }
  }

  function removePlugin(pluginId) {
    let adaptersRemoved = 0;
    let providersRemoved = 0;
    for (const [providerId, adapter] of [...adapters]) {
      if (adapter.pluginId !== pluginId) continue;
      adapters.delete(providerId);
      adaptersRemoved += 1;
    }
    for (const [providerId, definition] of [...providers]) {
      if (definition.ownerPluginId !== pluginId) continue;
      providers.delete(providerId);
      providersRemoved += 1;
    }
    return { adapters: adaptersRemoved, providers: providersRemoved };
  }

  if (providers.has("deepseek") && typeof fetchImpl === "function") {
    registerAdapter({ pluginId: "preacherman-host", providerId: "deepseek", capabilities: ["chat"], ...createDeepSeekAdapter(fetchImpl) });
  }

  return {
    catalog,
    get: async (providerId) => publicProvider(getDefinition(providerId)),
    invoke: (providerId, { capability, input } = {}) => callAdapter(providerId, capability, "invoke", input),
    registerAdapter,
    removePlugin,
    test,
    unregisterAdapter,
  };
}
