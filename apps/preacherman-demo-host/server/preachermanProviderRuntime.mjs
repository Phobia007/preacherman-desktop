export const PREACHERMAN_PROVIDER_CAPABILITIES = Object.freeze(["chat", "asr", "tts", "vision", "image"]);
const PROVIDER_CAPABILITIES = new Set(PREACHERMAN_PROVIDER_CAPABILITIES);
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
    models: [{ id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", capability: "chat" }],
    requirements: [
      { key: "DEEPSEEK_API_KEY", label: "DeepSeek API key", secret: true, capabilities: ["chat"] },
      { key: "DEEPSEEK_MODEL", label: "DeepSeek model", secret: false, required: false, capabilities: ["chat"] },
    ],
  },
  {
    id: "dashscope",
    label: "DashScope",
    capabilities: ["asr", "tts", "vision"],
    models: [
      { id: "qwen3-asr-flash-realtime", label: "Qwen3 ASR Flash Realtime", capability: "asr" },
      { id: "qwen3-tts-flash-realtime", label: "Qwen3 TTS Flash Realtime", capability: "tts" },
      { id: "qwen3-vl-plus", label: "Qwen3 VL Plus", capability: "vision" },
    ],
    requirements: [
      { key: "DASHSCOPE_API_KEY", label: "DashScope API key", secret: true, capabilities: ["asr", "tts", "vision"] },
      { key: "DASHSCOPE_WORKSPACE_ID", label: "DashScope workspace ID", secret: false, capabilities: ["asr", "vision"] },
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
      throw runtimeError("INVALID_PROVIDER_CAPABILITY", `Unsupported PREACHERMAN provider capability: ${capability}`);
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
  const models = (definition.models || []).map((model) => {
    if (!model || typeof model !== "object" || typeof model.id !== "string" || !model.id.trim()) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Provider ${id} has an invalid model declaration.`);
    }
    if (!capabilities.includes(model.capability)) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Provider model ${model.id} refers to an undeclared capability.`);
    }
    return {
      id: model.id.trim().slice(0, 160),
      label: typeof model.label === "string" && model.label.trim() ? model.label.trim().slice(0, 160) : model.id.trim().slice(0, 160),
      capability: model.capability,
      source: "declared",
    };
  });
  return { id, label: definition.label.trim(), capabilities, requirements, models, ownerPluginId };
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

function remoteModels(payload, capability, predicate = () => true) {
  if (!Array.isArray(payload?.data)) return [];
  return payload.data
    .filter((model) => typeof model?.id === "string" && model.id.trim() && predicate(model.id))
    .slice(0, 200)
    .map((model) => ({ id: model.id.trim().slice(0, 160), label: model.id.trim().slice(0, 160), capability, source: "provider" }));
}

function createDeepSeekAdapter(fetchImpl) {
  async function models({ config, signal }) {
    const response = await fetchImpl("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}` },
      signal,
    });
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || `DeepSeek returned HTTP ${response.status}.`);
    return remoteModels(payload, "chat");
  }
  return {
    async test(context) {
      return { ok: true, message: "Connected", models: await models(context) };
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
    models,
  };
}

