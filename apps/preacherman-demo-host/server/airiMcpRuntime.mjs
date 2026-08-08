import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as z from "zod/v4";

const DEFAULT_CONFIG = { mcpServers: {} };
const RUNTIME_TOOL = "preacherman::preacherman_runtime_status";
const REQUEST_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 15_000;

function userError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeToolResult(result) {
  return {
    content: Array.isArray(result?.content) ? result.content : [],
    structuredContent: result?.structuredContent && typeof result.structuredContent === "object"
      ? result.structuredContent
      : {},
    isError: result?.isError === true,
  };
}

function parseConfigText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw userError(`Invalid mcp.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) {
    throw userError("mcp.json must contain an mcpServers object.");
  }
  const entries = Object.entries(parsed.mcpServers);
  if (entries.length > 10) throw userError("mcp.json supports at most 10 servers in this demo.");
  const mcpServers = {};
  for (const [name, value] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(name)) throw userError(`Invalid MCP server name: ${name}`);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw userError(`MCP server ${name} must be an object.`);
    if (typeof value.command !== "string" || !value.command.trim() || value.command.length > 500) throw userError(`MCP server ${name} requires a command.`);
    if (value.args !== undefined && (!Array.isArray(value.args) || value.args.length > 30 || value.args.some((arg) => typeof arg !== "string" || arg.length > 1_000))) {
      throw userError(`MCP server ${name} has invalid args.`);
    }
    if (value.env !== undefined && (!value.env || typeof value.env !== "object" || Array.isArray(value.env) || Object.entries(value.env).length > 20 || Object.entries(value.env).some(([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== "string" || item.length > 4_000))) {
      throw userError(`MCP server ${name} has invalid env values.`);
    }
    if (value.cwd !== undefined && (typeof value.cwd !== "string" || value.cwd.length > 1_000)) throw userError(`MCP server ${name} has an invalid cwd.`);
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw userError(`MCP server ${name} has an invalid enabled flag.`);
    mcpServers[name] = {
      command: value.command.trim(),
      ...(value.args ? { args: value.args } : {}),
      ...(value.env ? { env: value.env } : {}),
      ...(value.cwd ? { cwd: value.cwd } : {}),
      ...(value.enabled === false ? { enabled: false } : {}),
    };
  }
  return { mcpServers };
}

async function writePrivateText(target, text) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, text, { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function qualifiedName(serverName, toolName) {
  return `${serverName}::${toolName}`;
}

function splitQualifiedName(name) {
  const separator = name.indexOf("::");
  if (separator <= 0 || separator === name.length - 2) throw userError(`Invalid MCP tool name: ${name}`);
  return { serverName: name.slice(0, separator), toolName: name.slice(separator + 2) };
}

function withDeadline(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out.`)), TOTAL_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Mirrors AIRI stage-tamagotchi's mcp.json + stdio manager, with one built-in
// in-memory server so the packaged demo remains useful before external setup.
export function createAiriMcpRuntime({ configFile, taskStore, now = () => new Date().toISOString() }) {
  let builtinPromise;
  let initializePromise;
  let mutationQueue = Promise.resolve();
  const externalSessions = new Map();
  const statuses = new Map();
  let updatedAt = Date.now();

  function setStatus(status) {
    statuses.set(status.name, status);
    updatedAt = Date.now();
  }

  async function connectBuiltin() {
    if (builtinPromise) return builtinPromise;
    builtinPromise = (async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = new McpServer({ name: "preacherman-airi-runtime", version: "0.2.0" });
      server.registerTool("preacherman_runtime_status", {
        title: "Preacherman runtime status",
        description: "Read persisted TaskRun and artifact status from the local Preacherman runtime.",
        inputSchema: {},
        outputSchema: {
          checkedAt: z.string(),
          taskCount: z.number().int().nonnegative(),
          activeTaskCount: z.number().int().nonnegative(),
          completedTaskCount: z.number().int().nonnegative(),
          latestArtifact: z.object({ name: z.string(), path: z.string() }).nullable(),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      }, async () => {
        const tasks = await taskStore.list(50);
        const latestArtifactTask = tasks.find((task) => task.artifact);
        const status = {
          checkedAt: now(),
          taskCount: tasks.length,
          activeTaskCount: tasks.filter((task) => ["queued", "running"].includes(task.status)).length,
          completedTaskCount: tasks.filter((task) => task.status === "succeeded").length,
          latestArtifact: latestArtifactTask?.artifact
            ? { name: latestArtifactTask.artifact.name, path: latestArtifactTask.artifact.path }
            : null,
        };
        return { content: [{ type: "text", text: JSON.stringify(status) }], structuredContent: status };
      });
      const client = new Client({ name: "preacherman-airi-mcp-client", version: "0.2.0" });
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      setStatus({ name: "preacherman", state: "running", command: "built-in", pid: null, error: null });
      return { client, server };
    })();
    return builtinPromise;
  }

  async function ensureConfigFile() {
    try {
      await readFile(configFile, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await writePrivateText(configFile, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    }
    return configFile;
  }

  async function readConfigText() {
    await ensureConfigFile();
    return { path: configFile, text: await readFile(configFile, "utf8") };
  }

  async function writeConfigText(text) {
    if (typeof text !== "string" || text.length > 32 * 1024) throw userError("mcp.json text must be at most 32 KB.");
    const config = parseConfigText(text);
    const normalized = `${JSON.stringify(config, null, 2)}\n`;
    await writePrivateText(configFile, normalized);
    return { path: configFile, text: normalized };
  }

  async function closeExternalSession(session) {
    await session.client.close().catch(() => session.transport.close().catch(() => undefined));
  }

  async function stopExternal() {
    for (const [name, session] of externalSessions) {
      await closeExternalSession(session);
      setStatus({ name, state: "stopped", command: session.config.command, pid: null, error: null });
    }
    externalSessions.clear();
  }

  async function startExternal(name, config) {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
      stderr: "pipe",
      maxBufferSize: 2 * 1024 * 1024,
    });
    const client = new Client({ name: `preacherman-airi-mcp:${name}`, version: "0.2.0" });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000); });
    try {
      await withDeadline(client.connect(transport), `MCP server ${name}`);
      externalSessions.set(name, { client, config, transport });
      setStatus({ name, state: "running", command: config.command, pid: transport.pid, error: null });
    } catch (error) {
      await client.close().catch(() => transport.close().catch(() => undefined));
      const message = `${error instanceof Error ? error.message : String(error)}${stderr.trim() ? `: ${stderr.trim()}` : ""}`;
      setStatus({ name, state: "error", command: config.command, pid: null, error: message });
      throw new Error(message);
    }
  }

  async function applyInternal() {
    await connectBuiltin();
    const { text } = await readConfigText();
    const config = parseConfigText(text);
    await stopExternal();
    const result = { started: [], failed: [], skipped: [] };
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (serverConfig.enabled === false) {
        result.skipped.push(name);
        setStatus({ name, state: "stopped", command: serverConfig.command, pid: null, error: null });
        continue;
      }
      try {
        await startExternal(name, serverConfig);
        result.started.push(name);
      } catch (error) {
        result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  function applyAndRestart() {
    const operation = mutationQueue.then(applyInternal);
    mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function initialize() {
    if (!initializePromise) {
      initializePromise = applyAndRestart().catch((error) => ({
        started: [], skipped: [], failed: [{ name: "mcp.json", error: error instanceof Error ? error.message : String(error) }],
      }));
    }
    return initializePromise;
  }

  function getRuntimeStatus() {
    return {
      path: configFile,
      servers: [...statuses.values()].sort((left, right) => left.name.localeCompare(right.name)),
      updatedAt,
    };
  }

  async function listTools() {
    await initialize();
    await mutationQueue;
    const builtin = await connectBuiltin();
    const sessions = [["preacherman", builtin], ...externalSessions.entries()];
    const groups = await Promise.all(sessions.map(async ([serverName, session]) => {
      const response = await session.client.listTools(undefined, { timeout: REQUEST_TIMEOUT_MS, maxTotalTimeout: TOTAL_TIMEOUT_MS });
      return response.tools.map((tool) => ({
        serverName,
        name: qualifiedName(serverName, tool.name),
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    }));
    return groups.flat().sort((left, right) => left.name.localeCompare(right.name));
  }

  async function callTool(name, args = {}) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw userError("MCP tool arguments must be an object.");
    await initialize();
    await mutationQueue;
    const { serverName, toolName } = splitQualifiedName(name);
    const session = serverName === "preacherman" ? await connectBuiltin() : externalSessions.get(serverName);
    if (!session) throw userError(`MCP server is not running: ${serverName}`);
    return normalizeToolResult(await session.client.callTool({ name: toolName, arguments: args }, undefined, {
      timeout: REQUEST_TIMEOUT_MS,
      maxTotalTimeout: TOTAL_TIMEOUT_MS,
    }));
  }

  async function executeCapability(capabilityId, context = {}) {
    if (capabilityId !== "agent.mcp-tools") return undefined;
    const tools = await listTools();
    const toolResult = await callTool(RUNTIME_TOOL);
    if (toolResult.isError) throw new Error("The Preacherman MCP status tool failed.");
    const result = toolResult.structuredContent;
    const chinese = context.locale === "zh-CN";
    return {
      status: "succeeded",
      protocol: "mcp",
      server: "preacherman",
      tool: RUNTIME_TOOL,
      tools: tools.map((tool) => tool.name),
      result,
      summary: chinese
        ? `MCP 已连接 ${tools.length} 个工具；读取到 ${result.taskCount} 个任务。`
        : `MCP connected ${tools.length} tools; read ${result.taskCount} tasks.`,
    };
  }

  async function close() {
    await mutationQueue;
    await stopExternal();
    if (!builtinPromise) return;
    const { client, server } = await builtinPromise;
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  return {
    applyAndRestart,
    callTool,
    close,
    executeCapability,
    getRuntimeStatus,
    initialize,
    listTools,
    readConfigText,
    writeConfigText,
  };
}
