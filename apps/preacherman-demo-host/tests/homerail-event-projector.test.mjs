import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHomeRailEventProjector } from "../server/homerail/homeRailEventProjector.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

async function taskFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-events-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }), createId: () => "event-task" });
  const task = await taskService.create({ objective: "Complex execution", execution: { kind: "homerail-dag", adapter: "homerail" } });
  await taskService.startAttempt(task.taskId, { provider: "homerail" });
  await taskService.linkExternalRun(task.taskId, { externalRunId: "run-1", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  return { taskService, taskId: task.taskId };
}

test("event projection keeps user milestones, evidence references, cursor, and duplicate count zero", async (t) => {
  const { taskService, taskId } = await taskFixture(t);
  const projector = createHomeRailEventProjector({ taskService });
  const history = { events: [
    { type: "dag:engine_started", timestamp: "2026-08-11T00:00:00.000Z", details: {} },
    { type: "dag:message_sent", timestamp: "2026-08-11T00:00:01.000Z", details: { content: "raw private chatter" } },
    { type: "dag:fanout_started", timestamp: "2026-08-11T00:00:02.000Z", details: {} },
    { type: "dag:fanout_completed", timestamp: "2026-08-11T00:00:03.000Z", details: {} },
  ] };
  await projector.projectHistory(taskId, "run-1", history);
  await projector.projectHistory(taskId, "run-1", history);
  const task = await taskService.get(taskId);
  const projected = task.events.filter((event) => event.type.startsWith("homerail."));
  assert.deepEqual(projected.map((event) => event.type), ["homerail.engine_started", "homerail.fanout_started", "homerail.fanout_completed"]);
  assert.equal(task.attempts[0].eventCursor, 4);
  assert.doesNotMatch(JSON.stringify(task), /raw private chatter/);
  assert.equal(new Set(projected.map((event) => event.sourceId)).size, projected.length);
});

test("status projection maps waiting and terminal states without terminal rollback", async (t) => {
  const { taskService, taskId } = await taskFixture(t);
  const projector = createHomeRailEventProjector({ taskService });
  assert.equal((await projector.projectStatus(taskId, { status: "waiting" })).status, "waiting_for_input");
  assert.equal((await projector.projectStatus(taskId, { status: "completed" })).status, "succeeded");
  assert.equal((await projector.projectStatus(taskId, { status: "active" })).status, "succeeded");
});

test("approval_requested becomes one Preacherman-owned pending approval", async (t) => {
  const { taskService, taskId } = await taskFixture(t);
  const projector = createHomeRailEventProjector({ taskService });
  const history = { events: [{
    type: "dag:approval_requested",
    timestamp: "2026-08-11T00:00:00.000Z",
    details: { runId: "run-1", nodeId: "publish", approvalId: "approval-1", proposalHash: "sha256:proposal" },
  }] };
  await projector.projectHistory(taskId, "run-1", history);
  await projector.projectHistory(taskId, "run-1", history);
  const task = await taskService.get(taskId);
  assert.equal(task.status, "waiting_for_approval");
  assert.equal(task.pendingApproval.approvalId, "approval-1");
  assert.equal(task.pendingApproval.proposalHash, "sha256:proposal");
  assert.equal(task.events.filter((event) => event.type === "approval_requested").length, 1);
});

test("event content fingerprints tolerate inserted and reordered history without duplicates", async (t) => {
  const { taskService, taskId } = await taskFixture(t);
  const projector = createHomeRailEventProjector({ taskService });
  const started = { type: "dag:engine_started", timestamp: "2026-08-11T00:00:00.000Z", details: {} };
  const fanout = { type: "dag:fanout_started", timestamp: "2026-08-11T00:00:01.000Z", details: { batch: "one" } };
  const completed = { type: "dag:fanout_completed", timestamp: "2026-08-11T00:00:02.000Z", details: {} };
  await projector.projectHistory(taskId, "run-1", { events: [started, completed] });
  await projector.projectHistory(taskId, "run-1", { events: [completed, fanout, started] });
  const task = await taskService.get(taskId);
  const projected = task.events.filter((event) => event.type.startsWith("homerail."));
  assert.deepEqual(projected.map((event) => event.type), ["homerail.engine_started", "homerail.fanout_completed", "homerail.fanout_started"]);
  assert.equal(new Set(projected.map((event) => event.sourceId)).size, 3);
  assert.equal(task.attempts[0].eventCursor, 3);
});

test("replaying an approved history event cannot reopen the approval", async (t) => {
  const { taskService, taskId } = await taskFixture(t);
  const projector = createHomeRailEventProjector({ taskService });
  const event = {
    type: "dag:approval_requested",
    timestamp: "2026-08-11T00:00:00.000Z",
    details: { runId: "run-1", nodeId: "publish", approvalId: "approval-1", proposalHash: "sha256:proposal" },
  };
  await projector.projectHistory(taskId, "run-1", { events: [event] });
  await taskService.resolveApproval(taskId, { approvalId: "approval-1", proposalHash: "sha256:proposal", decision: "approved" });
  await projector.projectHistory(taskId, "run-1", { events: [event] });
  const task = await taskService.get(taskId);
  assert.equal(task.pendingApproval, null);
  assert.equal(task.approvalHistory.length, 1);
  assert.equal(task.events.filter((candidate) => candidate.type === "approval_requested").length, 1);
});
