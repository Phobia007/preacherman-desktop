import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createPreachermanMcpGatewayAudit } from "./preachermanMcpGatewayAudit.mjs";

export const PREACHERMAN_MCP_GATEWAY_PROTOCOL_VERSION = "1.0";

export const PREACHERMAN_MCP_GATEWAY_SCOPES = Object.freeze([
  "capabilities:read",
  "tasks:create",
  "tasks:read-own",
  "tasks:cancel-own",
  "tasks:retry-own",
  "tasks:steer-own",
  "artifacts:read-own",
  "ledger:read-own",
]);

const VALID_CAPABILITY_STATES = new Set(["ready", "configuration-required", "external-runtime-required", "unsupported", "error"]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const FORBIDDEN_IDENTITY_KEYS = new Set(["principalId", "owner", "ownerPrincipalId", "role", "roles", "scope", "scopes", "grantedScopes", "sessionId"]);

export class PreachermanMcpGatewayError extends Error {
  constructor(code, message, { statusCode = 400, retryable = false, details } = {}) {
    super(message);
    this.name = "PreachermanMcpGatewayError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    if (details !== undefined) this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

function gatewayError(code, message, options) {
  return new PreachermanMcpGatewayError(code, message, options);
}

function secretsEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(input) {
  if (!plainObject(input)) throw gatewayError("INVALID_INPUT", "Tool arguments must be a JSON object.");
  const queue = [{ value: input, depth: 0 }];
  while (queue.length > 0) {
    const { value, depth } = queue.shift();
    if (!plainObject(value) || depth > 10) continue;
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_IDENTITY_KEYS.has(key)) {
        throw gatewayError("INVALID_INPUT", `Identity field is controlled by the gateway: ${key}.`);
      }
      if (plainObject(entry)) queue.push({ value: entry, depth: depth + 1 });
    }
  }
}

function assertAllowedKeys(input, allowed) {
  assertObject(input);
  const unexpected = Object.keys(input).find((key) => !allowed.includes(key));
  if (unexpected) throw gatewayError("INVALID_INPUT", `Unsupported field: ${unexpected}.`);
}

function requireString(input, key, { max = 200, min = 1 } = {}) {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw gatewayError("INVALID_INPUT", `${key} must be a string between ${min} and ${max} characters.`);
  }
  return value.trim();
}

function optionalString(input, key, { max = 200 } = {}) {
  if (input[key] === undefined) return undefined;
  return requireString(input, key, { max });
}

function boundedLimit(input, fallback = 50, maximum = 200) {
  if (input.limit === undefined) return fallback;
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > maximum) {
    throw gatewayError("INVALID_INPUT", `limit must be an integer between 1 and ${maximum}.`);
  }
  return input.limit;
}

function optionalOffset(input) {
  if (input.offset === undefined) return 0;
  if (!Number.isInteger(input.offset) || input.offset < 0) throw gatewayError("INVALID_INPUT", "offset must be a non-negative integer.");
  return input.offset;
}

function extractTask(value) {
  return plainObject(value?.task) ? value.task : value;
}

function ownerOf(value) {
  const task = extractTask(value);
  return value?.ownerPrincipalId
    ?? value?.gatewayOwnerPrincipalId
    ?? value?.owner?.principalId
    ?? task?.ownerPrincipalId
    ?? task?.gatewayOwnerPrincipalId
    ?? task?.ownership?.principalId
    ?? task?.owner?.principalId;
}

function taskIdOf(value) {
  const task = extractTask(value);
  return task?.taskId ?? task?.id ?? value?.taskId;
}

function itemsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.tasks)) return value.tasks;
  return [];
}

