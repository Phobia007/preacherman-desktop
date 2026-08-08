import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CLIENT_FAMILIES = new Set([
  "airi-card", "appearance", "audio", "avatar", "locale", "motion",
  "persona", "presentation", "scene", "shortcut", "stage",
]);
const LOCAL_CAPABILITIES = new Set([
  "agent.bindings-api", "agent.kits-api",
  "companion.chat", "conversation.history", "plugin.activity",
  "plugin.hot-reload", "plugin.manager", "provider.smoke-test",
  "runtime.io-history", "runtime.plugin-inspector", "mcp.servers",
]);
const EXTERNAL_FAMILIES = new Set([
  "artistry", "computer-use", "connection", "game", "mcp", "plugin", "vision",
]);

function familyOf(capabilityId) {
  return capabilityId.split(".", 1)[0];
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function backendState(capabilityId, config) {
  const family = familyOf(capabilityId);
  if (LOCAL_CAPABILITIES.has(capabilityId) || family === "task") {
    return { state: "available", adapter: family === "task" ? "preacherman-task" : `preacherman-${family}`, requirements: [] };
  }
  if (CLIENT_FAMILIES.has(family)) {
    return { state: "client-runtime", adapter: "preacherman-stage", requirements: [] };
  }
  if (family === "voice") {
    if (["voice.capture-mode", "voice.mic-test", "voice.quick-input", "voice.vad"].includes(capabilityId)) {
      return { state: "client-runtime", adapter: "preacherman-realtime-audio", requirements: [] };
    }
    return config.DASHSCOPE_API_KEY
      ? { state: "available", adapter: "preacherman-presentation-runtime", requirements: [] }
      : { state: "configuration-required", adapter: "preacherman-presentation-runtime", requirements: ["speech provider credentials"] };
  }
  if (family === "provider") {
    const configured = Boolean(config.DEEPSEEK_API_KEY || config.DASHSCOPE_API_KEY);
    return configured
      ? { state: "available", adapter: "preacherman-provider-gateway", requirements: [] }
      : { state: "configuration-required", adapter: "preacherman-provider-gateway", requirements: ["provider credentials"] };
  }
  if (family === "agent") {
    if (["agent.mcp-tools", "agent.plugin-tools"].includes(capabilityId)) {
      return {
        state: "available",
        adapter: capabilityId === "agent.mcp-tools"
          ? "preacherman-airi-mcp"
          : capabilityId === "agent.plugin-tools"
            ? "preacherman-airi-plugin-host"
            : "preacherman-task-orchestrator",
        requirements: [],
      };
    }
    return { state: "external-runtime-required", adapter: "airi-extension-host", requirements: ["AIRI plugin or MCP runtime"] };
  }
  if (["companion", "conversation", "journal", "memory", "runtime"].includes(family)) {
    return { state: "external-runtime-required", adapter: "airi-extension-host", requirements: [`${family} capability runtime`] };
  }
  if (EXTERNAL_FAMILIES.has(family)) {
    return { state: "external-runtime-required", adapter: "airi-extension-host", requirements: [`${family} runtime or provider`] };
  }
  return { state: "configuration-required", adapter: "airi-capability-gateway", requirements: ["capability adapter"] };
}

function localizedMessage(locale, state, adapter) {
  const chinese = locale === "zh-CN";
  if (state === "available") return chinese ? `后端已连接：${adapter}` : `Backend connected: ${adapter}`;
  if (state === "client-runtime") return chinese ? `由前端运行时执行：${adapter}` : `Handled by the client runtime: ${adapter}`;
  if (state === "configuration-required") return chinese ? `后端适配器已注册，需要完成配置：${adapter}` : `Backend adapter registered; configuration required: ${adapter}`;
  return chinese ? `后端适配入口已注册，需要外部运行时：${adapter}` : `Backend adapter registered; external runtime required: ${adapter}`;
}

export function createAiriCapabilityRuntime({ file, getRuntimeEnv, executeCapability, now = () => new Date().toISOString() }) {
  let state;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      state = { version: 1, events: Array.isArray(parsed?.events) ? parsed.events : [] };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { version: 1, events: [] };
    }
    return state;
  }

  async function invoke(capabilityId, context = {}) {
    if (!/^[a-z0-9][a-z0-9.-]{1,100}$/.test(capabilityId)) throw new Error("Invalid AIRI capability id.");
    const config = await getRuntimeEnv();
    const backend = backendState(capabilityId, config);
    let execution;
    try {
      execution = await executeCapability?.(capabilityId, context);
    } catch (error) {
      execution = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        summary: context.locale === "zh-CN" ? "能力执行失败。" : "Capability execution failed.",
      };
    }
    const event = {
      eventId: `airi_${randomUUID()}`,
      capabilityId,
      family: familyOf(capabilityId),
      surface: typeof context.surface === "string" ? context.surface.slice(0, 30) : "unknown",
      state: backend.state,
      adapter: backend.adapter,
      requirements: backend.requirements,
      message: execution?.summary || localizedMessage(context.locale, backend.state, backend.adapter),
      ...(execution ? { execution } : {}),
      at: now(),
    };
    const write = mutationQueue.then(async () => {
      const current = await load();
      current.events = [event, ...current.events].slice(0, 200);
      await writePrivateJson(file, current);
      return structuredClone(event);
    });
    mutationQueue = write.then(() => undefined, () => undefined);
    return write;
  }

  async function list(limit = 50) {
    await mutationQueue;
    const current = await load();
    return structuredClone(current.events.slice(0, Math.max(1, Math.min(200, limit))));
  }

  async function status(capabilityIds, context = {}) {
    if (!Array.isArray(capabilityIds) || capabilityIds.length > 300) {
      const error = new Error("Capability ids must be an array with at most 300 entries.");
      error.statusCode = 400;
      throw error;
    }
    const config = await getRuntimeEnv();
    return capabilityIds.map((capabilityId) => {
      if (typeof capabilityId !== "string" || !/^[a-z0-9][a-z0-9.-]{1,100}$/.test(capabilityId)) {
        const error = new Error("Invalid AIRI capability id.");
        error.statusCode = 400;
        throw error;
      }
      const backend = backendState(capabilityId, config);
      return {
        capabilityId,
        ...backend,
        message: localizedMessage(context.locale, backend.state, backend.adapter),
      };
    });
  }

  return { invoke, list, status };
}
