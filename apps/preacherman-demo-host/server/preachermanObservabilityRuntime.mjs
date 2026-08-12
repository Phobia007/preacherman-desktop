import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /api[-_]?key|authorization|cookie|credential|password|secret|token/i;
const MAX_STRING_LENGTH = 500;
const MAX_COLLECTION_ITEMS = 40;

function userError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cleanIdentifier(value, label) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) throw userError(`${label} is required.`);
  return value.trim();
}

function redactString(value) {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/((?:api[-_]?key|credential|password|secret|token)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .slice(0, MAX_STRING_LENGTH);
}

function sanitize(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return String(value).slice(0, MAX_STRING_LENGTH);
  if (depth >= 8) return "[MAX_DEPTH]";
  if (seen.has(value)) return "[CIRCULAR]";
  const nextSeen = new Set(seen).add(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.code === undefined ? {} : { code: String(value.code).slice(0, 100) }),
      ...(value.statusCode === undefined ? {} : { statusCode: value.statusCode }),
    };
  }
  if (Array.isArray(value)) return value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitize(item, depth + 1, nextSeen));
  return Object.fromEntries(Object.entries(value).slice(0, MAX_COLLECTION_ITEMS).map(([key, item]) => [
    key.slice(0, 100),
    SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1, nextSeen),
  ]));
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function defaultState() {
  return { version: 1, traces: [], activity: [], pluginStates: {} };
}

function normalizeLoadedState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultState();
  return {
    version: 1,
    traces: Array.isArray(value.traces) ? value.traces : [],
    activity: Array.isArray(value.activity) ? value.activity : [],
    pluginStates: value.pluginStates && typeof value.pluginStates === "object" && !Array.isArray(value.pluginStates)
      ? value.pluginStates
      : {},
  };
}

