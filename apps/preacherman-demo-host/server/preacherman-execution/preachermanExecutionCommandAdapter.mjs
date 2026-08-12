import { createHash } from "node:crypto";

function inputText(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 8_000) {
    const error = new Error("Task input must contain between 1 and 8000 characters.");
    error.code = "TASK_INPUT_INVALID";
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

export function createPreachermanExecutionCommandAdapter({ client, taskService }) {
  async function cancel(taskId) {
    const task = await taskService.get(taskId);
    if (task.status === "cancelled") return { task, accepted: true, reused: true };
    if (["succeeded", "failed"].includes(task.status)) {
      const error = new Error(`TaskRun ${taskId} cannot be cancelled from ${task.status}.`);
      error.code = "TASK_NOT_CANCELLABLE";
      error.statusCode = 409;
      throw error;
    }
    const attempt = task.attempts.at(-1);
    if (attempt?.provider !== "preacherman-execution" || !attempt.externalRunId) {
      const error = new Error("TaskRun does not have an active Preacherman Execution Run.");
      error.code = "PREACHERMAN_EXECUTION_RUN_NOT_LINKED";
      error.statusCode = 409;
      throw error;
    }
    await taskService.update(taskId, (current) => {
      current.cancellationPending = true;
    });
    try {
      await client.cancelRun(attempt.externalRunId);
    } catch (error) {
      await taskService.update(taskId, (current) => {
        current.cancellationPending = true;
        current.cancellationError = { code: error.code ?? "PREACHERMAN_EXECUTION_CANCEL_FAILED", message: error.message };
      });
      await taskService.appendEvent(taskId, { type: "cancel_pending", stage: "cancelling", message: "Cancellation has not yet been confirmed." });
      throw error;
    }
    const cancelled = await taskService.update(taskId, (current) => {
      current.cancellationPending = false;
      current.cancellationError = null;
    });
    const terminal = cancelled.status === "cancelled"
      ? cancelled
      : await taskService.transition(taskId, "cancelled", { event: { type: "cancelled", stage: "terminal", message: "Complex execution was cancelled." } });
    return { task: terminal, accepted: true, reused: false };
  }

  async function sendInput(taskId, value, { mode = "resume" } = {}) {
    const input = inputText(value);
    const task = await taskService.get(taskId);
    if (mode === "resume" && !["waiting_for_input", "waiting_for_approval"].includes(task.status)) {
      const error = new Error("Only a waiting TaskRun can be resumed.");
      error.code = "TASK_NOT_WAITING";
      error.statusCode = 409;
      throw error;
    }
    if (mode === "steer" && task.status !== "running") {
      const error = new Error("Only a running TaskRun can be steered.");
      error.code = "TASK_NOT_RUNNING";
      error.statusCode = 409;
      throw error;
    }
    const attempt = task.attempts.at(-1);
    if (attempt?.provider !== "preacherman-execution" || !attempt.externalRunId) {
      const error = new Error("TaskRun does not have an active Preacherman Execution Run.");
      error.code = "PREACHERMAN_EXECUTION_RUN_NOT_LINKED";
      error.statusCode = 409;
      throw error;
    }
    const status = await client.runStatus(attempt.externalRunId);
    const round = status.current_round;
    const actorIds = Array.isArray(round?.target_actor_ids) ? round.target_actor_ids.filter((actor) => typeof actor === "string" && actor) : [];
    if (!round?.round_id || actorIds.length === 0) {
      const error = new Error("Preacherman Execution did not expose a commandable waiting round.");
      error.code = "PREACHERMAN_EXECUTION_WAITING_TARGET_MISSING";
      error.statusCode = 409;
      throw error;
    }
    const digest = createHash("sha256").update(`${taskId}\n${attempt.attempt}\n${mode}\n${input}`).digest("hex");
    const result = await client.sendCommands(attempt.externalRunId, {
      expected_round_id: round.round_id,
      commands: actorIds.map((actorId, index) => ({
        actor_id: actorId,
        command_id: `preacherman-${attempt.attempt}-${mode}-${digest.slice(0, 16)}-${index + 1}`,
        idempotency_key: `${taskId}:${attempt.attempt}:${mode}:${digest}:${actorId}`,
        payload: { type: mode, user_input: input },
      })),
    });
    const updated = await taskService.update(taskId, (current) => {
      if (mode === "steer") current.revision += 1;
      current.status = "running";
      current.pendingInput = null;
    });
    await taskService.appendEvent(taskId, {
      type: mode === "steer" ? "steered" : "resumed",
      stage: "executing",
      message: mode === "steer" ? "Updated direction was delivered." : "Additional input was delivered; execution resumed.",
      command: { digest, actorCount: actorIds.length, roundId: round.round_id },
    }, { sourceId: `${attempt.externalRunId}:${mode}:${digest}` });
    return { task: await taskService.get(updated.taskId), result };
  }

  return { cancel, sendInput };
}
