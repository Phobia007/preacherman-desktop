const CALLER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NODE_KEYS = new Set(["tag", "role", "name", "selector", "disabled", "visible", "depth"]);
const SNAPSHOT_KEYS = new Set(["url", "title", "surface", "capturedAt", "nodes", "truncated"]);
const BROWSER_SNAPSHOT_KEYS = new Set(["schemaVersion", "surface", "capturedAt", "nodes", "truncated"]);
const BROWSER_NODE_KEYS = new Set(["tag", "role", "ariaLabel", "airiControl", "disabled", "visible", "path"]);
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

function runtimeError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw runtimeError("DOM_SNAPSHOT_INVALID", `${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw runtimeError("DOM_SNAPSHOT_INVALID", `${label}.${key} is not allowed.`);
}

function text(value, label, maximum, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw runtimeError("DOM_SNAPSHOT_INVALID", `${label} must contain between 1 and ${maximum} characters.`);
  }
  return value;
}

function normalizeNode(value, index) {
  const node = plainObject(value, `nodes[${index}]`);
  exactKeys(node, NODE_KEYS, `nodes[${index}]`);
  if (node.disabled !== undefined && typeof node.disabled !== "boolean") throw runtimeError("DOM_SNAPSHOT_INVALID", `nodes[${index}].disabled must be boolean.`);
  if (node.visible !== undefined && typeof node.visible !== "boolean") throw runtimeError("DOM_SNAPSHOT_INVALID", `nodes[${index}].visible must be boolean.`);
  if (!Number.isInteger(node.depth) || node.depth < 0 || node.depth > 32) throw runtimeError("DOM_SNAPSHOT_INVALID", `nodes[${index}].depth is invalid.`);
  return {
    tag: text(node.tag, `nodes[${index}].tag`, 64).toLowerCase(),
    ...(node.role === undefined ? {} : { role: text(node.role, `nodes[${index}].role`, 128) }),
    ...(node.name === undefined ? {} : { name: text(node.name, `nodes[${index}].name`, 512) }),
    ...(node.selector === undefined ? {} : { selector: text(node.selector, `nodes[${index}].selector`, 512) }),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    ...(node.visible === undefined ? {} : { visible: node.visible }),
    depth: node.depth,
  };
}

export function createAiriDomObservationRuntime({
  allowedOrigins = ["http://127.0.0.1:1420"],
  allowedPaths = ["/__surfaces/home", "/__surfaces/workspace", "/__surfaces/lab", "/__surfaces/market", "/__surfaces/ledger", "/__surfaces/settings", "/__surfaces/test"],
  maxAgeMs = 15_000,
  maxNodes = 200,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
} = {}) {
  const originSet = new Set(allowedOrigins);
  const pathSet = new Set(allowedPaths);
  const snapshots = new Map();
  const operationLog = [];
  const pathBySurface = new Map(allowedPaths.map((path) => [path.split("/").at(-1), path]));

  function normalizeUrl(value) {
    let url;
    try { url = new URL(text(value, "url", 2_000)); } catch { throw runtimeError("DOM_TARGET_INVALID", "DOM target URL is invalid."); }
    if (!originSet.has(url.origin) || !pathSet.has(url.pathname) || url.username || url.password || url.search || url.hash) {
      throw runtimeError("DOM_TARGET_OUT_OF_SCOPE", "DOM target is outside the approved local surfaces.", 403);
    }
    return url.href;
  }

  function normalizeCaller(value) {
    if (typeof value !== "string" || !CALLER_PATTERN.test(value)) throw runtimeError("DOM_CALLER_INVALID", "DOM observation caller is invalid.");
    return value;
  }

  function log(type, callerPluginId, target, status, resultCount = 0) {
    operationLog.push({ id: `${clock()}-${operationLog.length + 1}`, type, callerPluginId, target, status, resultCount, at: now() });
    if (operationLog.length > 100) operationLog.splice(0, operationLog.length - 100);
  }

  function ingest(value) {
    const snapshot = plainObject(value, "DOM snapshot");
    exactKeys(snapshot, SNAPSHOT_KEYS, "DOM snapshot");
    if (!Array.isArray(snapshot.nodes) || snapshot.nodes.length > maxNodes) throw runtimeError("DOM_SNAPSHOT_INVALID", `DOM snapshot may contain at most ${maxNodes} nodes.`);
    if (typeof snapshot.truncated !== "boolean") throw runtimeError("DOM_SNAPSHOT_INVALID", "DOM snapshot truncated must be boolean.");
    const url = normalizeUrl(snapshot.url);
    const capturedAt = text(snapshot.capturedAt, "capturedAt", 100);
    if (!Number.isFinite(Date.parse(capturedAt))) throw runtimeError("DOM_SNAPSHOT_INVALID", "DOM snapshot capturedAt is invalid.");
    const normalized = {
      url,
      title: text(snapshot.title, "title", 1_000),
      surface: text(snapshot.surface, "surface", 64),
      capturedAt,
      receivedAtMs: clock(),
      nodes: snapshot.nodes.map(normalizeNode),
      truncated: snapshot.truncated,
    };
    snapshots.set(url, normalized);
    return { status: "ready", target: { kind: "web", id: url }, nodeCount: normalized.nodes.length, capturedAt };
  }

  function ingestBrowserSnapshot(value) {
    const snapshot = plainObject(value, "Browser DOM snapshot");
    exactKeys(snapshot, BROWSER_SNAPSHOT_KEYS, "Browser DOM snapshot");
    if (snapshot.schemaVersion !== 1) throw runtimeError("DOM_SNAPSHOT_INVALID", "Browser DOM snapshot schemaVersion must be 1.");
    const surface = text(snapshot.surface, "surface", 64);
    const path = pathBySurface.get(surface);
    if (!path) throw runtimeError("DOM_TARGET_OUT_OF_SCOPE", "Browser DOM snapshot surface is outside the approved local surfaces.", 403);
    if (!Array.isArray(snapshot.nodes) || snapshot.nodes.length > maxNodes) throw runtimeError("DOM_SNAPSHOT_INVALID", `Browser DOM snapshot may contain at most ${maxNodes} nodes.`);
    const nodes = snapshot.nodes.map((value, index) => {
      const node = plainObject(value, `nodes[${index}]`);
      exactKeys(node, BROWSER_NODE_KEYS, `nodes[${index}]`);
      if (!Array.isArray(node.airiControl ?? []) || (node.airiControl ?? []).length > 12
        || (node.airiControl ?? []).some((token) => typeof token !== "string" || !SAFE_TOKEN_PATTERN.test(token))) {
        throw runtimeError("DOM_SNAPSHOT_INVALID", `nodes[${index}].airiControl is invalid.`);
      }
      const selector = text(node.path, `nodes[${index}].path`, 512);
      const name = node.ariaLabel === undefined
        ? (node.airiControl?.length ? node.airiControl.join(" ") : undefined)
        : text(node.ariaLabel, `nodes[${index}].ariaLabel`, 160);
      return {
        tag: text(node.tag, `nodes[${index}].tag`, 64),
        ...(node.role === undefined ? {} : { role: text(node.role, `nodes[${index}].role`, 64) }),
        ...(name === undefined ? {} : { name }),
        selector,
        disabled: node.disabled,
        visible: node.visible,
        depth: Math.min(32, selector.split(" > ").length - 1),
      };
    });
    return ingest({
      url: new URL(path, [...originSet][0]).href,
      title: "Preacherman Desktop Demo",
      surface,
      capturedAt: snapshot.capturedAt,
      nodes,
      truncated: snapshot.truncated,
    });
  }

  function current(target) {
    const id = normalizeUrl(plainObject(target, "DOM target").id);
    if (target.kind !== "web") throw runtimeError("DOM_TARGET_INVALID", "DOM observation only supports web targets.");
    const snapshot = snapshots.get(id);
    if (!snapshot || clock() - snapshot.receivedAtMs > maxAgeMs) throw runtimeError("DOM_SNAPSHOT_REQUIRED", "A current browser DOM snapshot is required.", 409);
    return snapshot;
  }

  function status() {
    const targets = [...snapshots.values()]
      .filter((snapshot) => clock() - snapshot.receivedAtMs <= maxAgeMs)
      .map((snapshot) => ({ kind: "web", id: snapshot.url }));
    return {
      phase: targets.length ? "ready" : "external-runtime-required",
      adapter: targets.length ? { pluginId: "preacherman-web-dom" } : null,
      targets,
      lastTest: targets.length ? { ok: true, at: now() } : null,
      lastError: null,
      pendingApprovals: 0,
    };
  }

  function observe({ callerPluginId, target }) {
    const caller = normalizeCaller(callerPluginId);
    const snapshot = current(target);
    const publicTarget = { kind: "web", id: snapshot.url };
    log("observe", caller, publicTarget, "succeeded", snapshot.nodes.length);
    return {
      status: "succeeded",
      operation: "observe",
      result: { summary: `Observed ${snapshot.nodes.length} structural DOM nodes on ${snapshot.surface}.` },
    };
  }

  function inspectDom({ callerPluginId, target, selector, maxDepth = 20 }) {
    const caller = normalizeCaller(callerPluginId);
    if (selector !== undefined && (typeof selector !== "string" || selector.length > 512)) throw runtimeError("DOM_SELECTOR_INVALID", "DOM selector is invalid.");
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 20) throw runtimeError("DOM_DEPTH_INVALID", "DOM maxDepth must be between 1 and 20.");
    const snapshot = current(target);
    const nodes = snapshot.nodes
      .filter((node) => node.depth <= maxDepth && (!selector || node.selector === selector || node.name?.includes(selector)))
      .map(({ disabled: _disabled, visible: _visible, depth: _depth, ...node }) => node);
    const publicTarget = { kind: "web", id: snapshot.url };
    log("inspect-dom", caller, publicTarget, "succeeded", nodes.length);
    return {
      status: "succeeded",
      operation: "inspect-dom",
      result: { url: snapshot.url, title: snapshot.title, nodes, truncated: snapshot.truncated },
    };
  }

  function logs({ limit = 20, callerPluginId } = {}) {
    const caller = callerPluginId === undefined ? undefined : normalizeCaller(callerPluginId);
    return operationLog
      .filter((entry) => !caller || entry.callerPluginId === caller)
      .slice(-Math.max(1, Math.min(100, limit)))
      .reverse()
      .map((entry) => structuredClone(entry));
  }

  return { ingest, ingestBrowserSnapshot, status, observe, inspectDom, logs };
}
