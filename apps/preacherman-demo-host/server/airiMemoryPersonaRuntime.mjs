import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const MEMORY_PERSONA_LIMITS = Object.freeze({
  maxPersonas: 20,
  maxMemoriesPerNamespace: 100,
  maxTotalMemories: 1_000,
  maxMemoryBytes: 8 * 1024,
  maxStoreBytes: 2 * 1024 * 1024,
  maxAuditEvents: 500,
});

export const MEMORY_BOUNDARIES = Object.freeze(["persona", "session", "long-term"]);
export const MEMORY_PLUGIN_SCOPES = Object.freeze([
  "persona:read",
  "persona:write",
  "persona:select",
  "persona:delete",
  "memory:read",
  "memory:write",
  "memory:delete",
  "memory:audit:read",
  "conversations:recent:read",
  "conversations:recent:content:read",
]);

const PERSONA_NAME_BYTES = 120;
const PERSONA_DESCRIPTION_BYTES = 2 * 1024;
const PERSONA_INSTRUCTIONS_BYTES = 8 * 1024;
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DEFAULT_OWNER = "preacherman-runtime";
const BOUNDARY_SET = new Set(MEMORY_BOUNDARIES);
const SENSITIVE_FIELD_PATTERN = /^(?:api[-_]?key|access[-_]?key|secret(?:[-_]?key)?|token|authorization|password|cookie|audio(?:data|bytes|buffer)?|voice(?:data|bytes|buffer)?|private[-_]?key|encryption[-_]?key|keys?)$/i;

function runtimeError(code, message, statusCode = 400, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw runtimeError("INVALID_MEMORY_INPUT", `${label} must be an object.`);
  }
  rejectSensitiveFields(value);
  return value;
}

function rejectSensitiveFields(value, path = "input") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      throw runtimeError(
        "SENSITIVE_FIELD_REJECTED",
        `${path}.${key} cannot be stored by the local Memory/Persona runtime.`,
      );
    }
    rejectSensitiveFields(nested, `${path}.${key}`);
  }
}

function rejectUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw runtimeError("INVALID_MEMORY_INPUT", `${label} does not support field: ${unknown}.`);
}

