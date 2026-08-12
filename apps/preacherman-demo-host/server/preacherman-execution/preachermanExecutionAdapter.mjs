import {
  createPreachermanExecutionCapabilityCatalogAdapter,
  PREACHERMAN_EXECUTION_CANONICAL_HASH,
  PREACHERMAN_EXECUTION_WORKFLOW_REVISION,
} from "./preachermanExecutionCapabilityCatalogAdapter.mjs";

export { PREACHERMAN_EXECUTION_CANONICAL_HASH, PREACHERMAN_EXECUTION_WORKFLOW_REVISION };

export function createPreachermanExecutionAdapter({
  client,
  taskService,
  linkStore,
  capabilityCatalog,
  workflowId = "preacherman-complex-task-v1",
  expectedWorkflowRevision = PREACHERMAN_EXECUTION_WORKFLOW_REVISION,
  expectedCanonicalHash = PREACHERMAN_EXECUTION_CANONICAL_HASH,
  profile,
  managerUrl = "http://127.0.0.1:19191",
  enabled = true,
  now = () => new Date().toISOString(),
}) {
  const catalog = capabilityCatalog ?? createPreachermanExecutionCapabilityCatalogAdapter({
    client,
    workflowId,
    expectedWorkflowRevision,
    expectedCanonicalHash,
    profile,
    managerUrl,
    enabled,
    now,
  });
  const status = () => catalog.status();

  async function start(taskId, { idempotencyKey }) {
    const existingLink = await linkStore.getByIdempotencyKey(idempotencyKey);
    if (existingLink) return { task: await taskService.get(existingLink.taskId), link: existingLink, reused: true };
    const provider = await status();
    if (provider.state !== "ready") {
      const error = new Error(provider.message);
      error.code = "PREACHERMAN_EXECUTION_CONFIGURATION_REQUIRED";
      error.statusCode = provider.state === "unreachable" ? 503 : 409;
      error.provider = provider;
      throw error;
    }
    let task = await taskService.get(taskId);
    let attempt = task.attempts.at(-1);
    if (!(attempt?.provider === "preacherman-execution" && attempt.status === "submitting" && !attempt.externalRunId)) {
      task = await taskService.startAttempt(taskId, { provider: "preacherman-execution" });
      attempt = task.attempts.at(-1);
    }
    const runId = `preacherman_${task.taskId}_${attempt.attempt}`;
    const result = await client.createAndRun({
      workflow_id: provider.workflow.id,
      workflow_revision: provider.workflow.revision,
      canonical_hash: provider.workflow.canonicalHash,
      profile: provider.profile,
      runId,
      prompt: task.objective,
    });
    const externalRunId = result.run_id ?? result.runId;
    if (typeof externalRunId !== "string" || !externalRunId) {
      const error = new Error("Preacherman Execution create-and-run response did not include a run ID.");
      error.code = "PREACHERMAN_EXECUTION_RUN_ID_MISSING";
      error.statusCode = 502;
      throw error;
    }
    task = await taskService.linkExternalRun(task.taskId, {
      externalRunId,
      workflowId: provider.workflow.id,
      workflowRevision: provider.workflow.revision,
      canonicalHash: provider.workflow.canonicalHash,
      eventCursor: 0,
    });
    const link = await linkStore.save({
      taskId: task.taskId,
      attempt: attempt.attempt,
      externalRunId,
      idempotencyKey,
      workflowId: provider.workflow.id,
      workflowRevision: provider.workflow.revision,
      canonicalHash: provider.workflow.canonicalHash,
      createdAt: now(),
    });
    return { task, link, reused: false };
  }

  return { status, start, capabilityCatalog: catalog };
}
