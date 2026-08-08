import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  createPitchProposal,
  generatePitchKit,
  repairPitchKit,
  readPitchBrief,
  validatePitchKit,
  writePitchKit,
} from "./agentRuntime.mjs";
import { appendTaskEvent, createTaskStore } from "./taskStore.mjs";
import { createAiriCapabilityRuntime } from "./airiCapabilityRuntime.mjs";
import { createAiriMcpRuntime } from "./airiMcpRuntime.mjs";
import { createAiriKitsRuntime } from "./airiKitsRuntime.mjs";
import { createAiriPluginRuntime } from "./airiPluginRuntime.mjs";
import { createAiriPluginTaskBinding } from "./airiPluginTaskBinding.mjs";
import { createAiriWidgetRuntime, AIRI_WIDGET_KIND } from "./airiWidgetRuntime.mjs";
import { createAiriGameletRuntime } from "./airiGameletRuntime.mjs";
import { createAiriProviderRuntime } from "./airiProviderRuntime.mjs";
import { createAiriMemoryPersonaRuntime } from "./airiMemoryPersonaRuntime.mjs";
import { createAiriConnectionRuntime } from "./airiConnectionRuntime.mjs";
import { createAiriComputerVisionRuntime } from "./airiComputerVisionRuntime.mjs";

const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_PORT = 8787;

function json(response, status, body, origin) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