function redactSecrets(value) {
  let text = value;
  const patterns = [
    /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,
    /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/g,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
    /\b(?:api[_-]?key|access[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;]{6,}/gi,
  ];
  for (const pattern of patterns) text = text.replace(pattern, "[REDACTED]");
  return { value: text, redacted: text !== value };
}

function normalizeText(value, label, maximumBytes, { required = false } = {}) {
  if (value === undefined && !required) return { value: "", redacted: false };
  if (typeof value !== "string" || (required && !value.trim())) {
    throw runtimeError("INVALID_MEMORY_INPUT", `${label} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (byteLength(trimmed) > maximumBytes) {
    throw runtimeError("MEMORY_SIZE_LIMIT", `${label} exceeds the ${maximumBytes}-byte limit.`, 413);
  }
  return redactSecrets(trimmed);
}

function normalizeId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw runtimeError("INVALID_MEMORY_INPUT", `${label} is required.`);
  }
  return value;
}

function normalizeNamespace(value = "general") {
  if (typeof value !== "string" || !NAMESPACE_PATTERN.test(value)) {
    throw runtimeError("INVALID_MEMORY_INPUT", "Memory namespace must use letters, numbers, dots, underscores, or hyphens.");
  }
  return value;
}

function normalizeBoundary(value = "persona", sessionId) {
  if (!BOUNDARY_SET.has(value)) {
    throw runtimeError("INVALID_MEMORY_INPUT", `Memory boundary must be one of: ${MEMORY_BOUNDARIES.join(", ")}.`);
  }
  if (value === "session") return { boundary: value, sessionId: normalizeId(sessionId, "Session id") };
  if (sessionId !== undefined && sessionId !== null && sessionId !== "") {
    throw runtimeError("INVALID_MEMORY_INPUT", "sessionId is only valid for the session memory boundary.");
  }
  return { boundary: value, sessionId: null };
}

function normalizeIso(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw runtimeError("INVALID_MEMORY_INPUT", `${label} must be an ISO date-time string.`);
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw runtimeError("INVALID_MEMORY_INPUT", `${label} must be an ISO date-time string.`);
  return timestamp.toISOString();
}

function normalizeTimezone(value = "UTC") {
  if (typeof value !== "string" || value.length > 100) {
    throw runtimeError("INVALID_MEMORY_INPUT", "Timezone must be an IANA timezone name.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw runtimeError("INVALID_MEMORY_INPUT", "Timezone must be an IANA timezone name.");
  }
  return value;
}

function normalizeTags(value = []) {
  if (!Array.isArray(value) || value.length > 20) {
    throw runtimeError("INVALID_MEMORY_INPUT", "Memory tags must be an array with at most 20 entries.");
  }
  return [...new Set(value.map((tag) => {
    if (typeof tag !== "string" || !tag.trim() || byteLength(tag.trim()) > 80) {
      throw runtimeError("INVALID_MEMORY_INPUT", "Each memory tag must be a non-empty string up to 80 bytes.");
    }
    return redactSecrets(tag.trim()).value;
  }))];
}

async function writePrivateJson(target, value, maximumBytes) {
  const json = JSON.stringify(value);
  if (byteLength(json) > maximumBytes) {
    throw runtimeError("MEMORY_STORE_LIMIT", `Memory store exceeds the ${maximumBytes}-byte limit.`, 413);
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, json, { mode: 0o600 });
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function validateLoadedState(value) {
  if (!value || ![1, 2, 3].includes(value.version) || !Array.isArray(value.personas) || !Array.isArray(value.memories)) {
    throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store has an unsupported or invalid format.", 500);
  }
  if (value.selectedPersonaId !== null && typeof value.selectedPersonaId !== "string") {
    throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store has an invalid selected persona.", 500);
  }
  if (value.selectedPersonaId && !value.personas.some((persona) => persona.id === value.selectedPersonaId)) {
    throw runtimeError("MEMORY_STORE_INVALID", "Selected persona does not exist in the Memory/Persona store.", 500);
  }
  let migrated = value.version !== 3 || !Array.isArray(value.audit);
  const memories = value.memories.map((memory) => {
    if (!memory || typeof memory !== "object") {
      throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store contains an invalid memory.", 500);
    }
    const validOwner = typeof memory.owner === "string" && OWNER_PATTERN.test(memory.owner);
    if (value.version >= 2 && !validOwner) {
      throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store contains an invalid memory owner.", 500);
    }
    if (value.version === 3 && (!BOUNDARY_SET.has(memory.boundary)
      || (memory.boundary === "session" && typeof memory.sessionId !== "string")
      || memory.sensitivity !== "private")) {
      throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store contains an invalid memory boundary.", 500);
    }
    const owner = validOwner ? memory.owner : DEFAULT_OWNER;
    const boundary = BOUNDARY_SET.has(memory.boundary) ? memory.boundary : "persona";
    const sessionId = boundary === "session" ? memory.sessionId : null;
    const sensitivity = "private";
    if (owner !== memory?.owner || boundary !== memory?.boundary || sessionId !== memory?.sessionId || sensitivity !== memory?.sensitivity) migrated = true;
    return { ...memory, owner, boundary, sessionId, sensitivity };
  });
  return {
    state: { ...value, version: 3, memories, audit: Array.isArray(value.audit) ? value.audit : [] },
    migrated,
  };
}

function conversationPreview(entry, includeContent) {
  const messages = Array.isArray(entry?.messages) ? entry.messages : [];
  const lastMessage = [...messages].reverse().find((message) => typeof message?.text === "string" || typeof message?.content === "string");
  const lastText = typeof lastMessage?.text === "string" ? lastMessage.text : lastMessage?.content;
  const preview = includeContent && lastText ? redactSecrets(lastText.slice(0, 280)).value : undefined;
  return {
    id: typeof entry?.id === "string" ? entry.id : "unknown",
    locale: entry?.locale === "zh-CN" ? "zh-CN" : "en",
    updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : null,
    messageCount: messages.length,
    ...(preview ? { preview } : {}),
  };
}

function publicMemory(memory, currentTime) {
  const reference = memory.temporal.occurredAt ?? memory.temporal.recordedAt;
  const ageMs = Math.max(0, currentTime.getTime() - new Date(reference).getTime());
  const isExpired = Boolean(memory.temporal.expiresAt && new Date(memory.temporal.expiresAt) <= currentTime);
  return structuredClone({ ...memory, temporal: { ...memory.temporal, ageMs, isExpired } });
}

export function createAiriMemoryPersonaRuntime({
  file,
  now = () => new Date().toISOString(),
  limits: limitOverrides = {},
  defaultTimezone = "UTC",
  principal = DEFAULT_OWNER,
  scopes,
  recentConversationReader,
  onAuditEvent = () => undefined,
} = {}) {
  if (typeof file !== "string" || !file) throw new TypeError("Memory/Persona runtime requires a persistence file.");
  if (typeof principal !== "string" || !OWNER_PATTERN.test(principal)) {
    throw new TypeError("Memory/Persona principal must be a valid owner identifier.");
  }
  if (scopes !== undefined && (!Array.isArray(scopes) || scopes.some((scope) => !MEMORY_PLUGIN_SCOPES.includes(scope)))) {
    throw new TypeError("Memory/Persona scopes contain an unsupported plugin scope.");
  }
  if (recentConversationReader !== undefined && typeof recentConversationReader !== "function") {
    throw new TypeError("recentConversationReader must be a function.");
  }
  if (typeof onAuditEvent !== "function") throw new TypeError("onAuditEvent must be a function.");
  const grantedScopes = new Set(scopes ?? (principal === DEFAULT_OWNER ? ["*"] : []));
  const limits = Object.freeze({ ...MEMORY_PERSONA_LIMITS, ...limitOverrides });
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`Memory/Persona limit ${name} must be a positive integer.`);
  }
  normalizeTimezone(defaultTimezone);

  let state;
  let initialization;
  let closed = false;
  let mutationQueue = Promise.resolve();
  const lifecycle = { phase: "cold", events: [{ phase: "cold", at: now() }], error: null };

  function transition(phase, error = null) {
    lifecycle.phase = phase;
    lifecycle.error = error ? (error instanceof Error ? error.message : String(error)) : null;
    lifecycle.events.push({ phase, at: now(), ...(lifecycle.error ? { error: lifecycle.error } : {}) });
  }

  async function initialize() {
    if (closed) throw runtimeError("MEMORY_RUNTIME_CLOSED", "Memory/Persona runtime is closed.", 409);
    if (state) return;
    if (initialization) return initialization;
    transition("loading");
    initialization = (async () => {
      try {
        try {
          const details = await stat(file);
          if (details.size > limits.maxStoreBytes) {
            throw runtimeError("MEMORY_STORE_LIMIT", `Memory store exceeds the ${limits.maxStoreBytes}-byte limit.`, 413);
          }
          const loaded = validateLoadedState(JSON.parse(await readFile(file, "utf8")));
          state = loaded.state;
          if (loaded.migrated) await writePrivateJson(file, state, limits.maxStoreBytes);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
          state = { version: 3, selectedPersonaId: null, personas: [], memories: [], audit: [], updatedAt: now() };
          await writePrivateJson(file, state, limits.maxStoreBytes);
        }
        transition("ready");
      } catch (cause) {
        state = undefined;
        const error = cause?.code
          ? cause
          : runtimeError("MEMORY_STORE_INVALID", `Unable to load Memory/Persona store: ${cause instanceof Error ? cause.message : String(cause)}`, 500, cause);
        transition("error", error);
        throw error;
      }
    })();
    return initialization;
  }

  function findPersona(current, personaId) {
    const id = personaId ?? current.selectedPersonaId;
    if (!id) throw runtimeError("PERSONA_NOT_SELECTED", "A personaId is required when no persona is selected.", 409);
    const persona = current.personas.find((candidate) => candidate.id === id);
    if (!persona) throw runtimeError("PERSONA_NOT_FOUND", `Unknown persona: ${id}`, 404);
    return persona;
  }

  function requireScope(scope) {
    if (grantedScopes.has("*") || grantedScopes.has(scope)) return;
    throw runtimeError("MEMORY_SCOPE_DENIED", `Principal ${principal} requires scope ${scope}.`, 403);
  }

  function appendAudit(current, context, outcome, output, error) {
    if (!context) return null;
    const event = {
      id: randomUUID(),
      sequence: (current.audit.at(-1)?.sequence ?? 0) + 1,
      principal,
      operation: context.operation,
      outcome,
      requiredScope: context.requiredScope,
      boundary: context.boundary ?? null,
      personaId: context.personaId ?? null,
      namespace: context.namespace ?? null,
      sessionId: context.sessionId ?? null,
      resultCount: outcome === "succeeded" ? (Array.isArray(output) ? output.length : output == null ? 0 : 1) : 0,
      errorCode: error?.code ?? null,
      at: now(),
    };
    current.audit.push(event);
    current.audit = current.audit.slice(-limits.maxAuditEvents);
    return event;
  }

  function notifyAudit(event) {
    if (!event) return;
    try { onAuditEvent(structuredClone(event)); } catch { /* Observers cannot change operation results. */ }
  }

  function mutate(operation, auditContext) {
    const result = mutationQueue.then(async () => {
      await initialize();
      const draft = structuredClone(state);
      try {
        const output = await operation(draft);
        const auditEvent = appendAudit(draft, auditContext, "succeeded", output);
        draft.updatedAt = now();
        await writePrivateJson(file, draft, limits.maxStoreBytes);
        state = draft;
        notifyAudit(auditEvent);
        return structuredClone(output);
      } catch (error) {
        if (auditContext) {
          const auditDraft = structuredClone(state);
          const outcome = error?.code === "MEMORY_SCOPE_DENIED" ? "denied" : "failed";
          const auditEvent = appendAudit(auditDraft, auditContext, outcome, null, error);
          auditDraft.updatedAt = now();
          await writePrivateJson(file, auditDraft, limits.maxStoreBytes);
          state = auditDraft;
          notifyAudit(auditEvent);
        }
        throw error;
      }
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function read(operation) {
    await initialize();
    await mutationQueue;
    return structuredClone(operation(state));
  }

  async function createPersona(input) {
    const value = requirePlainObject(input, "Persona input");
    rejectUnknownFields(value, new Set(["name", "description", "instructions"]), "Persona input");
    const name = normalizeText(value.name, "Persona name", PERSONA_NAME_BYTES, { required: true });
    const description = normalizeText(value.description, "Persona description", PERSONA_DESCRIPTION_BYTES);
    const instructions = normalizeText(value.instructions, "Persona instructions", PERSONA_INSTRUCTIONS_BYTES);
    return mutate((current) => {
      requireScope("persona:write");
      if (current.personas.length >= limits.maxPersonas) {
        throw runtimeError("PERSONA_LIMIT_REACHED", `Persona limit of ${limits.maxPersonas} reached.`, 409);
      }
      const timestamp = now();
      const persona = {
        id: randomUUID(),
        name: name.value,
        description: description.value,
        instructions: instructions.value,
        redacted: name.redacted || description.redacted || instructions.redacted,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      current.personas.push(persona);
      current.selectedPersonaId ??= persona.id;
      return persona;
    });
  }

  async function listPersonas() {
    return read((current) => {
      requireScope("persona:read");
      return current.personas
        .map((persona) => ({ ...persona, selected: persona.id === current.selectedPersonaId }))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  }

  async function getSelectedPersona() {
    return read((current) => {
      requireScope("persona:read");
      return current.selectedPersonaId ? { ...findPersona(current, current.selectedPersonaId), selected: true } : null;
    });
  }

  async function selectPersona(personaId) {
    const id = normalizeId(personaId, "Persona id");
    return mutate((current) => {
      requireScope("persona:select");
      const persona = findPersona(current, id);
      current.selectedPersonaId = id;
      return { ...persona, selected: true };
    });
  }

  async function updatePersona(personaId, patch) {
    const id = normalizeId(personaId, "Persona id");
    const value = requirePlainObject(patch, "Persona patch");
    rejectUnknownFields(value, new Set(["name", "description", "instructions"]), "Persona patch");
    if (Object.keys(value).length === 0) throw runtimeError("INVALID_MEMORY_INPUT", "Persona patch must change at least one field.");
    const normalized = {};
    if (Object.hasOwn(value, "name")) normalized.name = normalizeText(value.name, "Persona name", PERSONA_NAME_BYTES, { required: true });
    if (Object.hasOwn(value, "description")) normalized.description = normalizeText(value.description, "Persona description", PERSONA_DESCRIPTION_BYTES);
    if (Object.hasOwn(value, "instructions")) normalized.instructions = normalizeText(value.instructions, "Persona instructions", PERSONA_INSTRUCTIONS_BYTES);
    return mutate((current) => {
      requireScope("persona:write");
      const persona = findPersona(current, id);
      for (const [key, result] of Object.entries(normalized)) {
        persona[key] = result.value;
        persona.redacted ||= result.redacted;
      }
      persona.updatedAt = now();
      return persona;
    });
  }

  async function deletePersona(personaId) {
    const id = normalizeId(personaId, "Persona id");
    return mutate((current) => {
      requireScope("persona:delete");
      const index = current.personas.findIndex((persona) => persona.id === id);
      if (index < 0) throw runtimeError("PERSONA_NOT_FOUND", `Unknown persona: ${id}`, 404);
      current.personas.splice(index, 1);
      const previousMemoryCount = current.memories.length;
      current.memories = current.memories.filter((memory) => memory.personaId !== id);
      if (current.selectedPersonaId === id) current.selectedPersonaId = current.personas[0]?.id ?? null;
      return { id, deleted: true, deletedMemories: previousMemoryCount - current.memories.length };
    });
  }

  async function remember(input) {
    const value = requirePlainObject(input, "Memory input");
    rejectUnknownFields(value, new Set(["personaId", "namespace", "boundary", "sessionId", "text", "tags", "occurredAt", "expiresAt", "timezone"]), "Memory input");
    const namespace = normalizeNamespace(value.namespace);
    const memoryBoundary = normalizeBoundary(value.boundary, value.sessionId);
    const text = normalizeText(value.text, "Memory text", limits.maxMemoryBytes, { required: true });
    const tags = normalizeTags(value.tags);
    const occurredAt = normalizeIso(value.occurredAt, "occurredAt");
    const expiresAt = normalizeIso(value.expiresAt, "expiresAt");
    const timezone = normalizeTimezone(value.timezone ?? defaultTimezone);
    return mutate((current) => {
      requireScope("memory:write");
      const persona = findPersona(current, value.personaId);
      if (current.memories.length >= limits.maxTotalMemories) {
        throw runtimeError("MEMORY_LIMIT_REACHED", `Total memory limit of ${limits.maxTotalMemories} reached.`, 409);
      }
      const scopeCount = current.memories.filter((memory) => memory.owner === principal
        && memory.personaId === persona.id && memory.namespace === namespace
        && memory.boundary === memoryBoundary.boundary && memory.sessionId === memoryBoundary.sessionId).length;
      if (scopeCount >= limits.maxMemoriesPerNamespace) {
        throw runtimeError("MEMORY_LIMIT_REACHED", `Memory limit of ${limits.maxMemoriesPerNamespace} reached for namespace ${namespace}.`, 409);
      }
      const recordedAt = now();
      const memory = {
        id: randomUUID(),
        owner: principal,
        personaId: persona.id,
        namespace,
        boundary: memoryBoundary.boundary,
        sessionId: memoryBoundary.sessionId,
        sensitivity: "private",
        text: text.value,
        tags,
        redacted: text.redacted,
        temporal: { recordedAt, occurredAt: occurredAt ?? recordedAt, timezone, expiresAt },
      };
      current.memories.push(memory);
      return publicMemory(memory, new Date(recordedAt));
    }, {
      operation: "memory.remember", requiredScope: "memory:write", personaId: value.personaId,
      namespace, ...memoryBoundary,
    });
  }

  async function recall(input) {
    const value = requirePlainObject(input, "Recall input");
    rejectUnknownFields(value, new Set(["personaId", "namespace", "boundary", "sessionId", "query", "limit", "includeExpired"]), "Recall input");
    const namespace = normalizeNamespace(value.namespace);
    const memoryBoundary = normalizeBoundary(value.boundary, value.sessionId);
    if (value.query !== undefined && typeof value.query !== "string") throw runtimeError("INVALID_MEMORY_INPUT", "Recall query must be a string.");
    const query = value.query?.trim().toLocaleLowerCase() ?? "";
    const limit = value.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw runtimeError("INVALID_MEMORY_INPUT", "Recall limit must be between 1 and 50.");
    if (value.includeExpired !== undefined && typeof value.includeExpired !== "boolean") {
      throw runtimeError("INVALID_MEMORY_INPUT", "includeExpired must be a boolean.");
    }
    return mutate((current) => {
      requireScope("memory:read");
      const persona = findPersona(current, value.personaId);
      const currentTime = new Date(now());
      return current.memories
        .filter((memory) => memory.owner === principal
          && memory.personaId === persona.id && memory.namespace === namespace
          && memory.boundary === memoryBoundary.boundary && memory.sessionId === memoryBoundary.sessionId)
        .map((memory) => publicMemory(memory, currentTime))
        .filter((memory) => value.includeExpired || !memory.temporal.isExpired)
        .filter((memory) => !query || memory.text.toLocaleLowerCase().includes(query)
          || memory.tags.some((tag) => tag.toLocaleLowerCase().includes(query)))
        .sort((left, right) => right.temporal.occurredAt.localeCompare(left.temporal.occurredAt))
        .slice(0, limit);
    }, {
      operation: "memory.recall", requiredScope: "memory:read", personaId: value.personaId,
      namespace, ...memoryBoundary,
    });
  }

  async function deleteMemory(input) {
    const value = requirePlainObject(input, "Delete memory input");
    rejectUnknownFields(value, new Set(["personaId", "namespace", "boundary", "sessionId", "memoryId"]), "Delete memory input");
    const personaId = normalizeId(value.personaId, "Persona id");
    const memoryId = normalizeId(value.memoryId, "Memory id");
    const namespace = normalizeNamespace(value.namespace);
    const memoryBoundary = normalizeBoundary(value.boundary, value.sessionId);
    return mutate((current) => {
      requireScope("memory:delete");
      findPersona(current, personaId);
      const index = current.memories.findIndex((memory) => memory.id === memoryId
        && memory.owner === principal && memory.personaId === personaId && memory.namespace === namespace
        && memory.boundary === memoryBoundary.boundary && memory.sessionId === memoryBoundary.sessionId);
      if (index < 0) throw runtimeError("MEMORY_NOT_FOUND", "Memory does not exist in the requested persona and namespace.", 404);
      current.memories.splice(index, 1);
      return { id: memoryId, personaId, namespace, ...memoryBoundary, deleted: true };
    }, {
      operation: "memory.delete", requiredScope: "memory:delete", personaId, namespace, ...memoryBoundary,
    });
  }

  async function readRecentConversations(input = {}) {
    const value = requirePlainObject(input, "Recent conversation input");
    rejectUnknownFields(value, new Set(["limit"]), "Recent conversation input");
    const limit = value.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw runtimeError("INVALID_MEMORY_INPUT", "Recent conversation limit must be between 1 and 20.");
    }
    return mutate(async () => {
      requireScope("conversations:recent:read");
      if (!recentConversationReader) {
        throw runtimeError("CONVERSATION_READER_UNAVAILABLE", "Recent conversation reader is not connected.", 501);
      }
      const entries = await recentConversationReader({ limit, principal });
      if (!Array.isArray(entries)) throw runtimeError("CONVERSATION_READER_INVALID", "Recent conversation reader returned an invalid result.", 502);
      const includeContent = grantedScopes.has("*") || grantedScopes.has("conversations:recent:content:read");
      return entries.slice(0, limit).map((entry) => conversationPreview(entry, includeContent));
    }, { operation: "conversations.recent.read", requiredScope: "conversations:recent:read" });
  }

  async function listAuditEvents(input = {}) {
    const value = requirePlainObject(input, "Audit input");
    rejectUnknownFields(value, new Set(["limit"]), "Audit input");
    const limit = value.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw runtimeError("INVALID_MEMORY_INPUT", "Audit limit must be between 1 and 100.");
    return mutate((current) => {
      requireScope("memory:audit:read");
      return [...current.audit].reverse().slice(0, limit);
    }, { operation: "memory.audit.read", requiredScope: "memory:audit:read" });
  }

  async function close() {
    await mutationQueue;
    if (closed) return;
    closed = true;
    state = undefined;
    transition("stopped");
  }

  return {
    close,
    createPersona,
    deleteMemory,
    deletePersona,
    getAccessPolicy: () => ({
      principal,
      scopes: grantedScopes.has("*") ? ["*"] : [...grantedScopes].sort(),
      boundaries: [...MEMORY_BOUNDARIES],
      sensitiveData: "private-by-default",
    }),
    getLifecycle: () => structuredClone(lifecycle),
    getSelectedPersona,
    initialize,
    listAuditEvents,
    listPersonas,
    readRecentConversations,
    recall,
    remember,
    selectPersona,
    updatePersona,
  };
}
