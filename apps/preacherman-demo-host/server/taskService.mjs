import { randomUUID } from "node:crypto";
import { appendTaskEvent, normalizeTaskV2 } from "./taskStore.mjs";

export const TASK_STATUSES = Object.freeze([
  "queued", "running", "waiting_for_input", "waiting_for_approval", "succeeded", "failed", "cancelled",
]);

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const ATTEMPT_TERMINAL = new Set(["completed", "failed", "cancelled"]);
const TRANSITIONS = new Map([
  ["queued", new Set(["running", "waiting_for_input", "waiting_for_approval", "failed", "cancelled"])],
  ["running", new Set(["waiting_for_input", "waiting_for_approval", "succeeded", "failed", "cancelled"])],
  ["waiting_for_input", new Set(["running", "waiting_for_approval", "succeeded", "failed", "cancelled"])],
  ["waiting_for_approval", new Set(["running", "waiting_for_input", "succeeded", "failed", "cancelled"])],
]);

function taskError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function text(value, label, maximum = 2_000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw taskError("TASK_INPUT_INVALID", `${label} must contain between 1 and ${maximum} characters.`);
  }
  return value.trim();
}

function currentAttempt(task) {
  return task.attempts.at(-1) ?? null;
}

function updateAttemptForTaskStatus(task, status, at, error) {
  const attempt = currentAttempt(task);
  if (!attempt) return;
  if (status === "running") attempt.status = "active";
  else if (status === "waiting_for_input" || status === "waiting_for_approval") attempt.status = "waiting";
  else if (status === "succeeded") attempt.status = "completed";
  else if (status === "failed") attempt.status = "failed";
  else if (status === "cancelled") attempt.status = "cancelled";
  if (ATTEMPT_TERMINAL.has(attempt.status)) attempt.completedAt = at;
  if (error) attempt.error = structuredClone(error);
}

