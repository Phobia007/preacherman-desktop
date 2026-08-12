import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTaskStore } from "../server/taskStore.mjs";

function legacyTask(overrides = {}) {
  return {
    taskId: "run_legacy",
    runId: "run_legacy",
    objective: "Create a launch brief",
    executor: "pitchkit",
    revision: 1,
    status: "succeeded",
    events: [{ sequence: 1, revision: 1, type: "completed", stage: "terminal", message: "Done", at: "2026-08-01T00:00:00.000Z" }],
    artifact: { name: "pitch.md", path: "D:/artifacts/pitch.md", mediaType: "text/markdown" },
    error: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:01:00.000Z",
    ...overrides,
  };
}

test("TaskStore migrates v1 tasks to canonical v2 without losing the legacy primary artifact", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-task-v2-"));
  const file = join(directory, "task-store.v2.json");
  const legacyFile = join(directory, "task-store.v1.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(legacyFile, JSON.stringify({ version: 1, tasks: [legacyTask()] }));

  const store = createTaskStore({ file, legacyFiles: [legacyFile] });
  const task = await store.get("run_legacy");
  assert.deepEqual(task.execution, { kind: "local-pitch", adapter: "pitchkit" });
  assert.equal(task.attempts[0].provider, "local");
  assert.equal(task.attempts[0].status, "completed");
  assert.equal(task.artifacts.length, 1);
  assert.equal(task.artifacts[0].contentPath, "D:/artifacts/pitch.md");
  assert.equal(task.artifact.path, "D:/artifacts/pitch.md");
  assert.equal(JSON.parse(await readFile(file, "utf8")).version, 2);
});

test("restart fails interrupted local work but preserves Preacherman Execution work for reconciliation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-task-recovery-"));
  const file = join(directory, "task-store.v2.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(file, JSON.stringify({
    version: 2,
    tasks: [
      legacyTask({ taskId: "local", runId: "local", status: "running", artifact: null }),
      legacyTask({
        taskId: "external",
        runId: "external",
        status: "running",
        artifact: null,
        execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution", workflowId: "preacherman-complex-task-v1" },
        attempts: [{ attempt: 1, provider: "preacherman-execution", externalRunId: "hr_1", status: "active", startedAt: "2026-08-01T00:00:00.000Z" }],
      }),
    ],
  }));

  const store = createTaskStore({ file, now: () => "2026-08-11T00:00:00.000Z" });
  assert.equal((await store.get("local")).status, "failed");
  const external = await store.get("external");
  assert.equal(external.status, "running");
  assert.equal(external.recoveryPending, true);
  assert.equal(external.events.at(-1).type, "recovery_pending");
});
