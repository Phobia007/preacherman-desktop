import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BUILTIN_PLUGIN_ID = "preacherman-runtime";
const BUILTIN_TASK_TOOL = `${BUILTIN_PLUGIN_ID}::task_summary`;
const MANIFEST_KIND = "manifest.plugin.preacherman.local";
const PLUGIN_ABI = "preacherman.plugin.v1";
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_PLUGIN_TOOLS = 64;
const PLUGIN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const PERMISSION_PATTERN = /^[a-z][a-z0-9.-]*(?::[a-z][a-z0-9.-]*)*$/;
const SUPPORTED_SCHEMA_TYPES = new Set(["array", "boolean", "integer", "number", "object", "string"]);
const READY_LIFECYCLE = [
  "loading", "loaded", "authenticating", "authenticated", "announced",
  "preparing", "prepared", "configured", "ready",
];

function userError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function approvalError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "PLUGIN_APPROVAL_REQUIRED";
  return error;
}

function ownershipError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "PLUGIN_RESOURCE_OWNER_MISMATCH";
  return error;
}

function withTimeout(operation, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs} ms.`);
      error.statusCode = 504;
      error.code = "PLUGIN_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(operation), timeout]).finally(() => clearTimeout(timer));
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function isInside(root, target) {
  const comparableRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const comparableTarget = process.platform === "win32" ? target.toLowerCase() : target;
  const result = relative(comparableRoot, comparableTarget);
  return result === "" || (!result.startsWith("..") && !isAbsolute(result));
}

function pathKey(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

async function readLimitedFile(path, maximum, label) {
  const details = await stat(path);
  if (!details.isFile()) throw userError(`${label} must be a file.`);
  if (details.size > maximum) throw userError(`${label} exceeds the ${maximum}-byte limit.`);
  return readFile(path, "utf8");
}

function parseManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw userError(`Invalid plugin.preacherman.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw userError("plugin.preacherman.json must be an object.");
  if (manifest.apiVersion !== "v1") throw userError("PREACHERMAN plugin apiVersion must be v1.");
  if (manifest.kind !== MANIFEST_KIND) throw userError(`PREACHERMAN plugin kind must be ${MANIFEST_KIND}.`);
  if (typeof manifest.name !== "string" || !PLUGIN_NAME_PATTERN.test(manifest.name)) throw userError("PREACHERMAN plugin name is invalid.");
  if (!manifest.entrypoints || typeof manifest.entrypoints !== "object" || Array.isArray(manifest.entrypoints)) {
    throw userError("PREACHERMAN plugin entrypoints must be an object.");
  }
  const entrypoint = manifest.entrypoints.node ?? manifest.entrypoints.default;
  if (typeof entrypoint !== "string" || entrypoint.length === 0 || entrypoint.length > 500) {
    throw userError("PREACHERMAN plugin requires a node or default entrypoint.");
  }
  if (isAbsolute(entrypoint)) throw userError("PREACHERMAN plugin entrypoint must be relative to the plugin directory.");
  if (!entrypoint.endsWith(".mjs")) throw userError("PREACHERMAN plugin entrypoint must be an .mjs module.");
  const permissions = manifest.permissions ?? [];
  if (!Array.isArray(permissions) || permissions.length > 32 || permissions.some((permission) => typeof permission !== "string" || !PERMISSION_PATTERN.test(permission))) {
    throw userError("PREACHERMAN plugin permissions must be an array of at most 32 permission identifiers.");
  }
  if (new Set(permissions).size !== permissions.length) throw userError("PREACHERMAN plugin permissions must not contain duplicates.");
  const tools = manifest.tools ?? [];
  if (!Array.isArray(tools) || tools.length > MAX_PLUGIN_TOOLS) throw userError(`PREACHERMAN plugin manifest tools must be an array of at most ${MAX_PLUGIN_TOOLS} entries.`);
  const toolNames = new Set();
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool) || typeof tool.name !== "string" || !TOOL_NAME_PATTERN.test(tool.name)) {
      throw userError("PREACHERMAN plugin manifest contains an invalid tool declaration.");
    }
    if (tool.requiresApproval !== undefined && typeof tool.requiresApproval !== "boolean") {
      throw userError(`PREACHERMAN plugin tool ${tool.name} requiresApproval must be a boolean.`);
    }
    if (toolNames.has(tool.name)) throw userError(`PREACHERMAN plugin manifest declares tool ${tool.name} more than once.`);
    toolNames.add(tool.name);
  }
  return {
    manifest: {
      ...manifest,
      permissions: [...permissions],
      tools: tools.map((tool) => ({ name: tool.name, requiresApproval: tool.requiresApproval ?? true })),
    },
    entrypoint,
  };
}