export function createTaskService({ taskStore, now = () => new Date().toISOString(), createId = () => randomUUID() }) {
  if (!taskStore?.create || !taskStore?.get || !taskStore?.list || !taskStore?.update) {
    throw new TypeError("TaskService requires a TaskStore with create, get, list, and update.");
  }

  async function requireTask(taskId) {
    const task = await taskStore.get(text(taskId, "Task id", 128));
    if (!task) throw taskError("TASK_NOT_FOUND", `TaskRun not found: ${taskId}`, 404);
    return task;
  }

  async function create(input) {
    const createdAt = now();
    const taskId = input.taskId ?? `task_${createId()}`;
    const execution = input.execution ?? { kind: "local-pitch", adapter: "pitchkit" };
    const task = normalizeTaskV2({
      ...structuredClone(input),
      taskId,
      runId: taskId,
      objective: text(input.objective, "Objective"),
      status: "queued",
      revision: 1,
      execution,
      attempts: [],
      pendingApproval: null,
      events: [{ sequence: 1, revision: 1, type: "accepted", stage: "queued", message: "Task accepted.", at: createdAt }],
      artifacts: [],
      artifact: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
    }, now);
    task.attempts = [];
    return taskStore.create(task);
  }

  async function createRecord(record) {
    return taskStore.create(record);
  }

  async function update(taskId, mutator) {
    const existing = await requireTask(taskId);
    const at = now();
    return taskStore.update(existing.taskId, (task) => {
      const previousStatus = task.status;
      mutator(task);
      if (task.artifact) {
        const artifactId = task.artifact.artifactId ?? "artifact_1";
        const canonical = {
          ...task.artifact,
          artifactId,
          provider: task.artifact.provider ?? (task.execution?.kind === "preacherman-execution-dag" ? "preacherman-execution" : "local"),
          status: task.artifact.status ?? "ready",
          contentPath: task.artifact.contentPath ?? task.artifact.path,
          primary: true,
        };
        const artifactIndex = task.artifacts.findIndex((candidate) => candidate.artifactId === artifactId);
        if (artifactIndex >= 0) task.artifacts[artifactIndex] = canonical;
        else task.artifacts.push(canonical);
        task.artifact = canonical;
      }
      if (task.status !== previousStatus) updateAttemptForTaskStatus(task, task.status, at, task.error);
    });
  }

  async function transition(taskId, status, { event, error = null } = {}) {
    if (!TASK_STATUSES.includes(status)) throw taskError("TASK_STATUS_INVALID", `Unsupported Task status: ${status}`);
    const existing = await requireTask(taskId);
    if (existing.status === status) return existing;
    if (TERMINAL.has(existing.status) || !TRANSITIONS.get(existing.status)?.has(status)) {
      throw taskError("TASK_TRANSITION_INVALID", `TaskRun ${taskId} cannot transition from ${existing.status} to ${status}.`, 409);
    }
    const at = now();
    return taskStore.update(existing.taskId, (task) => {
      task.status = status;
      task.error = error ? structuredClone(error) : status === "running" || status === "succeeded" ? null : task.error;
      updateAttemptForTaskStatus(task, status, at, error);
      appendTaskEvent(task, event ?? { type: status, stage: TERMINAL.has(status) ? "terminal" : status, message: `Task ${status}.` }, at);
    });
  }

  async function startAttempt(taskId, input) {
    const provider = input.provider;
    if (!new Set(["local", "preacherman-execution"]).has(provider)) throw taskError("TASK_ATTEMPT_INVALID", "Attempt provider must be local or preacherman-execution.");
    const existing = await requireTask(taskId);
    if (currentAttempt(existing) && !ATTEMPT_TERMINAL.has(currentAttempt(existing).status)) {
      throw taskError("TASK_ATTEMPT_ACTIVE", `TaskRun ${taskId} already has an active attempt.`, 409);
    }
    if (input.externalRunId && existing.attempts.some((attempt) => attempt.externalRunId === input.externalRunId)) {
      return existing;
    }
    const at = now();
    return taskStore.update(existing.taskId, (task) => {
      const attempt = {
        attempt: task.attempts.length + 1,
        provider,
        status: input.status ?? "submitting",
        startedAt: at,
        ...(input.externalRunId ? { externalRunId: text(input.externalRunId, "External run id", 256) } : {}),
        ...(input.eventCursor !== undefined ? { eventCursor: input.eventCursor } : {}),
      };
      task.attempts.push(attempt);
      task.status = attempt.status === "waiting" ? "waiting_for_input" : attempt.status === "active" ? "running" : "queued";
      task.error = null;
      task.retryable = false;
      appendTaskEvent(task, { type: "attempt_started", stage: "submitting", message: `Execution attempt ${attempt.attempt} started.`, attempt: attempt.attempt }, at);
    });
  }

  async function linkExternalRun(taskId, { externalRunId, eventCursor, workflowId, workflowRevision, canonicalHash }) {
    const existing = await requireTask(taskId);
    const at = now();
    return taskStore.update(existing.taskId, (task) => {
      const attempt = currentAttempt(task);
      if (!attempt || attempt.provider !== "preacherman-execution") throw taskError("TASK_ATTEMPT_INVALID", "A Preacherman Execution attempt must exist before linking a Run.", 409);
      if (attempt.externalRunId && attempt.externalRunId !== externalRunId) {
        throw taskError("TASK_EXTERNAL_RUN_CONFLICT", "The current attempt is already linked to another Preacherman Execution Run.", 409);
      }
      attempt.externalRunId = text(externalRunId, "External run id", 256);
      attempt.status = "active";
      if (eventCursor !== undefined) attempt.eventCursor = eventCursor;
      task.execution = {
        ...task.execution,
        kind: "preacherman-execution-dag",
        adapter: "preacherman-execution",
        ...(workflowId ? { workflowId } : {}),
        ...(workflowRevision ? { workflowRevision } : {}),
        ...(canonicalHash ? { canonicalHash } : {}),
      };
      task.status = "running";
      task.recoveryPending = false;
      appendTaskEvent(task, { type: "external_run_linked", stage: "preparing", message: "Complex execution started.", attempt: attempt.attempt }, at);
    });
  }

  async function appendEvent(taskId, event, { sourceId } = {}) {
    const existing = await requireTask(taskId);
    if (sourceId && existing.events.some((candidate) => candidate.sourceId === sourceId)) return existing;
    return taskStore.update(existing.taskId, (task) => {
      if (sourceId && task.events.some((candidate) => candidate.sourceId === sourceId)) return;
      appendTaskEvent(task, { ...structuredClone(event), ...(sourceId ? { sourceId } : {}) }, now());
    });
  }

  async function addArtifact(taskId, artifact) {
    const existing = await requireTask(taskId);
    const artifactId = text(artifact.artifactId ?? `artifact_${createId()}`, "Artifact id", 256);
    const normalized = {
      ...structuredClone(artifact),
      artifactId,
      provider: artifact.provider ?? "local",
      name: text(artifact.name, "Artifact name", 256),
      mediaType: text(artifact.mediaType ?? "application/octet-stream", "Artifact media type", 128),
      status: artifact.status ?? "ready",
      contentPath: text(artifact.contentPath ?? artifact.path, "Artifact content path", 2_000),
      path: artifact.path ?? artifact.contentPath,
      primary: artifact.primary === true || existing.artifacts.length === 0,
    };
    return taskStore.update(existing.taskId, (task) => {
      const index = task.artifacts.findIndex((candidate) => candidate.artifactId === artifactId);
      if (index >= 0) task.artifacts[index] = normalized;
      else task.artifacts.push(normalized);
      if (normalized.primary) {
        for (const candidate of task.artifacts) candidate.primary = candidate.artifactId === artifactId;
      }
      task.artifact = task.artifacts.find((candidate) => candidate.primary) ?? task.artifacts[0] ?? null;
      appendTaskEvent(task, { type: "artifact_updated", stage: "artifacts", message: `${normalized.name} is ${normalized.status}.`, artifactId }, now());
    });
  }

  async function requestApproval(taskId, approval, { sourceId } = {}) {
    const existing = await requireTask(taskId);
    if (sourceId && existing.events.some((candidate) => candidate.sourceId === sourceId)) return existing;
    if (TERMINAL.has(existing.status)) throw taskError("TASK_TERMINAL", "A terminal TaskRun cannot request approval.", 409);
    const normalized = {
      approvalId: text(approval.approvalId ?? `approval_${createId()}`, "Approval id", 256),
      proposalHash: text(approval.proposalHash, "Proposal hash", 256),
      title: text(approval.title, "Approval title", 256),
      description: text(approval.description, "Approval description", 2_000),
      status: "pending",
      requestedAt: now(),
      ...(approval.nodeId ? { nodeId: text(approval.nodeId, "Approval node id", 256) } : {}),
      ...(approval.externalRunId ? { externalRunId: text(approval.externalRunId, "Approval external run id", 256) } : {}),
      ...(approval.expiresAt ? { expiresAt: text(approval.expiresAt, "Approval expiry", 128) } : {}),
    };
    return taskStore.update(existing.taskId, (task) => {
      if (sourceId && task.events.some((candidate) => candidate.sourceId === sourceId)) return;
      if (task.pendingApproval?.status === "pending" && task.pendingApproval.proposalHash === normalized.proposalHash) return;
      if (task.pendingApproval?.status === "pending") throw taskError("TASK_APPROVAL_PENDING", "Another approval is already pending.", 409);
      task.pendingApproval = normalized;
      task.status = "waiting_for_approval";
      updateAttemptForTaskStatus(task, task.status, normalized.requestedAt);
      appendTaskEvent(task, { type: "approval_requested", stage: "approval", message: normalized.title, approvalId: normalized.approvalId, ...(sourceId ? { sourceId } : {}) }, normalized.requestedAt);
    });
  }

  async function resolveApproval(taskId, { approvalId, proposalHash, decision, actor = "preacherman-user" }) {
    const existing = await requireTask(taskId);
    const approval = existing.pendingApproval;
    if (!approval) {
      const decided = existing.approvalHistory?.find((candidate) => candidate.approvalId === approvalId && candidate.proposalHash === proposalHash);
      if (decided?.status === decision) return existing;
      throw taskError("TASK_APPROVAL_NOT_FOUND", "No approval is pending.", 404);
    }
    if (approval.approvalId !== approvalId || approval.proposalHash !== proposalHash) {
      throw taskError("TASK_APPROVAL_MISMATCH", "Approval identity or proposal hash does not match.", 409);
    }
    if (approval.status !== "pending") return existing;
    if (!new Set(["approved", "rejected"]).has(decision)) throw taskError("TASK_APPROVAL_INVALID", "Decision must be approved or rejected.");
    const approvalActor = text(actor, "Approval actor", 256);
    const at = now();
    return taskStore.update(existing.taskId, (task) => {
      task.approvalHistory = [...(task.approvalHistory ?? []), { ...task.pendingApproval, status: decision, actor: approvalActor, decidedAt: at }];
      task.pendingApproval = null;
      task.status = "running";
      updateAttemptForTaskStatus(task, task.status, at);
      appendTaskEvent(task, { type: decision, stage: "executing", message: `Approval ${decision} by ${approvalActor}; execution resumed.`, approvalId, actor: approvalActor }, at);
    });
  }

  async function retry(taskId, attempt) {
    const existing = await requireTask(taskId);
    if (!TERMINAL.has(existing.status)) throw taskError("TASK_NOT_RETRYABLE", "Only a terminal TaskRun can start a new attempt.", 409);
    await taskStore.update(existing.taskId, (task) => {
      task.status = "queued";
      task.error = null;
      task.pendingApproval = null;
      task.retryable = false;
      appendTaskEvent(task, { type: "retry_requested", stage: "queued", message: `Execution attempt ${task.attempts.length + 1} queued.` }, now());
    });
    return startAttempt(existing.taskId, attempt);
  }

  return {
    create,
    createRecord,
    get: requireTask,
    list: (limit) => taskStore.list(limit),
    update,
    transition,
    startAttempt,
    linkExternalRun,
    appendEvent,
    addArtifact,
    requestApproval,
    resolveApproval,
    retry,
  };
}
