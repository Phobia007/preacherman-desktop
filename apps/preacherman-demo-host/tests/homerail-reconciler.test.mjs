import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHomeRailEventProjector } from "../server/homerail/homeRailEventProjector.mjs";
import { createHomeRailReconciler } from "../server/homerail/homeRailReconciler.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

test("service restart reconciles a still-running HomeRail Attempt instead of failing it", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-reconcile-"));
  const file = join(directory, "tasks.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const firstService = createTaskService({ taskStore: createTaskStore({ file }), createId: () => "reconcile-task" });
  const created = await firstService.create({ objective: "Complex execution", execution: { kind: "homerail-dag", adapter: "homerail" } });
  await firstService.startAttempt(created.taskId, { provider: "homerail" });
  await firstService.linkExternalRun(created.taskId, { externalRunId: "run-recover", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });

  const restartedService = createTaskService({ taskStore: createTaskStore({ file }) });
  assert.equal((await restartedService.get(created.taskId)).recoveryPending, true);
  const projector = createHomeRailEventProjector({ taskService: restartedService });
  const reconciler = createHomeRailReconciler({
    client: {
      runStatus: async () => ({ status: "active", terminal: false }),
      runEvents: async () => ({ events: [{ type: "dag:engine_started", timestamp: "2026-08-11T00:00:00.000Z", details: {} }] }),
    },
    taskService: restartedService,
    eventProjector: projector,
  });
  await reconciler.reconcileAll();
  const recovered = await restartedService.get(created.taskId);
  assert.equal(recovered.status, "running");
  assert.equal(recovered.recoveryPending, false);
  assert.equal(recovered.attempts[0].eventCursor, 1);
});

test("temporary reconciliation failure preserves the active Task and records one evidence marker", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-reconcile-fail-"));
  const file = join(directory, "tasks.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file }), createId: () => "reconcile-fail" });
  const created = await taskService.create({ objective: "Complex execution", execution: { kind: "homerail-dag", adapter: "homerail" } });
  await taskService.startAttempt(created.taskId, { provider: "homerail" });
  await taskService.linkExternalRun(created.taskId, { externalRunId: "run-fail", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  const unavailable = async () => { throw Object.assign(new Error("offline"), { code: "HOMERAIL_UNREACHABLE" }); };
  const reconciler = createHomeRailReconciler({ client: { runStatus: unavailable, runEvents: unavailable }, taskService, eventProjector: createHomeRailEventProjector({ taskService }) });
  await reconciler.reconcileAll();
  await reconciler.reconcileAll();
  const task = await taskService.get(created.taskId);
  assert.equal(task.status, "running");
  assert.equal(task.events.filter((event) => event.type === "reconcile_deferred").length, 1);
});

test("completed HomeRail Run cannot succeed while a required artifact failed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-required-artifact-"));
  const file = join(directory, "tasks.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file }), createId: () => "required-artifact" });
  const created = await taskService.create({ objective: "Complex execution", execution: { kind: "homerail-dag", adapter: "homerail" } });
  await taskService.startAttempt(created.taskId, { provider: "homerail" });
  await taskService.linkExternalRun(created.taskId, { externalRunId: "run-required", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  const reconciler = createHomeRailReconciler({
    client: { runStatus: async () => ({ status: "completed" }), runEvents: async () => ({ events: [] }) },
    taskService,
    eventProjector: createHomeRailEventProjector({ taskService }),
    artifactAdapter: { sync: async () => ({ gate: "failed" }) },
  });
  await reconciler.reconcileAll();
  const task = await taskService.get(created.taskId);
  assert.equal(task.status, "failed");
  assert.equal(task.error.code, "HOMERAIL_REQUIRED_ARTIFACT_FAILED");
});

test("SSE wakes history reconciliation immediately and shutdown aborts the watcher", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-sse-wakeup-"));
  const file = join(directory, "tasks.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file }), createId: () => "sse-task" });
  const created = await taskService.create({ objective: "Complex execution", execution: { kind: "homerail-dag", adapter: "homerail" } });
  await taskService.startAttempt(created.taskId, { provider: "homerail" });
  await taskService.linkExternalRun(created.taskId, { externalRunId: "run-sse", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  let eventReads = 0;
  let wake;
  let aborted = false;
  const client = {
    runStatus: async () => ({ status: "active" }),
    runEvents: async () => { eventReads += 1; return { events: [] }; },
    watchRunEvents: async (_runId, { signal, onSignal }) => {
      wake = onSignal;
      await new Promise((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    },
  };
  const reconciler = createHomeRailReconciler({
    client,
    taskService,
    eventProjector: createHomeRailEventProjector({ taskService }),
    intervalMs: 60_000,
  });
  reconciler.start();
  for (let attempt = 0; attempt < 20 && !wake; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(typeof wake, "function");
  const before = eventReads;
  wake({ event: "dag:node_dispatched" });
  for (let attempt = 0; attempt < 20 && eventReads === before; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(eventReads > before, "an SSE signal must trigger an authoritative history read");
  reconciler.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(aborted, true);
});

test("temporary failures use bounded per-Run exponential backoff and reset on success", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-backoff-"));
  const file = join(directory, "tasks.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file }), createId: () => "backoff-task" });
  const created = await taskService.create({ objective: "Complex execution", execution: { kind: "homerail-dag", adapter: "homerail" } });
  await taskService.startAttempt(created.taskId, { provider: "homerail" });
  await taskService.linkExternalRun(created.taskId, { externalRunId: "run-backoff", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  let now = 1_000;
  let calls = 0;
  let available = false;
  const request = async (value) => { calls += 1; if (!available) throw Object.assign(new Error("offline"), { code: "HOMERAIL_UNREACHABLE" }); return value; };
  const reconciler = createHomeRailReconciler({
    client: { runStatus: () => request({ status: "active" }), runEvents: () => request({ events: [] }) },
    taskService,
    eventProjector: createHomeRailEventProjector({ taskService }),
    intervalMs: 100,
    maxBackoffMs: 250,
    maxConsecutiveFailures: 3,
    clock: () => now,
  });
  const task = await taskService.get(created.taskId);
  await reconciler.reconcileTask(task);
  assert.deepEqual(reconciler.recoveryState().map(({ consecutiveFailures, retryAfterMs, nextAt }) => ({ consecutiveFailures, retryAfterMs, nextAt })), [{ consecutiveFailures: 1, retryAfterMs: 100, nextAt: 1_100 }]);
  await reconciler.reconcileTask(task);
  assert.equal(calls, 2, "backoff must skip both status and history requests before nextAt");
  now = 1_100;
  await reconciler.reconcileTask(task);
  assert.equal(reconciler.recoveryState()[0].retryAfterMs, 200);
  now = 1_250;
  await reconciler.reconcileTask(task);
  assert.equal(calls, 4, "second backoff window must still suppress network requests");
  now = 1_300;
  available = true;
  await reconciler.reconcileTask(task);
  assert.deepEqual(reconciler.recoveryState(), []);
  assert.equal((await taskService.get(created.taskId)).status, "running");
});
