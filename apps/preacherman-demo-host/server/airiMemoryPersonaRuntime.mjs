import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const MEMORY_PERSONA_LIMITS = Object.freeze({
  maxPersonas: 20,
  maxMemoriesPerNamespace: 100,
  maxTotalMemories: 1_000,
  maxMemoryBytes: 8 * 1024,
  maxStoreBytes: 2 * 1024 * 1024,
});

const PERSONA_NAME_BYTES = 120;
const PERSONA_DESCRIPTION_BYTES = 2 * 1024;
const PERSONA_INSTRUCTIONS_BYTES = 8 * 1024;
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DEFAULT_OWNER = "preacherman-runtime";
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
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.personas) || !Array.isArray(value.memories)) {
    throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store has an unsupported or invalid format.", 500);
  }
  if (value.selectedPersonaId !== null && typeof value.selectedPersonaId !== "string") {
    throw runtimeError("MEMORY_STORE_INVALID", "Memory/Persona store has an invalid selected persona.", 500);
  }
  if (value.selectedPersonaId && !value.personas.some((persona) => persona.id === value.selectedPersonaId)) {
    throw runtimeError("MEMORY_STORE_INVALID", "Selected persona does not exist in the Memory/Persona store.", 500);
  }
  let migrated = value.version === 1;
  const memories = value.memories.map((memory) => {
    if (memory && typeof memory.owner === "string" && OWNER_PATTERN.test(memory.owner)) return memory;
    migrated = true;
    return { ...memory, owner: DEFAULT_OWNER };
  });
  return {
    state: { ...value, version: 2, memories },
    migrated,
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
} = {}) {
  if (typeof file !== "string" || !file) throw new TypeError("Memory/Persona runtime requires a persistence file.");
  if (typeof principal !== "string" || !OWNER_PATTERN.test(principal)) {
    throw new TypeError("Memory/Persona principal must be a valid owner identifier.");
  }
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
          state = { version: 2, selectedPersonaId: null, personas: [], memories: [], updatedAt: now() };
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

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      await initialize();
      const draft = structuredClone(state);
      const output = operation(draft);
      draft.updatedAt = now();
      await writePrivateJson(file, draft, limits.maxStoreBytes);
      state = draft;
      return structuredClone(output);
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
    return read((current) => current.personas
      .map((persona) => ({ ...persona, selected: persona.id === current.selectedPersonaId }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
  }

  async function getSelectedPersona() {
    return read((current) => current.selectedPersonaId
      ? { ...findPersona(current, current.selectedPersonaId), selected: true }
      : null);
  }

  async function selectPersona(personaId) {
    const id = normalizeId(personaId, "Persona id");
    return mutate((current) => {
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
    rejectUnknownFields(value, new Set(["personaId", "namespace", "text", "tags", "occurredAt", "expiresAt", "timezone"]), "Memory input");
    const namespace = normalizeNamespace(value.namespace);
    const text = normalizeText(value.text, "Memory text", limits.maxMemoryBytes, { required: true });
    const tags = normalizeTags(value.tags);
    const occurredAt = normalizeIso(value.occurredAt, "occurredAt");
    const expiresAt = normalizeIso(value.expiresAt, "expiresAt");
    const timezone = normalizeTimezone(value.timezone ?? defaultTimezone);
    return mutate((current) => {
      const persona = findPersona(current, value.personaId);
      if (current.memories.length >= limits.maxTotalMemories) {
        throw runtimeError("MEMORY_LIMIT_REACHED", `Total memory limit of ${limits.maxTotalMemories} reached.`, 409);
      }
      const scopeCount = current.memories.filter((memory) => memory.owner === principal
        && memory.personaId === persona.id && memory.namespace === namespace).length;
      if (scopeCount >= limits.maxMemoriesPerNamespace) {
        throw runtimeError("MEMORY_LIMIT_REACHED", `Memory limit of ${limits.maxMemoriesPerNamespace} reached for namespace ${namespace}.`, 409);
      }
      const recordedAt = now();
      const memory = {
        id: randomUUID(),
        owner: principal,
        personaId: persona.id,
        namespace,
        text: text.value,
        tags,
        redacted: text.redacted,
        temporal: { recordedAt, occurredAt: occurredAt ?? recordedAt, timezone, expiresAt },
      };
      current.memories.push(memory);
      return publicMemory(memory, new Date(recordedAt));
    });
  }

  async function recall(input) {
    const value = requirePlainObject(input, "Recall input");
    rejectUnknownFields(value, new Set(["personaId", "namespace", "query", "limit", "includeExpired"]), "Recall input");
    const namespace = normalizeNamespace(value.namespace);
    if (value.query !== undefined && typeof value.query !== "string") throw runtimeError("INVALID_MEMORY_INPUT", "Recall query must be a string.");
    const query = value.query?.trim().toLocaleLowerCase() ?? "";
    const limit = value.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw runtimeError("INVALID_MEMORY_INPUT", "Recall limit must be between 1 and 50.");
    if (value.includeExpired !== undefined && typeof value.includeExpired !== "boolean") {
      throw runtimeError("INVALID_MEMORY_INPUT", "includeExpired must be a boolean.");
    }
    return read((current) => {
      const persona = findPersona(current, value.personaId);
      const currentTime = new Date(now());
      return current.memories
        .filter((memory) => memory.owner === principal
          && memory.personaId === persona.id && memory.namespace === namespace)
        .map((memory) => publicMemory(memory, currentTime))
        .filter((memory) => value.includeExpired || !memory.temporal.isExpired)
        .filter((memory) => !query || memory.text.toLocaleLowerCase().includes(query)
          || memory.tags.some((tag) => tag.toLocaleLowerCase().includes(query)))
        .sort((left, right) => right.temporal.occurredAt.localeCompare(left.temporal.occurredAt))
        .slice(0, limit);
    });
  }

  async function deleteMemory(input) {
    const value = requirePlainObject(input, "Delete memory input");
    rejectUnknownFields(value, new Set(["personaId", "namespace", "memoryId"]), "Delete memory input");
    const personaId = normalizeId(value.personaId, "Persona id");
    const memoryId = normalizeId(value.memoryId, "Memory id");
    const namespace = normalizeNamespace(value.namespace);
    return mutate((current) => {
      findPersona(current, personaId);
      const index = current.memories.findIndex((memory) => memory.id === memoryId
        && memory.owner === principal && memory.personaId === personaId && memory.namespace === namespace);
      if (index < 0) throw runtimeError("MEMORY_NOT_FOUND", "Memory does not exist in the requested persona and namespace.", 404);
      current.memories.splice(index, 1);
      return { id: memoryId, personaId, namespace, deleted: true };
    });
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
    getLifecycle: () => structuredClone(lifecycle),
    getSelectedPersona,
    initialize,
    listPersonas,
    recall,
    remember,
    selectPersona,
    updatePersona,
  };
}