async function inspectSource(sourceDirectory, trustedRoots = null) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0 || sourceDirectory.length > 2_000) {
    throw userError("A trusted plugin source directory is required.");
  }
  const root = await realpath(resolve(sourceDirectory));
  if (!(await stat(root)).isDirectory()) throw userError("PREACHERMAN plugin source must be a directory.");
  const trustedRoot = trustedRoots === null ? null : trustedRoots.find((candidate) => isInside(candidate, root));
  if (trustedRoots !== null && !trustedRoot) {
    throw userError("PREACHERMAN plugin source is outside the configured trusted roots.");
  }
  const manifestPath = await realpath(join(root, "plugin.preacherman.json"));
  if (!isInside(root, manifestPath)) throw userError("plugin.preacherman.json escapes the plugin directory.");
  const { manifest, entrypoint } = parseManifest(await readLimitedFile(manifestPath, MAX_MANIFEST_BYTES, "plugin.preacherman.json"));
  const entryPath = await realpath(resolve(root, entrypoint));
  if (!isInside(root, entryPath)) throw userError("PREACHERMAN plugin entrypoint escapes the plugin directory.");
  await readLimitedFile(entryPath, MAX_ENTRY_BYTES, "PREACHERMAN plugin entrypoint");
  return { root, manifest, entryPath, trustedRoot };
}

function validateSchema(schema, label, depth = 0, ancestors = new Set()) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw userError(`${label} must be an object.`);
  if (depth > 12) throw userError(`${label} exceeds the supported schema depth.`);
  if (ancestors.has(schema)) throw userError(`${label} must not contain circular references.`);
  const nextAncestors = new Set(ancestors).add(schema);
  if (schema.type !== undefined && (typeof schema.type !== "string" || !SUPPORTED_SCHEMA_TYPES.has(schema.type))) {
    throw userError(`${label} has an unsupported type.`);
  }
  if (schema.properties !== undefined) {
    if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) throw userError(`${label}.properties must be an object.`);
    for (const [name, propertySchema] of Object.entries(schema.properties)) {
      validateSchema(propertySchema, `${label}.properties.${name}`, depth + 1, nextAncestors);
    }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== "string") || new Set(schema.required).size !== schema.required.length) {
      throw userError(`${label}.required must be an array of unique property names.`);
    }
  }
  if ((schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined) && schema.type !== "object") {
    throw userError(`${label} must use type object with object constraints.`);
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    validateSchema(schema.additionalProperties, `${label}.additionalProperties`, depth + 1, nextAncestors);
  }
  if (schema.items !== undefined) {
    if (schema.type !== "array") throw userError(`${label} must use type array with items.`);
    validateSchema(schema.items, `${label}.items`, depth + 1, nextAncestors);
  }
}

function valueMatchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "string") return typeof value === "string";
  return true;
}

function validateSchemaValue(value, schema, path = "arguments", depth = 0) {
  if (depth > 12) throw userError(`${path} exceeds the supported nesting depth.`);
  if (schema.type && !valueMatchesType(value, schema.type)) throw userError(`${path} must be of type ${schema.type}.`);
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    for (const name of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) throw userError(`${path}.${name} is required.`);
    }
    for (const [name, propertyValue] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, name)) {
        validateSchemaValue(propertyValue, properties[name], `${path}.${name}`, depth + 1);
      } else if (schema.additionalProperties === false) {
        throw userError(`${path}.${name} is not allowed.`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateSchemaValue(propertyValue, schema.additionalProperties, `${path}.${name}`, depth + 1);
      }
    }
  }
  if (schema.type === "array" && schema.items) {
    value.forEach((item, index) => validateSchemaValue(item, schema.items, `${path}[${index}]`, depth + 1));
  }
}

function validateTool(pluginId, value, requiresApproval = true) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw userError(`Plugin ${pluginId} returned an invalid tool.`);
  if (typeof value.name !== "string" || !TOOL_NAME_PATTERN.test(value.name)) throw userError(`Plugin ${pluginId} returned an invalid tool name.`);
  if (typeof value.execute !== "function") throw userError(`Plugin ${pluginId} tool ${value.name} requires execute().`);
  if (value.description !== undefined && typeof value.description !== "string") throw userError(`Plugin ${pluginId} tool ${value.name} has an invalid description.`);
  const inputSchema = structuredClone(value.inputSchema ?? { type: "object", properties: {}, additionalProperties: false });
  validateSchema(inputSchema, `Plugin ${pluginId} tool ${value.name} inputSchema`);
  return {
    pluginId,
    name: `${pluginId}::${value.name}`,
    toolName: value.name,
    description: value.description ?? "",
    inputSchema,
    requiresApproval,
    execute: value.execute,
  };
}

