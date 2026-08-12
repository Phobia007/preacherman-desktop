import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanExecutionApprovalAdapter } from "../server/preacherman-execution/preachermanExecutionApprovalAdapter.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

test("approval decision sends the stored proposal hash once and resumes the parent Task", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-approval-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }), createId: () => "approval-task" });
  const created = await taskService.create({ objective: "Publish a verified result", execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution" } });
  await taskService.startAttempt(created.taskId, { provider: "preacherman-execution" });
  await taskService.linkExternalRun(created.taskId, { externalRunId: "run-approval", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  await taskService.requestApproval(created.taskId, {
    approvalId: "approval-1",
    proposalHash: "sha256:exact",
    nodeId: "publish",
    externalRunId: "run-approval",
    title: "Publish result",
    description: "Approve exact proposal",
  });
  const calls = [];
  const adapter = createPreachermanExecutionApprovalAdapter({
    client: { approveRun: async (runId, nodeId, body) => { calls.push({ runId, nodeId, body }); return { decision: body.decision }; } },
    taskService,
  });
  const decided = await adapter.decide(created.taskId, { approvalId: "approval-1", decision: "approved" });
  const repeated = await adapter.decide(created.taskId, { approvalId: "approval-1", decision: "approved" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { runId: "run-approval", nodeId: "publish", body: { decision: "approved", actor: "preacherman-user", proposal_hash: "sha256:exact" } });
  assert.equal(decided.task.status, "running");
  assert.equal(decided.task.pendingApproval, null);
  assert.equal(decided.task.approvalHistory[0].status, "approved");
  assert.equal(decided.task.approvalHistory[0].actor, "preacherman-user");
  assert.equal(decided.task.approvalHistory[0].proposalHash, "sha256:exact");
  assert.ok(decided.task.approvalHistory[0].requestedAt);
  assert.ok(decided.task.approvalHistory[0].decidedAt);
  assert.equal(repeated.reused, true);
});

test("approval mismatch is rejected before Preacherman Execution receives a decision", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-approval-mismatch-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }), createId: () => "approval-mismatch" });
  const created = await taskService.create({ objective: "Approve result" });
  await taskService.requestApproval(created.taskId, { approvalId: "real", proposalHash: "hash", title: "Review", description: "Review" });
  let called = false;
  const adapter = createPreachermanExecutionApprovalAdapter({ client: { approveRun: async () => { called = true; } }, taskService });
  await assert.rejects(adapter.decide(created.taskId, { approvalId: "wrong", decision: "approved" }), { code: "TASK_APPROVAL_MISMATCH", statusCode: 409 });
  assert.equal(called, false);
});
