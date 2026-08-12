import { randomUUID } from "node:crypto";
import { appendTaskEvent } from "./taskStore.mjs";

const BINDING_ID = "preacherman.task-ledger";
const MAX_PARAMETERS_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 128 * 1024;
const MAX_ARTIFACT_BYTES = 256 * 1024;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const RETRYABLE_STATUSES = new Set(["failed", "cancelled"]);

export const PREACHERMAN_PLUGIN_TASK_BINDING = Object.freeze({
  id: BINDING_ID,
  version: "1.0.0",
  kits: ["task", "ledger"],
  operations: [
    "create",
    "status",
    "progress",
    "cancel",
    "fail",
    "retry",
    "complete-with-artifact",
  ],
});

function bindingError(message, statusCode = 400, code = "invalid_request") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bindingError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw bindingError(`${label} must be a plain object.`);
  }
  return value;
}

function normalizeText(value, label, maximum, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string") throw bindingError(`${label} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw bindingError(`${label} must contain between 1 and ${maximum} characters.`);
  }
  return normalized;
}

function validateJsonValue(value, label, depth = 0) {
  if (depth > 16) throw bindingError(`${label} is nested too deeply.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw bindingError(`${label} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) validateJsonValue(entry, label, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") {
    throw bindingError(`${label} must contain only JSON values.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw bindingError(`${label} must contain only plain JSON objects.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.length > 128) throw bindingError(`${label} contains an overlong property name.`);
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw bindingError(`${label} contains a reserved property name.`);
    }
    validateJsonValue(entry, label, depth + 1);
  }
}

function normalizeJson(value, label, maximumBytes, { requireObject = false } = {}) {
  if (requireObject) requirePlainObject(value, label);
  validateJsonValue(value, label);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
    throw bindingError(`${label} exceeds ${maximumBytes} bytes.`);
  }
  return JSON.parse(serialized);
}

function normalizeIdentity(value, label) {
  const normalized = normalizeText(value, label, 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized)) {
    throw bindingError(`${label} contains unsupported characters.`);
  }
  return normalized;
}

function parameterSummary(parameters) {
  const serialized = JSON.stringify(parameters);
  return {
    keys: Object.keys(parameters).sort(),
    byteLength: Buffer.byteLength(serialized, "utf8"),
  };
}

function publicTask(task) {
  if (!task) return null;
  return {
    ...structuredClone(task),
    status: task.status === "succeeded" ? "completed" : task.status,
  };
}

function ledgerRecord(task) {
  const exposed = publicTask(task);
  return {
    taskId: exposed.taskId,
    status: exposed.status,
    pluginId: exposed.pluginId,
    toolName: exposed.toolCall.name,
    parameterSummary: exposed.toolCall.parameterSummary,
    structuredResult: exposed.toolCall.structuredResult,
    artifact: exposed.artifact,
    updatedAt: exposed.updatedAt,
  };
}

function response(task) {
  return { task: publicTask(task), ledger: ledgerRecord(task) };
}