function createDashScopeVisionAdapter(fetchImpl) {
  const baseUrl = (config) => `https://${config.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`;
  async function models({ config, signal }) {
    const response = await fetchImpl(`${baseUrl(config)}/models`, {
      headers: { Authorization: `Bearer ${config.DASHSCOPE_API_KEY}` },
      signal,
    });
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || `DashScope returned HTTP ${response.status}.`);
    return remoteModels(payload, "vision", (id) => /(?:vl|vision|omni)/i.test(id));
  }
  return {
    async test(context) {
      return { ok: true, message: "Connected", models: await models(context) };
    },
    async invoke({ config, input, signal }) {
      const messages = Array.isArray(input?.messages) ? input.messages : [];
      if (messages.length === 0) throw runtimeError("INVALID_PROVIDER_INPUT", "DashScope vision requires at least one message.");
      const response = await fetchImpl(`${baseUrl(config)}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: input.model || "qwen3-vl-plus", messages, ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }) }),
        signal,
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload?.error?.message || `DashScope returned HTTP ${response.status}.`);
      return { content: payload?.choices?.[0]?.message?.content ?? null, model: payload?.model || input.model || "qwen3-vl-plus", usage: payload?.usage || null };
    },
    models,
  };
}

function requireStreamingProtocol(protocol, capability) {
  if (!protocol || typeof protocol !== "object" || Array.isArray(protocol)) {
    throw runtimeError("INVALID_PROVIDER_INPUT", `DashScope ${capability} streaming protocol is required.`);
  }
  for (const operation of ["test", "open", "send", "close"]) {
    if (typeof protocol[operation] !== "function") {
      throw runtimeError("INVALID_PROVIDER_INPUT", `DashScope ${capability} streaming protocol must implement ${operation}().`);
    }
  }
  return protocol;
}

function dashScopeChannelConfiguration(capability, config) {
  return capability === "asr"
    ? { apiKey: config.DASHSCOPE_API_KEY, workspaceId: config.DASHSCOPE_WORKSPACE_ID }
    : { apiKey: config.DASHSCOPE_API_KEY };
}

/**
 * Adapts host-owned WebSocket clients to the Provider Runtime contract. The
 * opaque protocol session never leaves the runtime; callers only receive a
 * runtime session id and sanitized metadata/results.
 */
export function createDashScopeStreamingAdapter({ asr, tts } = {}) {
  const protocols = {};
  if (asr !== undefined) protocols.asr = requireStreamingProtocol(asr, "asr");
  if (tts !== undefined) protocols.tts = requireStreamingProtocol(tts, "tts");
  const capabilities = Object.keys(protocols);
  if (capabilities.length === 0) {
    throw runtimeError("INVALID_PROVIDER_INPUT", "DashScope streaming adapter requires an ASR or TTS protocol.");
  }

  function protocolFor(capability) {
    const protocol = protocols[capability];
    if (!protocol) throw runtimeError("PROVIDER_CAPABILITY_NOT_FOUND", `DashScope streaming adapter does not implement ${capability}.`, 404);
    return protocol;
  }

  const adapter = {
    capabilities,
    async test({ capability, config, signal }) {
      const result = await protocolFor(capability).test({
        ...dashScopeChannelConfiguration(capability, config),
        signal,
      });
      return typeof result === "boolean" ? { ok: result } : result;
    },
    stream: {
      async open({ capability, config, input, signal, emit }) {
        return protocolFor(capability).open({
          ...dashScopeChannelConfiguration(capability, config),
          input,
          signal,
          emit,
        });
      },
      async send({ capability, session, event, signal }) {
        return protocolFor(capability).send({ session, event, signal });
      },
      async close({ capability, session, reason, signal }) {
        return protocolFor(capability).close({ session, reason, signal });
      },
    },
    async dispose() {
      await Promise.all(capabilities.map(async (capability) => {
        const dispose = protocols[capability].dispose;
        if (typeof dispose === "function") await dispose();
      }));
    },
  };
  if (capabilities.some((capability) => typeof protocols[capability].invoke === "function")) {
    adapter.invoke = async ({ capability, config, input, signal }) => {
      const protocol = protocolFor(capability);
      if (typeof protocol.invoke !== "function") {
        throw runtimeError("PROVIDER_INVOKE_UNSUPPORTED", `DashScope ${capability} requires a stream session.`, 409);
      }
      return protocol.invoke({
        ...dashScopeChannelConfiguration(capability, config),
        input,
        signal,
      });
    };
  }
  return adapter;
}

export function createPreachermanProviderRuntime({
  definitions = CORE_PROVIDER_DEFINITIONS,
  getConfig = async () => ({}),
  fetchImpl,
  timeoutMs = 8_000,
} = {}) {
  if (typeof getConfig !== "function") throw runtimeError("INVALID_PROVIDER_INPUT", "Provider runtime requires getConfig().");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw runtimeError("INVALID_PROVIDER_INPUT", "Provider timeout must be a positive number.");
  const providers = new Map();
  const adapters = new Map();
  const sessions = new Map();
  const modelCache = new Map();
  const effectiveFetch = fetchImpl || globalThis.fetch;
  let nextAdapterId = 1;
  let nextSessionId = 1;

  for (const definition of definitions) {
    const normalized = normalizeDefinition(definition, null);
    if (providers.has(normalized.id)) throw runtimeError("PROVIDER_ALREADY_REGISTERED", `Provider already exists: ${normalized.id}`, 409);
    providers.set(normalized.id, normalized);
    modelCache.set(normalized.id, normalized.models);
  }

  function getDefinition(providerId) {
    const definition = providers.get(providerId);
    if (!definition) throw runtimeError("PROVIDER_NOT_FOUND", `Unknown PREACHERMAN provider: ${providerId}`, 404);
    return definition;
  }

  const adapterKey = (providerId, capability) => `${providerId}:${capability}`;
  const adapterFor = (providerId, capability) => adapters.get(adapterKey(providerId, capability));
  const uniqueAdapters = () => [...new Set(adapters.values())];
  const providerAdapters = (definition) => [...new Set(definition.capabilities.map((capability) => adapterFor(definition.id, capability)).filter(Boolean))];

  function registerAdapter({ pluginId, providerId, provider, capabilities, test, invoke, models, stream, dispose }) {
    requireIdentifier(pluginId, "Plugin id");
    let pendingDefinition;
    if (provider) {
      pendingDefinition = normalizeDefinition(provider, pluginId);
      if (providerId && providerId !== pendingDefinition.id) throw runtimeError("INVALID_PROVIDER_INPUT", "Provider id does not match its definition.");
      if (providers.has(pendingDefinition.id)) throw runtimeError("PROVIDER_ALREADY_REGISTERED", `Provider already exists: ${pendingDefinition.id}`, 409);
      providerId = pendingDefinition.id;
    }
    const definition = pendingDefinition || getDefinition(providerId);
    const supported = capabilities === undefined ? definition.capabilities : normalizeCapabilities(capabilities, "Adapter capabilities");
    if (supported.some((capability) => !definition.capabilities.includes(capability))) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Adapter ${providerId} declares a capability outside its provider catalog entry.`);
    }
    const hasStream = stream && typeof stream === "object" && !Array.isArray(stream);
    if (hasStream && ["open", "send", "close"].some((operation) => typeof stream[operation] !== "function")) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Streaming adapter ${providerId} must implement open(), send(), and close().`);
    }
    if (typeof test !== "function" && typeof invoke !== "function" && typeof models !== "function" && !hasStream) {
      throw runtimeError("INVALID_PROVIDER_INPUT", `Adapter ${providerId} must implement test, invoke, models, or stream.`);
    }
    for (const capability of supported) {
      if (adapterFor(providerId, capability)) {
        throw runtimeError("PROVIDER_ADAPTER_ALREADY_REGISTERED", `Provider adapter already exists for ${providerId}:${capability}.`, 409);
      }
    }
    if (pendingDefinition) {
      providers.set(providerId, pendingDefinition);
      modelCache.set(providerId, pendingDefinition.models);
    }
    const adapter = { id: nextAdapterId++, pluginId, providerId, capabilities: supported, test, invoke, models, stream, dispose };
    for (const capability of supported) adapters.set(adapterKey(providerId, capability), adapter);
    return { pluginId, providerId, capabilities: [...supported] };
  }

  async function closeAdapterSessions(adapter, reason) {
    let failure;
    for (const session of [...sessions.values()]) {
      if (session.adapter !== adapter) continue;
      try {
        await closeStream(session.id, { reason });
      } catch (error) {
        failure ||= error;
      }
    }
    if (failure) throw failure;
  }

  async function disposeAdapter(adapter) {
    if (typeof adapter.dispose !== "function") return;
    const definition = providers.get(adapter.providerId);
    const { secrets = [] } = definition ? await configuration(definition) : {};
    await boundedCall(adapter.providerId, "dispose", secrets, () => adapter.dispose(), { sanitizeResult: false });
  }

  function deleteAdapter(adapter) {
    for (const capability of adapter.capabilities) {
      const key = adapterKey(adapter.providerId, capability);
      if (adapters.get(key) === adapter) adapters.delete(key);
    }
  }

  async function releaseAdapter(adapter, reason) {
    let failure;
    try {
      await closeAdapterSessions(adapter, reason);
    } catch (error) {
      failure = error;
    }
    try {
      await disposeAdapter(adapter);
    } catch (error) {
      failure ||= error;
    }
    deleteAdapter(adapter);
    if (failure) throw failure;
  }

  async function unregisterAdapter(providerId, pluginId) {
    const matching = uniqueAdapters().filter((adapter) => adapter.providerId === providerId && (!pluginId || adapter.pluginId === pluginId));
    if (matching.length === 0 && uniqueAdapters().some((adapter) => adapter.providerId === providerId) && pluginId) {
      throw runtimeError("PROVIDER_ADAPTER_OWNER_MISMATCH", `Plugin ${pluginId} does not own provider adapter ${providerId}.`, 403);
    }
    if (matching.length === 0) throw runtimeError("PROVIDER_ADAPTER_NOT_FOUND", `Provider adapter is not registered: ${providerId}`, 404);
    let failure;
    for (const adapter of matching) {
      try {
        await releaseAdapter(adapter, "adapter-unregistered");
      } catch (error) {
        failure ||= error;
      }
    }
    const definition = providers.get(providerId);
    if (definition?.ownerPluginId && matching.some((adapter) => adapter.pluginId === definition.ownerPluginId) && providerAdapters(definition).length === 0) {
      providers.delete(providerId);
      modelCache.delete(providerId);
    }
    if (failure) throw failure;
    return {
      pluginId: pluginId || matching[0].pluginId,
      providerId,
      capabilities: [...new Set(matching.flatMap((adapter) => adapter.capabilities))],
    };
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
    const registrations = providerAdapters(definition);
    const { config } = await configuration(definition);
    const pluginIds = [...new Set(registrations.map((adapter) => adapter.pluginId))];
    return {
      id: definition.id,
      label: definition.label,
      sourcePluginId: definition.ownerPluginId,
      adapter: registrations.length > 0 ? {
        pluginId: pluginIds.length === 1 ? pluginIds[0] : "multiple",
        capabilities: [...new Set(registrations.flatMap((adapter) => adapter.capabilities))],
      } : null,
      models: structuredClone(modelCache.get(definition.id) || []),
      capabilities: Object.fromEntries(definition.capabilities.map((capability) => {
        const status = capabilityState(definition, adapterFor(definition.id, capability), config, capability);
        return [capability, { state: status.state, requirements: definition.requirements
          .filter((requirement) => requirement.capabilities.includes(capability))
          .map((requirement) => ({ key: requirement.key, label: requirement.label, required: requirement.required, configured: Boolean(config[requirement.key]) })) }];
      })),
    };
  }

  async function catalog({ capability } = {}) {
    if (capability !== undefined && !PROVIDER_CAPABILITIES.has(capability)) {
      throw runtimeError("INVALID_PROVIDER_CAPABILITY", `Unsupported PREACHERMAN provider capability: ${capability}`);
    }
    const visible = [...providers.values()].filter((definition) => !capability || definition.capabilities.includes(capability));
    return Promise.all(visible.sort((left, right) => left.id.localeCompare(right.id)).map(publicProvider));
  }

  async function resolveOperation(providerId, capability) {
    const definition = getDefinition(providerId);
    if (!PROVIDER_CAPABILITIES.has(capability) || !definition.capabilities.includes(capability)) {
      throw runtimeError("PROVIDER_CAPABILITY_NOT_FOUND", `Provider ${providerId} does not declare ${capability}.`, 404);
    }
    const adapter = adapterFor(providerId, capability);
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

  async function boundedCall(providerId, operation, secrets, run, { sanitizeResult = true, abortAfter = true, onController } = {}) {
    const controller = new AbortController();
    onController?.(controller);
    let timer;
    let completed = false;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => run(controller.signal)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(runtimeError("PROVIDER_TIMEOUT", `Provider ${providerId} ${operation} timed out.`, 504));
          }, timeoutMs);
        }),
      ]);
      completed = true;
      return sanitizeResult ? sanitize(result, secrets) : result;
    } catch (cause) {
      if (cause?.code === "PROVIDER_TIMEOUT" || cause?.code === "INVALID_PROVIDER_INPUT") throw cause;
      throw runtimeError(
        "PROVIDER_ADAPTER_FAILED",
        redactText(`Provider ${providerId} ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`, secrets),
        502,
      );
    } finally {
      clearTimeout(timer);
      if (!completed || abortAfter) controller.abort();
    }
  }

  async function callAdapter(providerId, capability, operation, input) {
    const { adapter, config, secrets } = await resolveOperation(providerId, capability);
    const handler = adapter[operation];
    if (typeof handler !== "function") {
      throw runtimeError(`PROVIDER_${operation.toUpperCase()}_UNSUPPORTED`, `Provider ${providerId} does not support ${operation}.`, 409);
    }
    return boundedCall(providerId, operation, secrets, (signal) => handler({ capability, config, input, signal }));
  }

  async function test(providerId, { capability } = {}) {
    const definition = getDefinition(providerId);
    const selected = capability || definition.capabilities[0];
    try {
      const result = await callAdapter(providerId, selected, "test");
      if (Array.isArray(result?.models)) modelCache.set(providerId, result.models);
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

  async function listModels(providerId) {
    const definition = getDefinition(providerId);
    const adapter = providerAdapters(definition).find((candidate) => typeof candidate.models === "function");
    const declared = structuredClone(modelCache.get(providerId) || []);
    if (!adapter || typeof adapter.models !== "function") {
      return { providerId, state: adapter ? PROVIDER_STATES.ready : PROVIDER_STATES.adapterRequired, source: "declared", models: declared };
    }
    const capability = adapter.capabilities.find((candidate) => definition.capabilities.includes(candidate));
    try {
      const models = await callAdapter(providerId, capability, "models");
      if (!Array.isArray(models)) throw runtimeError("INVALID_PROVIDER_RESPONSE", `Provider ${providerId} returned an invalid model list.`, 502);
      modelCache.set(providerId, models);
      return { providerId, state: PROVIDER_STATES.ready, source: "provider", models: structuredClone(models) };
    } catch (error) {
      if (error?.code !== "PROVIDER_CONFIGURATION_REQUIRED") throw error;
      return { providerId, state: PROVIDER_STATES.configurationRequired, source: "declared", models: declared };
    }
  }

  function publicSession(session, phase = session.phase) {
    return {
      id: session.id,
      providerId: session.providerId,
      capability: session.capability,
      phase,
      createdAt: session.createdAt,
      metadata: session.metadata,
    };
  }

  async function openStream(providerId, { capability, input, onEvent } = {}) {
    if (onEvent !== undefined && typeof onEvent !== "function") {
      throw runtimeError("INVALID_PROVIDER_INPUT", "Stream onEvent must be a function.");
    }
    const { adapter, config, secrets } = await resolveOperation(providerId, capability);
    if (!adapter.stream) throw runtimeError("PROVIDER_STREAM_UNSUPPORTED", `Provider ${providerId} does not support stream sessions.`, 409);
    let lifecycleController;
    const opened = await boundedCall(providerId, "stream open", secrets, (signal) => adapter.stream.open({
      capability,
      config,
      input,
      signal,
      emit: (event) => onEvent?.(sanitize(event, secrets)),
    }), { sanitizeResult: false, abortAfter: false, onController: (controller) => { lifecycleController = controller; } });
    if (!opened || typeof opened !== "object" || !Object.hasOwn(opened, "session") || opened.session == null) {
      lifecycleController.abort();
      throw runtimeError("INVALID_PROVIDER_RESPONSE", `Provider ${providerId} returned an invalid stream session.`, 502);
    }
    const session = {
      id: `provider-stream-${nextSessionId++}`,
      providerId,
      capability,
      pluginId: adapter.pluginId,
      adapter,
      opaqueSession: opened.session,
      phase: "open",
      createdAt: new Date().toISOString(),
      metadata: sanitize(opened.metadata ?? null, secrets),
      secrets,
      lifecycleController,
    };
    sessions.set(session.id, session);
    return publicSession(session);
  }

  async function sendStream(sessionId, event) {
    const session = sessions.get(sessionId);
    if (!session) throw runtimeError("PROVIDER_STREAM_NOT_FOUND", `Unknown provider stream session: ${sessionId}`, 404);
    return boundedCall(session.providerId, "stream send", session.secrets, (signal) => session.adapter.stream.send({
      capability: session.capability,
      session: session.opaqueSession,
      event,
      signal,
    }));
  }

  async function closeStream(sessionId, { reason = "requested" } = {}) {
    const session = sessions.get(sessionId);
    if (!session) throw runtimeError("PROVIDER_STREAM_NOT_FOUND", `Unknown provider stream session: ${sessionId}`, 404);
    try {
      await boundedCall(session.providerId, "stream close", session.secrets, (signal) => session.adapter.stream.close({
        capability: session.capability,
        session: session.opaqueSession,
        reason,
        signal,
      }));
      return publicSession(session, "closed");
    } finally {
      sessions.delete(sessionId);
      session.phase = "closed";
      session.lifecycleController.abort();
    }
  }

  function listStreams() {
    return [...sessions.values()].map((session) => publicSession(session));
  }

  async function removePlugin(pluginId) {
    let adaptersRemoved = 0;
    let providersRemoved = 0;
    let failure;
    for (const adapter of uniqueAdapters()) {
      if (adapter.pluginId !== pluginId) continue;
      try {
        await releaseAdapter(adapter, "plugin-removed");
      } catch (error) {
        failure ||= error;
      }
      adaptersRemoved += 1;
    }
    for (const [providerId, definition] of [...providers]) {
      if (definition.ownerPluginId !== pluginId) continue;
      providers.delete(providerId);
      modelCache.delete(providerId);
      providersRemoved += 1;
    }
    if (failure) throw failure;
    return { adapters: adaptersRemoved, providers: providersRemoved };
  }

  async function close() {
    let failure;
    for (const adapter of uniqueAdapters()) {
      try {
        await releaseAdapter(adapter, "runtime-closed");
      } catch (error) {
        failure ||= error;
      }
    }
    if (failure) throw failure;
  }

  if (providers.has("deepseek") && typeof effectiveFetch === "function") {
    registerAdapter({ pluginId: "preacherman-host", providerId: "deepseek", capabilities: ["chat"], ...createDeepSeekAdapter(effectiveFetch) });
  }
  if (providers.has("dashscope") && typeof fetchImpl === "function") {
    registerAdapter({ pluginId: "preacherman-host", providerId: "dashscope", capabilities: ["vision"], ...createDashScopeVisionAdapter(fetchImpl) });
  }

  return {
    catalog,
    close,
    closeStream,
    get: async (providerId) => publicProvider(getDefinition(providerId)),
    invoke: (providerId, { capability, input } = {}) => callAdapter(providerId, capability, "invoke", input),
    listModels,
    listStreams,
    openStream,
    registerAdapter,
    removePlugin,
    sendStream,
    test,
    unregisterAdapter,
  };
}
