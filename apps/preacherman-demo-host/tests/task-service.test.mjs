import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-task-service-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let tick = 0;
  const now = () => `2026-08-11T00:00:${String(tick++).padStart(2, "0")}.000Z`;
  const taskStore = createTaskStore({ file: join(directory, "task-store.v2.json"), now });
  const taskService = createTaskService({ taskStore, now, createId: (() => { let id = 0; return () => String(++id); })() });
  return { taskStore, taskService };
}

test("TaskService keeps one parent task while linking a revision-pinned Preacherman Execution attempt", async (t) => {
  const { taskService } = await fixture(t);
  const task = await taskService.create({
    objective: "Research and verify three launch options",
    execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution", workflowId: "preacherman-complex-task-v1" },
  });
  assert.equal(task.attempts.length, 0);
  await taskService.startAttempt(task.taskId, { provider: "preacherman-execution" });
  const linked = await taskService.linkExternalRun(task.taskId, {
    externalRunId: "hr_run_1",
    eventCursor: 0,
    workflowId: "preacherman-complex-task-v1",
    workflowRevision: 1,
    canonicalHash: "98acde13360a4f0d1c11a9024f238c1fbd2256517d6900d3e1871c70462c90de",
  });
  assert.equal(linked.taskId, task.taskId);
  assert.equal(linked.status, "running");
  assert.equal(linked.attempts.length, 1);
  assert.equal(linked.attempts[0].externalRunId, "hr_run_1");
  assert.equal(linked.execution.workflowRevision, 1);
});

test("TaskService de-duplicates projected events and artifacts", async (t) => {
  const { taskService } = await fixture(t);
  const task = await taskService.create({ objective: "Collect evidence" });
  await taskService.startAttempt(task.taskId, { provider: "local", status: "active" });
  await taskService.appendEvent(task.taskId, { type: "progress", stage: "executing", message: "Collected source A" }, { sourceId: "event-7" });
  await taskService.appendEvent(task.taskId, { type: "progress", stage: "executing", message: "Duplicate" }, { sourceId: "event-7" });
  await taskService.addArtifact(task.taskId, { artifactId: "report", name: "report.json", mediaType: "application/json", path: "/api/report", content: { version: 1 } });
  await taskService.addArtifact(task.taskId, { artifactId: "report", name: "report.json", mediaType: "application/json", path: "/api/report", content: { version: 2 } });
  const stored = await taskService.get(task.taskId);
  assert.equal(stored.events.filter((event) => event.sourceId === "event-7").length, 1);
  assert.equal(stored.artifacts.length, 1);
  assert.deepEqual(stored.artifact.content, { version: 2 });
});

test("TaskService owns approval hash validation and idempotent decisions", async (t) => {
  const { taskService } = await fixture(t);
  const task = await taskService.create({ objective: "Publish a reviewed result" });
  await taskService.startAttempt(task.taskId, { provider: "preacherman-execution", status: "active" });
  const waiting = await taskService.requestApproval(task.taskId, {
    approvalId: "approval-1",
    proposalHash: "sha256:abc",
    title: "Publish result",
    description: "Allow the verified result to be published.",
  });
  assert.equal(waiting.status, "waiting_for_approval");
  await assert.rejects(
    taskService.resolveApproval(task.taskId, { approvalId: "approval-1", proposalHash: "sha256:wrong", decision: "approved" }),
    { code: "TASK_APPROVAL_MISMATCH", statusCode: 409 },
  );
  const approved = await taskService.resolveApproval(task.taskId, { approvalId: "approval-1", proposalHash: "sha256:abc", decision: "approved", actor: "acceptance-reviewer" });
  assert.equal(approved.status, "running");
  assert.equal(approved.approvalHistory[0].actor, "acceptance-reviewer");
  assert.equal(approved.approvalHistory[0].proposalHash, "sha256:abc");
  assert.ok(approved.approvalHistory[0].requestedAt);
  assert.ok(approved.approvalHistory[0].decidedAt);
  assert.equal((await taskService.resolveApproval(task.taskId, { approvalId: "approval-1", proposalHash: "sha256:abc", decision: "approved" })).status, "running");
});

test("retry adds a new attempt to the same TaskRun", async (t) => {
  const { taskService } = await fixture(t);
  const task = await taskService.create({ objective: "Execute a complex workflow" });
  await taskService.startAttempt(task.taskId, { provider: "local", status: "active" });
  await taskService.transition(task.taskId, "failed", { error: { code: "EXECUTION_FAILED", message: "Worker failed", retryable: true } });
  const retried = await taskService.retry(task.taskId, { provider: "preacherman-execution" });
  assert.equal(retried.taskId, task.taskId);
  assert.equal(retried.attempts.length, 2);
  assert.equal(retried.attempts[1].attempt, 2);
  assert.equal(retried.status, "queued");
});
