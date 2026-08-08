import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const AIRI_WIDGET_KIND = "widget.airi.moeru.ai";

const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PLACEMENTS = new Set(["home", "work", "ledger", "lab", "gallery"]);
const TONES = new Set(["primary", "muted", "accent", "success", "warning", "error"]);
const TEXT_VARIANTS = new Set(["heading", "body", "caption"]);
const ORIENTATIONS = new Set(["vertical", "horizontal"]);
const FORBIDDEN_KEYS = /^(?:__proto__|prototype|constructor|html|innerHTML|srcdoc|script|style|dangerouslySetInnerHTML|on[A-Z].*)$/;

function widgetError(code, message, statusCode = 400, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw widgetError("INVALID_WIDGET_INPUT", `${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw widgetError("INVALID_WIDGET_INPUT", `${label} must be a plain JSON object.`);
  }
  return value;
}

function requireExactKeys(value, allowed, required, label, code = "INVALID_WIDGET_SCHEMA") {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.test(key) || !allowed.has(key)) {
      throw widgetError(code, `${label} contains an unsupported property: ${key}.`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw widgetError(code, `${label} requires ${key}.`);
    }
  }
}

function requireString(value, label, maximum, { pattern } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || (pattern && !pattern.test(value))) {
    throw widgetError("INVALID_WIDGET_INPUT", `${label} is invalid.`);
  }
  return value;
}

function normalizePluginId(pluginId) {
  return requireString(pluginId, "Plugin id", 64, { pattern: ID_PATTERN });
}

function normalizeManifest(value) {
  const manifest = requirePlainObject(value, "Widget manifest");
  requireExactKeys(
    manifest,
    new Set(["apiVersion", "kind", "id", "version", "title", "description", "placement"]),
    new Set(["apiVersion", "kind", "id", "version", "title", "placement"]),
    "Widget manifest",
    "INVALID_WIDGET_MANIFEST",
  );
  if (manifest.apiVersion !== "v1") throw widgetError("INVALID_WIDGET_MANIFEST", "Widget apiVersion must be v1.");
  if (manifest.kind !== AIRI_WIDGET_KIND) {
    throw widgetError("INVALID_WIDGET_MANIFEST", `Widget kind must be ${AIRI_WIDGET_KIND}.`);
  }
  const id = requireString(manifest.id, "Widget id", 64, { pattern: ID_PATTERN });
  const version = requireString(manifest.version, "Widget version", 32, { pattern: VERSION_PATTERN });
  const title = requireString(manifest.title.trim(), "Widget title", 120);
  if (!PLACEMENTS.has(manifest.placement)) {
    throw widgetError("INVALID_WIDGET_MANIFEST", `Widget placement must be one of: ${[...PLACEMENTS].join(", ")}.`);
  }
  let description;
  if (manifest.description !== undefined) {
    if (typeof manifest.description !== "string" || manifest.description.length > 500) {
      throw widgetError("INVALID_WIDGET_MANIFEST", "Widget description must be a string of at most 500 characters.");
    }
    description = manifest.description;
  }
  return {
    apiVersion: "v1",
    kind: AIRI_WIDGET_KIND,
    id,
    version,
    title,
    ...(description === undefined ? {} : { description }),
    placement: manifest.placement,
  };
}

function validateJsonValue(value, label, depth = 0) {
  if (depth > 6) throw widgetError("INVALID_WIDGET_SCHEMA", `${label} exceeds the JSON depth limit.`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 2_000) return value;
  if (Array.isArray(value)) {
    if (value.length > 50) throw widgetError("INVALID_WIDGET_SCHEMA", `${label} has too many items.`);
    return value.map((item, index) => validateJsonValue(item, `${label}[${index}]`, depth + 1));
  }
  if (value && typeof value === "object") {
    requirePlainObject(value, label);
    const entries = Object.entries(value);
    if (entries.length > 50) throw widgetError("INVALID_WIDGET_SCHEMA", `${label} has too many properties.`);
    const result = {};
    for (const [key, item] of entries) {
      if (FORBIDDEN_KEYS.test(key) || key.length > 80) {
        throw widgetError("INVALID_WIDGET_SCHEMA", `${label} contains an unsafe property: ${key}.`);
      }
      result[key] = validateJsonValue(item, `${label}.${key}`, depth + 1);
    }
    return result;
  }
  throw widgetError("INVALID_WIDGET_SCHEMA", `${label} must contain only finite JSON values.`);
}

function normalizeNode(value, context, depth = 0) {
  if (depth > context.maxDepth) throw widgetError("INVALID_WIDGET_SCHEMA", "Widget schema exceeds the node depth limit.");
  context.nodes += 1;
  if (context.nodes > context.maxNodes) throw widgetError("INVALID_WIDGET_SCHEMA", "Widget schema exceeds the node count limit.");
  const node = requirePlainObject(value, "Widget node");
  if (typeof node.type !== "string") throw widgetError("INVALID_WIDGET_SCHEMA", "Widget node requires a type.");

  if (node.type === "container") {
    requireExactKeys(node, new Set(["type", "orientation", "gap", "children"]), new Set(["type", "children"]), "Container node");
    const orientation = node.orientation ?? "vertical";
    if (!ORIENTATIONS.has(orientation)) throw widgetError("INVALID_WIDGET_SCHEMA", "Container orientation is invalid.");
    const gap = node.gap ?? 12;
    if (!Number.isInteger(gap) || gap < 0 || gap > 48) throw widgetError("INVALID_WIDGET_SCHEMA", "Container gap must be an integer from 0 to 48.");
    if (!Array.isArray(node.children) || node.children.length > 50) {
      throw widgetError("INVALID_WIDGET_SCHEMA", "Container children must be an array with at most 50 nodes.");
    }
    return { type: "container", orientation, gap, children: node.children.map((child) => normalizeNode(child, context, depth + 1)) };
  }

  if (node.type === "text") {
    requireExactKeys(node, new Set(["type", "text", "variant", "tone"]), new Set(["type", "text"]), "Text node");
    const text = requireString(node.text, "Text node content", 2_000);
    const variant = node.variant ?? "body";
    const tone = node.tone ?? "primary";
    if (!TEXT_VARIANTS.has(variant) || !TONES.has(tone)) throw widgetError("INVALID_WIDGET_SCHEMA", "Text node variant or tone is invalid.");
    return { type: "text", text, variant, tone };
  }

  if (node.type === "metric") {
    requireExactKeys(node, new Set(["type", "label", "value", "tone"]), new Set(["type", "label", "value"]), "Metric node");
    const label = requireString(node.label, "Metric label", 120);
    if ((typeof node.value !== "string" && typeof node.value !== "number") || String(node.value).length > 120 || (typeof node.value === "number" && !Number.isFinite(node.value))) {
      throw widgetError("INVALID_WIDGET_SCHEMA", "Metric value must be a finite number or short string.");
    }
    const tone = node.tone ?? "primary";
    if (!TONES.has(tone)) throw widgetError("INVALID_WIDGET_SCHEMA", "Metric tone is invalid.");
    return { type: "metric", label, value: node.value, tone };
  }

  if (node.type === "progress") {
    requireExactKeys(node, new Set(["type", "label", "value"]), new Set(["type", "label", "value"]), "Progress node");
    const label = requireString(node.label, "Progress label", 120);
    if (typeof node.value !== "number" || !Number.isFinite(node.value) || node.value < 0 || node.value > 1) {
      throw widgetError("INVALID_WIDGET_SCHEMA", "Progress value must be between 0 and 1.");
    }
    return { type: "progress", label, value: node.value };
  }

  if (node.type === "button") {
    requireExactKeys(node, new Set(["type", "label", "action", "disabled"]), new Set(["type", "label", "action"]), "Button node");
    const label = requireString(node.label, "Button label", 120);
    const action = requirePlainObject(node.action, "Button action");
    requireExactKeys(action, new Set(["type", "event", "payload"]), new Set(["type", "event"]), "Button action");
    if (action.type !== "emit") throw widgetError("INVALID_WIDGET_SCHEMA", "Button actions may only emit a declared event.");
    const event = requireString(action.event, "Button event", 80, { pattern: ID_PATTERN });
    if (node.disabled !== undefined && typeof node.disabled !== "boolean") throw widgetError("INVALID_WIDGET_SCHEMA", "Button disabled must be a boolean.");
    return {
      type: "button",
      label,
      action: { type: "emit", event, ...(action.payload === undefined ? {} : { payload: validateJsonValue(action.payload, "Button payload") }) },
      ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    };
  }

  throw widgetError("INVALID_WIDGET_SCHEMA", `Unsupported widget node type: ${node.type}.`);
}

function normalizeSchema(value, limits) {
  return normalizeNode(value, { nodes: 0, maxDepth: limits.maxDepth, maxNodes: limits.maxNodes });
}

function serializedSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch (cause) {
    throw widgetError("INVALID_WIDGET_INPUT", "Widget definition must be serializable JSON.", 400, cause);
  }
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function publicWidget(record) {
  return structuredClone(record);
}

export function createAiriWidgetRuntime({
  file,
  now = () => new Date().toISOString(),
  maxWidgetBytes = 64 * 1024,
  maxWidgets = 500,
  maxWidgetsPerPlugin = 50,
  maxDepth = 8,
  maxNodes = 200,
} = {}) {
  if (typeof file !== "string" || !file) throw new TypeError("Widget runtime requires a persistence file.");
  for (const [label, value] of Object.entries({ maxWidgetBytes, maxWidgets, maxWidgetsPerPlugin, maxDepth, maxNodes })) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer.`);
  }
  let state;
  let mutationQueue = Promise.resolve();

  function normalizeDefinition(definition) {
    const input = requirePlainObject(definition, "Widget definition");
    requireExactKeys(input, new Set(["manifest", "schema"]), new Set(["manifest", "schema"]), "Widget definition", "INVALID_WIDGET_INPUT");
    const normalized = { manifest: normalizeManifest(input.manifest), schema: normalizeSchema(input.schema, { maxDepth, maxNodes }) };
    if (serializedSize(normalized) > maxWidgetBytes) {
      throw widgetError("WIDGET_TOO_LARGE", `Widget definition exceeds the ${maxWidgetBytes}-byte limit.`, 413);
    }
    return normalized;
  }

  async function load() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      if (parsed?.version !== 1 || !Array.isArray(parsed.widgets)) {
        throw widgetError("WIDGET_STATE_INVALID", "Widget persistence file has an unsupported shape.", 500);
      }
      try {
        for (const record of parsed.widgets) {
          normalizePluginId(record?.pluginId);
          const definition = normalizeDefinition({ manifest: record?.manifest, schema: record?.schema });
          if (record?.id !== definition.manifest.id || !Number.isInteger(record?.revision) || record.revision < 1) {
            throw new Error("record identity or revision is invalid");
          }
        }
      } catch (cause) {
        throw widgetError("WIDGET_STATE_INVALID", "Widget persistence file contains an invalid record.", 500, cause);
      }
      state = parsed;
    } catch (error) {
      if (error?.code === "ENOENT") {
        state = { version: 1, widgets: [] };
        return state;
      }
      if (error?.code === "WIDGET_STATE_INVALID") throw error;
      throw widgetError("WIDGET_STATE_INVALID", `Unable to read widget persistence: ${error instanceof Error ? error.message : String(error)}`, 500, error);
    }
    return state;
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      const current = await load();
      const value = await operation(current);
      await writePrivateJson(file, current);
      return structuredClone(value);
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function ownedRecord(current, pluginId, id) {
    normalizePluginId(pluginId);
    requireString(id, "Widget id", 64, { pattern: ID_PATTERN });
    const record = current.widgets.find((candidate) => candidate.id === id);
    if (!record) throw widgetError("WIDGET_NOT_FOUND", `Unknown AIRI widget: ${id}`, 404);
    if (record.pluginId !== pluginId) {
      throw widgetError("WIDGET_OWNER_MISMATCH", `Plugin ${pluginId} does not own widget ${id}.`, 403);
    }
    return record;
  }

  async function register({ pluginId, manifest, schema }) {
    pluginId = normalizePluginId(pluginId);
    const definition = normalizeDefinition({ manifest, schema });
    return mutate((current) => {
      if (current.widgets.length >= maxWidgets) throw widgetError("WIDGET_LIMIT_EXCEEDED", "Widget registry is full.", 409);
      if (current.widgets.filter((widget) => widget.pluginId === pluginId).length >= maxWidgetsPerPlugin) {
        throw widgetError("WIDGET_LIMIT_EXCEEDED", `Plugin ${pluginId} reached its widget limit.`, 409);
      }
      if (current.widgets.some((widget) => widget.id === definition.manifest.id)) {
        throw widgetError("WIDGET_ALREADY_REGISTERED", `AIRI widget is already registered: ${definition.manifest.id}`, 409);
      }
      const timestamp = now();
      const record = {
        id: definition.manifest.id,
        pluginId,
        ...definition,
        phase: "ready",
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        lifecycle: [{ phase: "registered", at: timestamp }, { phase: "ready", at: timestamp }],
      };
      current.widgets.push(record);
      return record;
    });
  }

  async function list({ pluginId } = {}) {
    await mutationQueue;
    const current = await load();
    if (pluginId !== undefined) normalizePluginId(pluginId);
    return current.widgets
      .filter((widget) => pluginId === undefined || widget.pluginId === pluginId)
      .map(publicWidget)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async function get({ pluginId, id }) {
    await mutationQueue;
    return publicWidget(ownedRecord(await load(), pluginId, id));
  }

  async function update({ pluginId, id, manifest, schema }) {
    if (manifest === undefined && schema === undefined) throw widgetError("INVALID_WIDGET_INPUT", "Widget update requires manifest or schema.");
    return mutate((current) => {
      const record = ownedRecord(current, pluginId, id);
      const next = normalizeDefinition({ manifest: manifest ?? record.manifest, schema: schema ?? record.schema });
      if (next.manifest.id !== id) throw widgetError("INVALID_WIDGET_MANIFEST", "Widget id cannot change during update.", 409);
      const timestamp = now();
      record.manifest = next.manifest;
      record.schema = next.schema;
      record.revision += 1;
      record.updatedAt = timestamp;
      record.phase = "ready";
      record.lifecycle.push({ phase: "updated", at: timestamp }, { phase: "ready", at: timestamp });
      return record;
    });
  }

  async function remove({ pluginId, id }) {
    return mutate((current) => {
      const record = ownedRecord(current, pluginId, id);
      current.widgets.splice(current.widgets.indexOf(record), 1);
      const timestamp = now();
      return { ...record, phase: "removed", updatedAt: timestamp, lifecycle: [...record.lifecycle, { phase: "removed", at: timestamp }] };
    });
  }

  async function removePlugin(pluginId) {
    pluginId = normalizePluginId(pluginId);
    return mutate((current) => {
      const removed = current.widgets.filter((widget) => widget.pluginId === pluginId);
      current.widgets = current.widgets.filter((widget) => widget.pluginId !== pluginId);
      return { pluginId, removed: removed.length, widgetIds: removed.map((widget) => widget.id).sort() };
    });
  }

  return { get, list, register, remove, removePlugin, update };
}