function normalizeBridgeError(error) {
  if (error instanceof PreachermanMcpGatewayError) return error;
  const code = String(error?.code ?? "").toUpperCase();
  const status = Number(error?.statusCode ?? error?.status);
  const mappings = {
    TASK_NOT_FOUND: ["TASK_NOT_FOUND", "TaskRun was not found.", 404, false],
    NOT_FOUND: ["TASK_NOT_FOUND", "TaskRun was not found.", 404, false],
    CONFLICT: ["STATE_CONFLICT", "TaskRun state does not allow this operation.", 409, false],
    STATE_CONFLICT: ["STATE_CONFLICT", "TaskRun state does not allow this operation.", 409, false],
    APPROVAL_PENDING: ["APPROVAL_PENDING", "TaskRun is waiting for approval in Preacherman.", 409, false],
    BACKEND_NOT_CONFIGURED: ["BACKEND_NOT_CONFIGURED", "Execution backend is not configured.", 503, true],
    TIMEOUT: ["TIMEOUT", "Gateway bridge request timed out.", 504, true],
    ETIMEDOUT: ["TIMEOUT", "Gateway bridge request timed out.", 504, true],
    SERVICE_UNAVAILABLE: ["SERVICE_UNAVAILABLE", "Local Preacherman service is unavailable.", 503, true],
    ECONNREFUSED: ["SERVICE_UNAVAILABLE", "Local Preacherman service is unavailable.", 503, true],
    ARTIFACT_TOO_LARGE: ["ARTIFACT_TOO_LARGE", "Artifact exceeds the gateway read limit.", 413, false],
  };
  const mapped = mappings[code] ?? (status === 404 ? mappings.NOT_FOUND : status === 409 ? mappings.CONFLICT : status === 503 ? mappings.SERVICE_UNAVAILABLE : null);
  if (mapped) return gatewayError(mapped[0], mapped[1], { statusCode: mapped[2], retryable: mapped[3] });
  return gatewayError("INTERNAL_ERROR", "The gateway could not complete the request.", { statusCode: 500 });
}

function withTimeout(operation, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(gatewayError("TIMEOUT", "Gateway bridge request timed out.", { statusCode: 504, retryable: true })), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function nestedHandler(bridge, path, aliases = []) {
  let current = bridge;
  for (const part of path.split(".")) current = current?.[part];
  if (typeof current === "function") return current.bind(path.includes(".") ? bridge[path.split(".")[0]] : bridge);
  for (const alias of aliases) if (typeof bridge?.[alias] === "function") return bridge[alias].bind(bridge);
  return undefined;
}

const TOOL_SPECS = Object.freeze({
  "preacherman.capabilities": { scope: "capabilities:read", handler: "capabilities", aliases: ["getCapabilities"] },
  "preacherman.task.create": { scope: "tasks:create", handler: "task.create", aliases: ["createTask"] },
  "preacherman.task.get": { scope: "tasks:read-own", handler: "task.get", aliases: ["getTask"] },
  "preacherman.task.list": { scope: "tasks:read-own", handler: "task.list", aliases: ["listTasks"] },
  "preacherman.task.events": { scope: "tasks:read-own", handler: "task.events", aliases: ["getTaskEvents", "listTaskEvents"] },
  "preacherman.task.cancel": { scope: "tasks:cancel-own", handler: "task.cancel", aliases: ["cancelTask"] },
  "preacherman.task.retry": { scope: "tasks:retry-own", handler: "task.retry", aliases: ["retryTask"] },
  "preacherman.task.steer": { scope: "tasks:steer-own", handler: "task.steer", aliases: ["steerTask"] },
  "preacherman.artifact.list": { scope: "artifacts:read-own", handler: "artifact.list", aliases: ["listArtifacts"] },
  "preacherman.artifact.read": { scope: "artifacts:read-own", handler: "artifact.read", aliases: ["readArtifact"] },
  "preacherman.ledger.get": { scope: "ledger:read-own", handler: "ledger.get", aliases: ["getLedger"] },
});

const TOOL_SCHEMAS = Object.freeze({
  "preacherman.capabilities": { type: "object", additionalProperties: false, properties: {} },
  "preacherman.task.create": { type: "object", additionalProperties: false, required: ["objective"], properties: { objective: { type: "string", minLength: 1, maxLength: 2_000 }, title: { type: "string", maxLength: 200 }, backend: { type: "string", maxLength: 100 }, workspaceId: { type: "string", maxLength: 200 }, metadata: { type: "object" } } },
  "preacherman.task.get": { type: "object", additionalProperties: false, required: ["taskId"], properties: { taskId: { type: "string", maxLength: 200 } } },
  "preacherman.task.list": { type: "object", additionalProperties: false, properties: { cursor: { type: "string", maxLength: 500 }, limit: { type: "integer", minimum: 1, maximum: 200 } } },
  "preacherman.task.events": { type: "object", additionalProperties: false, required: ["taskId"], properties: { taskId: { type: "string", maxLength: 200 }, cursor: { type: "string", maxLength: 500 }, limit: { type: "integer", minimum: 1, maximum: 200 } } },
  "preacherman.task.cancel": { type: "object", additionalProperties: false, required: ["taskId"], properties: { taskId: { type: "string", maxLength: 200 }, reason: { type: "string", maxLength: 500 } } },
  "preacherman.task.retry": { type: "object", additionalProperties: false, required: ["taskId"], properties: { taskId: { type: "string", maxLength: 200 } } },
  "preacherman.task.steer": { type: "object", additionalProperties: false, required: ["taskId", "instruction"], properties: { taskId: { type: "string", maxLength: 200 }, instruction: { type: "string", minLength: 1, maxLength: 10_000 } } },
  "preacherman.artifact.list": { type: "object", additionalProperties: false, required: ["taskId"], properties: { taskId: { type: "string", maxLength: 200 } } },
  "preacherman.artifact.read": { type: "object", additionalProperties: false, required: ["taskId", "artifactId"], properties: { taskId: { type: "string", maxLength: 200 }, artifactId: { type: "string", maxLength: 200 }, offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 262_144 } } },
  "preacherman.ledger.get": { type: "object", additionalProperties: false, required: ["taskId"], properties: { taskId: { type: "string", maxLength: 200 } } },
});