function publicTool(tool) {
  const { execute: _execute, ...metadata } = tool;
  return structuredClone(metadata);
}

function createPluginToolRegistry({ pluginId, declarations, permissions }) {
  const approvalByTool = new Map(declarations.map((tool) => [tool.name, tool.requiresApproval]));
  const permissionApprovalRequired = permissionsRequireApproval(permissions);
  const registrations = new Map();
  let active = true;

  function assertActive() {
    if (!active) throw userError(`Plugin ${pluginId} tool registry is no longer active.`);
  }

  function register(definition) {
    assertActive();
    if (definition && typeof definition === "object"
      && (Object.hasOwn(definition, "pluginId") || Object.hasOwn(definition, "ownerPluginId"))) {
      throw ownershipError(`Plugin ${pluginId} tool definitions cannot override their host-captured owner.`);
    }
    const declared = definition && typeof definition === "object" ? approvalByTool.get(definition.name) : undefined;
    if (registrations.has(definition.name)) throw userError(`Plugin ${pluginId} tool is already registered: ${definition.name}`);
    if (registrations.size >= MAX_PLUGIN_TOOLS) throw userError(`Plugin ${pluginId} cannot register more than ${MAX_PLUGIN_TOOLS} tools.`);
    const tool = validateTool(pluginId, definition, permissionApprovalRequired || (declared ?? true));
    registrations.set(tool.toolName, tool);
    return publicTool(tool);
  }

  function unregister(name) {
    assertActive();
    if (typeof name !== "string" || !TOOL_NAME_PATTERN.test(name)) throw userError(`Plugin ${pluginId} supplied an invalid tool name.`);
    const tool = registrations.get(name);
    if (!tool) throw userError(`Plugin ${pluginId} does not own a registered tool named ${name}.`);
    registrations.delete(name);
    return publicTool(tool);
  }

  function list() {
    assertActive();
    return [...registrations.values()].map(publicTool).sort((left, right) => left.name.localeCompare(right.name));
  }

  function deactivate() {
    active = false;
    registrations.clear();
  }

  return {
    facade: Object.freeze({ list, register, unregister }),
    deactivate,
    getByQualifiedName(name) {
      if (!active || typeof name !== "string" || !name.startsWith(`${pluginId}::`)) return undefined;
      return registrations.get(name.slice(pluginId.length + 2));
    },
    listInternal() {
      return active ? [...registrations.values()] : [];
    },
    register,
    unregister,
  };
}

function permissionsRequireApproval(permissions) {
  return permissions.some((permission) => !permission.endsWith(":read"));
}

function normalizeToolResult(result) {
  if (result && typeof result === "object" && !Array.isArray(result) && Array.isArray(result.content)) {
    return {
      content: result.content,
      structuredContent: result.structuredContent && typeof result.structuredContent === "object" ? result.structuredContent : {},
      isError: result.isError === true,
    };
  }
  const structuredContent = result && typeof result === "object" && !Array.isArray(result) ? result : { value: result };
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, isError: false };
}

