#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createPreachermanMcpGatewayBridge,
  McpGatewayBridgeError,
} from "../server/mcp-gateway/preachermanMcpGatewayBridge.mjs";

function readBootstrapCredential() {
  const credentialFile = process.env.PREACHERMAN_MCP_BOOTSTRAP_FILE;
  if (credentialFile) return readFileSync(credentialFile, "utf8").trim();
  // Direct injection is kept for controlled test runners and explicit clients.
  return process.env.PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL;
}

const bridge = createPreachermanMcpGatewayBridge({
  baseUrl: process.env.PREACHERMAN_MCP_GATEWAY_URL,
  bootstrapCredential: readBootstrapCredential(),
});

const server = new Server(
  { name: "preacherman-mcp-gateway", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions: "Create and follow Preacherman tasks. Human approval remains inside Preacherman.",
  },
);

async function gatewaySession() {
  const client = server.getClientVersion();
  return bridge.openSession({
    clientName: client?.name || "unknown-mcp-client",
    clientVersion: client?.version || "unknown",
    transport: "stdio",
    workspacePath: process.cwd(),
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const session = await gatewaySession();
  return { tools: session.tools };
});

server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    await gatewaySession();
    return await bridge.callTool(params.name, params.arguments || {});
  } catch (error) {
    if (!(error instanceof McpGatewayBridgeError)) throw error;
    return {
      isError: true,
      content: [{ type: "text", text: `${error.code}: ${error.message}` }],
    };
  }
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await bridge.close();
  await server.close();
}

process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
process.once("beforeExit", () => void bridge.close());

await server.connect(new StdioServerTransport());
