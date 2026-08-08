import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AIRI_PLUGIN_TASK_BINDING,
  createAiriPluginTaskBinding,
} from "../server/airiPluginTaskBinding.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

const context = { pluginId: "demo-plugin", toolName: "build_report" };

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-plugin-binding-"));
  const file = join(directory, "task-store.v1.json");
  let id = 0;
  let tick = 0;
  const now = () => `2026-08-08T00:00:${String(tick++).padStart(2, "0")}.000Z`;
  const taskStore = createTaskStore({ file, now });
  const binding = createAiriPluginTaskBinding({ taskStore, now, createId: () => `test-${++id}` });
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  return { binding, directory, file, now, taskStore };
}

test("binding exposes a registry-ready task and ledger contract", async () => {
  assert.equal(AIRI_PLUGIN_TASK_BINDING.id, "preacherman.task-ledger");
  assert.deepEqual(AIRI_PLUGIN_TASK_BINDING.kits, ["task", "ledger"]);
  assert.ok(AIRI_PLUGIN_TASK_BINDING.operations.includes("complete-with-artifact"));
});

test("create, progress, and completion persist a structured TaskRun artifact and Ledger result", async (t) => {
  const { binding, file, now } = await fixture(t);
  const created = await binding.execute("create", {
    objective: "Build a factual launch report",
    parameters: { audience: "operators", sections: 3 },
  }, context);

  assert.equal(created.task.status, "queued");
  assert.equal(created.task.taskId, "plugin_test-1");
  assert.deepEqual(created.ledger.parameterSummary.keys, ["audience", "sections"]);
  assert.equal(created.ledger.structuredResult, null);

  const running = await binding.execute("progress", {
    taskId: created.task.taskId,
    value: 0.4,
    stage: "researching",
    message: "Reading verified sources.",
  }, context);
  assert.equal(running.task.status, "running");
  assert.equal(running.task.progress.value, 0.4);
  assert.deepEqual(running.task.events.map((event) => event.type), ["accepted", "started", "progress"]);

  const completed = await binding.execute("complete-with-artifact", {
    taskId: created.task.taskId,
    result: { sourceCount: 2, confidence: "verified" },
    artifact: {
      name: "launch-report.json",
      mediaType: "application/json",
      content: { title: "Launch report", findings: ["Local-first", "Auditable"] },
    },
  }, context);
  assert.equal(completed.task.status, "completed");
  assert.equal(completed.ledger.status, "completed");
  assert.deepEqual(completed.ledger.structuredResult, { sourceCount: 2, confidence: "verified" });
  assert.equal(completed.ledger.artifact.path, `/api/tasks/${encodeURIComponent(created.task.taskId)}/artifact`);
  assert.deepEqual(completed.ledger.artifact.content.findings, ["Local-first", "Auditable"]);
  assert.deepEqual(completed.task.events.map((event) => event.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(completed.task.events.slice(-2).map((event) => event.type), ["progress", "completed"]);

  const persisted = JSON.parse(await readFile(file, "utf8"));
  assert.equal(persisted.tasks[0].status, "succeeded");
  assert.equal(persisted.tasks[0].toolCall.name, "build_report");
  assert.deepEqual(persisted.tasks[0].artifact.content, completed.ledger.artifact.content);
  assert.doesNotMatch(await readFile(file, "utf8"), /operators/);

  const restartedStore = createTaskStore({ file, now });
  const restartedBinding = createAiriPluginTaskBinding({ taskStore: restartedStore, now });
  const recovered = await restartedBinding.execute("status", { taskId: created.task.taskId }, context);
  assert.equal(recovered.task.status, "completed");
  assert.deepEqual(recovered.ledger.artifact.content, completed.ledger.artifact.content);
});

test("cancel is durable and prevents a late completion from writing an artifact", async (t) => {
  const { binding, taskStore } = await fixture(t);
  const created = await binding.execute("create", {
    objective: "Generate a cancellable report",
    parameters: {},
  }, context);
  await binding.execute("progress", {
    taskId: created.task.taskId,
    value: 0.2,
    stage: "working",
    message: "Work started.",
  }, context);

  const cancelled = await binding.execute("cancel", {
    taskId: created.task.taskId,
    reason: "User cancelled the plugin task.",
  }, context);
  assert.equal(cancelled.task.status, "cancelled");
  assert.equal(cancelled.task.retryable, true);
  assert.equal(cancelled.task.events.at(-1).type, "cancelled");

  await assert.rejects(
    binding.execute("complete-with-artifact", {
      taskId: created.task.taskId,
      result: { late: true },
      artifact: { name: "late.json", content: { late: true } },
    }, context),
    (error) => error.statusCode === 409 && error.code === "task_terminal",
  );
  const persisted = await taskStore.get(created.task.taskId);
  assert.equal(persisted.status, "cancelled");
  assert.equal(persisted.artifact, null);
  assert.equal(persisted.toolCall.structuredResult, null);
});

test("failed plugin TaskRuns retry as a new queued attempt", async (t) => {
  const { binding, taskStore } = await fixture(t);
  const created = await binding.execute("create", {
    objective: "Run a retryable tool",
    parameters: { firstAttempt: true },
  }, context);
  const failed = await binding.execute("fail", {
    taskId: created.task.taskId,
    error: "Temporary provider failure.",
    result: { providerCode: "temporary_unavailable" },
  }, context);
  assert.equal(failed.task.status, "failed");
  assert.equal(failed.task.retryable, true);
  assert.deepEqual(failed.ledger.structuredResult, { providerCode: "temporary_unavailable" });

  const retried = await binding.execute("retry", {
    taskId: created.task.taskId,
    parameters: { firstAttempt: false },
  }, context);
  assert.equal(retried.task.status, "queued");
  assert.equal(retried.task.attempt, 2);
  assert.equal(retried.task.retryOf, created.task.taskId);
  assert.equal(retried.task.toolCall.name, "build_report");
  assert.notEqual(retried.task.taskId, created.task.taskId);
  assert.equal((await taskStore.list(10)).length, 2);
  assert.equal((await taskStore.get(created.task.taskId)).status, "failed");
});

test("parameters and structured artifact content enforce JSON type and size limits", async (t) => {
  const { binding, taskStore } = await fixture(t);
  await assert.rejects(
    binding.execute("create", {
      objective: "Reject invalid parameters",
      parameters: ["not", "an", "object"],
    }, context),
    /Tool parameters must be an object/,
  );
  await assert.rejects(
    binding.execute("create", {
      objective: "Reject non-JSON parameters",
      parameters: { createdAt: new Date() },
    }, context),
    /plain JSON objects/,
  );

  const created = await binding.execute("create", {
    objective: "Reject an oversized artifact",
    parameters: {},
  }, context);
  await assert.rejects(
    binding.execute("complete-with-artifact", {
      taskId: created.task.taskId,
      result: { ok: true },
      artifact: { name: "oversized.json", content: { data: "x".repeat(256 * 1024) } },
    }, context),
    /Artifact content exceeds 262144 bytes/,
  );
  const unchanged = await taskStore.get(created.task.taskId);
  assert.equal(unchanged.status, "queued");
  assert.equal(unchanged.artifact, null);
});
