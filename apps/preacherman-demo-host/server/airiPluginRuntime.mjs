import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PLUGIN_ID = "preacherman-runtime";
const TASK_TOOL = `${PLUGIN_ID}::task_summary`;
const MANIFEST_KIND = "manifest.plugin.airi.moeru.ai";
const READY_LIFECYCLE = [
  "loading", "loaded", "authenticating", "authenticated", "announced",
  "preparing", "prepared", "configured", "ready",
];

function userError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

// The public Plugin SDK is not currently available from npm. This bridge keeps
// AIRI's ManifestV1 identity and lifecycle contract at the boundary so the host
// can be replaced without changing the Settings API or capability placement.
export function createAiriPluginRuntime({ file, taskStore, now = () => new Date().toISOString() }) {
  const manifest = {
    apiVersion: "v1",
    kind: MANIFEST_KIND,
    name: PLUGIN_ID,
    entrypoints: { node: "builtin:preacherman-runtime" },
  };
  let state;
  let mutationQueue = Promise.resolve();
  let session = null;

  async function loadState() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      state = { version: 1, enabled: parsed?.enabled !== false };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { version: 1, enabled: true };
      await writePrivateJson(file, state);
    }
    return state;
  }

  async function initialize() {
    const current = await loadState();
    if (!session) {
      session = {
        id: PLUGIN_ID,
        manifest,
        version: "0.1.0",
        phase: current.enabled ? "ready" : "stopped",
        lifecycle: current.enabled ? READY_LIFECYCLE : ["stopped"],
        revision: 1,
        updatedAt: now(),
        error: null,
      };
    }
    return session;
  }

  function snapshot() {
    return {
      ...structuredClone(session),
      enabled: session.phase !== "stopped",
      capabilities: ["tools", "tasks:read"],
      toolCount: session.phase === "ready" ? 1 : 0,
    };
  }

  async function listPlugins() {
    await initialize();
    await mutationQueue;
    return [snapshot()];
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      await initialize();
      return operation();
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function setEnabled(id, enabled) {
    if (id !== PLUGIN_ID) throw userError(`Unknown AIRI plugin: ${id}`);
    if (typeof enabled !== "boolean") throw userError("Plugin enabled must be a boolean.");
    return mutate(async () => {
      state.enabled = enabled;
      await writePrivateJson(file, state);
      session = {
        ...session,
        phase: enabled ? "ready" : "stopped",
        lifecycle: enabled ? READY_LIFECYCLE : ["stopped"],
        revision: session.revision + 1,
        updatedAt: now(),
        error: null,
      };
      return snapshot();
    });
  }

  async function reload(id = PLUGIN_ID) {
    if (id !== PLUGIN_ID) throw userError(`Unknown AIRI plugin: ${id}`);
    return mutate(async () => {
      session = {
        ...session,
        phase: state.enabled ? "ready" : "stopped",
        lifecycle: state.enabled ? READY_LIFECYCLE : ["stopped"],
        revision: session.revision + 1,
        updatedAt: now(),
        error: null,
      };
      return snapshot();
    });
  }

  async function listTools() {
    await initialize();
    await mutationQueue;
    if (session.phase !== "ready") return [];
    return [{
      pluginId: PLUGIN_ID,
      name: TASK_TOOL,
      toolName: "task_summary",
      description: "Read the persisted Preacherman TaskRun and artifact summary.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    }];
  }

  async function callTool(name, args = {}) {
    if (name !== TASK_TOOL) throw userError(`Unknown AIRI plugin tool: ${name}`);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw userError("Plugin tool arguments must be an object.");
    await initialize();
    await mutationQueue;
    if (session.phase !== "ready") throw userError(`AIRI plugin is not ready: ${PLUGIN_ID}`);
    const tasks = await taskStore.list(50);
    const result = {
      checkedAt: now(),
      taskCount: tasks.length,
      activeTaskCount: tasks.filter((task) => task.status === "queued" || task.status === "running").length,
      completedTaskCount: tasks.filter((task) => task.status === "completed").length,
      artifactCount: tasks.filter((task) => task.artifact).length,
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false };
  }

  async function executeCapability(capabilityId, context = {}) {
    if (capabilityId === "agent.plugin-tools") {
      const tools = await listTools();
      const result = await callTool(TASK_TOOL, {});
      return {
        status: "succeeded",
        protocol: "airi-plugin",
        plugin: PLUGIN_ID,
        tool: TASK_TOOL,
        tools: tools.map((tool) => tool.name),
        result: result.structuredContent,
        summary: context.locale === "zh-CN"
          ? `插件宿主已连接 ${tools.length} 个工具；读取到 ${result.structuredContent.taskCount} 个任务。`
          : `Plugin host connected ${tools.length} tool; read ${result.structuredContent.taskCount} tasks.`,
      };
    }
    if (capabilityId === "runtime.plugin-inspector") {
      const plugins = await listPlugins();
      return { status: "succeeded", protocol: "airi-plugin", plugins, summary: `Plugin inspector read ${plugins.length} session.` };
    }
    if (capabilityId === "plugin.hot-reload") {
      const plugin = await reload();
      return { status: "succeeded", protocol: "airi-plugin", plugin: plugin.id, phase: plugin.phase, summary: `Plugin reloaded: ${plugin.id}.` };
    }
    return undefined;
  }

  return { callTool, executeCapability, initialize, listPlugins, listTools, reload, setEnabled };
}
