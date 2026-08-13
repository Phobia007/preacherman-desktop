const REQUIRED_METHODS = ["detect", "authStatus", "capabilities", "start", "events", "cancel", "close"];

function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new TypeError("Local agent adapter must be an object.");
  for (const field of ["id", "label", "kind"]) {
    if (typeof adapter[field] !== "string" || !adapter[field].trim()) {
      throw new TypeError(`Local agent adapter requires a non-empty ${field}.`);
    }
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") throw new TypeError(`Local agent adapter ${adapter.id} is missing ${method}().`);
  }
  return adapter;
}

export function createLocalAgentRegistry({ adapters = [] } = {}) {
  const registered = new Map();

  function register(adapter) {
    assertAdapter(adapter);
    if (registered.has(adapter.id)) throw new Error(`Local agent adapter already registered: ${adapter.id}`);
    registered.set(adapter.id, adapter);
    return adapter;
  }

  function requireAdapter(id) {
    const adapter = registered.get(id);
    if (!adapter) {
      const error = new Error(`Unknown local agent adapter: ${id}`);
      error.code = "LOCAL_AGENT_NOT_FOUND";
      throw error;
    }
    return adapter;
  }

  for (const adapter of adapters) register(adapter);

  return {
    register,
    get: (id) => registered.get(id) ?? null,
    ids: () => [...registered.keys()],
    async list() {
      return Promise.all([...registered.values()].map(async (adapter) => {
        let detection;
        try {
          detection = await adapter.detect();
        } catch (error) {
          detection = { installed: false, version: null, executable: null, error: error instanceof Error ? error.message : String(error) };
        }

        let auth = { status: "unknown", reason: detection.installed ? "probe-failed" : "not-installed" };
        if (detection.installed) {
          try {
            auth = await adapter.authStatus();
          } catch (error) {
            auth = { status: "error", reason: error instanceof Error ? error.message : String(error) };
          }
        }

        return {
          id: adapter.id,
          label: adapter.label,
          kind: adapter.kind,
          installed: detection.installed === true,
          version: typeof detection.version === "string" ? detection.version : null,
          auth: { state: auth.status ?? "unknown", ...(auth.reason ? { reason: auth.reason } : {}) },
          capabilities: adapter.capabilities(),
        };
      }));
    },
    detect: (id) => requireAdapter(id).detect(),
    authStatus: (id) => requireAdapter(id).authStatus(),
    capabilities: (id) => requireAdapter(id).capabilities(),
    start: (id, input) => requireAdapter(id).start(input),
    events: (id, runId, cursor) => requireAdapter(id).events(runId, cursor),
    cancel: (id, runId) => requireAdapter(id).cancel(runId),
    approve(id, runId, permissionId, optionId) {
      const adapter = requireAdapter(id);
      if (typeof adapter.approve !== "function") {
        const error = new Error(`Local agent adapter does not support approval: ${id}`);
        error.code = "LOCAL_AGENT_CAPABILITY_UNSUPPORTED";
        error.statusCode = 409;
        throw error;
      }
      return adapter.approve(runId, permissionId, optionId);
    },
    reject(id, runId, permissionId) {
      const adapter = requireAdapter(id);
      if (typeof adapter.reject !== "function") {
        const error = new Error(`Local agent adapter does not support rejection: ${id}`);
        error.code = "LOCAL_AGENT_CAPABILITY_UNSUPPORTED";
        error.statusCode = 409;
        throw error;
      }
      return adapter.reject(runId, permissionId);
    },
    async close() {
      await Promise.allSettled([...registered.values()].map((adapter) => adapter.close()));
    },
  };
}