export function createPreachermanPluginTaskBinding({
  taskService,
  now = () => new Date().toISOString(),
  createId = () => randomUUID(),
}) {
  if (!taskService || typeof taskService.createRecord !== "function" || typeof taskService.get !== "function"
    || typeof taskService.update !== "function") {
    throw new TypeError("A TaskService with createRecord, get, and update is required.");
  }

  function event(task, details) {
    appendTaskEvent(task, details, now());
  }

  function pluginContext(context) {
    requirePlainObject(context, "Binding context");
    return {
      pluginId: normalizeIdentity(context.pluginId, "Plugin id"),
      toolName: context.toolName === undefined ? undefined : normalizeIdentity(context.toolName, "Tool name"),
    };
  }

  async function ownedTask(taskId, pluginId) {
    const normalizedId = normalizeText(taskId, "Task id", 128);
    const task = await taskService.get(normalizedId).catch((error) => {
      if (error?.code === "TASK_NOT_FOUND") return null;
      throw error;
    });
    if (!task) throw bindingError(`Unknown TaskRun: ${normalizedId}`, 404, "task_not_found");
    if (task.pluginId !== pluginId) {
      throw bindingError(`Plugin ${pluginId} cannot access TaskRun ${normalizedId}.`, 403, "task_forbidden");
    }
    return task;
  }

  function makeTask({ pluginId, toolName, objective, parameters, retryOf = null, attempt = 1 }) {
    const timestamp = now();
    const taskId = `plugin_${createId()}`;
    return {
      taskId,
      runId: taskId,
      proposalId: null,
      source: "preacherman-plugin",
      executor: BINDING_ID,
      pluginId,
      objective,
      revision: 1,
      attempt,
      retryOf,
      status: "queued",
      progress: { value: 0, stage: "queued", message: "Plugin tool queued." },
      retryable: false,
      toolCall: {
        name: toolName,
        parameterSummary: parameterSummary(parameters),
        structuredResult: null,
      },
      artifact: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [{
        sequence: 1,
        revision: 1,
        type: "accepted",
        stage: "queued",
        message: retryOf ? `Plugin tool retry queued from ${retryOf}.` : "Plugin tool queued.",
        at: timestamp,
      }],
    };
  }

  async function create(input, context) {
    requirePlainObject(input, "Create input");
    const identity = pluginContext(context);
    const toolName = identity.toolName ?? normalizeIdentity(input.toolName, "Tool name");
    const objective = normalizeText(input.objective, "Objective", 2_000);
    const parameters = normalizeJson(input.parameters ?? {}, "Tool parameters", MAX_PARAMETERS_BYTES, { requireObject: true });
    const task = makeTask({ ...identity, toolName, objective, parameters });
    await taskService.createRecord(task);
    return response(task);
  }

  async function status(input, context) {
    requirePlainObject(input, "Status input");
    const { pluginId } = pluginContext(context);
    return response(await ownedTask(input.taskId, pluginId));
  }

  async function progress(input, context) {
    requirePlainObject(input, "Progress input");
    const { pluginId } = pluginContext(context);
    const taskId = normalizeText(input.taskId, "Task id", 128);
    await ownedTask(taskId, pluginId);
    if (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0 || input.value > 1) {
      throw bindingError("Progress value must be a number between 0 and 1.");
    }
    const stage = normalizeText(input.stage, "Progress stage", 64);
    const message = normalizeText(input.message, "Progress message", 1_000);
    const task = await taskService.update(taskId, (current) => {
      if (current.pluginId !== pluginId) throw bindingError("Task ownership changed.", 403, "task_forbidden");
      if (TERMINAL_STATUSES.has(current.status)) {
        throw bindingError(`TaskRun ${taskId} is already ${publicTask(current).status}.`, 409, "task_terminal");
      }
      if (current.status === "queued") {
        current.status = "running";
        event(current, { type: "started", stage, message: "Plugin tool started." });
      }
      current.progress = { value: input.value, stage, message };
      event(current, { type: "progress", stage, message, value: input.value });
    });
    return response(task);
  }

  async function cancel(input, context) {
    requirePlainObject(input, "Cancel input");
    const { pluginId } = pluginContext(context);
    const taskId = normalizeText(input.taskId, "Task id", 128);
    await ownedTask(taskId, pluginId);
    const reason = normalizeText(input.reason ?? "Plugin task cancelled.", "Cancellation reason", 1_000);
    const task = await taskService.update(taskId, (current) => {
      if (current.pluginId !== pluginId) throw bindingError("Task ownership changed.", 403, "task_forbidden");
      if (current.status === "cancelled") return;
      if (TERMINAL_STATUSES.has(current.status)) {
        throw bindingError(`TaskRun ${taskId} is already ${publicTask(current).status}.`, 409, "task_terminal");
      }
      current.status = "cancelled";
      current.retryable = true;
      current.progress = { ...current.progress, stage: "terminal", message: reason };
      event(current, { type: "cancelled", stage: "terminal", message: reason });
    });
    return response(task);
  }

  async function fail(input, context) {
    requirePlainObject(input, "Failure input");
    const { pluginId } = pluginContext(context);
    const taskId = normalizeText(input.taskId, "Task id", 128);
    await ownedTask(taskId, pluginId);
    const message = normalizeText(input.error, "Failure error", 2_000);
    const structuredResult = input.result === undefined
      ? null
      : normalizeJson(input.result, "Tool result", MAX_RESULT_BYTES);
    const task = await taskService.update(taskId, (current) => {
      if (current.pluginId !== pluginId) throw bindingError("Task ownership changed.", 403, "task_forbidden");
      if (TERMINAL_STATUSES.has(current.status)) {
        throw bindingError(`TaskRun ${taskId} is already ${publicTask(current).status}.`, 409, "task_terminal");
      }
      current.status = "failed";
      current.retryable = true;
      current.error = message;
      current.progress = { ...current.progress, stage: "terminal", message };
      current.toolCall.structuredResult = structuredResult;
      event(current, { type: "failed", stage: "terminal", message });
    });
    return response(task);
  }

  async function retry(input, context) {
    requirePlainObject(input, "Retry input");
    const identity = pluginContext(context);
    const original = await ownedTask(input.taskId, identity.pluginId);
    if (!RETRYABLE_STATUSES.has(original.status)) {
      throw bindingError(`TaskRun ${original.taskId} cannot be retried from ${publicTask(original).status}.`, 409, "task_not_retryable");
    }
    const parameters = normalizeJson(input.parameters ?? {}, "Retry parameters", MAX_PARAMETERS_BYTES, { requireObject: true });
    const task = makeTask({
      pluginId: identity.pluginId,
      toolName: original.toolCall.name,
      objective: original.objective,
      parameters,
      retryOf: original.taskId,
      attempt: (original.attempt ?? 1) + 1,
    });
    await taskService.createRecord(task);
    return response(task);
  }

  async function completeWithArtifact(input, context) {
    requirePlainObject(input, "Completion input");
    const { pluginId } = pluginContext(context);
    const taskId = normalizeText(input.taskId, "Task id", 128);
    await ownedTask(taskId, pluginId);
    const result = normalizeJson(input.result, "Tool result", MAX_RESULT_BYTES);
    const artifactInput = requirePlainObject(input.artifact, "Artifact");
    const artifact = {
      name: normalizeText(artifactInput.name, "Artifact name", 128),
      path: `/api/tasks/${encodeURIComponent(taskId)}/artifact`,
      mediaType: artifactInput.mediaType === undefined
        ? "application/json"
        : normalizeText(artifactInput.mediaType, "Artifact media type", 128),
      content: normalizeJson(artifactInput.content, "Artifact content", MAX_ARTIFACT_BYTES, { requireObject: true }),
    };
    if (artifact.mediaType !== "application/json") {
      throw bindingError("Structured plugin artifacts must use application/json.");
    }
    const task = await taskService.update(taskId, (current) => {
      if (current.pluginId !== pluginId) throw bindingError("Task ownership changed.", 403, "task_forbidden");
      if (TERMINAL_STATUSES.has(current.status)) {
        throw bindingError(`TaskRun ${taskId} is already ${publicTask(current).status}.`, 409, "task_terminal");
      }
      if (current.status === "queued") {
        current.status = "running";
        event(current, { type: "started", stage: "executing", message: "Plugin tool started." });
      }
      current.progress = { value: 1, stage: "terminal", message: "Plugin tool completed." };
      current.toolCall.structuredResult = result;
      current.artifact = artifact;
      current.status = "succeeded";
      current.retryable = false;
      current.error = null;
      event(current, { type: "progress", stage: "writing", message: "Structured artifact persisted.", value: 1 });
      event(current, { type: "completed", stage: "terminal", message: "Plugin tool completed." });
    });
    return response(task);
  }

  async function execute(operation, input = {}, context = {}) {
    switch (operation) {
      case "create": return create(input, context);
      case "status": return status(input, context);
      case "progress": return progress(input, context);
      case "cancel": return cancel(input, context);
      case "fail": return fail(input, context);
      case "retry": return retry(input, context);
      case "complete-with-artifact": return completeWithArtifact(input, context);
      default: throw bindingError(`Unsupported ${BINDING_ID} operation: ${operation}`);
    }
  }

  return { ...PREACHERMAN_PLUGIN_TASK_BINDING, definition: PREACHERMAN_PLUGIN_TASK_BINDING, execute };
}
