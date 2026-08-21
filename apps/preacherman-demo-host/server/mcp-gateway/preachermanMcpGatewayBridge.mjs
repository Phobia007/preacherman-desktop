const DEFAULT_TIMEOUT_MS = 15_000;

export class McpGatewayBridgeError extends Error {
  constructor(message, { code = "gateway_error", status } = {}) {
    super(message);
    this.name = "McpGatewayBridgeError";
    this.code = code;
    this.status = status;
  }
}

function requireLoopbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new McpGatewayBridgeError("Gateway URL is invalid.", { code: "invalid_gateway_url" });
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
    throw new McpGatewayBridgeError("Gateway URL must use HTTP on the loopback interface.", {
      code: "non_loopback_gateway_url",
    });
  }

  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function requireCredential(value) {
  if (typeof value !== "string" || value.trim().length < 24) {
    throw new McpGatewayBridgeError("A bootstrap credential is required.", {
      code: "missing_bootstrap_credential",
    });
  }
  return value.trim();
}

function jsonString(value) {
  return JSON.stringify(String(value));
}

function normalizeLaunchSpec({ command, args = [], env = {} }) {
  if (typeof command !== "string" || command.trim() === "") {
    throw new TypeError("command must be a non-empty string");
  }
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new TypeError("args must be an array of strings");
  }
  const environment = Object.fromEntries(Object.entries(env)
    .filter(([key, value]) => /^[A-Z_][A-Z0-9_]*$/i.test(key) && typeof value === "string")
    .sort(([left], [right]) => left.localeCompare(right)));
  if ("PREACHERMAN_MCP_BOOTSTRAP_CREDENTIAL" in environment) {
    throw new TypeError("client templates must reference PREACHERMAN_MCP_BOOTSTRAP_FILE instead of embedding a credential");
  }
  return { command: command.trim(), args: [...args], env: environment };
}

/**
 * Generate copy-ready stdio MCP client configuration. Values are serialized as
 * data, never concatenated into a shell command, so Windows paths remain safe.
 */
export function generateClientTemplates(launchSpec) {
  const spec = normalizeLaunchSpec(launchSpec);
  const jsonServer = { command: spec.command, args: spec.args, env: spec.env };
  const jsonConfig = JSON.stringify({ mcpServers: { preacherman: jsonServer } }, null, 2);
  const tomlArgs = spec.args.map(jsonString).join(", ");
  const tomlEnv = Object.entries(spec.env)
    .map(([key, value]) => `${jsonString(key)} = ${jsonString(value)}`)
    .join(", ");
  const codexLines = [
    "[mcp_servers.preacherman]",
    `command = ${jsonString(spec.command)}`,
    `args = [${tomlArgs}]`,
  ];
  if (tomlEnv) codexLines.push(`env = { ${tomlEnv} }`);

  const sharedNotice = [
    "The Agent keeps using its own login, subscription, or enterprise identity.",
    "This configuration only lets the Agent discover Preacherman tools; Preacherman does not receive the Agent account password.",
    "MCP lets the Agent initiate Preacherman workflows. It does not let Preacherman start or control that Agent as an execution runtime.",
  ];

  return [
    { id: "codex", label: "Codex", format: "toml", configuration: `${codexLines.join("\n")}\n`, notice: sharedNotice },
    { id: "claude-code", label: "Claude Code", format: "json", configuration: jsonConfig, notice: sharedNotice },
    { id: "gemini-cli", label: "Gemini CLI", format: "json", configuration: jsonConfig, notice: sharedNotice },
    { id: "generic", label: "Generic stdio MCP client", format: "json", configuration: jsonConfig, notice: sharedNotice },
  ];
}

export function createPreachermanMcpGatewayBridge({
  baseUrl,
  bootstrapCredential,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const gatewayUrl = requireLoopbackUrl(baseUrl);
  const bootstrap = requireCredential(bootstrapCredential);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  let session;

  async function request(pathname, { method = "GET", token, body } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(pathname, gatewayUrl), {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new McpGatewayBridgeError("The local Preacherman service is unavailable.", {
        code: error?.name === "TimeoutError" ? "gateway_timeout" : "gateway_unavailable",
      });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new McpGatewayBridgeError(payload?.error?.message || `Gateway request failed (${response.status}).`, {
        code: payload?.error?.code || "gateway_request_failed",
        status: response.status,
      });
    }
    if (!payload || typeof payload !== "object") {
      throw new McpGatewayBridgeError("Gateway returned an invalid JSON response.", { code: "invalid_gateway_response" });
    }
    return payload;
  }

  return {
    async openSession({ clientName = "unknown-mcp-client", clientVersion = "unknown", transport = "stdio", workspacePath } = {}) {
      if (session) return session;
      const payload = await request("/api/mcp/gateway/bridge/sessions", {
        method: "POST",
        token: bootstrap,
        body: { client: { name: clientName, version: clientVersion }, transport, ...(workspacePath ? { workspacePath } : {}) },
      });
      if (!payload.session?.id || !payload.session?.accessToken || !Array.isArray(payload.tools)) {
        throw new McpGatewayBridgeError("Gateway session response is incomplete.", { code: "invalid_session_response" });
      }
      session = payload;
      return session;
    },

    async callTool(name, args = {}) {
      if (!session) throw new McpGatewayBridgeError("Gateway session has not been opened.", { code: "session_not_open" });
      return request(`/api/mcp/gateway/bridge/sessions/${encodeURIComponent(session.session.id)}/calls`, {
        method: "POST",
        token: session.session.accessToken,
        body: { name, arguments: args },
      });
    },

    async close() {
      if (!session) return;
      const closing = session;
      session = undefined;
      try {
        await request(`/api/mcp/gateway/bridge/sessions/${encodeURIComponent(closing.session.id)}`, {
          method: "DELETE",
          token: closing.session.accessToken,
        });
      } catch {
        // The stdio process may be exiting because its host is already gone.
      }
    },
  };
}
