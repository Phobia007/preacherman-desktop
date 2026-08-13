import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ACTIVE_STATUSES = new Set(["queued", "running", "waiting_for_input", "waiting_for_approval"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

function clone(value) {
  return structuredClone(value);
}

async function writePrivateJson(target, value) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, target);
  // Windows protects this file through the user's data-directory ACL. POSIX
  // platforms additionally enforce the intended owner-only mode.
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function executionKind(task) {
  if (task.execution?.kind) return task.execution.kind;
  if (task.source === "preacherman-plugin") return "local-plugin";
  if (task.executor === "pitchkit") return "local-pitch";
  if (task.toolCall?.name) return "local-mcp";
  return "local-pitch";
}

function attemptStatus(status) {
  if (status === "queued") return "submitting";
  if (status === "running") return "active";
  if (status === "waiting_for_input" || status === "waiting_for_approval") return "waiting";
  if (status === "succeeded") return "completed";
  return status === "cancelled" ? "cancelled" : "failed";
}

function canonicalArtifact(artifact, task, index = 0) {
  if (!artifact || typeof artifact !== "object") return null;
  const contentPath = artifact.contentPath ?? artifact.path ?? `/api/tasks/${encodeURIComponent(task.taskId)}/artifacts/${index + 1}/content`;
  return {
    ...clone(artifact),
    artifactId: artifact.artifactId ?? `artifact_${index + 1}`,
    provider: artifact.provider ?? (task.execution?.kind === "preacherman-execution-dag" ? "preacherman-execution" : "local"),
    status: artifact.status ?? "ready",
    contentPath,
    path: artifact.path ?? contentPath,
    primary: artifact.primary ?? index === 0,
  };
}

export function normalizeTaskV2(task, now = () => new Date().toISOString()) {
  const normalized = clone(task);
  const timestamp = normalized.createdAt ?? normalized.updatedAt ?? now();
  normalized.taskId = normalized.taskId ?? normalized.runId;
  normalized.runId = normalized.runId ?? normalized.taskId;
  normalized.objective = typeof normalized.objective === "string" && normalized.objective.trim()
    ? normalized.objective
    : "Untitled task";
  normalized.status = ACTIVE_STATUSES.has(normalized.status) || TERMINAL_STATUSES.has(normalized.status)
    ? normalized.status
    : "failed";
  normalized.revision = Number.isSafeInteger(normalized.revision) && normalized.revision > 0 ? normalized.revision : 1;
  normalized.execution = {
    kind: executionKind(normalized),
    adapter: normalized.execution?.adapter ?? normalized.executor ?? "preacherman-local",
    ...(normalized.execution?.agentId ? { agentId: normalized.execution.agentId } : {}),
    ...(normalized.execution?.workspaceId ? { workspaceId: normalized.execution.workspaceId } : {}),
    ...(normalized.execution?.localRunId ? { localRunId: normalized.execution.localRunId } : {}),
    ...(normalized.execution?.workflowId ? { workflowId: normalized.execution.workflowId } : {}),
    ...(normalized.execution?.workflowRevision ? { workflowRevision: normalized.execution.workflowRevision } : {}),
    ...(normalized.execution?.canonicalHash ? { canonicalHash: normalized.execution.canonicalHash } : {}),
  };
  normalized.events = Array.isArray(normalized.events) ? normalized.events : [];
  const existingArtifacts = Array.isArray(normalized.artifacts) && normalized.artifacts.length
    ? normalized.artifacts
    : (normalized.artifact ? [normalized.artifact] : []);
  normalized.artifacts = existingArtifacts.map((artifact, index) => canonicalArtifact(artifact, normalized, index)).filter(Boolean);
  const primary = normalized.artifacts.find((artifact) => artifact.primary) ?? normalized.artifacts[0] ?? null;
  if (primary && !primary.primary) primary.primary = true;
  normalized.artifact = primary;
  normalized.pendingApproval = normalized.pendingApproval ?? null;
  normalized.attempts = Array.isArray(normalized.attempts)
    ? normalized.attempts
    : [{
        attempt: Number.isSafeInteger(normalized.attempt) && normalized.attempt > 0 ? normalized.attempt : 1,
        provider: normalized.execution.kind === "preacherman-execution-dag" ? "preacherman-execution" : "local",
        status: attemptStatus(normalized.status),
        startedAt: timestamp,
        ...(TERMINAL_STATUSES.has(normalized.status) ? { completedAt: normalized.updatedAt ?? timestamp } : {}),
        ...(normalized.error ? { error: clone(normalized.error) } : {}),
      }];
  normalized.createdAt = timestamp;
  normalized.updatedAt = normalized.updatedAt ?? timestamp;
  normalized.error = normalized.error ?? null;
  return normalized;
}

export function createTaskStore({ file, legacyFiles = [], now = () => new Date().toISOString() }) {
  let state;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (state) return state;
    try {
      let source = file;
      let serialized;
      try {
        serialized = await readFile(source, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        for (const legacyFile of legacyFiles) {
          try {
            serialized = await readFile(legacyFile, "utf8");
            source = legacyFile;
            break;
          } catch (legacyError) {
            if (legacyError?.code !== "ENOENT") throw legacyError;
          }
        }
        if (serialized === undefined) throw error;
      }
      const parsed = JSON.parse(serialized);
      state = {
        version: 2,
        tasks: Array.isArray(parsed?.tasks) ? parsed.tasks.map((task) => normalizeTaskV2(task, now)) : [],
      };
      if (parsed?.version !== 2 || source !== file) await writePrivateJson(file, state);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { version: 2, tasks: [] };
    }

    let changed = false;
    for (const task of state.tasks) {
      if (!ACTIVE_STATUSES.has(task.status)) continue;
      const currentAttempt = task.attempts.at(-1);
      if (task.execution.kind === "preacherman-execution-dag" || currentAttempt?.provider === "preacherman-execution") {
        task.recoveryPending = true;
        if (!task.events.some((event) => event.type === "recovery_pending")) {
          task.events.push({
            sequence: task.events.length + 1,
            revision: task.revision,
            type: "recovery_pending",
            stage: "recovery",
            message: "External execution will be reconciled after service restart.",
            at: now(),
          });
          changed = true;
        }
        continue;
      }
      task.status = "failed";
      task.retryable = true;
      task.error = "Task execution was interrupted by a service restart.";
      task.updatedAt = now();
      task.events.push({
        sequence: task.events.length + 1,
        revision: task.revision,
        type: "interrupted",
        stage: "terminal",
        message: task.error,
        at: task.updatedAt,
      });
      if (currentAttempt && !["completed", "failed", "cancelled"].includes(currentAttempt.status)) {
        currentAttempt.status = "failed";
        currentAttempt.completedAt = task.updatedAt;
        currentAttempt.error = task.error;
      }
      changed = true;
    }
    if (changed) await writePrivateJson(file, state);
    return state;
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => {
      const current = await load();
      const value = operation(current);
      await writePrivateJson(file, current);
      return clone(value);
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    async create(task) {
      return mutate((current) => {
        if (current.tasks.some((candidate) => candidate.taskId === task.taskId)) {
          const error = new Error(`TaskRun already exists: ${task.taskId}`);
          error.code = "TASK_ALREADY_EXISTS";
          error.statusCode = 409;
          throw error;
        }
        const normalized = normalizeTaskV2(task, now);
        current.tasks.push(normalized);
        return normalized;
      });
    },

    async get(taskId) {
      await mutationQueue;
      const current = await load();
      const task = current.tasks.find((candidate) => candidate.taskId === taskId);
      return task ? clone(task) : null;
    },

    async list(limit = 10) {
      await mutationQueue;
      const current = await load();
      return clone([...current.tasks]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, Math.max(1, Math.min(50, limit))));
    },

    async listOwned(principalId, limit = 10) {
      await mutationQueue;
      const current = await load();
      return clone([...current.tasks]
        .filter((task) => task.ownership?.principalId === principalId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, Math.max(1, Math.min(50, limit))));
    },

    async update(taskId, update) {
      return mutate((current) => {
        const task = current.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task) return null;
        update(task);
        task.updatedAt = now();
        return task;
      });
    },

    async updateOwned(taskId, principalId, update) {
      return mutate((current) => {
        const task = current.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task || task.ownership?.principalId !== principalId) return null;
        const ownership = clone(task.ownership);
        update(task);
        if (JSON.stringify(task.ownership) !== JSON.stringify(ownership)) {
          const error = new Error("Task ownership is immutable.");
          error.code = "TASK_OWNERSHIP_IMMUTABLE";
          error.statusCode = 409;
          throw error;
        }
        task.updatedAt = now();
        return task;
      });
    },
  };
}

export function appendTaskEvent(task, event, at = new Date().toISOString()) {
  task.events.push({
    sequence: task.events.length + 1,
    revision: task.revision,
    at,
    ...event,
  });
}