function validateInput(toolName, input, maxArtifactBytes) {
  const taskOnly = () => {
    assertAllowedKeys(input, ["taskId"]);
    return { taskId: requireString(input, "taskId") };
  };
  switch (toolName) {
    case "preacherman.capabilities":
      assertAllowedKeys(input, []);
      return {};
    case "preacherman.task.create": {
      assertAllowedKeys(input, ["objective", "title", "backend", "workspaceId", "metadata"]);
      if (input.metadata !== undefined && (!plainObject(input.metadata) || byteLength(input.metadata) > 16_384)) throw gatewayError("INVALID_INPUT", "metadata must be a JSON object no larger than 16 KB.");
      return {
        objective: requireString(input, "objective", { max: 2_000 }),
        ...(optionalString(input, "title") ? { title: optionalString(input, "title") } : {}),
        ...(optionalString(input, "backend", { max: 100 }) ? { backend: optionalString(input, "backend", { max: 100 }) } : {}),
        ...(optionalString(input, "workspaceId") ? { workspaceId: optionalString(input, "workspaceId") } : {}),
        ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
      };
    }
    case "preacherman.task.get":
    case "preacherman.task.retry":
    case "preacherman.artifact.list":
    case "preacherman.ledger.get":
      return taskOnly();
    case "preacherman.task.list":
      assertAllowedKeys(input, ["cursor", "limit"]);
      return { ...(optionalString(input, "cursor", { max: 500 }) ? { cursor: optionalString(input, "cursor", { max: 500 }) } : {}), limit: boundedLimit(input) };
    case "preacherman.task.events":
      assertAllowedKeys(input, ["taskId", "cursor", "limit"]);
      return { taskId: requireString(input, "taskId"), ...(optionalString(input, "cursor", { max: 500 }) ? { cursor: optionalString(input, "cursor", { max: 500 }) } : {}), limit: boundedLimit(input) };
    case "preacherman.task.cancel":
      assertAllowedKeys(input, ["taskId", "reason"]);
      return { taskId: requireString(input, "taskId"), ...(optionalString(input, "reason", { max: 500 }) ? { reason: optionalString(input, "reason", { max: 500 }) } : {}) };
    case "preacherman.task.steer":
      assertAllowedKeys(input, ["taskId", "instruction"]);
      return { taskId: requireString(input, "taskId"), instruction: requireString(input, "instruction", { max: 10_000 }) };
    case "preacherman.artifact.read":
      assertAllowedKeys(input, ["taskId", "artifactId", "offset", "limit"]);
      return { taskId: requireString(input, "taskId"), artifactId: requireString(input, "artifactId"), offset: optionalOffset(input), limit: boundedLimit(input, Math.min(65_536, maxArtifactBytes), maxArtifactBytes) };
    default:
      throw gatewayError("TOOL_NOT_FOUND", "Gateway tool was not found.", { statusCode: 404 });
  }
}

function sanitizeArtifactMetadata(value) {
  const items = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.artifacts) ? value.artifacts : [];
  const safe = items.map((item) => {
    const result = {};
    for (const key of ["id", "artifactId", "taskId", "name", "kind", "mimeType", "mediaType", "size", "createdAt", "updatedAt", "summary", "downloadAvailable"]) {
      if (item?.[key] !== undefined) result[key] = item[key];
    }
    return result;
  });
  if (!plainObject(value) || Array.isArray(value)) return safe;
  const envelope = { items: safe };
  for (const key of ["taskId", "cursor", "nextCursor", "truncated"]) {
    if (value[key] !== undefined) envelope[key] = value[key];
  }
  return envelope;
}

