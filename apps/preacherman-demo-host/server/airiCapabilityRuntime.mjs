import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CLIENT_CAPABILITIES = new Set([
  "appearance.select", "avatar.preview", "avatar.select", "avatar.status",
  "locale.select", "motion.select", "presentation.stop", "scene.transparent-background",
  "voice.capture-mode", "voice.mic-test", "voice.quick-input", "voice.vad",
]);
const LOCAL_CAPABILITIES = new Set([
  "agent.bindings-api", "agent.kits-api",
  "companion.chat", "conversation.history", "plugin.activity",
  "game.tic-tac-toe", "memory.recall", "memory.time-awareness", "persona.select",
  "plugin.gamelets", "plugin.hot-reload", "plugin.manager", "plugin.widgets",
  "provider.catalog", "provider.smoke-test",
  "runtime.io-history", "runtime.plugin-inspector", "mcp.servers",
  "task.acceptance", "task.artifacts", "task.cancel", "task.confirm",
  "task.create", "task.events", "task.retry",
]);
const EXTERNAL_FAMILIES = new Set([
  "airi-card", "artistry", "audio", "avatar", "computer-use", "connection", "game",
  "mcp", "motion", "persona", "plugin", "scene", "shortcut", "stage", "task", "vision",
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
  if (LOCAL_CAPABILITIES.has(capabilityId)) {
    return { state: "available", adapter: family === "task" ? "preacherman-task" : `preacherman-${family}`, requirements: [] };
  }
  if (CLIENT_CAPABILITIES.has(capabilityId)) {
    return { state: "client-runtime", adapter: "preacherman-stage", requirements: [] };
  }
  if (family === "voice") {
    const requirements = ["voice.asr", "voice.asr-test"].includes(capabilityId)
      ? ["DASHSCOPE_API_KEY", "DASHSCOPE_WORKSPACE_ID"]
      : ["voice.tts", "voice.tts-preview", "voice.tts-test"].includes(capabilityId)
        ? ["DASHSCOPE_API_KEY"]
        : null;
    if (!requirements) {
      return { state: "external-runtime-required", adapter: "airi-voice-extension", requirements: ["matching speech provider adapter"] };
    }
    return requirements.every((key) => Boolean(config[key]))
      ? { state: "available", adapter: "preacherman-presentation-runtime", requirements: [] }
      : { state: "configuration-required", adapter: "preacherman-presentation-runtime", requirements };
  }
  if (family === "provider") {
    return { state: "external-runtime-required", adapter: "airi-provider-extension", requirements: ["matching provider adapter"] };
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

export function createAiriCapabilityRuntime({ file, getRuntimeEnv, executeCapability, resolveCapabilityStatus, now = () => new Date().toISOString() }) {
  let state;
  let mutationQueue = Promise.resolve();

  async function resolveBackend(capabilityId, config, context) {
    const resolved = await resolveCapabilityStatus?.(capabilityId, context);
    if (!resolved) return backendState(capabilityId, config);
    const allowedStates = new Set(["available", "client-runtime", "configuration-required", "external-runtime-required"]);
    if (!allowedStates.has(resolved.state) || typeof resolved.adapter !== "string") {
      throw new Error(`Invalid capability status resolver result for ${capabilityId}.`);
    }
    return {
      state: resolved.state,
      adapter: resolved.adapter,
      requirements: Array.isArray(resolved.requirements) ? resolved.requirements.filter((entry) => typeof entry === "string") : [],
    };
  }

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
    let backend = await resolveBackend(capabilityId, config, context);
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
    if (["configuration-required", "external-runtime-required", "client-runtime"].includes(execution?.status)) {
      backend = { ...backend, state: execution.status };
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
    return Promise.all(capabilityIds.map(async (capabilityId) => {
      if (typeof capabilityId !== "string" || !/^[a-z0-9][a-z0-9.-]{1,100}$/.test(capabilityId)) {
        const error = new Error("Invalid AIRI capability id.");
        error.statusCode = 400;
        throw error;
      }
      const backend = await resolveBackend(capabilityId, config, context);
      return {
        capabilityId,
        ...backend,
        message: localizedMessage(context.locale, backend.state, backend.adapter),
      };
    }));
  }

  return { invoke, list, status };
}
