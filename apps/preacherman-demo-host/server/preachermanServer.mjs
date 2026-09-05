import { createHash, randomUUID } from "node:crypto";
import { createExecutionConnections } from "./executionConnections.mjs";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
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
import { createTaskService } from "./taskService.mjs";
import { createPreachermanCapabilityRuntime } from "./preachermanCapabilityRuntime.mjs";
import { createPreachermanMcpRuntime } from "./preachermanMcpRuntime.mjs";
import { createPreachermanKitsRuntime } from "./preachermanKitsRuntime.mjs";
import { createPreachermanPluginRuntime } from "./preachermanPluginRuntime.mjs";
import { createPreachermanPluginTaskBinding } from "./preachermanPluginTaskBinding.mjs";
import { createPreachermanWidgetRuntime, PREACHERMAN_WIDGET_KIND } from "./preachermanWidgetRuntime.mjs";
import { createPreachermanGameletRuntime } from "./preachermanGameletRuntime.mjs";
import { createPreachermanProviderRuntime, createDashScopeStreamingAdapter } from "./preachermanProviderRuntime.mjs";
import { createPreachermanMemoryPersonaRuntime, MEMORY_PLUGIN_SCOPES } from "./preachermanMemoryPersonaRuntime.mjs";
import { createPreachermanObservabilityRuntime } from "./preachermanObservabilityRuntime.mjs";
import { createPreachermanConnectionRuntime } from "./preachermanConnectionRuntime.mjs";
import { createPreachermanComputerVisionRuntime } from "./preachermanComputerVisionRuntime.mjs";
import { createPreachermanVisionEnhancementRuntime } from "./preachermanVisionEnhancementRuntime.mjs";
import { createPreachermanDomObservationRuntime } from "./preachermanDomObservationRuntime.mjs";
import { createPreachermanEcosystemBindingFacade } from "./preachermanEcosystemBindingFacade.mjs";
import { createExecutionRouter } from "./execution/executionRouter.mjs";
import { createPreachermanExecutionClient } from "./preacherman-execution/preachermanExecutionClient.mjs";
import { createPreachermanExecutionAdapter, PREACHERMAN_EXECUTION_CANONICAL_HASH, PREACHERMAN_EXECUTION_WORKFLOW_REVISION } from "./preacherman-execution/preachermanExecutionAdapter.mjs";
import { createPreachermanExecutionLinkStore } from "./preacherman-execution/preachermanExecutionLinkStore.mjs";
import { createPreachermanExecutionEventProjector } from "./preacherman-execution/preachermanExecutionEventProjector.mjs";
import { createPreachermanExecutionCommandAdapter } from "./preacherman-execution/preachermanExecutionCommandAdapter.mjs";
import { createPreachermanExecutionApprovalAdapter } from "./preacherman-execution/preachermanExecutionApprovalAdapter.mjs";
import { createPreachermanExecutionReconciler } from "./preacherman-execution/preachermanExecutionReconciler.mjs";
import { createPreachermanExecutionArtifactAdapter } from "./preacherman-execution/preachermanExecutionArtifactAdapter.mjs";
import { createPreachermanExecutionCapabilityCatalogAdapter } from "./preacherman-execution/preachermanExecutionCapabilityCatalogAdapter.mjs";
import { createPreachermanExecutionDiagnosticsAdapter } from "./preacherman-execution/preachermanExecutionDiagnosticsAdapter.mjs";
import { createPreachermanExecutionLedgerProjector } from "./preacherman-execution/preachermanExecutionLedgerProjector.mjs";
import { migratePreachermanBrandData } from "./preachermanBrandMigration.mjs";
import { createLocalAgentRegistry, createCodexCliAdapter, createDeepSeekHarnessAdapter, deepSeekHarnessPinnedVersion } from "./local-agent/index.mjs";
import { discoverLocalAgents } from "./local-agent/localAgentDiscovery.mjs";
import { createPreachermanAgentAccessRuntime } from "./preachermanAgentAccessRuntime.mjs";
import { binaryServiceHealth, createBinaryWebSocketProxy } from "./speechMotionProxy.mjs";
import { createCortanaVoiceTelemetry } from "./cortanaVoiceTelemetry.mjs";

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
  const cortanaVoiceTelemetry = createCortanaVoiceTelemetry({ env, fetchImpl });
  const packageRoot = resolve(env.PREACHERMAN_PACKAGE_ROOT || process.cwd());
  const dataDirectory = env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo");
  const pluginDirectory = join(dataDirectory, "plugins");
  const developmentPluginFixtures = join(process.cwd(), "tests", "fixtures", "preacherman-plugin");
  const trustedPluginRoots = [
    pluginDirectory,
    ...(typeof env.PREACHERMAN_PLUGIN_ROOTS === "string"
      ? env.PREACHERMAN_PLUGIN_ROOTS.split(delimiter).map((root) => root.trim()).filter(Boolean)
      : []),
    ...(existsSync(developmentPluginFixtures) ? [developmentPluginFixtures] : []),
  ];
  const configuredPreviewOrigins = typeof env.PREACHERMAN_PREVIEW_ORIGINS === "string"
    ? env.PREACHERMAN_PREVIEW_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [];
  for (const origin of configuredPreviewOrigins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid PREACHERMAN_PREVIEW_ORIGINS entry: ${origin}`);
    }
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.port) {
      throw new Error(`PREACHERMAN_PREVIEW_ORIGINS must contain only local HTTP origins with an explicit port: ${origin}`);
    }
  }
  const allowedOrigins = new Set([
    "http://127.0.0.1:1420",
    "http://localhost:1420",
    "http://127.0.0.1:1421",
    "http://localhost:1421",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    ...configuredPreviewOrigins,
  ]);
  const proposals = new Map();
  let savedProviderConfig = null;
  let conversationSaveQueue = Promise.resolve();

  function taskStoreFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "task-store.v1.json");
  }

  const taskStore = createTaskStore({ file: taskStoreFile() });
  const taskService = createTaskService({ taskStore });
  const configuredWorkspaceRoots = typeof env.PREACHERMAN_LOCAL_AGENT_ROOTS === "string"
    ? env.PREACHERMAN_LOCAL_AGENT_ROOTS.split(delimiter).map((entry) => resolve(entry.trim())).filter(Boolean)
    : [resolve(process.cwd(), "../..")];
  let localServicePort = null;
  const gatewayCredentialFile = join(dataDirectory, "mcp-gateway.bootstrap");
  const gatewayScript = resolve(packageRoot, "scripts", "preacherman-mcp-gateway.mjs");
  const harnessCompositionTemplate = resolve(packageRoot, "..", "..", "config", "deepseek-harness", "preacherman-native", "acp-overlay-template.json");
  const localAgentRegistry = options.localAgentRegistry ?? createLocalAgentRegistry({
    adapters: [
      createDeepSeekHarnessAdapter({
        allowedWorkspaceRoots: configuredWorkspaceRoots,
        envSource: runtimeEnv,
        harnessRoot: env.PREACHERMAN_HARNESS_ROOT || "D:\\deepseek-harness",
        runtimeStateRoot: join(dataDirectory, "native-agent-runs"),
        compositionTemplate: harnessCompositionTemplate,
        gatewayScript,
        gatewayCredentialFile,
        gatewayUrl: () => localServicePort ? `http://127.0.0.1:${localServicePort}` : "",
      }),
      createCodexCliAdapter({ allowedWorkspaceRoots: configuredWorkspaceRoots }),
    ],
  });
  const localAgentWorkspaces = configuredWorkspaceRoots.map((workspacePath, index) => ({
    id: `workspace-${index + 1}`,
    label: index === 0 ? "Preacherman workspace" : `Approved workspace ${index + 1}`,
    path: workspacePath,
  }));
  const preachermanExecutionBaseUrl = env.PREACHERMAN_EXECUTION_BASE_URL || env.PREACHERMAN_EXECUTION_MANAGER_URL || "http://127.0.0.1:19191";
  const preachermanExecutionClient = options.preachermanExecutionClient ?? createPreachermanExecutionClient({
    baseUrl: preachermanExecutionBaseUrl,
    token: env.PREACHERMAN_EXECUTION_DAG_TOKEN || env.PREACHERMAN_EXECUTION_DAG_MUTATION_TOKEN,
    approvalToken: env.PREACHERMAN_EXECUTION_APPROVAL_TOKEN || env.PREACHERMAN_EXECUTION_DAG_APPROVAL_TOKEN,
    fetchImpl,
  });
  const preachermanExecutionConsoleUrl = env.PREACHERMAN_EXECUTION_CONSOLE_URL || "http://127.0.0.1:19193";
  const preachermanExecutionLinkStore = createPreachermanExecutionLinkStore({ file: join(dataDirectory, "preacherman-execution-links.v1.json") });
  const preachermanExecutionCapabilityCatalog = createPreachermanExecutionCapabilityCatalogAdapter({
    client: preachermanExecutionClient,
    workflowId: env.PREACHERMAN_EXECUTION_DEFAULT_WORKFLOW_ID || env.PREACHERMAN_EXECUTION_WORKFLOW_ID || "preacherman-complex-task-v1",
    expectedWorkflowRevision: Number.parseInt(env.PREACHERMAN_EXECUTION_WORKFLOW_REVISION || String(PREACHERMAN_EXECUTION_WORKFLOW_REVISION), 10),
    expectedCanonicalHash: env.PREACHERMAN_EXECUTION_CANONICAL_HASH || PREACHERMAN_EXECUTION_CANONICAL_HASH,
    profile: env.PREACHERMAN_EXECUTION_PROFILE,
    managerUrl: preachermanExecutionBaseUrl,
    enabled: env.PREACHERMAN_EXECUTION_ENABLED !== "false",
  });
  const preachermanExecutionDiagnostics = createPreachermanExecutionDiagnosticsAdapter({ capabilityCatalog: preachermanExecutionCapabilityCatalog });
  const preachermanExecutionAdapter = createPreachermanExecutionAdapter({
    client: preachermanExecutionClient,
    taskService,
    linkStore: preachermanExecutionLinkStore,
    capabilityCatalog: preachermanExecutionCapabilityCatalog,
  });
  const preachermanExecutionEventProjector = createPreachermanExecutionEventProjector({ taskService });
  const preachermanExecutionCommandAdapter = createPreachermanExecutionCommandAdapter({ client: preachermanExecutionClient, taskService });
  const preachermanExecutionApprovalAdapter = createPreachermanExecutionApprovalAdapter({ client: preachermanExecutionClient, taskService });
  const preachermanExecutionArtifactAdapter = createPreachermanExecutionArtifactAdapter({
    client: preachermanExecutionClient,
    taskService,
    cacheDirectory: join(dataDirectory, "preacherman-execution-artifacts"),
  });
  const preachermanExecutionLedgerProjector = createPreachermanExecutionLedgerProjector({ taskService, eventProjector: preachermanExecutionEventProjector, artifactAdapter: preachermanExecutionArtifactAdapter });
  const preachermanExecutionReconciler = createPreachermanExecutionReconciler({ client: preachermanExecutionClient, taskService, eventProjector: preachermanExecutionEventProjector, artifactAdapter: preachermanExecutionArtifactAdapter, ledgerProjector: preachermanExecutionLedgerProjector });
  const executionRouter = createExecutionRouter({ preachermanExecutionStatus: () => preachermanExecutionAdapter.status() });
  const preachermanKitsRuntime = createPreachermanKitsRuntime();
  const preachermanPluginTaskBinding = createPreachermanPluginTaskBinding({ taskService });

  for (const kit of preachermanKitsRuntime.kits.discover()) {
    preachermanKitsRuntime.kits.attachConsumer("preacherman-runtime", kit.name, "^1.0.0");
  }

  function callerPluginId(context) {
    return typeof context?.callerPluginId === "string" ? context.callerPluginId : "preacherman-runtime";
  }

  function bindTaskOperation(kit, operation, bindingOperation = operation) {
    preachermanKitsRuntime.bindings.bind({
      pluginId: "preacherman-host",
      kit,
      operation,
      versionRange: "^1.0.0",
      handler(input, context) {
        return preachermanPluginTaskBinding.execute(bindingOperation, input, {
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
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "task",
    operation: "list",
    versionRange: "^1.0.0",
    async handler(_input, context) {
      const pluginId = callerPluginId(context);
      return { tasks: (await taskService.list(50)).filter((task) => task.pluginId === pluginId) };
    },
  });
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "ledger",
    operation: "list",
    versionRange: "^1.0.0",
    async handler(_input, context) {
      const pluginId = callerPluginId(context);
      return { entries: (await taskService.list(50)).filter((task) => task.pluginId === pluginId) };
    },
  });
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "ledger",
    operation: "append",
    versionRange: "^1.0.0",
    handler(input, context) {
      const operation = input?.type === "failure" ? "fail" : "progress";
      return preachermanPluginTaskBinding.execute(operation, input, { pluginId: callerPluginId(context) });
    },
  });

  function mcpConfigFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "mcp.json");
  }

  const preachermanMcpRuntime = createPreachermanMcpRuntime({ configFile: mcpConfigFile(), taskStore });

  function pluginStateFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "preacherman-plugins.v1.json");
  }

  function widgetStateFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "preacherman-widgets.v1.json");
  }

  function memoryPersonaFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "preacherman-memory-persona.v1.json");
  }

  function observabilityFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "preacherman-observability.v1.json");
  }

  let preachermanWidgetRuntime;
  const pluginMemoryRuntimes = new Map();

  function memoryRuntimeForPlugin(pluginId, permissions) {
    let runtime = pluginMemoryRuntimes.get(pluginId);
    if (runtime) return runtime;
    const scopes = permissions.filter((permission) => MEMORY_PLUGIN_SCOPES.includes(permission));
    runtime = createPreachermanMemoryPersonaRuntime({
      file: join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "preacherman-plugin-memory", `${pluginId}.v1.json`),
      principal: pluginId,
      scopes,
      recentConversationReader: async ({ limit }) => (await readConversationLedger()).slice(0, limit),
      onAuditEvent(event) {
        void preachermanObservabilityRuntime.recordTrace({
          caller: pluginId,
          target: event.operation,
          durationMs: 0,
          status: event.outcome === "succeeded" ? "succeeded" : "failed",
          input: { scope: event.requiredScope, boundary: event.boundary },
          result: { resultCount: event.resultCount },
          error: event.errorCode,
        }).catch(() => undefined);
      },
    });
    pluginMemoryRuntimes.set(pluginId, runtime);
    return runtime;
  }

  let preachermanPluginRuntime;
  let ecosystemFacade;
  preachermanPluginRuntime = createPreachermanPluginRuntime({
    file: pluginStateFile(),
    taskStore,
    hostBridge: Object.freeze({ abi: "preacherman.host.v1", service: "preacherman-demo-host" }),
    kits: preachermanKitsRuntime.kits,
    bindings: preachermanKitsRuntime.bindings,
    trustedRoots: trustedPluginRoots,
    releasePluginResources: (pluginId) => ecosystemFacade?.removePlugin(pluginId),
    createPluginBridge({ pluginId, permissions, hostBridge }) {
      memoryRuntimeForPlugin(pluginId, permissions);
      return hostBridge;
    },
  });
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "tools",
    operation: "list",
    versionRange: "^1.0.0",
    async handler() {
      return { tools: await preachermanPluginRuntime.listTools() };
    },
  });
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "tools",
    operation: "register",
    versionRange: "^1.0.0",
    async handler(input, bindingContext) {
      return preachermanPluginRuntime.registerTool(bindingContext.callerPluginId, input?.tool);
    },
  });
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "tools",
    operation: "unregister",
    versionRange: "^1.0.0",
    async handler(input, bindingContext) {
      return preachermanPluginRuntime.unregisterTool(bindingContext.callerPluginId, input?.name);
    },
  });
  preachermanKitsRuntime.bindings.bind({
    pluginId: "preacherman-host",
    kit: "tools",
    operation: "call",
    versionRange: "^1.0.0",
    handler(input, bindingContext) {
      return executePluginToolAsTask(input?.name, input?.arguments ?? {}, {
        callerPluginId: bindingContext.callerPluginId,
        approved: false,
      });
    },
  });

  async function executePluginToolAsTask(name, args, {
    callerPluginId: callerId = "preacherman-runtime",
    approved = false,
  } = {}) {
    const separator = name.indexOf("::");
    if (separator < 1) {
      const error = new Error("Plugin tool name must include its plugin id.");
      error.statusCode = 400;
      throw error;
    }
    const providerPluginId = name.slice(0, separator);
    const toolName = name.slice(separator + 2);
    const invokeBinding = (kit, operation, input) => preachermanKitsRuntime.bindings.invokeAs(
      callerId, kit, operation, input, { versionRange: "^1.0.0", providerPluginId },
    );
    const created = await invokeBinding("task", "create", {
      objective: `Execute PREACHERMAN plugin tool ${name}`,
      parameters: args,
      toolName,
    });
    const taskId = created.task.taskId;
    await taskService.update(taskId, (task) => {
      task.providerPluginId = providerPluginId;
      task.toolCall.qualifiedName = name;
    });
    let terminal = false;
    try {
      await invokeBinding("ledger", "append", { taskId, value: 0.35, stage: "tool-call", message: `Calling ${name}.` });
      const result = await preachermanObservabilityRuntime.trace({
        caller: callerId,
        target: name,
        input: { argumentKeys: Object.keys(args).sort(), approved },
      }, () => preachermanPluginRuntime.callTool(name, args, { approved, callerPluginId: callerId }));
      if (result.isError) {
        await preachermanPluginTaskBinding.execute("fail", {
          taskId,
          error: `Plugin tool ${name} returned an error result.`,
          result: result.structuredContent,
        }, { pluginId: callerId });
        terminal = true;
        const error = new Error(`Plugin tool ${name} returned an error result.`);
        error.statusCode = 502;
        throw error;
      }
      const completed = await invokeBinding("ledger", "write-artifact", {
        taskId,
        result: result.structuredContent,
        artifact: {
          name: `${toolName}-result.json`,
          mediaType: "application/json",
          content: result.structuredContent,
        },
      });
      terminal = true;
      await preachermanCapabilityRuntime.record("agent.plugin-tools", {
        surface: "work",
        execution: {
          status: "succeeded",
          summary: `Plugin tool ${name} completed and wrote a Ledger artifact.`,
          taskId,
          toolName: name,
          artifactPath: completed.task?.artifact?.path || completed.ledger?.artifact?.path || `${toolName}-result.json`,
        },
      }).catch(() => undefined);
      return { ...result, task: completed.task, ledger: completed.ledger };
    } catch (error) {
      if (!terminal) {
        await preachermanPluginTaskBinding.execute("fail", {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        }, { pluginId: callerId }).catch(() => undefined);
      }
      await preachermanCapabilityRuntime.record("agent.plugin-tools", {
        surface: "work",
        execution: {
          status: "failed",
          summary: `Plugin tool ${name} failed.`,
          taskId,
          toolName: name,
          errorCode: typeof error?.code === "string" ? error.code : "PLUGIN_TOOL_FAILED",
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  function providerConfigFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "provider-settings.json");
  }

  function conversationLedgerFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "conversation-ledger.json");
  }

  function preachermanCapabilityEventsFile() {
    return join(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"), "preacherman-capability-events.v1.json");
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

  preachermanWidgetRuntime = createPreachermanWidgetRuntime({ file: widgetStateFile() });
  const preachermanObservabilityRuntime = createPreachermanObservabilityRuntime({ file: observabilityFile() });
  const preachermanGameletRuntime = createPreachermanGameletRuntime();
  const preachermanProviderRuntime = createPreachermanProviderRuntime({ getConfig: runtimeEnv, fetchImpl });
  preachermanProviderRuntime.registerAdapter({
    pluginId: "preacherman-dashscope-stream",
    providerId: "dashscope",
    ...createDashScopeStreamingAdapter({
      asr: createDashscopeVoiceProtocol("asr"),
      tts: createDashscopeVoiceProtocol("tts"),
    }),
  });
  const preachermanVisionEnhancementRuntime = createPreachermanVisionEnhancementRuntime({
    file: join(dataDirectory, "vision-observations.v1.json"),
    providerRuntime: preachermanProviderRuntime,
  });
  const preachermanMemoryPersonaRuntime = createPreachermanMemoryPersonaRuntime({
    file: memoryPersonaFile(),
    recentConversationReader: async ({ limit }) => (await readConversationLedger()).slice(0, limit),
  });
  const preachermanConnectionRuntime = createPreachermanConnectionRuntime({ file: join(dataDirectory, "connection-settings.json") });
  const computerUseApprovalAuthority = Object.freeze({ authority: "preacherman-local-host" });
  const localImageRoots = [
    join(dataDirectory, "vision-inputs"),
    ...(typeof env.PREACHERMAN_VISION_IMAGE_ROOTS === "string"
      ? env.PREACHERMAN_VISION_IMAGE_ROOTS.split(delimiter).filter(Boolean)
      : []),
  ];
  const preachermanComputerVisionRuntime = createPreachermanComputerVisionRuntime({
    localImageRoots,
    approvalVerifier: ({ evidence }) => evidence === computerUseApprovalAuthority,
  });
  const preachermanDomObservationRuntime = createPreachermanDomObservationRuntime({ allowedOrigins: [...allowedOrigins] });
  ecosystemFacade = createPreachermanEcosystemBindingFacade({
    kits: preachermanKitsRuntime.kits,
    bindings: preachermanKitsRuntime.bindings,
    widgetRuntime: preachermanWidgetRuntime,
    gameletRuntime: preachermanGameletRuntime,
    providerRuntime: preachermanProviderRuntime,
    connectionRuntime: preachermanConnectionRuntime,
    computerVisionRuntime: preachermanComputerVisionRuntime,
    getMemoryRuntime(pluginId) {
      const runtime = pluginMemoryRuntimes.get(pluginId);
      if (runtime) return runtime;
      const error = new Error("Plugin memory runtime unavailable.");
      error.code = "MEMORY_RUNTIME_UNAVAILABLE";
      error.statusCode = 503;
      throw error;
    },
    async releaseMemoryRuntime(pluginId) {
      const runtime = pluginMemoryRuntimes.get(pluginId);
      await runtime?.close();
      pluginMemoryRuntimes.delete(pluginId);
    },
  });

  async function initializeEcosystemRuntimes() {
    await Promise.all([
      preachermanMemoryPersonaRuntime.initialize(),
      preachermanObservabilityRuntime.initialize(),
      preachermanConnectionRuntime.initialize(),
    ]);
    await mkdir(pluginDirectory, { recursive: true });
    await mkdir(localImageRoots[0], { recursive: true });
    if ((await preachermanMemoryPersonaRuntime.listPersonas()).length === 0) {
      await preachermanMemoryPersonaRuntime.createPersona({
        name: "Preacherman",
        description: "Local demo companion persona",
        instructions: "Be concise, auditable, and explicit about unavailable capabilities.",
      });
    }
    if (!(await preachermanWidgetRuntime.list()).some((widget) => widget.id === "ecosystem-status")) {
      await preachermanWidgetRuntime.register({
        pluginId: "preacherman-runtime",
        manifest: {
          apiVersion: "v1",
          kind: PREACHERMAN_WIDGET_KIND,
          id: "ecosystem-status",
          version: "1.0.0",
          title: "Preacherman ecosystem status",
          placement: "work",
        },
        schema: {
          type: "container",
          orientation: "vertical",
          gap: 8,
          children: [
            { type: "text", text: "Preacherman runtimes are registered", variant: "heading", tone: "primary" },
            { type: "metric", label: "Registered Kits", value: 9, tone: "success" },
            { type: "button", label: "Open ledger", action: { type: "emit", event: "open-ledger" } },
          ],
        },
      });
    }
  }

  async function executeEcosystemCapability(capabilityId, context = {}) {
    if (capabilityId === "agent.kits-api") {
      const kits = preachermanKitsRuntime.kits.discover();
      return { status: "succeeded", protocol: "preacherman-kits", kits, summary: `Discovered ${kits.length} Preacherman kits.` };
    }
    if (capabilityId === "agent.bindings-api") {
      const bindings = preachermanKitsRuntime.bindings.list();
      return { status: "succeeded", protocol: "preacherman-bindings", bindings, summary: `Discovered ${bindings.length} Preacherman bindings.` };
    }
    if (capabilityId === "plugin.widgets") {
      const widgets = await preachermanWidgetRuntime.list();
      return { status: "succeeded", protocol: "preacherman-widget", widgets, summary: `Loaded ${widgets.length} declarative widgets.` };
    }
    if (capabilityId === "plugin.gamelets") {
      const gamelets = preachermanGameletRuntime.discover();
      return { status: "succeeded", protocol: "preacherman-gamelet", gamelets, summary: `Loaded ${gamelets.length} gamelets.` };
    }
    if (capabilityId === "game.tic-tac-toe") {
      const session = await preachermanGameletRuntime.createSession({ pluginId: "preacherman-runtime", gameletId: "tic-tac-toe" });
      return { status: "succeeded", protocol: "preacherman-gamelet", session, summary: `Started offline gamelet ${session.id}.` };
    }
    if (capabilityId === "provider.catalog") {
      const providers = await preachermanProviderRuntime.catalog();
      return { status: "succeeded", protocol: "preacherman-provider", providers, summary: `Read ${providers.length} provider definitions.` };
    }
    if (capabilityId === "persona.select") {
      const persona = await preachermanMemoryPersonaRuntime.getSelectedPersona();
      return { status: "succeeded", protocol: "preacherman-persona", persona, summary: `Selected persona: ${persona?.name ?? "none"}.` };
    }
    if (capabilityId === "memory.recall" || capabilityId === "memory.time-awareness") {
      const memories = await preachermanMemoryPersonaRuntime.recall({ namespace: "default", limit: 10 });
      return { status: "succeeded", protocol: "preacherman-memory", memories, summary: `Recalled ${memories.length} local memories.` };
    }
    if (capabilityId.startsWith("connection.")) {
      const service = capabilityId.slice("connection.".length);
      const connection = preachermanConnectionRuntime.get(service);
      return { status: "inspected", protocol: "preacherman-connection", connection, summary: `${service} status: ${connection.status}.` };
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
      const result = await preachermanComputerVisionRuntime.invoke(computerVisionCapability, input);
      return {
        ...result,
        protocol: "preacherman-computer-vision",
        summary: result.status === "succeeded"
          ? `${computerVisionCapability} completed.`
          : `${computerVisionCapability} requires an installed desktop or vision adapter.`,
      };
    }
    return undefined;
  }

  async function resolveEcosystemCapabilityStatus(capabilityId) {
    if (capabilityId.startsWith("connection.")) {
      const service = capabilityId.slice("connection.".length);
      try {
        const connection = preachermanConnectionRuntime.get(service);
        const state = connection.status === "configuration-required"
          ? "configuration-required"
          : connection.status === "external-runtime-required"
            ? "external-runtime-required"
            : "available";
        return { state, adapter: `preacherman-connection-${service}`, requirements: state === "available" ? [] : ["connection configuration and adapter"] };
      } catch {
        return { state: "external-runtime-required", adapter: "preacherman-connection", requirements: ["connection adapter"] };
      }
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
      const capability = preachermanComputerVisionRuntime.status(computerVisionCapability);
      return {
        state: capability.phase === "ready" ? "available" : "external-runtime-required",
        adapter: capability.adapter?.pluginId ?? "preacherman-computer-vision",
        requirements: capability.phase === "ready" ? [] : ["desktop or vision adapter"],
      };
    }
    const providerCapability = {
      "voice.asr": ["dashscope", "asr"],
      "voice.asr-test": ["dashscope", "asr"],
      "voice.tts": ["dashscope", "tts"],
      "voice.tts-preview": ["dashscope", "tts"],
      "voice.tts-test": ["dashscope", "tts"],
      "provider.credentials": ["deepseek", "chat"],
      "provider.smoke-test": ["deepseek", "chat"],
    }[capabilityId];
    if (providerCapability) {
      const [providerId, operation] = providerCapability;
      const provider = await preachermanProviderRuntime.get(providerId);
      const state = provider.capabilities[operation]?.state;
      return {
        state: state === "ready" ? "available" : state === "configuration-required" ? "configuration-required" : "external-runtime-required",
        adapter: `preacherman-provider-${providerId}`,
        requirements: state === "ready" ? [] : [`${providerId} ${operation} configuration and adapter`],
      };
    }
    return undefined;
  }

  const preachermanCapabilityRuntime = createPreachermanCapabilityRuntime({
    file: preachermanCapabilityEventsFile(),
    getRuntimeEnv: runtimeEnv,
    resolveCapabilityStatus: resolveEcosystemCapabilityStatus,
    async executeCapability(capabilityId, context) {
      return await executeEcosystemCapability(capabilityId, context)
        ?? await preachermanMcpRuntime.executeCapability(capabilityId, context)
        ?? await preachermanPluginRuntime.executeCapability(capabilityId, context);
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

  const nativePreferencesFile = join(dataDirectory, "native-agent-preferences.json");
  const nativeDefaultPreferences = Object.freeze({
    agentId: "preacherman-native",
    providerId: "deepseek-official",
    modelId: "deepseek-v4-pro",
    policy: "ask",
  });

  async function readNativePreferences() {
    try {
      const parsed = JSON.parse(await readFile(nativePreferencesFile, "utf8"));
      return { ...nativeDefaultPreferences, ...(parsed?.defaults ?? {}) };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return { ...nativeDefaultPreferences };
    }
  }

  async function writeNativePreferences(defaults) {
    const catalog = await agentWorkspaceCatalog();
    const agent = catalog.agents.find((candidate) => candidate.id === defaults?.agentId);
    const provider = agent?.providers.find((candidate) => candidate.id === defaults?.providerId);
    const model = provider?.models.find((candidate) => candidate.id === defaults?.modelId);
    if (!agent || !provider || !model || !new Set(["auto", "ask", "strict"]).has(defaults?.policy)) {
      throw Object.assign(new Error("Native defaults must reference a catalogued Agent, provider, model and policy."), { statusCode: 400 });
    }
    const normalized = { agentId: agent.id, providerId: provider.id, modelId: model.id, policy: defaults.policy };
    await mkdir(dirname(nativePreferencesFile), { recursive: true });
    const temporary = `${nativePreferencesFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, defaults: normalized }), { mode: 0o600 });
    await rename(temporary, nativePreferencesFile);
    if (process.platform !== "win32") await chmod(nativePreferencesFile, 0o600);
    return normalized;
  }

  function availabilityForAgent(agent) {
    if (!agent.installed) return "external-runtime-required";
    if (agent.auth?.state === "ready") return "ready";
    if (agent.auth?.state === "login-required") return "login-required";
    if (agent.auth?.state === "error") return "error";
    return "configuration-required";
  }

  async function agentWorkspaceCatalog() {
    const agents = await agentAccessRuntime.listLocalAgents();
    return {
      agents: agents.map((agent) => {
        const status = availabilityForAgent(agent);
        const providers = agent.id === "preacherman-native"
          ? [{
              id: "deepseek-official",
              label: "DeepSeek Official",
              status,
              models: [{ id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", status, verified: status === "ready" }],
            }]
          : [{
              id: agent.id,
              label: agent.id === "codex-cli" ? "Codex subscription / CLI" : agent.label,
              status,
              models: [{ id: "default", label: "CLI default", status, verified: status === "ready" }],
            }];
        return { id: agent.id, label: agent.label, status, description: agent.id === "preacherman-native" ? "Built-in execution powered by a pinned DeepSeek Harness." : "Installed local Agent adapter.", providers };
      }),
      workspaces: agentAccessRuntime.listWorkspaces().map(({ id, label }) => ({ id, label })),
    };
  }

  async function nativeStatus({ healthCheck = false } = {}) {
    const catalog = await agentWorkspaceCatalog();
    const agent = catalog.agents.find((candidate) => candidate.id === "preacherman-native");
    const record = (await agentAccessRuntime.listLocalAgents()).find((candidate) => candidate.id === "preacherman-native");
    const status = agent?.status ?? "external-runtime-required";
    const gatewayState = agentAccessRuntime.gatewayStatus().state === "ready" ? "ready" : "error";
    return {
      native: {
        id: "preacherman-native",
        label: "Preacherman Native",
        status,
        installed: record?.installed === true,
        version: record?.version ?? null,
        auth: { state: status, providerId: "deepseek-official", modelId: "deepseek-v4-pro", providers: agent?.providers ?? [] },
        health: { state: status, message: healthCheck ? (status === "ready" ? "Harness, provider and MCP Gateway are ready." : "Complete the reported Native Agent configuration before execution.") : undefined, checkedAt: healthCheck ? new Date().toISOString() : undefined },
        capabilities: { ...(record?.capabilities ?? {}), permissionPolicies: ["auto", "ask", "strict"] },
        harness: { compatibilityVersion: deepSeekHarnessPinnedVersion, license: "MIT", attribution: "Powered by DeepSeek Harness" },
        gateway: { state: gatewayState },
      },
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

  function createDashscopeVoiceProtocol(kind) {
    const urlFor = ({ workspaceId }) => kind === "asr"
      ? dashscopeAsrUrl({ DASHSCOPE_WORKSPACE_ID: workspaceId })
      : dashscopeTtsUrl();
    return {
      test: ({ apiKey, workspaceId }) => testDashscopeConnection(urlFor({ workspaceId }), apiKey),
      open: ({ apiKey, workspaceId, signal, emit }) => new Promise((resolveOpen, rejectOpen) => {
        const socket = new WebSocket(urlFor({ workspaceId }), {
          headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "realtime=v1" },
        });
        let opened = false;
        const abort = () => {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
        };
        signal.addEventListener("abort", abort, { once: true });
        socket.once("open", () => {
          opened = true;
          resolveOpen({ session: { socket, abort }, metadata: { transport: "websocket", kind } });
        });
        socket.on("message", (data, isBinary) => emit({
          type: "message",
          data: isBinary ? Buffer.from(data).toString("base64") : data.toString("utf8"),
          isBinary,
        }));
        socket.on("close", (code, reason) => emit({ type: "close", code, reason: reason.toString("utf8") }));
        socket.on("unexpected-response", (_request, response) => {
          if (!opened) rejectOpen(new Error(`DashScope returned HTTP ${response.statusCode || 401}.`));
        });
        socket.on("error", () => {
          if (!opened) rejectOpen(new Error("DashScope connection failed."));
          else emit({ type: "error", message: "DashScope connection failed." });
        });
      }),
      async send({ session, event }) {
        if (session.socket.readyState !== WebSocket.OPEN) throw new Error("DashScope stream is not open.");
        session.socket.send(event.isBinary ? Buffer.from(event.data, "base64") : event.data, { binary: event.isBinary === true });
        return { sent: true };
      },
      close: ({ session }) => new Promise((resolveClose) => {
        session.socket.removeAllListeners("message");
        session.socket.removeAllListeners("error");
        session.socket.removeAllListeners("unexpected-response");
        if (session.socket.readyState === WebSocket.CLOSED) {
          resolveClose({ closed: true });
          return;
        }
        session.socket.once("close", () => resolveClose({ closed: true }));
        session.socket.close();
      }),
    };
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
    const proposalRequested = /pitch|路演|演示|方案|生成|制作|research|compare|verify|parallel|multi[- ]?(?:agent|step)|研究|比较|验证|并行|多步骤|多智能体/i.test(input);
    const fallback = companionFallback(locale, proposalRequested, "provider_unavailable");
    const configuredEnv = await runtimeEnv();
    if (!configuredEnv.DEEPSEEK_API_KEY) return fallback;
    try {
      const model = configuredEnv.DEEPSEEK_MODEL || "deepseek-v4-flash";
      const providerResult = await preachermanObservabilityRuntime.trace({
        caller: "preacherman-companion",
        target: "provider:deepseek:chat",
        input: { messageCount: cleanConversationHistory(history).length + 2, model },
      }, () => preachermanProviderRuntime.invoke("deepseek", {
        capability: "chat",
        input: {
          model,
          temperature: 0.45,
          maxTokens: 600,
          messages: [
            { role: "system", content: "你是 Preacherman，一位自然、可靠的数字伙伴。理解用户的上下文并直接回答，不要自称 A 或 Agent。返回 JSON：message（完整文字）、speechText（不超过80汉字）、action（reply 或 propose_task）。只有用户明确要求生成、整理、制作路演或演示方案时才使用 propose_task。不要编造已完成的工作。" },
            ...cleanConversationHistory(history),
            { role: "user", content: input },
          ],
        },
      }));
      return parseCompanionResponse(providerResult?.content, fallback, providerResult?.model || model);
    } catch {
      return companionFallback(locale, proposalRequested, "provider_request_failed");
    }
  }

  async function executePitchTask(taskId) {
    try {
      await taskService.update(taskId, (task) => {
        if (task.status !== "queued") return;
        task.status = "running";
        appendTaskEvent(task, { type: "started", stage: "reading", message: "Reading the fixed PitchKit brief" });
      });
      const brief = await readPitchBrief();

      while (true) {
        const execution = await taskService.update(taskId, (task) => {
          if (task.status !== "running") return;
          appendTaskEvent(task, { type: "progress", stage: "generating", message: "Generating a constrained PitchKit" });
        });
        if (!execution || execution.status !== "running") return;

        const executionRevision = execution.revision;
        let markdown;
        try {
          markdown = await generatePitchKit({ env: await runtimeEnv(), objective: execution.objective, brief, fetchImpl });
        } catch (error) {
          const latest = await taskService.get(taskId);
          if (latest?.status === "running" && latest.revision !== executionRevision) continue;
          throw error;
        }

        let latest = await taskService.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) {
          await taskService.update(taskId, (task) => {
            if (task.status === "running") appendTaskEvent(task, { type: "revision_restarted", stage: "generating", message: "Restarting generation with the latest direction" });
          });
          continue;
        }

        await taskService.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            appendTaskEvent(task, { type: "progress", stage: "validating", message: "Validating required sections" });
          }
        });
        try {
          validatePitchKit(markdown);
        } catch {
          await taskService.update(taskId, (task) => {
            if (task.status === "running" && task.revision === executionRevision) {
              appendTaskEvent(task, { type: "progress", stage: "generating", message: "Repairing the required PitchKit format" });
            }
          });
          markdown = repairPitchKit(execution.objective, brief);
          validatePitchKit(markdown);
        }

        latest = await taskService.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) continue;
        await taskService.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            appendTaskEvent(task, { type: "tool_call", stage: "tool-call", message: "Inspecting runtime through the built-in MCP tool" });
          }
        });
        const runtimeTool = await preachermanMcpRuntime.callTool("preacherman::preacherman_runtime_status", {});
        if (runtimeTool.isError) throw new Error("The built-in MCP runtime status tool failed.");
        latest = await taskService.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) continue;
        await taskService.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            task.toolCall = {
              name: "preacherman::preacherman_runtime_status",
              parameterSummary: { keys: [], byteLength: 2 },
              structuredResult: runtimeTool.structuredContent,
            };
            appendTaskEvent(task, { type: "tool_result", stage: "tool-call", message: "Built-in MCP runtime status recorded" });
          }
        });
        await taskService.update(taskId, (task) => {
          if (task.status === "running" && task.revision === executionRevision) {
            appendTaskEvent(task, { type: "progress", stage: "writing", message: "Writing the PitchKit artifact" });
          }
        });
        const artifactPath = await writePitchKit({ env, runId: taskId, markdown });

        latest = await taskService.get(taskId);
        if (!latest || latest.status !== "running") return;
        if (latest.revision !== executionRevision) continue;
        const completion = await taskService.update(taskId, (task) => {
          if (task.status !== "running" || task.revision !== executionRevision) return;
          task.artifact = { name: "pitch-kit.md", path: artifactPath, mediaType: "text/markdown" };
          task.status = "succeeded";
          appendTaskEvent(task, { type: "completed", stage: "terminal", message: "PitchKit completed" });
        });
        if (completion?.status === "running" && completion.revision !== executionRevision) continue;
        return;
      }
    } catch (error) {
      await taskService.update(taskId, (task) => {
        if (task.status === "cancelled") return;
        task.status = "failed";
        task.retryable = true;
        task.error = error instanceof Error ? error.message : String(error);
        appendTaskEvent(task, { type: "failed", stage: "terminal", message: task.error });
      });
    }
  }

  function storedProposalSnapshot(proposal) {
    const { confirmationPromise: _confirmationPromise, taskId: _taskId, ...snapshot } = proposal;
    return structuredClone(snapshot);
  }

  async function startPitchRun(proposal) {
    if (proposal.taskId) return taskService.get(proposal.taskId);
    const taskId = `run_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const run = {
      taskId,
      runId: taskId,
      proposalId: proposal.proposalId,
      objective: proposal.objective,
      executor: "pitchkit",
      execution: { kind: "local-pitch", adapter: "pitchkit" },
      proposalSnapshot: storedProposalSnapshot(proposal),
      revision: 1,
      status: "queued",
      retryable: false,
      events: [{ sequence: 1, revision: 1, type: "accepted", stage: "queued", message: "PitchKit queued", at: createdAt }],
      artifact: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
    };
    await taskService.createRecord(run);
    proposal.taskId = taskId;
    void executePitchTask(taskId);
    return run;
  }

  function createPluginToolProposal({ id, objective, locale, toolName = "preacherman-runtime::task_summary", toolArguments = {} }) {
    const chinese = locale === "zh-CN";
    const shortToolName = toolName.slice(toolName.indexOf("::") + 2);
    return {
      proposalId: id,
      revision: 1,
      kind: "plugin-tool",
      objective,
      executor: chinese ? "Preacherman 插件工具执行器" : "Preacherman plugin tool executor",
      inputs: [toolName],
      outputs: [`${shortToolName}-result.json`],
      allowedTools: [toolName],
      toolName,
      toolArguments,
      successCriteria: [chinese ? "生成可在 Ledger 审阅的结构化产物" : "Produce a structured artifact reviewable in Ledger"],
      editableFields: ["objective"],
    };
  }

  async function startPluginToolRun(proposal) {
    if (proposal.taskId) return taskService.get(proposal.taskId);
    const result = await executePluginToolAsTask(proposal.toolName || "preacherman-runtime::task_summary", proposal.toolArguments ?? {}, {
      callerPluginId: "preacherman-runtime",
      approved: true,
    });
    const stored = await taskService.update(result.task.taskId, (task) => {
      task.proposalId = proposal.proposalId;
      task.proposalSnapshot = storedProposalSnapshot(proposal);
    });
    proposal.taskId = stored.taskId;
    return { ...stored, runId: stored.taskId };
  }

  async function startPreachermanExecutionRun(proposal, route) {
    let task;
    if (proposal.taskId) task = await taskService.get(proposal.taskId);
    else {
      task = await taskService.create({
        taskId: `run_${randomUUID()}`,
        proposalId: proposal.proposalId,
        objective: proposal.objective,
        executor: "preacherman-execution",
        execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution" },
        proposalSnapshot: storedProposalSnapshot(proposal),
      });
      proposal.taskId = task.taskId;
    }
    try {
      const started = (await preachermanExecutionAdapter.start(task.taskId, {
        idempotencyKey: `${proposal.proposalId}:${proposal.revision ?? 1}:attempt:${Math.max(1, task.attempts.length)}`,
      })).task;
      void preachermanExecutionReconciler.reconcileTask(started);
      return started;
    } catch (error) {
      let latest = await taskService.get(task.taskId);
      if (["queued", "running", "waiting_for_input", "waiting_for_approval"].includes(latest.status)) {
        latest = await taskService.transition(task.taskId, "failed", {
          error: { code: error.code ?? "PREACHERMAN_EXECUTION_START_FAILED", message: error.message, retryable: true },
          event: { type: "failed", stage: "terminal", message: error.message },
        });
      }
      return { ...latest, executionRoute: route };
    }
  }

  async function retryPreachermanExecutionTask(task) {
    await taskService.retry(task.taskId, { provider: "preacherman-execution" });
    const snapshot = task.proposalSnapshot ?? {
      proposalId: task.proposalId ?? `retry_${task.taskId}`,
      revision: task.revision,
      objective: task.objective,
    };
    return startPreachermanExecutionRun({ ...snapshot, taskId: task.taskId, objective: task.objective }, {
      kind: "preacherman-execution-dag",
      adapter: "preacherman-execution",
      reason: "retry",
    });
  }

  async function startProposalRun(proposal) {
    if (proposal.confirmationPromise) return proposal.confirmationPromise;
    const promise = (async () => {
      const route = await executionRouter.route(proposal);
      if (route.kind === "local-plugin") return startPluginToolRun(proposal);
      if (route.kind === "preacherman-execution-dag") return startPreachermanExecutionRun(proposal, route);
      return startPitchRun(proposal);
    })();
    proposal.confirmationPromise = promise;
    try {
      return await promise;
    } finally {
      proposal.confirmationPromise = null;
    }
  }

  async function startApprovedGatewayTask(task) {
    const proposal = {
      ...(task.proposalSnapshot ?? {}),
      proposalId: task.proposalId ?? `gateway_${task.taskId}`,
      taskId: task.taskId,
      objective: task.objective,
      revision: task.revision,
    };
    const route = await executionRouter.route(proposal);
    if (route.kind === "preacherman-execution-dag") {
      await taskService.update(task.taskId, (current) => {
        current.execution = { kind: "preacherman-execution-dag", adapter: "preacherman-execution" };
      });
      return startPreachermanExecutionRun(proposal, route);
    }
    await taskService.update(task.taskId, (current) => {
      current.executor = "pitchkit";
      current.execution = { kind: "local-pitch", adapter: "pitchkit" };
    });
    const latest = await taskService.get(task.taskId);
    if (!latest.attempts.at(-1) || ["completed", "failed", "cancelled"].includes(latest.attempts.at(-1).status)) {
      await taskService.startAttempt(task.taskId, { provider: "local", status: "active" });
    }
    void executePitchTask(task.taskId);
    return taskService.get(task.taskId);
  }

  async function commandAgentTask(task, type, input = {}, { actor } = {}) {
    if (task.execution?.kind === "local-agent") {
      if (type === "cancel") return agentAccessRuntime.cancelLocalTask(task);
      if (type === "retry") return agentAccessRuntime.retryLocalTask(task);
      throw Object.assign(new Error("This Local Agent does not support steering or resume."), { code: "LOCAL_AGENT_CAPABILITY_UNSUPPORTED", statusCode: 409 });
    }
    if (type === "cancel") {
      if (task.execution?.kind === "preacherman-execution-dag") return (await preachermanExecutionCommandAdapter.cancel(task.taskId)).task;
      if (!new Set(["queued", "running", "waiting_for_input", "waiting_for_approval"]).has(task.status)) return task;
      return taskService.transition(task.taskId, "cancelled", { event: { type: "cancelled", stage: "terminal", message: "Task cancelled." } });
    }
    if (type === "retry") {
      if (!new Set(["failed", "cancelled"]).has(task.status)) throw Object.assign(new Error(`TaskRun ${task.taskId} cannot be retried from ${task.status}.`), { statusCode: 409 });
      if (task.execution?.kind === "preacherman-execution-dag") return retryPreachermanExecutionTask(task);
      if (task.source === "mcp-gateway") {
        const queued = await taskService.update(task.taskId, (current) => {
          current.status = "queued";
          current.error = null;
          current.pendingApproval = null;
          current.retryable = false;
          appendTaskEvent(current, { type: "retry_requested", stage: "queued", message: "External Agent requested a new approved attempt." });
        });
        return taskService.requestApproval(queued.taskId, {
          proposalHash: createHash("sha256").update(JSON.stringify({ taskId: queued.taskId, objective: queued.objective, revision: queued.revision })).digest("hex"),
          title: "Retry external Agent task",
          description: "The external Agent requested a retry. Approve it in Preacherman before execution restarts.",
        });
      }
    }
    if (type === "steer") {
      if (task.source === "mcp-gateway" && task.execution?.kind !== "preacherman-execution-dag") {
        if (task.status !== "running") throw Object.assign(new Error("TaskRun is not steerable in its current state."), { statusCode: 409 });
        return taskService.update(task.taskId, (current) => {
          current.objective = `${current.objective}\n\nAdditional direction: ${String(input.instruction ?? "").trim()}`;
          current.revision += 1;
          appendTaskEvent(current, { type: "steered", stage: "executing", message: "External Agent supplied additional direction." });
        });
      }
      throw Object.assign(new Error("The selected backend does not support steering."), { code: "STEERING_UNSUPPORTED", statusCode: 409 });
    }
    throw Object.assign(new Error(`Unsupported task command: ${type}`), { statusCode: 400 });
  }

  const agentAccessRuntime = createPreachermanAgentAccessRuntime({
    taskService,
    localAgentRegistry,
    workspaces: localAgentWorkspaces,
    gatewayCredentialFile,
    gatewayScript,
    artifactRoots: [join(dataDirectory, "artifacts")],
    visionEnhancementRuntime: preachermanVisionEnhancementRuntime,
    gatewayAuthenticate: options.gatewayAuthenticate,
    startApprovedTask: startApprovedGatewayTask,
    commandTask: commandAgentTask,
  });

  function parseExplicitPluginToolRequest(input) {
    const match = input.match(/(?:run|execute|调用|运行)\s+(?:(?:the\s+)?plugin\s+tool\s+|插件工具\s+)?([A-Za-z0-9_-]+::[A-Za-z0-9_.-]+)(?:\s+(?:with|参数)\s+(\{[\s\S]*\}))?$/i);
    if (!match) return null;
    let toolArguments = {};
    if (match[2]) {
      try {
        toolArguments = JSON.parse(match[2]);
      } catch {
        const error = new Error("Plugin tool arguments must be a valid JSON object.");
        error.statusCode = 400;
        throw error;
      }
      if (!toolArguments || typeof toolArguments !== "object" || Array.isArray(toolArguments)) {
        const error = new Error("Plugin tool arguments must be a JSON object.");
        error.statusCode = 400;
        throw error;
      }
    }
    return { toolName: match[1], toolArguments };
  }

  function requestOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return "http://127.0.0.1:1420";
    return allowedOrigins.has(origin) ? origin : null;
  }

  function bearerCredential(request) {
    const header = request.headers.authorization;
    const match = typeof header === "string" ? /^Bearer ([A-Za-z0-9._~+\/-]{8,512})$/.exec(header) : null;
    if (!match) throw Object.assign(new Error("A valid Bearer credential is required."), { code: "UNAUTHENTICATED", statusCode: 401 });
    return match[1];
  }

  const motionProxy = createBinaryWebSocketProxy({
    endpoint: env.PREACHERMAN_SPEECH_MOTION_WS_URL,
    serviceName: "Speech2Motion",
  });
  const faceProxy = createBinaryWebSocketProxy({
    endpoint: env.PREACHERMAN_AUDIO2FACE_WS_URL
      ?? "ws://127.0.0.1:18083/api/v1/streaming_audio2face/ws",
    serviceName: "Audio2Face",
  });
  const executionConnections = createExecutionConnections({
    file: join(dataDirectory, "execution-connections.v1.json"),
    legacyKey: async () => (await runtimeEnv()).DEEPSEEK_API_KEY || "",
    ...(options.executionConnectionRequest ? { request: options.executionConnectionRequest } : {}),
  });
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
      if (url.pathname === "/api/settings/execution" && request.method === "GET") {
        json(response, 200, await executionConnections.status(), origin);
        return;
      }
      const connectionAction = url.pathname.match(/^\/api\/settings\/execution\/(models|test|save)$/);
      if (connectionAction && request.method === "POST") {
        json(response, 200, await executionConnections[connectionAction[1]](await readJson(request)), origin);
        return;
      }
      if (url.pathname === "/api/settings/execution/local" && request.method === "POST") {
        const body = await readJson(request);
        const agent = (await agentAccessRuntime.listLocalAgents()).find(item => item.id === body.agentId);
        if (!agent || agent.id === "preacherman-native" || !agent.capabilities?.workspaceWrite || !agent.installed || agent.auth?.state !== "ready") throw Object.assign(new Error("A ready, adapted local Agent is required."), { statusCode: 409 });
        if (!agentAccessRuntime.listWorkspaces().some(item => item.id === body.workspaceId)) throw Object.assign(new Error("Choose an approved workspace."), { statusCode: 400 });
        await executionConnections.activateLocal(body.agentId, body.workspaceId, agent.label);
        json(response, 200, await executionConnections.status(), origin);
        return;
      }
      if (url.pathname === "/api/settings/execution/local" && request.method === "DELETE") {
        await executionConnections.disconnectLocal();
        json(response, 200, await executionConnections.status(), origin);
        return;
      }
      if (url.pathname === "/api/execution/chat" && request.method === "POST") {
        json(response, 200, await executionConnections.chat(await readJson(request)), origin);
        return;
      }
      if (url.pathname === "/api/execution/local-turn" && request.method === "POST") {
        const body = await readJson(request);
        if (typeof body.objective !== "string" || !body.objective.trim() || body.objective.length > 2000) throw Object.assign(new Error("Task description must contain 1–2000 characters."), { statusCode: 400 });
        const agent = (await agentAccessRuntime.listLocalAgents()).find(item => item.id === body.agentId);
        const local = (await executionConnections.status()).local;
        if (!local || local.agentId !== body.agentId || local.workspaceId !== body.workspaceId) throw Object.assign(new Error("Reconnect this local Agent and workspace in Execution Mode."), { statusCode: 409 });
        if (!agent || agent.id === "preacherman-native" || !agent.capabilities?.workspaceWrite || !agent.installed || agent.auth?.state !== "ready") throw Object.assign(new Error("Local Agent is not ready. Check Execution Mode."), { statusCode: 409 });
        const task = await agentAccessRuntime.createAgentWorkspaceTask({
          objective: body.objective, agentId: agent.id, providerId: agent.id, modelId: "default",
          workspaceId: body.workspaceId, policy: "ask", adapterVersion: agent.version, capabilities: agent.capabilities,
        });
        json(response, 200, { task }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        const status = await providerStatus();
        json(response, 200, {
          ok: true,
          ...status,
        }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/telemetry/cortana-voice") {
        json(response, 202, cortanaVoiceTelemetry.capture(await readJson(request)), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/motion/health") {
        json(response, 200, await binaryServiceHealth(env.PREACHERMAN_SPEECH_MOTION_HEALTH_URL), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/face/health") {
        json(response, 200, await binaryServiceHealth(
          env.PREACHERMAN_AUDIO2FACE_HEALTH_URL ?? "http://127.0.0.1:18083/health",
        ), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/gateway") {
        json(response, 200, agentAccessRuntime.gatewayStatus(), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/gateway/templates") {
        json(response, 200, { templates: await agentAccessRuntime.gatewayTemplates() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/gateway/sessions") {
        json(response, 200, { sessions: agentAccessRuntime.gatewaySessions() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/gateway/audit") {
        json(response, 200, { events: agentAccessRuntime.gatewayAudit() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mcp/gateway/credentials/rotate") {
        await readJson(request);
        json(response, 200, { result: await agentAccessRuntime.gatewayRotateCredential() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mcp/gateway/test") {
        await readJson(request);
        json(response, 200, { result: await agentAccessRuntime.gatewayTest() }, origin);
        return;
      }
      const gatewayRevokeMatch = url.pathname.match(/^\/api\/mcp\/gateway\/sessions\/([^/]+)\/revoke$/);
      if (request.method === "POST" && gatewayRevokeMatch) {
        await readJson(request);
        json(response, 200, { session: agentAccessRuntime.gatewayRevokeSession(decodeURIComponent(gatewayRevokeMatch[1])) }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mcp/gateway/bridge/sessions") {
        const body = await readJson(request);
        const result = await agentAccessRuntime.gatewayCreateSession({
          bootstrapCredential: bearerCredential(request),
          client: body.client,
          transport: body.transport,
          workspacePath: body.workspacePath,
        });
        json(response, 200, {
          server: { name: "preacherman", version: "1.0" },
          session: { id: result.session.sessionId, accessToken: result.accessToken, expiresAt: null },
          tools: result.tools,
        }, origin);
        return;
      }
      const gatewayCallMatch = url.pathname.match(/^\/api\/mcp\/gateway\/bridge\/sessions\/([^/]+)\/calls$/);
      if (request.method === "POST" && gatewayCallMatch) {
        const body = await readJson(request);
        json(response, 200, await agentAccessRuntime.gatewayCall({
          sessionId: decodeURIComponent(gatewayCallMatch[1]),
          accessToken: bearerCredential(request),
          name: body.name,
          arguments: body.arguments,
        }), origin);
        return;
      }
      const gatewayCloseMatch = url.pathname.match(/^\/api\/mcp\/gateway\/bridge\/sessions\/([^/]+)$/);
      if (request.method === "DELETE" && gatewayCloseMatch) {
        json(response, 200, { session: agentAccessRuntime.gatewayCloseSession(decodeURIComponent(gatewayCloseMatch[1]), bearerCredential(request)) }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/local-agents") {
        const agents = await agentAccessRuntime.listLocalAgents();
        const discovered = options.localAgentRegistry ? [] : await discoverLocalAgents();
        json(response, 200, { scannedAt: new Date().toISOString(), agents: [...agents.map(agent => ({ ...agent, execution: {
          supported: agent.id !== "preacherman-native" && agent.capabilities?.workspaceWrite === true,
          models: [{ id: "default", label: "Default · CLI configuration" }],
          workspaceRequired: true, reasoningManagedByAgent: true,
        } })), ...discovered.filter(agent => !agents.some(registered => registered.id === agent.id))] }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/agent-workspace/catalog") {
        json(response, 200, await agentWorkspaceCatalog(), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/agent-workspace/turn") {
        const body = await readJson(request);
        const input = typeof body.input === "string" ? body.input.trim() : "";
        const selection = body.selection ?? {};
        const policy = body.policy;
        if (!input || input.length > 2_000) throw Object.assign(new Error("Agent workspace input must contain 1 to 2000 characters."), { statusCode: 400 });
        if (!new Set(["auto", "ask", "strict"]).has(policy)) throw Object.assign(new Error("Unknown approval policy."), { statusCode: 400 });
        const catalog = await agentWorkspaceCatalog();
        const agent = catalog.agents.find((candidate) => candidate.id === selection.agentId);
        const provider = agent?.providers.find((candidate) => candidate.id === selection.providerId);
        const model = provider?.models.find((candidate) => candidate.id === selection.modelId);
        if (!agent || !provider || !model) throw Object.assign(new Error("The selected Agent, provider and model combination is not supported."), { statusCode: 400 });
        if (agent.status !== "ready" || provider.status !== "ready" || model.status !== "ready") throw Object.assign(new Error("The selected Agent configuration is not ready."), { statusCode: 409 });
        if (agent.id !== "preacherman-native") throw Object.assign(new Error("This Agent is discovered but its Agent Workspace flow is not available yet."), { statusCode: 409 });
        const record = (await agentAccessRuntime.listLocalAgents()).find((candidate) => candidate.id === agent.id);
        const task = await agentAccessRuntime.createAgentWorkspaceTask({
          objective: input,
          agentId: agent.id,
          providerId: provider.id,
          modelId: model.id,
          workspaceId: body.workspaceId,
          policy,
          adapterVersion: record?.version,
          capabilities: record?.capabilities ?? {},
        });
        json(response, 200, {
          displayText: body.locale === "zh-CN" ? "任务提案已准备好。批准后，Preacherman Native 才会启动执行。" : "The task proposal is ready. Preacherman Native will start only after approval.",
          proposal: {
            proposalId: `proposal_${task.taskId}`,
            taskId: task.taskId,
            approvalId: task.pendingApproval.approvalId,
            objective: task.objective,
            executor: "Preacherman Native",
            inputs: [provider.label, model.label],
            outputs: ["TaskRun", "Ledger artifact"],
          },
          task,
        }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/native/status") {
        json(response, 200, await nativeStatus(), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/execution/native/health") {
        await readJson(request);
        json(response, 200, await nativeStatus({ healthCheck: true }), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/native/preferences") {
        json(response, 200, { defaults: await readNativePreferences() }, origin);
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/execution/native/preferences") {
        const body = await readJson(request);
        json(response, 200, { defaults: await writeNativePreferences(body.defaults) }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/workspaces") {
        json(response, 200, { workspaces: agentAccessRuntime.listWorkspaces() }, origin);
        return;
      }
      const localAgentTestMatch = url.pathname.match(/^\/api\/execution\/local-agents\/([^/]+)\/test$/);
      if (request.method === "POST" && localAgentTestMatch) {
        await readJson(request);
        const id = decodeURIComponent(localAgentTestMatch[1]);
        const agent = (await agentAccessRuntime.listLocalAgents()).find((candidate) => candidate.id === id);
        if (!agent) throw Object.assign(new Error("Local Agent adapter was not found."), { statusCode: 404 });
        json(response, 200, { agent }, origin);
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
        const runTest = async (providerId, capability) => {
          try {
            const providerResult = await preachermanProviderRuntime.test(providerId, { capability });
            return {
              configured: providerResult.state !== "configuration-required",
              ok: providerResult.ok === true,
              message: providerResult.message || (providerResult.state === "configuration-required" ? "Not configured" : "Connection failed"),
            };
          } catch (error) {
            return { configured: true, ok: false, message: error instanceof Error ? error.message : "Connection failed" };
          }
        };
        const [deepseek, asr, tts] = await Promise.all([
          runTest("deepseek", "chat"),
          runTest("dashscope", "asr"),
          runTest("dashscope", "tts"),
        ]);
        const result = { deepseek, asr, tts };
        json(response, 200, result, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/config") {
        json(response, 200, { ...(await preachermanMcpRuntime.readConfigText()), status: preachermanMcpRuntime.getRuntimeStatus() }, origin);
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/mcp/config") {
        const body = await readJson(request);
        const config = await preachermanMcpRuntime.writeConfigText(body.text);
        const result = await preachermanMcpRuntime.applyAndRestart();
        json(response, 200, { ...config, result, status: preachermanMcpRuntime.getRuntimeStatus() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp/tools") {
        json(response, 200, { tools: await preachermanMcpRuntime.listTools(), status: preachermanMcpRuntime.getRuntimeStatus() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mcp/tools/call") {
        const body = await readJson(request);
        if (typeof body.name !== "string" || body.name.length > 200) {
          json(response, 400, { error: "MCP tool name is required." }, origin);
          return;
        }
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-settings",
          target: body.name,
          input: { argumentKeys: Object.keys(body.arguments ?? {}).sort() },
        }, () => preachermanMcpRuntime.callTool(body.name, body.arguments ?? {}));
        json(response, 200, { result }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/plugins") {
        json(response, 200, { plugins: await preachermanPluginRuntime.listPlugins() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/preacherman/kits") {
        json(response, 200, {
          kits: preachermanKitsRuntime.kits.discover(),
          bindings: preachermanKitsRuntime.bindings.list(),
        }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/install") {
        const body = await readJson(request);
        const plugin = await preachermanPluginRuntime.install(body.directory);
        await preachermanObservabilityRuntime.syncPluginSessions(await preachermanPluginRuntime.listPlugins());
        json(response, 201, { plugin }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/uninstall") {
        const body = await readJson(request);
        const result = await preachermanPluginRuntime.uninstall(body.name);
        await preachermanObservabilityRuntime.syncPluginSessions(await preachermanPluginRuntime.listPlugins());
        json(response, 200, { result }, origin);
        return;
      }
      const pluginMatch = url.pathname.match(/^\/api\/plugins\/([A-Za-z0-9_-]{1,80})$/);
      if (request.method === "PUT" && pluginMatch) {
        const plugin = await preachermanPluginRuntime.setEnabled(pluginMatch[1], (await readJson(request)).enabled);
        await preachermanObservabilityRuntime.syncPluginSessions(await preachermanPluginRuntime.listPlugins());
        json(response, 200, { plugin }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/reload") {
        const body = await readJson(request);
        const plugin = await preachermanPluginRuntime.reload(typeof body.name === "string" ? body.name : undefined);
        await preachermanObservabilityRuntime.syncPluginSessions(await preachermanPluginRuntime.listPlugins());
        json(response, 200, { plugin }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/observability") {
        json(response, 200, await preachermanObservabilityRuntime.snapshot({
          plugins: await preachermanPluginRuntime.listPlugins(),
          tools: await preachermanPluginRuntime.listTools(),
        }), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/plugins/tools") {
        json(response, 200, { tools: await preachermanPluginRuntime.listTools() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/plugins/tools/call") {
        const body = await readJson(request);
        if (typeof body.name !== "string" || body.name.length > 200) {
          json(response, 400, { error: "Plugin tool name is required." }, origin);
          return;
        }
        json(response, 200, {
          result: await executePluginToolAsTask(body.name, body.arguments ?? {}, {
            callerPluginId: "preacherman-runtime",
            approved: body.approved === true,
          }),
        }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/widgets") {
        json(response, 200, { widgets: await preachermanWidgetRuntime.list() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/gamelets") {
        json(response, 200, { gamelets: preachermanGameletRuntime.discover() }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gamelets/sessions") {
        const body = await readJson(request);
        const session = await preachermanGameletRuntime.createSession({
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
        const session = await preachermanGameletRuntime.sendAction({
          pluginId: "preacherman-runtime",
          sessionId: decodeURIComponent(gameletActionMatch[1]),
          action: body.action,
        });
        json(response, 200, { session }, origin);
        return;
      }
      const gameletStopMatch = url.pathname.match(/^\/api\/gamelets\/sessions\/([^/]+)\/stop$/);
      if (request.method === "POST" && gameletStopMatch) {
        const body = await readJson(request);
        const session = await preachermanGameletRuntime.stopSession({
          pluginId: "preacherman-runtime",
          sessionId: decodeURIComponent(gameletStopMatch[1]),
          reason: typeof body.reason === "string" ? body.reason : "requested",
        });
        json(response, 200, { session }, origin);
        return;
      }
      const gameletLifecycleMatch = url.pathname.match(/^\/api\/gamelets\/sessions\/([^/]+)\/(pause|resume)$/);
      if (request.method === "POST" && gameletLifecycleMatch) {
        await readJson(request);
        const sessionId = decodeURIComponent(gameletLifecycleMatch[1]);
        const session = gameletLifecycleMatch[2] === "pause"
          ? await preachermanGameletRuntime.pauseSession({ pluginId: "preacherman-runtime", sessionId })
          : await preachermanGameletRuntime.resumeSession({ pluginId: "preacherman-runtime", sessionId });
        json(response, 200, { session }, origin);
        return;
      }
      const gameletDestroyMatch = url.pathname.match(/^\/api\/gamelets\/sessions\/([^/]+)$/);
      if (request.method === "DELETE" && gameletDestroyMatch) {
        const session = await preachermanGameletRuntime.destroySession({
          pluginId: "preacherman-runtime",
          sessionId: decodeURIComponent(gameletDestroyMatch[1]),
          reason: "user-requested",
        });
        json(response, 200, { session }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/providers/catalog") {
        json(response, 200, { providers: await preachermanProviderRuntime.catalog() }, origin);
        return;
      }
      const providerModelsMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/models$/);
      if (request.method === "GET" && providerModelsMatch) {
        const providerId = decodeURIComponent(providerModelsMatch[1]);
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-settings",
          target: `provider:${providerId}:models`,
          input: {},
        }, () => preachermanProviderRuntime.listModels(providerId));
        json(response, 200, { result }, origin);
        return;
      }
      const providerOperationMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/(test|invoke)$/);
      if (request.method === "POST" && providerOperationMatch) {
        const body = await readJson(request);
        const providerId = decodeURIComponent(providerOperationMatch[1]);
        const operation = providerOperationMatch[2];
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-settings",
          target: `provider:${providerId}:${operation}`,
          input: { capability: body.capability },
        }, () => operation === "test"
          ? preachermanProviderRuntime.test(providerId, { capability: body.capability })
          : preachermanProviderRuntime.invoke(providerId, { capability: body.capability, input: body.input }));
        json(response, 200, { result }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/personas") {
        json(response, 200, {
          personas: await preachermanMemoryPersonaRuntime.listPersonas(),
          selected: await preachermanMemoryPersonaRuntime.getSelectedPersona(),
        }, origin);
        return;
      }
      const personaSelectMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/select$/);
      if (request.method === "POST" && personaSelectMatch) {
        const selected = await preachermanMemoryPersonaRuntime.selectPersona(decodeURIComponent(personaSelectMatch[1]));
        json(response, 200, { selected }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/memory/remember") {
        json(response, 201, { memory: await preachermanMemoryPersonaRuntime.remember(await readJson(request)) }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/memory/recall") {
        json(response, 200, { memories: await preachermanMemoryPersonaRuntime.recall(await readJson(request)) }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/memory/access") {
        json(response, 200, { access: preachermanMemoryPersonaRuntime.getAccessPolicy() }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/memory/audit") {
        const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
        json(response, 200, { events: await preachermanMemoryPersonaRuntime.listAuditEvents({ limit }) }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/connections") {
        json(response, 200, { connections: preachermanConnectionRuntime.list() }, origin);
        return;
      }
      const connectionOperationMatch = url.pathname.match(/^\/api\/connections\/([^/]+)\/(configure|test|connect|disconnect)$/);
      if (request.method === "POST" && connectionOperationMatch) {
        const body = await readJson(request);
        const connectionId = decodeURIComponent(connectionOperationMatch[1]);
        const operation = connectionOperationMatch[2];
        const connection = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-settings",
          target: `connection:${connectionId}:${operation}`,
          input: operation === "configure"
            ? { configurationKeys: Object.keys(body.configuration ?? {}).sort() }
            : {},
        }, () => operation === "configure"
          ? preachermanConnectionRuntime.configure(connectionId, body.configuration ?? {})
          : operation === "test"
            ? preachermanConnectionRuntime.test(connectionId)
            : operation === "connect"
              ? preachermanConnectionRuntime.connect(connectionId)
              : preachermanConnectionRuntime.disconnect(connectionId));
        json(response, 200, { connection }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/computer-vision") {
        const externalComputerUse = preachermanComputerVisionRuntime.computerUseStatus();
        const domComputerUse = preachermanDomObservationRuntime.status();
        const computerUseReady = externalComputerUse.phase === "ready" || domComputerUse.phase === "ready";
        const targets = [...externalComputerUse.targets, ...domComputerUse.targets]
          .filter((target, index, all) => all.findIndex((candidate) => candidate.kind === target.kind && candidate.id === target.id) === index);
        json(response, 200, {
          capabilities: preachermanComputerVisionRuntime.list(),
          computerUse: {
            ...externalComputerUse,
            phase: computerUseReady ? "ready" : externalComputerUse.phase,
            adapter: externalComputerUse.phase === "ready" ? externalComputerUse.adapter : domComputerUse.adapter,
            targets,
            lastTest: externalComputerUse.lastTest ?? domComputerUse.lastTest,
          },
          approvals: preachermanComputerVisionRuntime.listApprovals({ status: "pending" }),
          operations: [...preachermanComputerVisionRuntime.logs({ limit: 20 }), ...preachermanDomObservationRuntime.logs({ limit: 20 })]
            .sort((left, right) => String(right.at).localeCompare(String(left.at)))
            .slice(0, 20),
        }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/computer-vision/dom-snapshot") {
        const result = preachermanDomObservationRuntime.ingestBrowserSnapshot(await readJson(request));
        json(response, 202, { result }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/computer-vision/computer-use/test") {
        await readJson(request);
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-work",
          target: "computer-use:test",
          input: {},
        }, () => preachermanComputerVisionRuntime.testComputerUse());
        json(response, 200, { result }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/computer-vision/computer-use/observe") {
        const body = await readJson(request);
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-ui",
          target: "computer-use:observe",
          input: { target: body.target },
        }, () => body.target?.kind === "web"
          ? preachermanDomObservationRuntime.observe({ callerPluginId: "preacherman-ui", target: body.target })
          : preachermanComputerVisionRuntime.observe({ callerPluginId: "preacherman-ui", target: body.target }));
        json(response, 200, { result }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/computer-vision/computer-use/inspect-dom") {
        const body = await readJson(request);
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-ui",
          target: "computer-use:inspect-dom",
          input: { target: body.target, selector: body.selector, maxDepth: body.maxDepth },
        }, () => body.target?.kind === "web"
          ? preachermanDomObservationRuntime.inspectDom({
            callerPluginId: "preacherman-ui",
            target: body.target,
            selector: body.selector,
            maxDepth: body.maxDepth,
          })
          : preachermanComputerVisionRuntime.inspectDom({
            callerPluginId: "preacherman-ui",
            target: body.target,
            selector: body.selector,
            maxDepth: body.maxDepth,
          }));
        json(response, 200, { result }, origin);
        return;
      }
      const computerUseApprovalMatch = url.pathname.match(/^\/api\/computer-vision\/computer-use\/approvals\/([^/]+)$/);
      if (request.method === "POST" && computerUseApprovalMatch) {
        const body = await readJson(request);
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-ui",
          target: "computer-use:approval",
          input: { approvalId: computerUseApprovalMatch[1], decision: body.decision },
        }, () => preachermanComputerVisionRuntime.approveAction({
          approvalId: decodeURIComponent(computerUseApprovalMatch[1]),
          decision: body.decision,
          evidence: computerUseApprovalAuthority,
        }));
        json(response, 200, { result }, origin);
        return;
      }
      const computerVisionMatch = url.pathname.match(/^\/api\/computer-vision\/([^/]+)\/(test|invoke)$/);
      if (request.method === "POST" && computerVisionMatch) {
        const capability = decodeURIComponent(computerVisionMatch[1]);
        const body = await readJson(request);
        const operation = computerVisionMatch[2];
        const result = await preachermanObservabilityRuntime.trace({
          caller: "preacherman-work",
          target: `computer-vision:${capability}:${operation}`,
          input: { capability, hasInput: Boolean(body.input) },
        }, () => operation === "test"
          ? preachermanComputerVisionRuntime.test(capability)
          : preachermanComputerVisionRuntime.invoke(capability, body.input ?? {}));
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
      if (request.method === "GET" && url.pathname === "/api/preacherman/events") {
        const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
        json(response, 200, { events: await preachermanCapabilityRuntime.list(limit) }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/preacherman/capabilities/status") {
        const body = await readJson(request);
        json(response, 200, {
          capabilities: await preachermanCapabilityRuntime.status(body.ids, { locale: body.locale }),
        }, origin);
        return;
      }
      const preachermanCapabilityMatch = url.pathname.match(/^\/api\/preacherman\/capabilities\/([^/]+)\/invoke$/);
      if (request.method === "POST" && preachermanCapabilityMatch) {
        const event = await preachermanCapabilityRuntime.invoke(
          decodeURIComponent(preachermanCapabilityMatch[1]),
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
        const explicitPluginTool = parseExplicitPluginToolRequest(input);
        if (explicitPluginTool) {
          const availableTools = await preachermanPluginRuntime.listTools();
          if (!availableTools.some((tool) => tool.name === explicitPluginTool.toolName)) {
            json(response, 404, { error: `Plugin tool is not available: ${explicitPluginTool.toolName}` }, origin);
            return;
          }
        }
        const pluginToolRequested = Boolean(explicitPluginTool)
          || /(?:preacherman\s*)?(?:plugin|插件).*(?:summary|status|摘要|状态)|(?:summary|status|摘要|状态).*(?:plugin|插件)/i.test(input);
        const selectedPluginTool = explicitPluginTool ?? { toolName: "preacherman-runtime::task_summary", toolArguments: {} };
        const turn = pluginToolRequested
          ? {
              message: locale === "zh-CN" ? `我可以运行插件工具 ${selectedPluginTool.toolName}；确认后，结果会作为 TaskRun 产物写入 Ledger。` : `I can run plugin tool ${selectedPluginTool.toolName}. After approval, its result will be written to Ledger as a TaskRun artifact.`,
              speechText: locale === "zh-CN" ? "请确认运行这个插件工具。" : "Please approve this plugin tool.",
              action: "propose_task",
              diagnostics: { source: "fallback", model: null, reason: "local_plugin_intent" },
            }
          : await createCompanionTurn(input, locale, body.history);
        let proposal = null;
        if (turn.action === "propose_task") {
          proposal = pluginToolRequested
            ? createPluginToolProposal({ id: `proposal_${randomUUID()}`, objective: input, locale, ...selectedPluginTool })
            : createPitchProposal({ id: `proposal_${randomUUID()}`, objective: input, locale });
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
        const run = await startProposalRun(proposal);
        json(response, 202, { run }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/tasks") {
        const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "10", 10);
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;
        json(response, 200, { tasks: await taskService.list(limit) }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const body = await readJson(request);
        if (body.source !== "local-agent-runner") throw Object.assign(new Error("Only the registered Local Agent launcher can create tasks through this route."), { statusCode: 400 });
        json(response, 201, { task: await agentAccessRuntime.createLocalTask(body.objective) }, origin);
        return;
      }
      const localAgentStartMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/local-agent\/start$/);
      if (request.method === "POST" && localAgentStartMatch) {
        const body = await readJson(request);
        const allowed = new Set(["agentId", "workspaceId", "policy"]);
        if (Object.keys(body).some((key) => !allowed.has(key))) throw Object.assign(new Error("Local Agent start accepts only agentId, workspaceId, and policy."), { statusCode: 400 });
        const task = await agentAccessRuntime.startLocalTask(decodeURIComponent(localAgentStartMatch[1]), body);
        json(response, 202, { task }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/providers/status") {
        json(response, 200, { providers: [await preachermanExecutionDiagnostics.status()] }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/providers/preacherman-execution/workflows") {
        json(response, 200, await preachermanExecutionDiagnostics.workflows(), origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/execution/providers/preacherman-execution/console") {
        response.writeHead(302, {
          "Access-Control-Allow-Origin": origin,
          Location: preachermanExecutionConsoleUrl,
          Vary: "Origin",
        });
        response.end();
        return;
      }
      const taskArtifactsMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/artifacts$/);
      if (request.method === "GET" && taskArtifactsMatch) {
        const task = await taskService.get(decodeURIComponent(taskArtifactsMatch[1])).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        if (!task) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        json(response, 200, { taskId: task.taskId, artifacts: task.artifacts, total: task.artifacts.length }, origin);
        return;
      }
      const taskArtifactContentMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/artifacts\/([^/]+)\/content$/);
      if (request.method === "GET" && taskArtifactContentMatch) {
        const taskId = decodeURIComponent(taskArtifactContentMatch[1]);
        const artifactId = decodeURIComponent(taskArtifactContentMatch[2]);
        const task = await taskService.get(taskId).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        const artifact = task?.artifacts?.find((candidate) => candidate.artifactId === artifactId);
        if (!task || !artifact) {
          json(response, 404, { error: "Task artifact not found." }, origin);
          return;
        }
        if (task.execution?.kind !== "preacherman-execution-dag") {
          if (artifact.content === undefined) {
            json(response, 409, { error: "This local artifact has no host-owned inline content." }, origin);
            return;
          }
          const payload = artifact.mediaType === "application/json"
            ? Buffer.from(JSON.stringify(artifact.content, null, 2), "utf8")
            : Buffer.from(typeof artifact.content === "string" ? artifact.content : JSON.stringify(artifact.content), "utf8");
          if (payload.byteLength > 2 * 1024 * 1024) {
            json(response, 413, { error: "Task artifact is too large to download." }, origin);
            return;
          }
          const filename = String(artifact.name || "artifact")
            .replace(/[\r\n"\\/:*?<>|]+/g, "-")
            .slice(0, 160) || "artifact";
          response.writeHead(200, {
            "Access-Control-Allow-Origin": origin,
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(payload.byteLength),
            "Content-Type": artifact.mediaType || "application/octet-stream",
            Vary: "Origin",
          });
          response.end(payload);
          return;
        }
        const upstream = await preachermanExecutionArtifactAdapter.content(taskId, artifactId, {
          range: typeof request.headers.range === "string" ? request.headers.range : undefined,
        });
        const headers = {
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin",
          ...Object.fromEntries(["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]
            .map((name) => [name, upstream.headers.get(name)])
            .filter(([, value]) => value !== null)),
        };
        response.writeHead(upstream.status, headers);
        if (upstream.body) Readable.fromWeb(upstream.body).pipe(response);
        else response.end();
        return;
      }
      const taskArtifactMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/artifact$/);
      if (request.method === "GET" && taskArtifactMatch) {
        const task = await taskService.get(decodeURIComponent(taskArtifactMatch[1])).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        if (!task?.artifact) {
          json(response, 404, { error: "Task artifact not found." }, origin);
          return;
        }
        json(response, 200, { artifact: task.artifact }, origin);
        return;
      }
      const taskSummaryMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/summary$/);
      if (request.method === "POST" && taskSummaryMatch) {
        const body = await readJson(request);
        const taskId = decodeURIComponent(taskSummaryMatch[1]);
        const task = await taskService.get(taskId).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        if (!task) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        if (task.status !== "succeeded") throw Object.assign(new Error("Only a succeeded TaskRun can be summarized."), { statusCode: 409 });
        if (!task.aAgentSummary) {
          const artifactNames = (task.artifacts ?? []).map((artifact) => artifact.name).slice(0, 20).join(", ");
          const executorResult = String(task.localAgentSummary ?? "").trim();
          if (!executorResult) throw Object.assign(new Error("The completed TaskRun has no verified executor result to summarize."), { statusCode: 409 });
          const summary = body.locale === "zh-CN"
            ? `Preacherman 已核对 TaskRun 的真实结果：\n\n${executorResult.slice(0, 6_000)}\n\n可查看产物：${artifactNames || "无"}`
            : `Preacherman verified the real TaskRun result:\n\n${executorResult.slice(0, 6_000)}\n\nAvailable artifacts: ${artifactNames || "none"}`;
          await taskService.update(task.taskId, (current) => {
            current.aAgentSummary = summary;
            appendTaskEvent(current, { type: "result_summarized", stage: "reporting", message: "Preacherman summarized the verified TaskResult." });
          });
        }
        json(response, 200, { task: await taskService.get(task.taskId) }, origin);
        return;
      }
      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (request.method === "GET" && taskMatch) {
        const task = await taskService.get(decodeURIComponent(taskMatch[1])).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
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
        const existing = await taskService.get(taskId).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        if (!existing) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        const body = await readJson(request);
        const type = body.type;
        if (existing.execution?.kind === "local-agent") {
          if (type === "approve" || type === "reject") {
            const approval = existing.pendingApproval;
            if (!approval || (body.approvalId && body.approvalId !== approval.approvalId)) {
              json(response, 409, { error: "The Local Agent approval does not match the pending request." }, origin);
              return;
            }
            const task = await agentAccessRuntime.decideLocalTaskApproval(existing, type === "approve" ? "approved" : "rejected");
            json(response, type === "approve" ? 202 : 200, { task, command: { type, accepted: true } }, origin);
            return;
          }
          if (type === "resume" || type === "steer") {
            json(response, 409, { error: "The selected Local Agent does not support this command." }, origin);
            return;
          }
          const task = await commandAgentTask(existing, type, body);
          json(response, type === "retry" ? 202 : 200, { task, command: { type, accepted: true } }, origin);
          return;
        }
        if ((type === "approve" || type === "reject") && existing.source === "mcp-gateway") {
          const approval = existing.pendingApproval;
          if (!approval) throw Object.assign(new Error("No approval is pending."), { statusCode: 409 });
          let task = await taskService.resolveApproval(existing.taskId, {
            approvalId: approval.approvalId,
            proposalHash: approval.proposalHash,
            decision: type === "approve" ? "approved" : "rejected",
            actor: "preacherman-user",
          });
          if (type === "approve") task = await agentAccessRuntime.startApprovedTask(task);
          else task = await taskService.transition(task.taskId, "cancelled", { event: { type: "rejected", stage: "terminal", message: "User rejected the external Agent task." } });
          json(response, 200, { task, command: { type, accepted: true } }, origin);
          return;
        }
        if (existing.source === "mcp-gateway" && new Set(["cancel", "retry", "steer"]).has(type)) {
          const task = await commandAgentTask(existing, type, body);
          json(response, type === "retry" || type === "steer" ? 202 : 200, { task, command: { type, accepted: true } }, origin);
          return;
        }
        if (type === "cancel") {
          if (existing.execution?.kind === "preacherman-execution-dag") {
            const result = await preachermanExecutionCommandAdapter.cancel(taskId);
            json(response, 200, { task: result.task, command: { type: "cancel", accepted: result.accepted, reused: result.reused } }, origin);
            return;
          }
          const task = await taskService.update(taskId, (current) => {
            if (!["queued", "running"].includes(current.status)) return;
            current.status = "cancelled";
            appendTaskEvent(current, { type: "cancelled", stage: "terminal", message: "PitchKit cancelled" });
          });
          json(response, 200, { task, command: { type: "cancel", accepted: task.status === "cancelled" } }, origin);
          return;
        }
        if ((type === "approve" || type === "reject") && existing.execution?.kind === "preacherman-execution-dag") {
          const approvalId = typeof body.approvalId === "string" ? body.approvalId : existing.pendingApproval?.approvalId;
          const result = await preachermanExecutionApprovalAdapter.decide(taskId, {
            approvalId,
            decision: type === "approve" ? "approved" : "rejected",
          });
          json(response, 200, { task: result.task, command: { type, accepted: true, reused: result.reused } }, origin);
          return;
        }
        if ((type === "resume" || type === "steer") && existing.execution?.kind === "preacherman-execution-dag") {
          const input = typeof body.input === "string" && body.input.trim()
            ? body.input
            : typeof body.instruction === "string" && body.instruction.trim()
              ? body.instruction
              : typeof body.objective === "string" ? body.objective : "";
          const result = await preachermanExecutionCommandAdapter.sendInput(taskId, input, { mode: type });
          json(response, 202, { task: result.task, command: { type, accepted: true } }, origin);
          return;
        }
        if (type === "retry" && existing.execution?.kind === "preacherman-execution-dag") {
          const task = await retryPreachermanExecutionTask(existing);
          json(response, 202, { task, command: { type, accepted: true, attempt: task.attempts.at(-1)?.attempt } }, origin);
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
          const task = await taskService.update(taskId, (current) => {
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
        json(response, 400, { error: "command type must be cancel, steer, resume, retry, approve, or reject." }, origin);
        return;
      }
      const runMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)$/);
      if (request.method === "GET" && runMatch) {
        const run = await taskService.get(decodeURIComponent(runMatch[1])).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        if (!run) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        json(response, 200, { run }, origin);
        return;
      }
      const runActionMatch = url.pathname.match(/^\/api\/agent\/runs\/([^/]+)\/(cancel|retry)$/);
      if (request.method === "POST" && runActionMatch) {
        const run = await taskService.get(decodeURIComponent(runActionMatch[1])).catch((error) => error?.code === "TASK_NOT_FOUND" ? null : Promise.reject(error));
        if (!run) {
          json(response, 404, { error: "Task run not found." }, origin);
          return;
        }
        if (runActionMatch[2] === "cancel") {
          if (run.execution?.kind === "preacherman-execution-dag") {
            const result = await preachermanExecutionCommandAdapter.cancel(run.taskId);
            json(response, 200, { run: result.task }, origin);
            return;
          }
          const cancelled = await taskService.update(run.taskId, (task) => {
            if (!["queued", "running"].includes(task.status)) return;
            task.status = "cancelled";
            appendTaskEvent(task, { type: "cancelled", stage: "terminal", message: task.source === "preacherman-plugin" ? "Plugin TaskRun cancelled" : "PitchKit cancelled" });
          });
          json(response, 200, { run: cancelled }, origin);
          return;
        }
        if (!["failed", "cancelled"].includes(run.status)) {
          json(response, 409, { error: `TaskRun ${run.taskId} cannot be retried from ${run.status}.` }, origin);
          return;
        }
        if (run.execution?.kind === "preacherman-execution-dag") {
          const retried = await retryPreachermanExecutionTask(run);
          json(response, 202, { run: retried, previousRunId: run.runId, sameTask: true }, origin);
          return;
        }
        if (run.source === "preacherman-plugin") {
          const body = await readJson(request);
          const qualifiedName = run.toolCall?.qualifiedName
            ?? (run.providerPluginId && run.toolCall?.name ? `${run.providerPluginId}::${run.toolCall.name}` : null);
          if (!qualifiedName) {
            json(response, 409, { error: "This plugin TaskRun predates retry metadata. Run the tool again from Work or Plugin Manager." }, origin);
            return;
          }
          const parameterKeys = run.toolCall?.parameterSummary?.keys ?? [];
          if (body.arguments === undefined && parameterKeys.length > 0) {
            json(response, 409, { error: "Plugin arguments are not persisted. Run the tool again with its original arguments from Work or Plugin Manager." }, origin);
            return;
          }
          const retryResult = await executePluginToolAsTask(qualifiedName, body.arguments ?? {}, {
            callerPluginId: run.pluginId || "preacherman-runtime",
            approved: body.approved === true,
          });
          const storedRetry = await taskService.get(retryResult.task.taskId);
          json(response, 202, { run: { ...storedRetry, runId: storedRetry.taskId }, previousRunId: run.runId }, origin);
          return;
        }
        const retry = await startPitchRun({ proposalId: run.proposalId, objective: run.objective });
        json(response, 202, { run: retry, previousRunId: run.runId }, origin);
        return;
      }
      json(response, 404, { error: "Route not found." }, origin);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      const failedTask = error?.taskId
        ? await taskService.get(error.taskId).catch(() => undefined)
        : undefined;
      json(response, status, {
        error: error instanceof Error ? error.message : "Unexpected service error.",
        ...(failedTask ? { task: failedTask } : {}),
      }, origin);
    }
  });

  const voiceProxy = new WebSocketServer({ noServer: true });
  voiceProxy.on("connection", async (client, _request, kind) => {
    let providerSessionId;
    let closing = false;
    const pendingMessages = [];
    const closeProvider = async (reason) => {
      if (closing || !providerSessionId) return;
      closing = true;
      try { await preachermanProviderRuntime.closeStream(providerSessionId, { reason }); } catch { /* session is already terminal */ }
    };
    const sendToProvider = async ({ data, isBinary }) => {
      await preachermanProviderRuntime.sendStream(providerSessionId, {
        data: isBinary ? Buffer.from(data).toString("base64") : Buffer.from(data).toString("utf8"),
        isBinary,
      });
    };
    client.on("message", (data, isBinary) => {
      const message = { data: Buffer.from(data), isBinary };
      if (!providerSessionId) pendingMessages.push(message);
      else void sendToProvider(message).catch(() => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "preacherman.voice.error", message: "DashScope stream send failed." }));
      });
    });
    client.on("close", () => { void closeProvider("client-closed"); });
    try {
      const session = await preachermanProviderRuntime.openStream("dashscope", {
        capability: kind,
        input: { transport: "preacherman-local-websocket" },
        onEvent(event) {
          if (client.readyState !== WebSocket.OPEN) return;
          if (event?.type === "message") {
            client.send(event.isBinary ? Buffer.from(event.data, "base64") : event.data, { binary: event.isBinary === true });
          } else if (event?.type === "error") {
            client.send(JSON.stringify({ type: "preacherman.voice.error", message: event.message || "DashScope connection failed." }));
          } else if (event?.type === "close") {
            client.close();
          }
        },
      });
      providerSessionId = session.id;
      if (client.readyState !== WebSocket.OPEN) {
        await closeProvider("client-closed-before-ready");
        return;
      }
      client.send(JSON.stringify({ type: "preacherman.voice.ready", kind }));
      for (const message of pendingMessages.splice(0)) await sendToProvider(message);
    } catch (error) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "preacherman.voice.error", message: error instanceof Error ? error.message : "DashScope connection failed." }));
        client.close(1011, "Provider stream unavailable.");
      }
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const origin = requestOrigin(request);
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (!origin) {
      socket.destroy();
      return;
    }
    if (path === "/api/motion/speech2motion") {
      motionProxy.handleUpgrade(request, socket, head);
      return;
    }
    if (path === "/api/face/audio2face") {
      faceProxy.handleUpgrade(request, socket, head);
      return;
    }
    const kind = path === "/api/voice/asr" ? "asr" : path === "/api/voice/tts" ? "tts" : null;
    if (!kind) {
      socket.destroy();
      return;
    }
    voiceProxy.handleUpgrade(request, socket, head, (client) => voiceProxy.emit("connection", client, request, kind));
  });

  return {
    server,
    async listen(port = Number(env.PREACHERMAN_SERVICE_PORT) || DEFAULT_PORT) {
      await migratePreachermanBrandData(dataDirectory);
      await initializeEcosystemRuntimes();
      await Promise.all([preachermanMcpRuntime.initialize(), preachermanPluginRuntime.initialize()]);
      await preachermanObservabilityRuntime.syncPluginSessions(await preachermanPluginRuntime.listPlugins());
      await preachermanExecutionReconciler.reconcileAll();
      preachermanExecutionReconciler.start();
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", async () => {
          server.off("error", reject);
          try {
            localServicePort = server.address().port;
            await agentAccessRuntime.initialize(localServicePort);
            resolveListen(server.address());
          } catch (error) {
            server.close(() => reject(error));
          }
        });
      });
    },
    async close() {
      preachermanExecutionReconciler.stop();
      for (const client of voiceProxy.clients) client.close();
      motionProxy.close();
      faceProxy.close();
      await preachermanPluginRuntime.close();
      await agentAccessRuntime.close();
      ecosystemFacade.close();
      await Promise.all([
        preachermanMcpRuntime.close(),
        preachermanGameletRuntime.close(),
        preachermanProviderRuntime.close(),
        preachermanMemoryPersonaRuntime.close(),
        preachermanConnectionRuntime.close(),
        preachermanComputerVisionRuntime.close(),
        preachermanObservabilityRuntime.close(),
        ...[...pluginMemoryRuntimes.values()].map((runtime) => runtime.close()),
      ]);
      return new Promise((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
    },
  };
}
