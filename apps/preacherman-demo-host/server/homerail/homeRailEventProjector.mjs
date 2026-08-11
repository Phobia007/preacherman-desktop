import { createHash } from "node:crypto";

const MILESTONES = new Map([
  ["run_created", { stage: "preparing", message: "Complex execution was created." }],
  ["engine_started", { stage: "preparing", message: "Preparing the execution plan." }],
  ["node_dispatched", { stage: "executing", message: "Executing a planned work item." }],
  ["fanout_started", { stage: "executing", message: "Executing independent work items in parallel." }],
  ["fanout_completed", { stage: "checking", message: "Parallel work finished; checking the combined result." }],
  ["artifact_pending", { stage: "artifacts", message: "Preparing a task artifact." }],
  ["artifact_ready", { stage: "artifacts", message: "A task artifact is ready." }],
  ["artifact_failed", { stage: "artifacts", message: "A task artifact could not be prepared." }],
  ["run_waiting", { stage: "waiting", message: "Execution needs additional input." }],
  ["run_resumed", { stage: "executing", message: "Execution resumed." }],
  ["run_completed", { stage: "terminal", message: "Complex execution completed." }],
  ["run_failed", { stage: "terminal", message: "Complex execution failed." }],
  ["run_cancelled", { stage: "terminal", message: "Complex execution was cancelled." }],
]);

function eventType(event) {
  const value = event?.event_type ?? event?.type ?? "";
  return typeof value === "string" && value.startsWith("dag:") ? value.slice(4) : value;
}

function evidence(event, externalRunId, index) {
  return {
    provider: "homerail",
    externalRunId,
    sourceEvent: eventType(event),
    sourceIndex: index,
    ...(event?.node_id ? { nodeId: event.node_id } : {}),
    ...(event?.timestamp ? { sourceTimestamp: event.timestamp } : {}),
  };
}

function stableJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(null);
}

export function homeRailEventFingerprint(event) {
  const explicitId = event?.event_id ?? event?.eventId ?? event?.id;
  if (typeof explicitId === "string" && explicitId.trim()) return `id:${explicitId.trim()}`;
  const normalized = {
    type: eventType(event),
    timestamp: event?.timestamp ?? null,
    nodeId: event?.node_id ?? event?.nodeId ?? null,
    details: event?.details ?? event?.payload ?? null,
  };
  return `sha256:${createHash("sha256").update(stableJson(normalized)).digest("hex")}`;
}

export function createHomeRailEventProjector({ taskService }) {
  async function projectHistory(taskId, externalRunId, response) {
    const events = Array.isArray(response?.events) ? response.events : [];
    const task = await taskService.get(taskId);
    const attempt = task.attempts.at(-1);
    const cursor = Number.isSafeInteger(Number(attempt?.eventCursor)) ? Number(attempt.eventCursor) : 0;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const type = eventType(event);
      const sourceId = `${externalRunId}:event:${homeRailEventFingerprint(event)}`;
      if (type === "approval_requested") {
        const details = event.details ?? event.payload ?? {};
        if (typeof details.approvalId === "string" && typeof details.proposalHash === "string" && typeof details.nodeId === "string") {
          await taskService.requestApproval(taskId, {
            approvalId: details.approvalId,
            proposalHash: details.proposalHash,
            nodeId: details.nodeId,
            externalRunId,
            ...(typeof details.expiresAt === "string" ? { expiresAt: details.expiresAt } : {}),
            title: "Review a requested execution action",
            description: "HomeRail paused this task until you approve or reject the exact proposal hash.",
          }, { sourceId });
        }
      }
      const milestone = MILESTONES.get(type);
      if (milestone) {
        await taskService.appendEvent(taskId, {
          type: `homerail.${type}`,
          ...milestone,
          evidence: evidence(event, externalRunId, index),
        }, { sourceId });
      }
    }
    if (events.length > cursor) {
      await taskService.update(taskId, (current) => {
        const currentAttempt = current.attempts.at(-1);
        if (currentAttempt?.externalRunId === externalRunId) currentAttempt.eventCursor = Math.max(Number(currentAttempt.eventCursor) || 0, events.length);
      });
    }
    return taskService.get(taskId);
  }

  async function projectStatus(taskId, status) {
    const task = await taskService.get(taskId);
    const raw = status?.status;
    const target = raw === "active" ? "running"
      : raw === "waiting" ? (task.pendingApproval?.status === "pending" ? "waiting_for_approval" : "waiting_for_input")
        : raw === "completed" ? "succeeded"
          : raw === "failed" ? "failed"
            : raw === "cancelled" ? "cancelled"
              : null;
    if (!target || task.status === target) return task;
    if (["succeeded", "failed", "cancelled"].includes(task.status)) return task;
    return taskService.transition(taskId, target, {
      ...(target === "failed" ? { error: { code: "HOMERAIL_RUN_FAILED", message: "HomeRail execution failed.", retryable: true } } : {}),
      event: { type: `homerail.status.${raw}`, stage: ["succeeded", "failed", "cancelled"].includes(target) ? "terminal" : target, message: `Complex execution is ${raw}.` },
    });
  }

  return { projectHistory, projectStatus };
}