// External modules intentionally use a small host-owned ABI instead of pretending
// that arbitrary PREACHERMAN browser/worker entrypoints can run inside the Node service.
// Module shape: default { abi: "preacherman.plugin.v1", activate(context) }.
export function createPreachermanPluginRuntime({
  file,
  taskStore,
  hostBridge = Object.freeze({}),
  createPluginBridge,
  kits,
  bindings,
  widgets,
  releasePluginResources,
  trustedRoots,
  timeoutMs = 10_000,
  now = () => new Date().toISOString(),
}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new TypeError("Plugin timeout must be an integer between 10 and 120000 milliseconds.");
  }
  if (createPluginBridge !== undefined && typeof createPluginBridge !== "function") {
    throw new TypeError("createPluginBridge must be a function.");
  }
  if (releasePluginResources !== undefined && typeof releasePluginResources !== "function") {
    throw new TypeError("releasePluginResources must be a function.");
  }
  if (trustedRoots !== undefined && (!Array.isArray(trustedRoots)
    || trustedRoots.some((root) => typeof root !== "string" || root.length === 0 || root.length > 2_000))) {
    throw new TypeError("trustedRoots must be an array of non-empty directory paths.");
  }
  const configuredTrustedRoots = trustedRoots === undefined ? null : [...trustedRoots];
  let canonicalTrustedRootsPromise;

  function getTrustedRoots() {
    if (configuredTrustedRoots === null) return Promise.resolve(null);
    canonicalTrustedRootsPromise ??= Promise.all(configuredTrustedRoots.map(async (configuredRoot) => {
      let root;
      try {
        root = await realpath(resolve(configuredRoot));
      } catch {
        throw userError(`Trusted plugin root cannot be resolved: ${configuredRoot}`);
      }
      if (!(await stat(root)).isDirectory()) throw userError(`Trusted plugin root must be a directory: ${configuredRoot}`);
      return root;
    })).then((roots) => [...new Map(roots.map((root) => [pathKey(root), root])).values()]);
    return canonicalTrustedRootsPromise;
  }
  const builtinManifest = {
    apiVersion: "v1",
    kind: MANIFEST_KIND,
    name: BUILTIN_PLUGIN_ID,
    entrypoints: { node: "builtin:preacherman-runtime" },
    permissions: ["tasks:read"],
    tools: [{ name: "task_summary", requiresApproval: false }],
  };
  let state;
  let initialized = false;
  let mutationQueue = Promise.resolve();
  const sessions = new Map();

  async function persistState() {
    await writePrivateJson(file, {
      version: state.version,
      // Keep the original field for packaged hosts and existing state readers.
      enabled: state.builtinEnabled,
      builtinEnabled: state.builtinEnabled,
      sources: state.sources,
    });
  }

  async function loadState() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      state = {
        version: 2,
        builtinEnabled: parsed?.builtinEnabled ?? parsed?.enabled !== false,
        sources: Array.isArray(parsed?.sources)
          ? parsed.sources.filter((item) => item && typeof item.id === "string" && typeof item.directory === "string")
            .map((item) => ({ id: item.id, directory: item.directory, enabled: item.enabled !== false }))
          : [],
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { version: 2, builtinEnabled: true, sources: [] };
      await persistState();
    }
    return state;
  }

  function createBuiltinSession() {
    return {
      id: BUILTIN_PLUGIN_ID,
      manifest: builtinManifest,
      version: "0.1.0",
      source: "builtin",
      phase: state.builtinEnabled ? "ready" : "stopped",
      lifecycle: state.builtinEnabled ? READY_LIFECYCLE : ["stopped"],
      revision: 1,
      updatedAt: now(),
      error: null,
      tools: state.builtinEnabled ? [{
        pluginId: BUILTIN_PLUGIN_ID,
        name: BUILTIN_TASK_TOOL,
        toolName: "task_summary",
        description: "Read the persisted Preacherman TaskRun and artifact summary.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        requiresApproval: false,
        execute: async () => {
          const tasks = await taskStore.list(50);
          return {
            checkedAt: now(),
            taskCount: tasks.length,
            activeTaskCount: tasks.filter((task) => task.status === "queued" || task.status === "running").length,
            completedTaskCount: tasks.filter((task) => task.status === "succeeded" || task.status === "completed").length,
            artifactCount: tasks.filter((task) => task.artifact).length,
          };
        },
      }] : [],
      widgetCount: 0,
      dispose: null,
    };
  }

  function toolsForSession(session) {
    return session?.toolRegistry ? session.toolRegistry.listInternal() : session?.tools ?? [];
  }

  async function activateExternal(source, previousRevision = 0) {
    const inspected = await inspectSource(source.directory, await getTrustedRoots());
    if (inspected.manifest.name !== source.id) throw userError(`Plugin source identity changed from ${source.id} to ${inspected.manifest.name}.`);
    const moduleUrl = pathToFileURL(inspected.entryPath);
    moduleUrl.searchParams.set("preachermanReload", randomUUID());
    const imported = await withTimeout(import(moduleUrl.href), timeoutMs, `Plugin ${source.id} import`);
    const plugin = imported.default ?? imported.preachermanPlugin;
    if (!plugin || plugin.abi !== PLUGIN_ABI || typeof plugin.activate !== "function") {
      throw userError(`Plugin ${source.id} uses an unsupported ABI; expected ${PLUGIN_ABI}.`);
    }
    const resourceState = { active: true };
    const assertResourceActive = () => {
      if (!resourceState.active) throw userError(`Plugin ${source.id} host context is no longer active.`);
    };
    const toolRegistry = createPluginToolRegistry({
      pluginId: source.id,
      declarations: inspected.manifest.tools,
      permissions: inspected.manifest.permissions,
    });
    const kitFacade = kits ? Object.freeze({
      discover({ capability } = {}) {
        assertResourceActive();
        return kits.discover({ capability }).map(({ name, version, description, capabilities, phase }) => ({
          name, version, description, capabilities, phase,
        }));
      },
      require(name, versionRange = "*") {
        assertResourceActive();
        const kit = kits.attachConsumer(source.id, name, versionRange);
        return {
          name: kit.name,
          version: kit.version,
          description: kit.description,
          capabilities: kit.capabilities,
          phase: kit.phase,
        };
      },
      provide(definition) {
        assertResourceActive();
        if (typeof kits.provide !== "function") throw userError("The host Kit Registry does not support external providers.");
        const kit = kits.provide(source.id, definition);
        return {
          name: kit.name,
          version: kit.version,
          description: kit.description,
          capabilities: kit.capabilities,
          phase: kit.phase,
        };
      },
      register(definition) {
        assertResourceActive();
        if (typeof kits.provide !== "function") throw userError("The host Kit Registry does not support external providers.");
        const kit = kits.provide(source.id, definition);
        return {
          name: kit.name,
          version: kit.version,
          description: kit.description,
          capabilities: kit.capabilities,
          phase: kit.phase,
        };
      },
      unregister(name) {
        assertResourceActive();
        if (typeof kits.unprovide !== "function") throw userError("The host Kit Registry does not support external providers.");
        const kit = kits.unprovide(source.id, name);
        bindings?.removeKit?.(name);
        return {
          name: kit.name,
          version: kit.version,
          description: kit.description,
          capabilities: kit.capabilities,
          phase: kit.phase,
        };
      },
    }) : null;
    const bindPluginBinding = ({ kit, operation, versionRange = "*", handler }) => {
      assertResourceActive();
      if (typeof bindings?.bind !== "function") throw userError("The host Binding Registry does not support plugin providers.");
      const owned = typeof kits?.ownedBy === "function"
        && kits.ownedBy(source.id).some((record) => record.name === kit);
      if (!owned) throw ownershipError(`Plugin ${source.id} can only bind operations for a Kit it provides: ${String(kit)}`);
      if (typeof handler !== "function") throw userError(`Plugin ${source.id} binding ${String(kit)}.${String(operation)} requires a handler.`);
      return bindings.bind({
        pluginId: source.id,
        kit,
        operation,
        versionRange,
        async handler(input, context) {
          assertResourceActive();
          if (context?.providerPluginId !== source.id) {
            throw ownershipError(`Plugin ${source.id} does not own binding ${String(kit)}.${String(operation)}.`);
          }
          const result = await withTimeout(
            Promise.resolve().then(() => handler(structuredClone(input), Object.freeze({ ...context }))),
            timeoutMs,
            `Plugin ${source.id} binding ${String(kit)}.${String(operation)}`,
          );
          return structuredClone(result);
        },
      });
    };
    const bindingFacade = bindings ? Object.freeze({
      bind: bindPluginBinding,
      async invoke({ kit, operation, versionRange = "*", input }) {
        assertResourceActive();
        if (typeof bindings.invokeAs === "function") {
          return bindings.invokeAs(source.id, kit, operation, input, { versionRange });
        }
        return bindings.invoke({
          kit,
          operation,
          versionRange,
          input,
          context: { callerPluginId: source.id },
        });
      },
      list() {
        assertResourceActive();
        return bindings.list({ pluginId: source.id });
      },
      register: bindPluginBinding,
      unbind({ kit, operation }) {
        assertResourceActive();
        return bindings.unbind(kit, operation, source.id);
      },
    }) : null;
    const toolFacade = toolRegistry.facade;
    let activated;
    try {
      const pluginBridge = createPluginBridge
        ? await withTimeout(createPluginBridge({
          pluginId: source.id,
          permissions: Object.freeze([...inspected.manifest.permissions]),
          hostBridge,
        }), timeoutMs, `Plugin ${source.id} host bridge`)
        : hostBridge;
      activated = await withTimeout(plugin.activate(Object.freeze({
        abi: PLUGIN_ABI,
        pluginId: source.id,
        hostBridge: Object.freeze(pluginBridge ?? {}),
        permissions: Object.freeze([...inspected.manifest.permissions]),
        kits: kitFacade,
        bindings: bindingFacade,
        tools: toolFacade,
        now,
      })), timeoutMs, `Plugin ${source.id} activation`);
      if (!activated || typeof activated !== "object" || Array.isArray(activated)) throw userError(`Plugin ${source.id} activate() must return an object.`);
      if (activated.dispose !== undefined && typeof activated.dispose !== "function") throw userError(`Plugin ${source.id} returned an invalid dispose hook.`);
      if (activated.widgets !== undefined && (!Array.isArray(activated.widgets) || activated.widgets.length > 32)) {
        throw userError(`Plugin ${source.id} widgets must be an array of at most 32 definitions.`);
      }
      if (activated.tools !== undefined && (!Array.isArray(activated.tools) || activated.tools.length > MAX_PLUGIN_TOOLS)) {
        throw userError(`Plugin ${source.id} tools must be an array of at most ${MAX_PLUGIN_TOOLS} definitions.`);
      }
      for (const tool of activated.tools ?? []) toolRegistry.register(tool);
      const widgetDefinitions = activated.widgets ?? [];
      if (widgets) {
        await widgets.removePlugin?.(source.id);
        try {
          for (const definition of widgetDefinitions) await widgets.register({ pluginId: source.id, ...definition });
        } catch (error) {
          await Promise.resolve(widgets.removePlugin?.(source.id)).catch(() => undefined);
          throw error;
        }
      } else if (widgetDefinitions.length > 0) {
        throw userError(`Plugin ${source.id} declared widgets but the Widget Kit is unavailable.`);
      }
      return {
        id: source.id,
        manifest: inspected.manifest,
        version: typeof plugin.version === "string" ? plugin.version : "0.0.0",
        source: inspected.root,
        trustedRoot: inspected.trustedRoot,
        phase: "ready",
        lifecycle: READY_LIFECYCLE,
        revision: previousRevision + 1,
        updatedAt: now(),
        error: null,
        toolRegistry,
        resourceState,
        widgetCount: widgetDefinitions.length,
        dispose: activated.dispose ?? null,
      };
    } catch (error) {
      try {
        if (typeof activated?.dispose === "function") {
          await withTimeout(activated.dispose(), timeoutMs, `Plugin ${source.id} failed activation disposal`);
        }
      } catch {
        // Preserve the activation error; host-owned resources are still removed below.
      } finally {
        resourceState.active = false;
        toolRegistry.deactivate();
      }
      throw error;
    }
  }

  async function cleanupPluginResources(pluginId) {
    if (!pluginId) return;
    const ownedKits = typeof kits?.ownedBy === "function" ? kits.ownedBy(pluginId).map((kit) => kit.name) : [];
    bindings?.removePlugin?.(pluginId);
    for (const kit of ownedKits) bindings?.removeKit?.(kit);
    kits?.removePlugin?.(pluginId);
    await widgets?.removePlugin?.(pluginId);
    await releasePluginResources?.(pluginId);
  }

  async function activateExternalSafely(source, previousRevision = 0) {
    try {
      return await activateExternal(source, previousRevision);
    } catch (error) {
      await Promise.resolve(cleanupPluginResources(source.id)).catch(() => undefined);
      throw error;
    }
  }

  async function disposeSession(session) {
    try {
      if (typeof session?.dispose === "function") {
        await withTimeout(session.dispose(), timeoutMs, `Plugin ${session.id} disposal`);
      }
    } finally {
      if (session?.resourceState) session.resourceState.active = false;
      session?.toolRegistry?.deactivate();
      await cleanupPluginResources(session?.id);
    }
  }

  function failedSession(source, error, previousRevision = 0) {
    return {
      id: source.id,
      manifest: { apiVersion: "v1", kind: MANIFEST_KIND, name: source.id, entrypoints: {}, permissions: [], tools: [] },
      version: "0.0.0",
      source: source.directory,
      phase: "failed",
      lifecycle: ["loading", "failed"],
      revision: previousRevision + 1,
      updatedAt: now(),
      error: error instanceof Error ? error.message : String(error),
      tools: [],
      toolRegistry: null,
      resourceState: null,
      widgetCount: 0,
      dispose: null,
    };
  }

  async function initialize() {
    if (initialized) return;
    await loadState();
    sessions.set(BUILTIN_PLUGIN_ID, createBuiltinSession());
    for (const source of state.sources) {
      if (!source.enabled) {
        sessions.set(source.id, {
          ...failedSession(source, null),
          phase: "stopped",
          lifecycle: ["stopped"],
          error: null,
        });
        continue;
      }
      try {
        sessions.set(source.id, await activateExternalSafely(source));
      } catch (error) {
        sessions.set(source.id, failedSession(source, error));
      }
    }
    initialized = true;
  }

  function snapshot(session) {
    const usedKits = typeof kits?.usedBy === "function"
      ? kits.usedBy(session.id).map((kit) => kit.name)
      : typeof kits?.discover === "function" ? kits.discover({ pluginId: session.id }).map((kit) => kit.name) : [];
    const providedKits = typeof kits?.providedBy === "function"
      ? kits.providedBy(session.id).map((kit) => kit.name)
      : [];
    const associatedKits = [...new Set([...usedKits, ...providedKits])].sort((left, right) => left.localeCompare(right));
    const associatedBindings = typeof bindings?.list === "function"
      ? bindings.list({ pluginId: session.id })
        .filter((binding) => binding.pluginId === session.id)
        .map((binding) => `${binding.kit}.${binding.operation}`)
      : [];
    return {
      id: session.id,
      manifest: structuredClone(session.manifest),
      version: session.version,
      ...(session.source === "builtin" ? {} : { sourceDirectory: session.source }),
      trust: session.source === "builtin"
        ? { mode: "builtin" }
        : configuredTrustedRoots === null
          ? { mode: "explicit-directory" }
          : { mode: "root-allowlist", ...(session.trustedRoot ? { root: session.trustedRoot } : {}) },
      phase: session.phase,
      lifecycle: [...session.lifecycle],
      revision: session.revision,
      updatedAt: session.updatedAt,
      error: session.error,
      enabled: session.phase !== "stopped",
      capabilities: ["tools", ...(session.id === BUILTIN_PLUGIN_ID ? ["tasks:read"] : [])],
      permissions: [...(session.manifest.permissions ?? [])],
      kits: associatedKits,
      usedKits,
      providedKits,
      bindings: associatedBindings,
      toolCount: session.phase === "ready" ? toolsForSession(session).length : 0,
      widgetCount: session.phase === "ready" ? session.widgetCount ?? 0 : 0,
    };
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      await initialize();
      return operation();
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function listPlugins() {
    await initialize();
    await mutationQueue;
    return [...sessions.values()].map(snapshot).sort((left, right) => left.id.localeCompare(right.id));
  }

  async function install(sourceDirectory) {
    return mutate(async () => {
      const inspected = await inspectSource(sourceDirectory, await getTrustedRoots());
      const id = inspected.manifest.name;
      if (id === BUILTIN_PLUGIN_ID || state.sources.some((source) => source.id === id)) throw userError(`PREACHERMAN plugin is already installed: ${id}`);
      const source = { id, directory: inspected.root, enabled: true };
      const session = await activateExternalSafely(source);
      state.sources.push(source);
      try {
        await persistState();
      } catch (error) {
        await disposeSession(session);
        state.sources.pop();
        throw error;
      }
      sessions.set(id, session);
      return snapshot(session);
    });
  }

  async function setEnabled(id, enabled) {
    if (typeof enabled !== "boolean") throw userError("Plugin enabled must be a boolean.");
    return mutate(async () => {
      if (id === BUILTIN_PLUGIN_ID) {
        state.builtinEnabled = enabled;
        await persistState();
        const previous = sessions.get(id);
        sessions.set(id, { ...createBuiltinSession(), revision: previous.revision + 1 });
        return snapshot(sessions.get(id));
      }
      const source = state.sources.find((item) => item.id === id);
      if (!source) throw userError(`Unknown PREACHERMAN plugin: ${id}`);
      const previous = sessions.get(id);
      if (source.enabled === enabled) return snapshot(previous);
      if (enabled) {
        const next = await activateExternalSafely(source, previous.revision);
        source.enabled = true;
        try {
          await persistState();
        } catch (error) {
          source.enabled = false;
          await disposeSession(next);
          throw error;
        }
        sessions.set(id, next);
      } else {
        await disposeSession(previous);
        source.enabled = false;
        await persistState();
        sessions.set(id, {
          ...previous,
          phase: "stopped",
          lifecycle: ["stopped"],
          revision: previous.revision + 1,
          updatedAt: now(),
          error: null,
          tools: [],
          toolRegistry: null,
          resourceState: null,
          dispose: null,
        });
      }
      return snapshot(sessions.get(id));
    });
  }

  async function reload(id = BUILTIN_PLUGIN_ID) {
    return mutate(async () => {
      const previous = sessions.get(id);
      if (!previous) throw userError(`Unknown PREACHERMAN plugin: ${id}`);
      if (id === BUILTIN_PLUGIN_ID) {
        sessions.set(id, { ...createBuiltinSession(), revision: previous.revision + 1 });
      } else {
        const source = state.sources.find((item) => item.id === id);
        if (!source.enabled) return snapshot(previous);
        await disposeSession(previous);
        try {
          sessions.set(id, await activateExternalSafely(source, previous.revision));
        } catch (error) {
          sessions.set(id, failedSession(source, error, previous.revision));
          throw error;
        }
      }
      return snapshot(sessions.get(id));
    });
  }

  async function uninstall(id) {
    if (id === BUILTIN_PLUGIN_ID) throw userError("The built-in Preacherman plugin cannot be uninstalled.");
    return mutate(async () => {
      const index = state.sources.findIndex((source) => source.id === id);
      if (index < 0) throw userError(`Unknown PREACHERMAN plugin: ${id}`);
      const previous = sessions.get(id);
      await disposeSession(previous);
      const [removed] = state.sources.splice(index, 1);
      try {
        await persistState();
      } catch (error) {
        state.sources.splice(index, 0, removed);
        throw error;
      }
      sessions.delete(id);
      return { id, uninstalled: true };
    });
  }

  async function listTools() {
    await initialize();
    await mutationQueue;
    return [...sessions.values()]
      .filter((session) => session.phase === "ready")
      .flatMap((session) => toolsForSession(session).map(publicTool))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function listToolsForPlugin(pluginId) {
    await initialize();
    await mutationQueue;
    const session = sessions.get(pluginId);
    if (!session || session.phase !== "ready" || !session.toolRegistry) return [];
    return session.toolRegistry.listInternal().map(publicTool).sort((left, right) => left.name.localeCompare(right.name));
  }

  async function registerTool(pluginId, definition) {
    await initialize();
    await mutationQueue;
    const session = sessions.get(pluginId);
    if (!session || session.phase !== "ready" || !session.toolRegistry) {
      throw ownershipError(`Plugin ${String(pluginId)} does not own an active dynamic tool registry.`);
    }
    return session.toolRegistry.register(definition);
  }

  async function unregisterTool(pluginId, name) {
    await initialize();
    await mutationQueue;
    const session = sessions.get(pluginId);
    if (!session || session.phase !== "ready" || !session.toolRegistry) {
      throw ownershipError(`Plugin ${String(pluginId)} does not own an active dynamic tool registry.`);
    }
    return session.toolRegistry.unregister(name);
  }

  async function callTool(name, args = {}, approvalContext = {}) {
    if (typeof name !== "string") throw userError("Plugin tool name is required.");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw userError("Plugin tool arguments must be an object.");
    if (!approvalContext || typeof approvalContext !== "object" || Array.isArray(approvalContext)) throw userError("Plugin tool approval context must be an object.");
    await initialize();
    await mutationQueue;
    for (const session of sessions.values()) {
      const tool = session.phase === "ready"
        ? session.toolRegistry?.getByQualifiedName(name) ?? session.tools?.find((item) => item.name === name)
        : undefined;
      if (tool) {
        validateSchemaValue(args, tool.inputSchema);
        if (tool.requiresApproval && approvalContext.approved !== true) {
          throw approvalError(`Plugin tool ${tool.name} requires explicit approval for this invocation.`);
        }
        return normalizeToolResult(await withTimeout(
          tool.execute(args),
          timeoutMs,
          `Plugin tool ${tool.name}`,
        ));
      }
    }
    throw userError(`Unknown PREACHERMAN plugin tool: ${name}`);
  }

  async function executeCapability(capabilityId, context = {}) {
    if (capabilityId === "agent.plugin-tools") {
      const tools = await listTools();
      const result = await callTool(BUILTIN_TASK_TOOL, {});
      return {
        status: "succeeded",
        protocol: "preacherman-plugin",
        plugin: BUILTIN_PLUGIN_ID,
        tool: BUILTIN_TASK_TOOL,
        tools: tools.map((tool) => tool.name),
        result: result.structuredContent,
        summary: context.locale === "zh-CN"
          ? `插件宿主已连接 ${tools.length} 个工具；读取到 ${result.structuredContent.taskCount} 个任务。`
          : `Plugin host connected ${tools.length} tools; read ${result.structuredContent.taskCount} tasks.`,
      };
    }
    if (capabilityId === "runtime.plugin-inspector") {
      const plugins = await listPlugins();
      return { status: "succeeded", protocol: "preacherman-plugin", plugins, summary: `Plugin inspector read ${plugins.length} sessions.` };
    }
    if (capabilityId === "plugin.hot-reload") {
      const plugin = await reload();
      return { status: "succeeded", protocol: "preacherman-plugin", plugin: plugin.id, phase: plugin.phase, summary: `Plugin reloaded: ${plugin.id}.` };
    }
    return undefined;
  }

  async function close() {
    await mutationQueue;
    if (!initialized) return;
    await Promise.allSettled([...sessions.values()].map(disposeSession));
    sessions.clear();
    initialized = false;
  }

  return {
    callTool,
    close,
    executeCapability,
    initialize,
    install,
    listPlugins,
    listTools,
    listToolsForPlugin,
    registerTool,
    reload,
    setEnabled,
    uninstall,
    unregisterTool,
  };
}
