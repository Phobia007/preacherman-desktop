import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanExecutionCommandAdapter } from "../server/preacherman-execution/preachermanExecutionCommandAdapter.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

async function fixture(t, cancelRun) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-command-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }), createId: () => "command-task" });
  const task = await taskService.create({ objective: "Complex execution", execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution" } });
  await taskService.startAttempt(task.taskId, { provider: "preacherman-execution" });
  await taskService.linkExternalRun(task.taskId, { externalRunId: "run-cancel", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  return { taskService, taskId: task.taskId, adapter: createPreachermanExecutionCommandAdapter({ client: { cancelRun }, taskService }) };
}

test("cancel only marks the parent Task cancelled after Preacherman Execution confirms", async (t) => {
  let calls = 0;
  const { adapter, taskId } = await fixture(t, async () => { calls += 1; return { cancelled: true }; });
  assert.equal((await adapter.cancel(taskId)).task.status, "cancelled");
  assert.equal((await adapter.cancel(taskId)).reused, true);
  assert.equal(calls, 1);
});

test("a failed cancel stays pending and never pretends execution stopped", async (t) => {
  const error = Object.assign(new Error("Manager unavailable"), { code: "PREACHERMAN_EXECUTION_UNREACHABLE", statusCode: 503 });
  const { adapter, taskService, taskId } = await fixture(t, async () => { throw error; });
  await assert.rejects(adapter.cancel(taskId), { code: "PREACHERMAN_EXECUTION_UNREACHABLE" });
  const task = await taskService.get(taskId);
  assert.equal(task.status, "running");
  assert.equal(task.cancellationPending, true);
  assert.equal(task.events.at(-1).type, "cancel_pending");
});

test("waiting input is fenced to the current round and resumes without storing the text", async (t) => {
  const commands = [];
  const { taskService, taskId } = await fixture(t, async () => ({ cancelled: true }));
  await taskService.transition(taskId, "waiting_for_input", { event: { type: "waiting", stage: "waiting", message: "Need input" } });
  const adapter = createPreachermanExecutionCommandAdapter({
    client: {
      runStatus: async () => ({ status: "waiting", current_round: { round_id: "round-2", target_actor_ids: ["researcher"] } }),
      sendCommands: async (_runId, body) => { commands.push(body); return { deduplicated: false }; },
    },
    taskService,
  });
  const result = await adapter.sendInput(taskId, "Focus on verified public evidence.", { mode: "resume" });
  assert.equal(result.task.status, "running");
  assert.equal(commands[0].expected_round_id, "round-2");
  assert.equal(commands[0].commands[0].actor_id, "researcher");
  assert.doesNotMatch(JSON.stringify(result.task), /Focus on verified public evidence/);
  assert.match(commands[0].commands[0].payload.user_input, /verified public evidence/);
});