export function createPreachermanObservabilityRuntime({
  file,
  maxEntries = 500,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
}) {
  if (typeof file !== "string" || file.length === 0) throw new TypeError("Observability state file is required.");
  if (!Number.isInteger(maxEntries) || maxEntries < 20 || maxEntries > 10_000) throw new TypeError("Observability maxEntries must be between 20 and 10000.");
  let state;
  let mutationQueue = Promise.resolve();

  async function initialize() {
    if (state) return;
    try {
      state = normalizeLoadedState(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = defaultState();
      await writePrivateJson(file, state);
    }
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      await initialize();
      const output = await operation();
      await writePrivateJson(file, state);
      return output;
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function pushBounded(collection, value) {
    collection.unshift(value);
    if (collection.length > maxEntries) collection.length = maxEntries;
  }

  async function recordTrace({ caller, target, durationMs, status, input, result, error }) {
    const normalizedCaller = cleanIdentifier(caller, "Trace caller");
    const normalizedTarget = cleanIdentifier(target, "Trace target");
    if (!Number.isFinite(durationMs) || durationMs < 0) throw userError("Trace durationMs must be a non-negative number.");
    if (status !== "succeeded" && status !== "failed") throw userError("Trace status must be succeeded or failed.");
    return mutate(() => {
      const trace = {
        id: randomUUID(),
        recordedAt: now(),
        caller: normalizedCaller,
        target: normalizedTarget,
        durationMs: Math.round(durationMs * 100) / 100,
        status,
        input: sanitize(input ?? {}),
        result: status === "succeeded" ? sanitize(result ?? null) : null,
        error: status === "failed" ? sanitize(error ?? "Unknown failure") : null,
      };
      pushBounded(state.traces, trace);
      return structuredClone(trace);
    });
  }

  async function trace({ caller, target, input }, operation) {
    if (typeof operation !== "function") throw new TypeError("Trace operation must be a function.");
    const startedAt = clock();
    try {
      const result = await operation();
      await recordTrace({ caller, target, input, result, durationMs: Math.max(0, clock() - startedAt), status: "succeeded" });
      return result;
    } catch (error) {
      await recordTrace({ caller, target, input, error, durationMs: Math.max(0, clock() - startedAt), status: "failed" });
      throw error;
    }
  }

  async function recordActivity({ pluginId, phase, revision = 0, message = "", error = null }) {
    const normalizedPluginId = cleanIdentifier(pluginId, "Activity pluginId");
    const normalizedPhase = cleanIdentifier(phase, "Activity phase");
    if (!Number.isInteger(revision) || revision < 0) throw userError("Activity revision must be a non-negative integer.");
    return mutate(() => {
      const activity = {
        id: randomUUID(),
        recordedAt: now(),
        pluginId: normalizedPluginId,
        phase: normalizedPhase,
        revision,
        message: redactString(String(message)),
        error: error ? sanitize(error) : null,
      };
      pushBounded(state.activity, activity);
      return structuredClone(activity);
    });
  }

  async function syncPluginSessions(plugins) {
    if (!Array.isArray(plugins)) throw userError("Plugin sessions must be an array.");
    return mutate(() => {
      const currentIds = new Set();
      const added = [];
      for (const plugin of plugins) {
        const pluginId = cleanIdentifier(plugin?.id, "Plugin session id");
        currentIds.add(pluginId);
        const revision = Number.isInteger(plugin.revision) && plugin.revision >= 0 ? plugin.revision : 0;
        const phase = cleanIdentifier(plugin.phase, "Plugin session phase");
        const previous = state.pluginStates[pluginId];
        if (!previous || previous.revision !== revision) {
          const lifecycle = Array.isArray(plugin.lifecycle) && plugin.lifecycle.length ? plugin.lifecycle : [phase];
          for (const lifecyclePhase of lifecycle) {
            if (typeof lifecyclePhase !== "string" || lifecyclePhase.length === 0) continue;
            const activity = {
              id: randomUUID(), recordedAt: now(), pluginId, phase: lifecyclePhase, revision,
              message: `Plugin ${pluginId} entered ${lifecyclePhase}.`,
              error: lifecyclePhase === phase && plugin.error ? sanitize(plugin.error) : null,
            };
            pushBounded(state.activity, activity);
            added.push(structuredClone(activity));
          }
        } else if (previous.phase !== phase || previous.error !== String(plugin.error ?? "")) {
          const activity = {
            id: randomUUID(), recordedAt: now(), pluginId, phase, revision,
            message: `Plugin ${pluginId} entered ${phase}.`, error: plugin.error ? sanitize(plugin.error) : null,
          };
          pushBounded(state.activity, activity);
          added.push(structuredClone(activity));
        }
        state.pluginStates[pluginId] = { phase, revision, error: String(plugin.error ?? "") };
      }
      for (const [pluginId, previous] of Object.entries(state.pluginStates)) {
        if (currentIds.has(pluginId)) continue;
        const activity = {
          id: randomUUID(), recordedAt: now(), pluginId, phase: "uninstalled", revision: previous.revision,
          message: `Plugin ${pluginId} was uninstalled.`, error: null,
        };
        pushBounded(state.activity, activity);
        added.push(structuredClone(activity));
        delete state.pluginStates[pluginId];
      }
      return added;
    });
  }

  function inspectPlugins(plugins, tools) {
    if (!Array.isArray(plugins) || !Array.isArray(tools)) throw userError("Plugin inspector requires plugin and tool arrays.");
    return plugins.map((plugin) => ({
      id: String(plugin.id),
      name: String(plugin.manifest?.name ?? plugin.id),
      manifest: sanitize(plugin.manifest ?? {}),
      phase: String(plugin.phase ?? "unknown"),
      revision: Number.isInteger(plugin.revision) ? plugin.revision : 0,
      kits: Array.isArray(plugin.kits) ? plugin.kits.map(String) : [],
      bindings: Array.isArray(plugin.bindings) ? plugin.bindings.map(String) : [],
      tools: tools.filter((tool) => tool.pluginId === plugin.id || String(tool.name).startsWith(`${plugin.id}::`)).map((tool) => ({
        name: String(tool.name),
        description: redactString(String(tool.description ?? "")),
        requiresApproval: tool.requiresApproval === true,
      })),
      error: plugin.error ? redactString(String(plugin.error)) : null,
    })).sort((left, right) => left.id.localeCompare(right.id));
  }

  async function listTraces({ limit = 100, status } = {}) {
    await initialize();
    await mutationQueue;
    const count = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    return structuredClone(state.traces.filter((traceEntry) => !status || traceEntry.status === status).slice(0, count));
  }

  async function listActivity({ limit = 100, pluginId } = {}) {
    await initialize();
    await mutationQueue;
    const count = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    return structuredClone(state.activity.filter((entry) => !pluginId || entry.pluginId === pluginId).slice(0, count));
  }

  async function diagnostics() {
    const [traces, activity] = await Promise.all([listTraces({ limit: 500 }), listActivity({ limit: 500 })]);
    const failures = traces.filter((entry) => entry.status === "failed");
    return {
      traceCount: traces.length,
      failureCount: failures.length,
      averageDurationMs: traces.length ? Math.round((traces.reduce((total, entry) => total + entry.durationMs, 0) / traces.length) * 100) / 100 : 0,
      pluginErrorCount: activity.filter((entry) => entry.error).length,
      recentFailures: failures.slice(0, 10).map(({ id, recordedAt, caller, target, durationMs, error }) => ({ id, recordedAt, caller, target, durationMs, error })),
    };
  }

  async function snapshot({ plugins = [], tools = [] } = {}) {
    await syncPluginSessions(plugins);
    const [traces, activity, diagnosticSummary] = await Promise.all([listTraces(), listActivity(), diagnostics()]);
    return { plugins: inspectPlugins(plugins, tools), traces, activity, diagnostics: diagnosticSummary };
  }

  async function close() {
    await mutationQueue;
  }

  return { close, diagnostics, initialize, inspectPlugins, listActivity, listTraces, recordActivity, recordTrace, snapshot, syncPluginSessions, trace };
}
