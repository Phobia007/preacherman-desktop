import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

const RUNTIME_TOOL = "preacherman::preacherman_runtime_status";

function normalizeToolResult(result) {
  return {
    content: Array.isArray(result?.content) ? result.content : [],
    structuredContent: result?.structuredContent && typeof result.structuredContent === "object"
      ? result.structuredContent
      : {},
    isError: result?.isError === true,
  };
}

// This uses the same MCP Client -> Transport -> Server boundary as Project
// AIRI's stage-tamagotchi MCP manager, while keeping the first Preacherman tool
// in-process so the packaged desktop demo has no extra daemon prerequisite.
export function createAiriMcpRuntime({ taskStore, now = () => new Date().toISOString() }) {
  let connectionPromise;

  async function connect() {
    if (connectionPromise) return connectionPromise;
    connectionPromise = (async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = new McpServer({ name: "preacherman-airi-runtime", version: "0.1.0" });
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
        return {
          content: [{ type: "text", text: JSON.stringify(status) }],
          structuredContent: status,
        };
      });

      const client = new Client({ name: "preacherman-airi-mcp-client", version: "0.1.0" });
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      return { client, server };
    })();
    return connectionPromise;
  }

  async function listTools() {
    const { client } = await connect();
    const response = await client.listTools();
    return response.tools.map((tool) => ({
      name: `preacherman::${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async function callTool(qualifiedName, args = {}) {
    if (qualifiedName !== RUNTIME_TOOL) throw new Error(`Unknown MCP tool: ${qualifiedName}`);
    const { client } = await connect();
    return normalizeToolResult(await client.callTool({
      name: "preacherman_runtime_status",
      arguments: args,
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
        ? `MCP 已真实执行：${result.taskCount} 个任务，${result.completedTaskCount} 个已完成。`
        : `MCP executed: ${result.taskCount} tasks, ${result.completedTaskCount} completed.`,
    };
  }

  async function close() {
    if (!connectionPromise) return;
    const { client, server } = await connectionPromise;
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  return { callTool, close, executeCapability, listTools };
}
