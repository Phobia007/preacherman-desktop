import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  createPreachermanMcpGatewayBridge,
  generateClientTemplates,
} from "../server/mcp-gateway/preachermanMcpGatewayBridge.mjs";

const gatewayScript = fileURLToPath(new URL("../scripts/preacherman-mcp-gateway.mjs", import.meta.url));
const fixtureBootstrap = "fixture-bootstrap-credential-32chars";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function startFixtureHost() {
  const calls = [];
  const server = createServer(async (request, response) => {
    const authorization = request.headers.authorization;
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");

    if (request.method === "POST" && url.pathname === "/api/mcp/gateway/bridge/sessions") {
      assert.equal(authorization, `Bearer ${fixtureBootstrap}`);
      const body = await readJson(request);
      calls.push({ type: "session", body });
      response.end(JSON.stringify({
        server: { name: "preacherman", version: "test" },
        session: { id: "session-1", accessToken: "short-session-token", expiresAt: "2099-01-01T00:00:00Z" },
        tools: [{
          name: "preacherman.capabilities",
          description: "Discover live Preacherman gateway capabilities.",
          inputSchema: { type: "object", additionalProperties: false },
        }],
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/mcp/gateway/bridge/sessions/session-1/calls") {
      assert.equal(authorization, "Bearer short-session-token");
      const body = await readJson(request);
      calls.push({ type: "call", body });
      response.end(JSON.stringify({
        content: [{ type: "text", text: "ready" }],
        structuredContent: { status: "ready", dynamic: true },
      }));
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/mcp/gateway/bridge/sessions/session-1") {
      calls.push({ type: "close" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: { code: "not_found", message: "Not found" } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    calls,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("official MCP SDK client discovers and calls tools through the real stdio gateway", async () => {
  const host = await startFixtureHost();
  const credentialDirectory = await mkdtemp(join(tmpdir(), "preacherman-mcp-gateway-"));
  const credentialFile = join(credentialDirectory, "bootstrap");
  await writeFile(credentialFile, `${fixtureBootstrap}\n`, { encoding: "utf8", mode: 0o600 });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [gatewayScript],
    env: {
      ...process.env,
      PREACHERMAN_MCP_GATEWAY_URL: host.url,
      PREACHERMAN_MCP_BOOTSTRAP_FILE: credentialFile,
      PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL: "",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "fixture-agent", version: "1.2.3" });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), ["preacherman.capabilities"]);

    const result = await client.callTool({ name: "preacherman.capabilities", arguments: {} });
    assert.deepEqual(result.structuredContent, { status: "ready", dynamic: true });
    assert.equal(host.calls[0].body.transport, "stdio");
    assert.deepEqual(host.calls[0].body.client, { name: "fixture-agent", version: "1.2.3" });
    assert.deepEqual(host.calls[1].body, { name: "preacherman.capabilities", arguments: {} });
  } finally {
    await client.close().catch(() => {});
    await host.close();
    await rm(credentialDirectory, { recursive: true, force: true });
  }
});

test("bridge rejects non-loopback hosts and never promotes tool arguments to transport identity", async () => {
  assert.throws(
    () => createPreachermanMcpGatewayBridge({ baseUrl: "https://example.com", bootstrapCredential: "credential" }),
    (error) => error.code === "non_loopback_gateway_url",
  );

  const host = await startFixtureHost();
  const bridge = createPreachermanMcpGatewayBridge({
    baseUrl: host.url,
    bootstrapCredential: fixtureBootstrap,
  });
  try {
    await bridge.openSession({ clientName: "test", clientVersion: "1" });
    await bridge.callTool("preacherman.capabilities", { principalId: "forged", scopes: ["admin"] });
    assert.deepEqual(host.calls[1].body.arguments, { principalId: "forged", scopes: ["admin"] });
    assert.equal(host.calls[1].body.principalId, undefined);
    assert.equal(host.calls[1].body.scopes, undefined);
  } finally {
    await bridge.close();
    await host.close();
  }
});

test("client templates safely serialize Windows paths for Codex, Claude, Gemini and generic clients", () => {
  const templates = generateClientTemplates({
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: ["C:\\Program Files\\Preacherman\\scripts\\preacherman-mcp-gateway.mjs"],
    env: {
      PREACHERMAN_MCP_GATEWAY_URL: "http://127.0.0.1:1421",
      PREACHERMAN_MCP_BOOTSTRAP_FILE: "C:\\Users\\Ada\\AppData\\Local\\Preacherman\\mcp-gateway.bootstrap",
    },
  });

  assert.deepEqual(templates.map(({ id }) => id), ["codex", "claude-code", "gemini-cli", "generic"]);
  const codex = templates[0].configuration;
  assert.match(codex, /command = "C:\\\\Program Files\\\\nodejs\\\\node\.exe"/);
  assert.match(codex, /PREACHERMAN_MCP_BOOTSTRAP_FILE/);
  for (const template of templates.slice(1)) {
    const parsed = JSON.parse(template.configuration);
    assert.equal(parsed.mcpServers.preacherman.command, "C:\\Program Files\\nodejs\\node.exe");
    assert.deepEqual(parsed.mcpServers.preacherman.args, ["C:\\Program Files\\Preacherman\\scripts\\preacherman-mcp-gateway.mjs"]);
  }
  assert.ok(templates.every(({ configuration }) => !configuration.includes("short-session-token")));
  assert.throws(() => generateClientTemplates({
    command: "node",
    env: { PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL: "must-not-be-copied" },
  }), /BOOTSTRAP_FILE/);
});
