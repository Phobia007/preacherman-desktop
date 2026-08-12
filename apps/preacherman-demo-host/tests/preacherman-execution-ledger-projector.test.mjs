import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanExecutionLedgerProjector } from "../server/preacherman-execution/preachermanExecutionLedgerProjector.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

test("Ledger Projector is the user-safe milestone and artifact evidence entry point", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-ledger-projector-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }), createId: () => "ledger-task" });
  const task = await taskService.create({ objective: "Complex objective", execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution" } });
  await taskService.startAttempt(task.taskId, { provider: "preacherman-execution" });
  await taskService.linkExternalRun(task.taskId, { externalRunId: "run-ledger", workflowId: "wf", workflowRevision: 2, canonicalHash: "a".repeat(64) });
  const projector = createPreachermanExecutionLedgerProjector({
    taskService,
    eventProjector: {
      projectHistory: async (taskId, externalRunId) => taskService.appendEvent(taskId, {
        type: "preacherman-execution.engine_started", stage: "preparing", message: "Preparing execution.",
        evidence: { provider: "preacherman-execution", externalRunId, sourceEvent: "engine_started", sourceIndex: 0 },
      }, { sourceId: `${externalRunId}:event:one` }),
    },
    artifactAdapter: {
      sync: async (taskId) => {
        await taskService.addArtifact(taskId, {
          artifactId: "plan", provider: "preacherman-execution", externalRunId: "run-ledger", name: "plan.json",
          mediaType: "application/json", status: "ready", sha256: "b".repeat(64), sizeBytes: 42,
          contentPath: `/api/tasks/${taskId}/artifacts/plan/content`, primary: true,
        });
        return { gate: "ready" };
      },
    },
  });
  await projector.projectHistory(task.taskId, "run-ledger", { events: [{ details: { raw: "worker chat" } }] });
  await projector.projectArtifacts(task.taskId);
  const evidence = await projector.evidence(task.taskId);
  assert.equal(evidence.attempts[0].externalRunId, "run-ledger");
  assert.equal(evidence.milestones[0].evidence.sourceEvent, "engine_started");
  assert.equal(evidence.artifacts[0].sha256, "b".repeat(64));
  assert.doesNotMatch(JSON.stringify(evidence), /worker chat|contentPath/);
});
