import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const server = new McpServer({ name: "preacherman-test-mcp", version: "1.0.0" });
server.registerTool("fixture_status", {
  description: "Return a deterministic status from a real stdio MCP child process.",
  inputSchema: { label: z.string().optional() },
  outputSchema: { ok: z.boolean(), label: z.string() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async ({ label = "ready" }) => ({
  content: [{ type: "text", text: `${label}:ok` }],
  structuredContent: { ok: true, label },
}));

await server.connect(new StdioServerTransport());