export function createPreachermanServer(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowedOrigins = new Set([
    "http://127.0.0.1:1420",
    "http://localhost:1420",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
  ]);
  const proposals = new Map();
  let savedProviderConfig = null;
  let conversationSaveQueue = Promise.resolve();

  function taskStoreFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "task-store.v1.json");
  }

  const taskStore = createTaskStore({ file: taskStoreFile() });
  const airiKitsRuntime = createAiriKitsRuntime();
  const airiPluginTaskBinding = createAiriPluginTaskBinding({ taskStore });

  for (const kit of airiKitsRuntime.kits.discover()) {
    airiKitsRuntime.kits.attachConsumer("preacherman-runtime", kit.name, "^1.0.0");
  }

  function callerPluginId(context) {
    return typeof context?.callerPluginId === "string" ? context.callerPluginId : "preacherman-runtime";
  }

  function bindTaskOperation(kit, operation, bindingOperation = operation) {
    airiKitsRuntime.bindings.bind({
      pluginId: "preacherman-host",
      kit,
      operation,
      versionRange: "^1.0.0",
      handler(input, context) {
        return airiPluginTaskBinding.execute(bindingOperation, input, {
          pluginId: callerPluginId(context),
          toolName: input?.toolName,
        });
      },
    });
  }

  bindTaskOperation("task", "create");
  bindTaskOperation("task", "get", "status");
  bindTaskOperation("task", "cancel");
  bindTaskOperation("task", "retry");
  bindTaskOperation("ledger", "get", "status");
  bindTaskOperation("ledger", "write-artifact", "complete-with-artifact");
  airiKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "task",
    operation: "list",
    versionRange: "^1.0.0",
    async handler(_input, context) {
      const pluginId = callerPluginId(context);
      return { tasks: (await taskStore.list(50)).filter((task) => task.pluginId === pluginId) };
    },
  });
  airiKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "ledger",
    operation: "list",
    versionRange: "^1.0.0",
    async handler(_input, context) {
      const pluginId = callerPluginId(context);
      return { entries: (await taskStore.list(50)).filter((task) => task.pluginId === pluginId) };
    },
  });
  airiKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "ledger",
    operation: "append",
    versionRange: "^1.0.0",
    handler(input, context) {
      const operation = input?.type === "failure" ? "fail" : "progress";
      return airiPluginTaskBinding.execute(operation, input, { pluginId: callerPluginId(context) });
    },
  });

  function mcpConfigFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "mcp.json");
  }

  const airiMcpRuntime = createAiriMcpRuntime({ configFile: mcpConfigFile(), taskStore });

  function pluginStateFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "airi-plugins.v1.json");
  }

  function widgetStateFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "airi-widgets.v1.json");
  }

  function memoryPersonaFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "airi-memory-persona.v1.json");
  }

  let airiPluginRuntime;
  airiPluginRuntime = createAiriPluginRuntime({
    file: pluginStateFile(),
    taskStore,
    hostBridge: Object.freeze({ abi: "preacherman.host.v1", service: "preacherman-demo-host" }),
    kits: airiKitsRuntime.kits,
    bindings: airiKitsRuntime.bindings,
  });
  airiKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "tools",
    operation: "list",
    versionRange: "^1.0.0",
    async handler() {
      return { tools: await airiPluginRuntime.listTools() };
    },
  });
  airiKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "tools",
    operation: "call",
    versionRange: "^1.0.0",
    handler(input) {
      return executePluginToolAsTask(input?.name, input?.arguments ?? {});
    },
  });

  async function executePluginToolAsTask(name, args) {
    const separator = name.indexOf("::");
    if (separator < 1) {
      const error = new Error("Plugin tool name must include its plugin id.");
      error.statusCode = 400;
      throw error;
    }
    const pluginId = name.slice(0, separator);
    const toolName = name.slice(separator + 2);
    const context = { callerPluginId: pluginId };
    const created = await airiKitsRuntime.bindings.invoke({
      kit: "task",
      operation: "create",
      versionRange: "^1.0.0",
      input: { objective: `Execute AIRI plugin tool ${name}`, parameters: args, toolName },
      context,
    });
    const taskId = created.task.taskId;
    let terminal = false;
    try {
      await airiKitsRuntime.bindings.invoke({
        kit: "ledger",
        operation: "append",
        versionRange: "^1.0.0",
        input: { taskId, value: 0.35, stage: "tool-call", message: `Calling ${name}.` },
        context,
      });
      const result = await airiPluginRuntime.callTool(name, args);
      if (result.isError) {
        await airiPluginTaskBinding.execute("fail", {
          taskId,
          error: `Plugin tool ${name} returned an error result.`,
          result: result.structuredContent,
        }, { pluginId });
        terminal = true;
        const error = new Error(`Plugin tool ${name} returned an error result.`);
        error.statusCode = 502;
        throw error;
      }
      const completed = await airiKitsRuntime.bindings.invoke({
        kit: "ledger",
        operation: "write-artifact",
        versionRange: "^1.0.0",
        input: {
          taskId,
          result: result.structuredContent,
          artifact: {
            name: `${toolName}-result.json`,
            mediaType: "application/json",
            content: result.structuredContent,
          },
        },
        context,
      });
      terminal = true;
      return { ...result, task: completed.task, ledger: completed.ledger };
    } catch (error) {
      if (!terminal) {
        await airiPluginTaskBinding.execute("fail", {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        }, { pluginId }).catch(() => undefined);
      }
      throw error;
    }
  }

  function providerConfigFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "provider-settings.json");
  }

  function conversationLedgerFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "conversation-ledger.json");
  }

  function airiCapabilityEventsFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "airi-capability-events.v1.json");
  }

  async function readConversationLedger() {
    try {
      const entries = JSON.parse(await readFile(conversationLedgerFile(), "utf8"));
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  async function saveConversation(id, entry) {
    if (!/^[A-Za-z0-9:_-]{1,120}$/.test(id)) throw new Error("Invalid conversation id.");
    const locale = entry?.locale === "en" ? "en" : "zh-CN";
    const messages = Array.isArray(entry?.messages) ? entry.messages
      .filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message?.text === "string")
      .slice(-20)
      .map((message) => ({ role: message.role, text: message.text.slice(0, 4_000) })) : [];
    const next = { id, locale, updatedAt: new Date().toISOString(), messages };
    const write = conversationSaveQueue.then(async () => {
      const entries = (await readConversationLedger()).filter((item) => item?.id !== id);
      const target = conversationLedgerFile();
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify([next, ...entries].slice(0, 10)), { mode: 0o600 });
      await rename(temporary, target);
      if (process.platform !== "win32") await chmod(target, 0o600);
    });
    conversationSaveQueue = write.catch(() => undefined);
    await write;
    return next;
  }

  async function providerConfig() {
    if (savedProviderConfig) return savedProviderConfig;
    try {
      savedProviderConfig = JSON.parse(await readFile(providerConfigFile(), "utf8"));
    } catch {
      savedProviderConfig = {};
    }
    return savedProviderConfig;
  }

  async function runtimeEnv() {
    const saved = await providerConfig();
    return {
      ...env,
      DEEPSEEK_API_KEY: saved.deepseekApiKey || env.DEEPSEEK_API_KEY || "",
      DASHSCOPE_API_KEY: saved.dashscopeApiKey || env.DASHSCOPE_API_KEY || "",
      DASHSCOPE_WORKSPACE_ID: saved.dashscopeWorkspaceId || env.DASHSCOPE_WORKSPACE_ID || "",
    };
  }

  const airiWidgetRuntime = createAiriWidgetRuntime({ file: widgetStateFile() });
  const airiGameletRuntime = createAiriGameletRuntime();
  const airiProviderRuntime = createAiriProviderRuntime({ getConfig: runtimeEnv, fetchImpl });
  const airiMemoryPersonaRuntime = createAiriMemoryPersonaRuntime({ file: memoryPersonaFile() });
  const airiConnectionRuntime = createAiriConnectionRuntime();
  const airiComputerVisionRuntime = createAiriComputerVisionRuntime();

  async function initializeEcosystemRuntimes() {
    await airiMemoryPersonaRuntime.initialize();
    if ((await airiMemoryPersonaRuntime.listPersonas()).length === 0) {
      await airiMemoryPersonaRuntime.createPersona({
        name: "Preacherman",
        description: "Local demo companion persona",
        instructions: "Be concise, auditable, and explicit about unavailable capabilities.",
      });
    }
    if (!(await airiWidgetRuntime.list()).some((widget) => widget.id === "ecosystem-status")) {
      await airiWidgetRuntime.register({
        pluginId: "preacherman-runtime",
        manifest: {
          apiVersion: "v1",
          kind: AIRI_WIDGET_KIND,
          id: "ecosystem-status",
          version: "1.0.0",
          title: "AIRI ecosystem status",
          placement: "work",
        },
        schema: {
          type: "container",
          orientation: "vertical",
          gap: 8,
          children: [
            { type: "text", text: "AIRI runtimes are registered", variant: "heading", tone: "primary" },
            { type: "metric", label: "Core kits", value: 3, tone: "success" },
            { type: "button", label: "Open ledger", action: { type: "emit", event: "open-ledger" } },
          ],
        },
      });
    }
  }

  async function executeEcosystemCapability(capabilityId, context = {}) {
    if (capabilityId === "agent.kits-api") {
      const kits = airiKitsRuntime.kits.discover();
      return { status: "succeeded", protocol: "airi-kits", kits, summary: `Discovered ${kits.length} AIRI kits.` };
    }
    if (capabilityId === "agent.bindings-api") {
      const bindings = airiKitsRuntime.bindings.list();
      return { status: "succeeded", protocol: "airi-bindings", bindings, summary: `Discovered ${bindings.length} AIRI bindings.` };
    }
    if (capabilityId === "plugin.widgets") {
      const widgets = await airiWidgetRuntime.list();
      return { status: "succeeded", protocol: "airi-widget", widgets, summary: `Loaded ${widgets.length} declarative widgets.` };
    }
    if (capabilityId === "plugin.gamelets") {
      const gamelets = airiGameletRuntime.discover();
      return { status: "succeeded", protocol: "airi-gamelet", gamelets, summary: `Loaded ${gamelets.length} gamelets.` };
    }
    if (capabilityId === "game.tic-tac-toe") {
      const session = await airiGameletRuntime.createSession({ pluginId: "preacherman-runtime", gameletId: "tic-tac-toe" });
      return { status: "succeeded", protocol: "airi-gamelet", session, summary: `Started offline gamelet ${session.id}.` };
    }
    if (capabilityId === "provider.catalog") {
      const providers = await airiProviderRuntime.catalog();
      return { status: "succeeded", protocol: "airi-provider", providers, summary: `Read ${providers.length} provider definitions.` };
    }
    if (capabilityId === "persona.select") {
      const persona = await airiMemoryPersonaRuntime.getSelectedPersona();
      return { status: "succeeded", protocol: "airi-persona", persona, summary: `Selected persona: ${persona?.name ?? "none"}.` };
    }
    if (capabilityId === "memory.recall" || capabilityId === "memory.time-awareness") {
      const memories = await airiMemoryPersonaRuntime.recall({ namespace: "default", limit: 10 });
      return { status: "succeeded", protocol: "airi-memory", memories, summary: `Recalled ${memories.length} local memories.` };
    }
    if (capabilityId.startsWith("connection.")) {
      const service = capabilityId.slice("connection.".length);
      const connection = airiConnectionRuntime.get(service);
      return { status: "succeeded", protocol: "airi-connection", connection, summary: `${service} status: ${connection.status}.` };
    }
    const computerVisionCapability = {
      "vision.screen": "screenshot",
      "vision.camera": "camera-window",
      "computer-use.desktop": "cursor-monitor",
      "computer-use.browser": "cursor-monitor",
      "computer-use.dom": "cursor-monitor",
      "computer-use.session": "cursor-monitor",
      "computer-use.transcript": "cursor-monitor",
    }[capabilityId];
    if (computerVisionCapability) {
      const input = computerVisionCapability === "camera-window" ? { source: "camera" } : {};
      const result = await airiComputerVisionRuntime.invoke(computerVisionCapability, input);
      return {
        ...result,
        protocol: "airi-computer-vision",
        summary: result.status === "succeeded"
          ? `${computerVisionCapability} completed.`
          : `${computerVisionCapability} requires an installed desktop or vision adapter.`,
      };
    }
    return undefined;
  }

  const airiCapabilityRuntime = createAiriCapabilityRuntime({
    file: airiCapabilityEventsFile(),
    getRuntimeEnv: runtimeEnv,
    async executeCapability(capabilityId, context) {
      return await executeEcosystemCapability(capabilityId, context)
        ?? await airiMcpRuntime.executeCapability(capabilityId, context)
        ?? await airiPluginRuntime.executeCapability(capabilityId, context);
    },
  });

  async function saveProviderConfig(next) {
    const current = await providerConfig();
    savedProviderConfig = {
      deepseekApiKey: typeof next.deepseekApiKey === "string" && next.deepseekApiKey.trim() ? next.deepseekApiKey.trim() : current.deepseekApiKey || "",
      dashscopeApiKey: typeof next.dashscopeApiKey === "string" && next.dashscopeApiKey.trim() ? next.dashscopeApiKey.trim() : current.dashscopeApiKey || "",
      dashscopeWorkspaceId: typeof next.dashscopeWorkspaceId === "string" && next.dashscopeWorkspaceId.trim() ? next.dashscopeWorkspaceId.trim() : current.dashscopeWorkspaceId || "",
    };
    const target = providerConfigFile();
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(savedProviderConfig), { mode: 0o600 });
    await rename(temporary, target);
    if (process.platform !== "win32") await chmod(target, 0o600);
    return savedProviderConfig;
  }

  async function providerStatus() {
    const config = await runtimeEnv();
    return {
      deepseekConfigured: Boolean(config.DEEPSEEK_API_KEY),
      dashscopeWorkspaceConfigured: Boolean(config.DASHSCOPE_WORKSPACE_ID),
      asrConfigured: Boolean(config.DASHSCOPE_API_KEY && config.DASHSCOPE_WORKSPACE_ID),
      ttsConfigured: Boolean(config.DASHSCOPE_API_KEY),
    };
  }

  function dashscopeAsrUrl(config) {
    const model = "qwen3-asr-flash-realtime";
    return `wss://${config.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(model)}`;
  }

  function dashscopeTtsUrl() {
    return "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime";
  }

  function testDashscopeConnection(url, apiKey) {
    return new Promise((resolveTest) => {
      const socket = new WebSocket(url, {
        headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "realtime=v1" },
      });
      const timeout = setTimeout(() => { socket.terminate(); resolveTest({ configured: true, ok: false, message: "Connection timed out" }); }, 8_000);
      socket.once("open", () => { clearTimeout(timeout); socket.close(); resolveTest({ configured: true, ok: true, message: "Connected" }); });
      socket.once("unexpected-response", (_request, response) => { clearTimeout(timeout); resolveTest({ configured: true, ok: false, message: `HTTP ${response.statusCode || 401}` }); });
      socket.once("error", () => { clearTimeout(timeout); resolveTest({ configured: true, ok: false, message: "Connection failed" }); });
    });
  }

  function cleanConversationHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message?.text === "string")
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.text.trim().slice(0, 2_000) }))
      .filter((message) => message.content);
  }

  function companionFallback(locale, proposalRequested, reason) {
    return {
      message: locale === "zh-CN" ? "我暂时没能拿到完整的模型回复。你可以换一种说法，或直接告诉我想讨论、修改或制作什么。" : "I could not get a complete model reply just now. Try phrasing it another way, or tell me what you would like to discuss, revise, or create.",
      action: proposalRequested ? "propose_task" : "reply",
      diagnostics: { source: "fallback", model: null, reason },
    };
  }

  function parseCompanionResponse(raw, fallback, model) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return fallback;
    const jsonCandidate = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const turn = JSON.parse(jsonCandidate);
      if (typeof turn.message !== "string" || !turn.message.trim()) return fallback;
      return {
        message: turn.message.trim(),
        speechText: typeof turn.speechText === "string" ? turn.speechText.trim().slice(0, 160) : undefined,
        action: turn.action === "propose_task" ? "propose_task" : "reply",
        diagnostics: { source: "deepseek", model, reason: null },
      };
    } catch {
      // A useful natural-language answer is better than throwing it away because
      // the provider did not follow the optional JSON envelope exactly.
      return {
        message: text,
        speechText: text.slice(0, 160),
        action: fallback.action,
        diagnostics: { source: "deepseek-unstructured", model, reason: "unstructured_response" },
      };
    }
  }

  async function createCompanionTurn(input, locale, history) {
    const proposalRequested = /pitch|路演|演示|方案|生成|制作/i.test(input);
    const fallback = companionFallback(locale, proposalRequested, "provider_unavailable");
    const configuredEnv = await runtimeEnv();
    if (!configuredEnv.DEEPSEEK_API_KEY) return fallback;
    try {
      const model = configuredEnv.DEEPSEEK_MODEL || "deepseek-v4-flash";
      const upstream = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${configuredEnv.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.45,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你是 Preacherman，一位自然、可靠的数字伙伴。理解用户的上下文并直接回答，不要自称 A 或 Agent。返回 JSON：message（完整文字）、speechText（不超过80汉字）、action（reply 或 propose_task）。只有用户明确要求生成、整理、制作路演或演示方案时才使用 propose_task。不要编造已完成的工作。" },
            ...cleanConversationHistory(history),
            { role: "user", content: input },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await upstream.json();
      if (!upstream.ok) return companionFallback(locale, proposalRequested, "provider_request_failed");
      return parseCompanionResponse(payload?.choices?.[0]?.message?.content, fallback, model);
    } catch {
      return companionFallback(locale, proposalRequested, "provider_request_failed");
    }
  }

  async function executePitchTask(taskId) {
    try {
      await taskStore.update(taskId, (task) => {
        if (task.status !== "queued") return;
        task.status = "running";
        appendTaskEvent(task, { type: "started", stage: "reading", message: "Reading the fixed PitchKit brief" });
      });
      const brief = await readPitchBrief();

      while (true) {
        const execution = await taskStore.update(taskId, (task) => {
          if (task.status !== "running") return;
          appendTaskEvent(task, { type: "progress", stage: "generating", message: "Generating a constrained PitchKit" });
        });
        if (!execution || execution.status !== "running") return;

        const executionRevision = execution.revision;
        let markdown;
        try {
          markdown = await generatePitchKit({ env: await runtimeEnv(), objective: execution.objective, brief, fetchImpl });
        } catch (error) {
          const latest = await taskStore.get(taskId);
          if (latest?.status === "running" && latest.revision !== executionRevision) continue;
          throw error;
        }

        let latest = await taskStore.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) {
          await taskStore.update(taskId, (task) => {
            if (task.status === "running") appendTaskEvent(task, { type: "revision_restarted", stage: "generating", message: "Restarting generation with the latest direction" });
          });
          continue;
        }

        await taskStore.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            appendTaskEvent(task, { type: "progress", stage: "validating", message: "Validating required sections" });
          }
        });
        try {
          validatePitchKit(markdown);
        } catch {
          await taskStore.update(taskId, (task) => {
            if (task.status === "running" && task.revision === executionRevision) {
              appendTaskEvent(task, { type: "progress", stage: "generating", message: "Repairing the required PitchKit format" });
            }
          });
          markdown = repairPitchKit(execution.objective, brief);
          validatePitchKit(markdown);
        }

        latest = await taskStore.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) continue;
        await taskStore.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            appendTaskEvent(task, { type: "tool_call", stage: "tool-call", message: "Inspecting runtime through the built-in MCP tool" });
          }
        });
        const runtimeTool = await airiMcpRuntime.callTool("preacherman::preacherman_runtime_status", {});
        if (runtimeTool.isError) throw new Error("The built-in MCP runtime status tool failed.");
        latest = await taskStore.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) continue;
        await taskStore.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            task.toolCall = {
              name: "preacherman::preacherman_runtime_status",
              parameterSummary: { keys: [], byteLength: 2 },
              structuredResult: runtimeTool.structuredContent,
            };
            appendTaskEvent(task, { type: "tool_result", stage: "tool-call", message: "Built-in MCP runtime status recorded" });
          }
        });
        await taskStore.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            appendTaskEvent(task, { type: "progress", stage: "writing", message: "Writing the PitchKit artifact" });
          }
        });
        const artifactPath = await writePitchKit({ env, runId: taskId, markdown });

        latest = await taskStore.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) continue;
        const completion = await taskStore.update(taskId, (task) => {
          if (task.status !== "running" || task.revision !== executionRevision) return;
          task.artifact = { name: "pitch-kit.md", path: artifactPath, mediaType: "text/markdown" };
          task.status = "succeeded";
          appendTaskEvent(task, { type: "completed", stage: "terminal", message: "PitchKit completed" });
        });
        if (completion?.status === "running" && completion.revision !== executionRevision) continue;
        return;
      }
    } catch (error) {
      await taskStore.update(taskId, (task) => {
        if (task.status === "cancelled") return;
        task.status = "failed";
        task.retryable = true;
        task.error = error instanceof Error ? error.message : String(error);
        appendTaskEvent(task, { type: "failed", stage: "terminal", message: task.error });
      });
    }
  }

  async function startPitchRun(proposal) {
    const taskId = `run_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const run = {
      taskId,
      runId: taskId,
      proposalId: proposal.proposalId,
      objective: proposal.objective,
      executor: "pitchkit",
      revision: 1,
      status: "queued",
      retryable: false,
      events: [{ sequence: 1, revision: 1, type: "accepted", stage: "queued", message: "PitchKit queued", at: createdAt }],
      artifact: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
    };
    await taskStore.create(run);
    void executePitchTask(taskId);
    return run;
  }

  function requestOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return "http://127.0.0.1:1420";
    return allowedOrigins.has(origin) ? origin : null;
  }

  const server = createServer(async (request, response) => {
    const origin = requestOrigin(request);
    if (!origin) {
      json(response, 403, { error: "Origin is not allowed." }, "null");
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      });
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        const status = await providerStatus();
        json(response, 200, {
          ok: true,
          ...status,
        }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/settings/providers") {
        json(response, 200, await providerStatus(), origin);
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/settings/providers") {
        const body = await readJson(request);
        await saveProviderConfig(body);
        json(response, 200, await providerStatus(), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/settings/test") {
        const config = await runtimeEnv();
        const result = {
          deepseek: { configured: Boolean(config.DEEPSEEK_API_KEY), ok: false, message: "Not configured" },
          asr: { configured: Boolean(config.DASHSCOPE_API_KEY && config.DASHSCOPE_WORKSPACE_ID), ok: false, message: "Not configured" },
          tts: { configured: Boolean(config.DASHSCOPE_API_KEY), ok: false, message: "Not configured" },
        };
        if (config.DEEPSEEK_API_KEY) {
          try {
            const upstream = await fetchImpl("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
            result.deepseek = { configured: true, ok: upstream.ok, message: upstream.ok ? "Connected" : `HTTP ${upstream.status}` };
          } catch {
            result.deepseek = { configured: true, ok: false, message: "Connection failed" };
          }
        }
        if (config.DASHSCOPE_API_KEY && config.DASHSCOPE_WORKSPACE_ID) result.asr = await testDashscopeConnection(dashscopeAsrUrl(config), config.DASHSCOPE_API_KEY);
        if (config.DASHSCOPE_API_KEY) result.tts = await testDashscopeConnection(dashscopeTtsUrl(), config.DASHSCOPE_API_KEY);
        json(response, 200, result, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/config") {
        json(response, 200, { ...(await airiMcpRuntime.readConfigText()), status: airiMcpRuntime.getRuntimeStatus() }, origin);
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/mcp/config") {
        const body = await readJson(request);
        const config = await airiMcpRuntime.writeConfigText(body.text);
        const result = await airiMcpRuntime.applyAndRestart();
        json(response, 200, { ...config, result, status: airiMcpRuntime.getRuntimeStatus() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/tools") {
        json(response, 200, { tools: await airiMcpRuntime.listTools(), status: airiMcpRuntime.getRuntimeStatus() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mcp/tools/call") {
        const body = await readJson(request);
        if (typeof body.name !== "string" || body.name.length > 200) {
          json(response, 400, { error: "MCP tool name is required." }, origin);
          return;
        }
        const result = await airiMcpRuntime.callTool(body.name, body.arguments ?? {});
        json(response, 200, { result }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/plugins") {
        json(response, 200, { plugins: await airiPluginRuntime.listPlugins() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/airi/kits") {
        json(response, 200, {
          kits: airiKitsRuntime.kits.discover(),
          bindings: airiKitsRuntime.bindings.list(),
        }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/install") {
        const body = await readJson(request);
        const plugin = await airiPluginRuntime.install(body.directory);
        json(response, 201, { plugin }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/uninstall") {
        const body = await readJson(request);
        const result = await airiPluginRuntime.uninstall(body.name);
        json(response, 200, { result }, origin);
        return;
      }
      const pluginMatch = url.pathname.match(/^\/api\/plugins\/([A-Za-z0-9_-]{1,80})$/);
      if (request.method === "PUT" && pluginMatch) {
        const plugin = await airiPluginRuntime.setEnabled(pluginMatch[1], (await readJson(request)).enabled);
        json(response, 200, { plugin }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/reload") {
        const body = await readJson(request);
        const plugin = await airiPluginRuntime.reload(typeof body.name === "string" ? body.name : undefined);
        json(response, 200, { plugin }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/plugins/tools") {
        json(response, 200, { tools: await airiPluginRuntime.listTools() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/tools/call") {
        const body = await readJson(request);
        if (typeof body.name !== "string" || body.name.length > 200) {
          json(response, 400, { error: "Plugin tool name is required." }, origin);
          return;
        }
        json(response, 200, { result: await executePluginToolAsTask(body.name, body.arguments ?? {}) }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/widgets") {
        json(response, 200, { widgets: await airiWidgetRuntime.list() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/gamelets") {
        json(response, 200, { gamelets: airiGameletRuntime.discover() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gamelets/sessions") {
        const body = await readJson(request);
        const session = await airiGameletRuntime.createSession({
          pluginId: "preacherman-runtime",
          gameletId: body.gameletId,
          input: body.input,
        });
        json(response, 201, { session }, origin);
        return;
      }
      const gameletActionMatch = url.pathname.match(/^\/api\/gamelets\/sessions\/([^/]+)\/actions$/);
      if (request.method === "POST" && gameletActionMatch) {
        const body = await readJson(request);
        const session = await airiGameletRuntime.sendAction({
          pluginId: "preacherman-runtime",
          sessionId: decodeURIComponent(gameletActionMatch[1]),
          action: body.action,
        });
        json(response, 200, { session }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/providers/catalog") {
        json(response, 200, { providers: await airiProviderRuntime.catalog() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/personas") {
        json(response, 200, {
          personas: await airiMemoryPersonaRuntime.listPersonas(),
          selected: await airiMemoryPersonaRuntime.getSelectedPersona(),
        }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/memory/remember") {
        json(response, 201, { memory: await airiMemoryPersonaRuntime.remember(await readJson(request)) }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/memory/recall") {
        json(response, 200, { memories: await airiMemoryPersonaRuntime.recall(await readJson(request)) }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/connections") {
        json(response, 200, { connections: airiConnectionRuntime.list() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/computer-vision") {
        json(response, 200, { capabilities: airiComputerVisionRuntime.list() }, origin);
        return;
      }
      const computerVisionMatch = url.pathname.match(/^\/api\/computer-vision\/([^/]+)\/(test|invoke)$/);
      if (request.method === "POST" && computerVisionMatch) {
        const capability = decodeURIComponent(computerVisionMatch[1]);
        const result = computerVisionMatch[2] === "test"
          ? await airiComputerVisionRuntime.test(capability)
          : await airiComputerVisionRuntime.invoke(capability, (await readJson(request)).input ?? {});
        json(response, 200, { result }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/conversations/recent") {
        json(response, 200, { entries: await readConversationLedger() }, origin);
        return;
      }
      const conversationMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
      if (request.method === "PUT" && conversationMatch) {
        const entry = await saveConversation(decodeURIComponent(conversationMatch[1]), await readJson(request));
        json(response, 200, { entry }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/airi/events") {
        const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
        json(response, 200, { events: await airiCapabilityRuntime.list(limit) }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/airi/capabilities/status") {
        const body = await readJson(request);
        json(response, 200, {
          capabilities: await airiCapabilityRuntime.status(body.ids, { locale: body.locale }),
        }, origin);
        return;
      }
      const airiCapabilityMatch = url.pathname.match(/^\/api\/airi\/capabilities\/([^/]+)\/invoke$/);
      if (request.method === "POST" && airiCapabilityMatch) {
        const event = await airiCapabilityRuntime.invoke(
          decodeURIComponent(airiCapabilityMatch[1]),
          await readJson(request),
        );
        json(response, 200, { event }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/agent/turn") {
        const body = await readJson(request);
        const input = typeof body.input === "string" ? body.input.trim() : "";
        const locale = body.locale === "en" ? "en" : "zh-CN";
        if (!input || input.length > 4_000) {
          json(response, 400, { error: "input must contain 1 to 4000 characters." }, origin);
          return;
        }
        const turn = await createCompanionTurn(input, locale, body.history);
        let proposal = null;
        if (turn.action === "propose_task") {
          proposal = createPitchProposal({ id: `proposal_${randomUUID()}`, objective: input, locale });
          proposals.set(proposal.proposalId, proposal);
        }
        json(response, 200, { displayText: turn.message, speechText: turn.speechText || turn.message.slice(0, 80), action: turn.action, proposal, diagnostics: turn.diagnostics }, origin);
        return;
      }
      const proposalMatch = url.pathname.match(/^\/api\/agent\/proposals\/([^/]+)\/confirm$/);
      if (request.method === "POST" && proposalMatch) {
        const proposal = proposals.get(decodeURIComponent(proposalMatch[1]));
        if (!proposal) {
          json(response, 404, { error: "Task proposal not found." }, origin);
          return;
        }
        const body = await readJson(request);
        if (typeof body.objective === "string" && body.objective.trim()) proposal.objective = body.objective.trim();
        const run = await startPitchRun(proposal);
        json(response, 202, { run }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/tasks") {
        const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "10", 10);
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;
        json(response, 200, { tasks: await taskStore.list(limit) }, origin);
        return;
      }
      const taskArtifactMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/artifact$/);
      if (request.method === "GET" && taskArtifactMatch) {
        const task = await taskStore.get(decodeURIComponent(taskArtifactMatch[1]));
        if (!task?.artifact) {
          json(response, 404, { error: "Task artifact not found." }, origin);
          return;
        }
        json(response, 200, { artifact: task.artifact }, origin);
        return;
      }
      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (request.method === "GET" && taskMatch) {
        const task = await taskStore.get(decodeURIComponent(taskMatch[1]));
        if (!task) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        json(response, 200, { task }, origin);
        return;
      }
      const taskCommandMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/commands$/);
      if (request.method === "POST" && taskCommandMatch) {
        const taskId = decodeURIComponent(taskCommandMatch[1]);
        const existing = await taskStore.get(taskId);
        if (!existing) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        const body = await readJson(request);
        const type = body.type;
        if (type === "cancel") {
          const task = await taskStore.update(taskId, (current) => {
            if (!["queued", "running"].includes(current.status)) return;
            current.status = "cancelled";
            appendTaskEvent(current, { type: "cancelled", stage: "terminal", message: "PitchKit cancelled" });
          });
          json(response, 200, { task, command: { type: "cancel", accepted: task.status === "cancelled" } }, origin);
          return;
        }
        if (type === "steer") {
          const objective = typeof body.objective === "string" ? body.objective.trim() : "";
          const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
          if (!objective && !instruction) {
            json(response, 400, { error: "steer requires objective or instruction." }, origin);
            return;
          }
          if (!["queued", "running"].includes(existing.status)) {
            json(response, 409, { error: "Only an active task can be steered.", task: existing }, origin);
            return;
          }
          const task = await taskStore.update(taskId, (current) => {
            if (!["queued", "running"].includes(current.status)) return;
            current.revision += 1;
            current.objective = objective || `${current.objective}\n\nAdditional direction: ${instruction}`;
            appendTaskEvent(current, {
              type: "steered",
              stage: "steering",
              message: instruction || "Task objective updated",
            });
          });
          if (task.revision === existing.revision) {
            json(response, 409, { error: "Task finished before steering was applied.", task }, origin);
            return;
          }
          json(response, 202, { task, command: { type: "steer", accepted: true, revision: task.revision } }, origin);
          return;
        }
        json(response, 400, { error: "command type must be cancel or steer." }, origin);
        return;
      }
      const runMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)$/);
      if (request.method === "GET" && runMatch) {
        const run = await taskStore.get(decodeURIComponent(runMatch[1]));
        if (!run) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        json(response, 200, { run }, origin);
        return;
      }
      const runActionMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)\/(cancel|retry)$/);
      if (request.method === "POST" && runActionMatch) {
        const run = await taskStore.get(decodeURIComponent(runActionMatch[1]));
        if (!run) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        if (runActionMatch[2] === "cancel") {
          const cancelled = await taskStore.update(run.taskId, (task) => {
            if (!["queued", "running"].includes(task.status)) return;
            task.status = "cancelled";
            appendTaskEvent(task, { type: "cancelled", stage: "terminal", message: "PitchKit cancelled" });
          });
          json(response, 200, { run: cancelled }, origin);
          return;
        }
        const retry = await startPitchRun({ proposalId: run.proposalId, objective: run.objective });
        json(response, 202, { run: retry, previousRunId: run.runId }, origin);
        return;
      }
      json(response, 404, { error: "Route not found." }, origin);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      json(response, status, {
        error: error instanceof Error ? error.message : "Unexpected service error.",
      }, origin);
    }
  });

  const voiceProxy = new WebSocketServer({ noServer: true });
  voiceProxy.on("connection", async (client, request, kind) => {
    const config = await runtimeEnv();
    if (!config.DASHSCOPE_API_KEY) {
      client.close(1011, "Set DASHSCOPE_API_KEY in .env.local.");
      return;
    }
    if (kind === "asr" && !config.DASHSCOPE_WORKSPACE_ID) {
      client.close(1011, "Set DASHSCOPE_WORKSPACE_ID in Settings.");
      return;
    }
    const upstream = new WebSocket(kind === "asr" ? dashscopeAsrUrl(config) : dashscopeTtsUrl(), {
      headers: { Authorization: `Bearer ${config.DASHSCOPE_API_KEY}`, "OpenAI-Beta": "realtime=v1" },
    });
    const pendingMessages = [];
    const closeBoth = () => {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close();
    };
    upstream.on("open", () => {
      client.send(JSON.stringify({ type: "preacherman.voice.ready", kind }));
      for (const message of pendingMessages) upstream.send(message.data, { binary: message.isBinary });
      pendingMessages.length = 0;
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.on("error", () => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "preacherman.voice.error", message: "DashScope connection failed." }));
    });
    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (upstream.readyState === WebSocket.CONNECTING) pendingMessages.push({ data, isBinary });
    });
    client.on("close", closeBoth);
    upstream.on("close", () => {
      if (client.readyState === WebSocket.OPEN) client.close();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const origin = requestOrigin(request);
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const kind = path === "/api/voice/asr" ? "asr" : path === "/api/voice/tts" ? "tts" : null;
    if (!origin || !kind) {
      socket.destroy();
      return;
    }
    voiceProxy.handleUpgrade(request, socket, head, (client) => voiceProxy.emit("connection", client, request, kind));
  });

  return {
    server,
    async listen(port = Number(env.PREACHERMAN_SERVICE_PORT) || DEFAULT_PORT) {
      await Promise.all([airiMcpRuntime.initialize(), airiPluginRuntime.initialize(), initializeEcosystemRuntimes()]);
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    async close() {
      for (const client of voiceProxy.clients) client.close();
      await Promise.all([
        airiMcpRuntime.close(),
        airiPluginRuntime.close(),
        airiGameletRuntime.close(),
        airiMemoryPersonaRuntime.close(),
        airiConnectionRuntime.close(),
        airiComputerVisionRuntime.close(),
      ]);
      return new Promise((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
    },
  };
}