function sanitizeArtifactRead(value) {
  if (!plainObject(value)) return value;
  const result = {};
  for (const key of ["id", "artifactId", "taskId", "name", "kind", "mimeType", "size", "encoding", "content", "truncated", "nextOffset"]) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

export function createPreachermanMcpGatewayRuntime({
  bridge,
  audit = createPreachermanMcpGatewayAudit(),
  bootstrapCredential,
  authenticate,
  defaultPrincipalId = "local-mcp-agent",
  defaultScopes = PREACHERMAN_MCP_GATEWAY_SCOPES,
  now = () => new Date().toISOString(),
  createId = () => randomUUID(),
  timeoutMs = 10_000,
  maxInputBytes = 32 * 1024,
  maxOutputBytes = 1024 * 1024,
  maxArtifactBytes = 256 * 1024,
} = {}) {
  if (!plainObject(bridge)) throw new TypeError("Preacherman MCP Gateway requires a bridge object.");
  const sessions = new Map();
  let currentBootstrapCredential = bootstrapCredential;

  function actorFor(session) {
    return Object.freeze({
      principalId: session.principalId,
      sessionId: session.sessionId,
      clientName: session.clientName,
      clientVersion: session.clientVersion,
      transport: session.transport,
      grantedScopes: [...session.grantedScopes],
    });
  }

  function openSession(identity) {
    if (!plainObject(identity) || typeof identity.principalId !== "string" || !ID_PATTERN.test(identity.principalId)) {
      throw gatewayError("UNAUTHENTICATED", "A host-authenticated principal is required.", { statusCode: 401 });
    }
    if (!Array.isArray(identity.grantedScopes) || identity.grantedScopes.some((scope) => !PREACHERMAN_MCP_GATEWAY_SCOPES.includes(scope))) {
      throw gatewayError("INVALID_SCOPE", "Session contains an unknown or invalid scope.", { statusCode: 400 });
    }
    const connectedAt = now();
    const session = {
      principalId: identity.principalId,
      clientName: typeof identity.clientName === "string" ? identity.clientName.slice(0, 100) : "unknown-mcp-client",
      clientVersion: typeof identity.clientVersion === "string" ? identity.clientVersion.slice(0, 100) : "unknown",
      transport: typeof identity.transport === "string" ? identity.transport.slice(0, 30) : "stdio",
      sessionId: `mcp_${createId()}`,
      connectedAt,
      lastSeenAt: connectedAt,
      grantedScopes: [...new Set(identity.grantedScopes)],
      revokedAt: null,
      accessToken: randomBytes(32).toString("base64url"),
    };
    sessions.set(session.sessionId, session);
    return structuredClone(session);
  }

  async function createSession({ bootstrapCredential: suppliedCredential, client = {}, transport = "stdio" } = {}) {
    let identity;
    if (typeof authenticate === "function") {
      identity = await authenticate({ bootstrapCredential: suppliedCredential, client, transport });
    } else {
      if (!currentBootstrapCredential || !secretsEqual(suppliedCredential, currentBootstrapCredential)) {
        throw gatewayError("UNAUTHENTICATED", "MCP Gateway bootstrap credential is invalid.", { statusCode: 401 });
      }
      identity = { principalId: defaultPrincipalId, grantedScopes: defaultScopes };
    }
    if (!identity) throw gatewayError("UNAUTHENTICATED", "MCP Gateway bootstrap credential is invalid.", { statusCode: 401 });
    const opened = openSession({
      ...identity,
      clientName: identity.clientName ?? client.name,
      clientVersion: identity.clientVersion ?? client.version,
      transport,
    });
    const { accessToken, ...session } = opened;
    return { session, accessToken, tools: toolDefinitions() };
  }

  function requireSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) throw gatewayError("UNAUTHENTICATED", "MCP Gateway session is not authenticated.", { statusCode: 401 });
    if (session.revokedAt) throw gatewayError("SESSION_REVOKED", "MCP Gateway session has been revoked.", { statusCode: 401 });
    session.lastSeenAt = now();
    return session;
  }

  function requireAccess(session, accessToken) {
    if (!secretsEqual(session.accessToken, accessToken)) {
      throw gatewayError("UNAUTHENTICATED", "MCP Gateway session token is invalid.", { statusCode: 401 });
    }
  }

  function revokeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) throw gatewayError("SESSION_NOT_FOUND", "MCP Gateway session was not found.", { statusCode: 404 });
    if (!session.revokedAt) session.revokedAt = now();
    const { accessToken: _accessToken, ...safeSession } = session;
    return structuredClone(safeSession);
  }

  function listSessions() {
    return [...sessions.values()].map(({ accessToken: _accessToken, ...session }) => structuredClone(session));
  }

  function closeSession(sessionId) {
    return revokeSession(sessionId);
  }

  function closeAuthenticated(sessionId, accessToken) {
    const session = requireSession(sessionId);
    requireAccess(session, accessToken);
    return closeSession(sessionId);
  }

  function rotateCredential(nextCredential = randomBytes(32).toString("base64url")) {
    if (typeof nextCredential !== "string" || nextCredential.length < 24 || nextCredential.length > 512) {
      throw gatewayError("INVALID_INPUT", "Bootstrap credential must contain between 24 and 512 characters.");
    }
    currentBootstrapCredential = nextCredential;
    let revokedSessionCount = 0;
    const rotatedAt = now();
    for (const session of sessions.values()) {
      if (!session.revokedAt) {
        session.revokedAt = rotatedAt;
        revokedSessionCount += 1;
      }
    }
    return { bootstrapCredential: nextCredential, rotatedAt, revokedSessionCount };
  }

  function status() {
    const values = [...sessions.values()];
    return {
      state: currentBootstrapCredential || authenticate ? "ready" : "configuration-required",
      protocolVersion: PREACHERMAN_MCP_GATEWAY_PROTOCOL_VERSION,
      transports: ["stdio"],
      sessionCount: values.length,
      activeSessionCount: values.filter((session) => !session.revokedAt).length,
      toolCount: Object.keys(TOOL_SPECS).length,
    };
  }

  function toolDefinitions() {
    return Object.entries(TOOL_SPECS).map(([name, spec]) => ({
      name,
      requiredScope: spec.scope,
      inputSchema: structuredClone(TOOL_SCHEMAS[name]),
    }));
  }

  function bridgeHandler(toolName) {
    const spec = TOOL_SPECS[toolName];
    return spec ? nestedHandler(bridge, spec.handler, spec.aliases) : undefined;
  }

  async function dynamicCapabilities(session) {
    const actor = actorFor(session);
    const provider = bridgeHandler("preacherman.capabilities");
    let reported = {};
    if (provider) reported = await provider({ actor, input: {} }) ?? {};
    const reportedTools = plainObject(reported.tools) ? reported.tools : {};
    const tools = toolDefinitions().map((definition) => {
      const handlerReady = definition.name === "preacherman.capabilities" || Boolean(bridgeHandler(definition.name));
      const declaredState = reportedTools[definition.name]?.state;
      const state = VALID_CAPABILITY_STATES.has(declaredState) ? declaredState : handlerReady ? "ready" : "unsupported";
      return {
        name: definition.name,
        requiredScope: definition.requiredScope,
        state,
        availableToSession: state === "ready" && session.grantedScopes.includes(definition.requiredScope),
        ...(reportedTools[definition.name]?.reason ? { reason: String(reportedTools[definition.name].reason).slice(0, 300) } : {}),
      };
    });
    return {
      protocolVersion: PREACHERMAN_MCP_GATEWAY_PROTOCOL_VERSION,
      gateway: { state: "ready", transport: session.transport },
      session: { principalId: session.principalId, sessionId: session.sessionId, grantedScopes: [...session.grantedScopes] },
      tools,
      executionBackends: Array.isArray(reported.executionBackends) ? reported.executionBackends : [],
      limits: { maxInputBytes, maxOutputBytes, maxArtifactBytes, timeoutMs },
    };
  }

  async function requireOwnedTask(taskId, actor) {
    const getter = bridgeHandler("preacherman.task.get");
    if (!getter) throw gatewayError("BACKEND_NOT_CONFIGURED", "Task ownership bridge is not configured.", { statusCode: 503, retryable: true });
    const result = await getter({ actor, input: { taskId } });
    if (!result) throw gatewayError("TASK_NOT_FOUND", "TaskRun was not found.", { statusCode: 404 });
    const ownerPrincipalId = ownerOf(result);
    if (!ownerPrincipalId) throw gatewayError("BRIDGE_CONTRACT_ERROR", "Task ownership evidence is missing from the bridge response.", { statusCode: 502 });
    if (ownerPrincipalId !== actor.principalId) throw gatewayError("OWNER_MISMATCH", "TaskRun belongs to another principal.", { statusCode: 403 });
    return extractTask(result);
  }

  async function executeTool(toolName, input, session) {
    const actor = actorFor(session);
    if (toolName === "preacherman.capabilities") return dynamicCapabilities(session);
    const handler = bridgeHandler(toolName);
    if (!handler) throw gatewayError("BACKEND_NOT_CONFIGURED", "Gateway bridge handler is not configured.", { statusCode: 503, retryable: true });

    if (toolName === "preacherman.task.create") {
      const result = await handler({ actor, input });
      const ownerPrincipalId = ownerOf(result);
      if (!ownerPrincipalId || ownerPrincipalId !== actor.principalId || !taskIdOf(result)) {
        throw gatewayError("BRIDGE_CONTRACT_ERROR", "Created TaskRun is missing valid ownership evidence.", { statusCode: 502 });
      }
      return extractTask(result);
    }

    if (toolName === "preacherman.task.list") {
      const result = await handler({ actor, input });
      const owned = itemsOf(result).filter((task) => ownerOf(task) === actor.principalId);
      return Array.isArray(result) ? owned : { ...result, items: owned, tasks: undefined };
    }

    if (toolName === "preacherman.task.get") return requireOwnedTask(input.taskId, actor);
    await requireOwnedTask(input.taskId, actor);
    const result = await handler({ actor, input });
    if (toolName === "preacherman.artifact.list") return sanitizeArtifactMetadata(result);
    if (toolName === "preacherman.artifact.read") return sanitizeArtifactRead(result);
    return result;
  }

  async function callTool({ sessionId, name, arguments: rawArguments = {} } = {}) {
    const session = requireSession(sessionId);
    const inputBytes = byteLength(rawArguments);
    const started = Date.now();
    try {
      const spec = TOOL_SPECS[name];
      if (!spec) throw gatewayError("TOOL_NOT_FOUND", "Gateway tool was not found.", { statusCode: 404 });
      if (!session.grantedScopes.includes(spec.scope)) throw gatewayError("SCOPE_DENIED", `Required scope is not granted: ${spec.scope}.`, { statusCode: 403 });
      if (inputBytes > maxInputBytes) throw gatewayError("INPUT_TOO_LARGE", "Tool arguments exceed the gateway input limit.", { statusCode: 413 });
      const input = validateInput(name, rawArguments, maxArtifactBytes);
      const output = await withTimeout(Promise.resolve().then(() => executeTool(name, input, session)), timeoutMs);
      const outputBytes = byteLength(output);
      if (name === "preacherman.artifact.read" && outputBytes > maxArtifactBytes) throw gatewayError("ARTIFACT_TOO_LARGE", "Artifact exceeds the gateway read limit.", { statusCode: 413 });
      if (outputBytes > maxOutputBytes) throw gatewayError("OUTPUT_TOO_LARGE", "Tool result exceeds the gateway output limit.", { statusCode: 413 });
      await audit.record({ eventId: `audit_${createId()}`, principalId: session.principalId, sessionId, clientName: session.clientName, transport: session.transport, toolName: name, outcome: "succeeded", durationMs: Date.now() - started, inputBytes, inputKeys: Object.keys(rawArguments), outputBytes });
      return output;
    } catch (error) {
      const stable = normalizeBridgeError(error);
      await audit.record({ eventId: `audit_${createId()}`, principalId: session.principalId, sessionId, clientName: session.clientName, transport: session.transport, toolName: name, outcome: "failed", errorCode: stable.code, durationMs: Date.now() - started, inputBytes, inputKeys: plainObject(rawArguments) ? Object.keys(rawArguments) : [] });
      throw stable;
    }
  }

  async function call({ sessionId, accessToken, name, arguments: rawArguments = {} } = {}) {
    const session = requireSession(sessionId);
    requireAccess(session, accessToken);
    const structuredContent = await callTool({ sessionId, name, arguments: rawArguments });
    return {
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      structuredContent,
      isError: false,
    };
  }

  return {
    createSession,
    revokeSession,
    closeSession,
    closeAuthenticated,
    listSessions,
    listTools: toolDefinitions,
    listToolDefinitions: toolDefinitions,
    call,
    rotateCredential,
    status,
    audit,
  };
}
