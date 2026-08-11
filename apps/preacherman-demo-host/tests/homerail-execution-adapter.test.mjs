import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHomeRailExecutionAdapter } from "../server/homerail/homeRailExecutionAdapter.mjs";
import { createHomeRailLinkStore } from "../server/homerail/homeRailLinkStore.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

async function setup(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-homerail-adapter-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskStore = createTaskStore({ file: join(directory, "tasks.json") });
  const taskService = createTaskService({ taskStore, createId: () => "task-1" });
  const linkStore = createHomeRailLinkStore({ file: join(directory, "links.json") });
  const calls = [];
  const client = {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 1, connected_nodes: 1 }),
    workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 2, canonical_hash: "a5ea80a2755e94d5e77819507502d4a4f747e72ec3e68d3618f2eebf66c486e2" }),
    profiles: async () => ({ profiles: [{ profile_id: "local-main" }] }),
    createAndRun: async (body) => { calls.push(body); return { run_id: body.runId }; },
    ...overrides,
  };
  const adapter = createHomeRailExecutionAdapter({ client, taskService, linkStore, profile: "local-main" });
  return { adapter, calls, linkStore, taskService };
}

test("HomeRail adapter creates one revision-pinned Attempt and reuses the idempotent link", async (t) => {
  const { adapter, calls, taskService } = await setup(t);
  const task = await taskService.create({ objective: "Research in parallel and independently verify" , execution: { kind: "homerail-dag", adapter: "homerail" } });
  const started = await adapter.start(task.taskId, { idempotencyKey: "proposal-1:revision-1" });
  const repeated = await adapter.start(task.taskId, { idempotencyKey: "proposal-1:revision-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workflow_revision, 2);
  assert.equal(calls[0].canonical_hash, "a5ea80a2755e94d5e77819507502d4a4f747e72ec3e68d3618f2eebf66c486e2");
  assert.equal(started.task.attempts.length, 1);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.task.taskId, task.taskId);
});

test("HomeRail adapter reports configuration-required and does not create a fake Attempt", async (t) => {
  const { adapter, taskService } = await setup(t, {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
    profiles: async () => ({ profiles: [] }),
  });
  const task = await taskService.create({ objective: "Complex objective", execution: { kind: "homerail-dag", adapter: "homerail" } });
  assert.equal((await adapter.status()).state, "configuration-required");
  await assert.rejects(adapter.start(task.taskId, { idempotencyKey: "proposal-2" }), { code: "HOMERAIL_CONFIGURATION_REQUIRED", statusCode: 409 });
  assert.equal((await taskService.get(task.taskId)).attempts.length, 0);
});

test("HomeRail adapter treats zero idle workers as ready when a Node and profile are available", async (t) => {
  const { adapter } = await setup(t, {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
  });
  const status = await adapter.status();
  assert.equal(status.state, "ready");
  assert.equal(status.runtime.connectedWorkers, 0);
  assert.equal(status.runtime.connectedNodes, 1);
  assert.equal(status.profile, "local-main");
});

test("HomeRail adapter still blocks when no execution Node can dispatch a Worker", async (t) => {
  const { adapter } = await setup(t, {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 0 }),
  });
  const status = await adapter.status();
  assert.equal(status.state, "configuration-required");
  assert.match(status.message, /execution node/i);
});

test("HomeRail adapter fails closed when revision or canonical hash drifts", async (t) => {
  const { adapter } = await setup(t, {
    workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: "b".repeat(64) }),
  });
  const status = await adapter.status();
  assert.equal(status.state, "configuration-required");
  assert.match(status.message, /revision 2/i);
  assert.match(status.message, /canonical hash/i);
  assert.equal(status.workflow.expectedRevision, 2);
});

test("HomeRail adapter never auto-selects an arbitrary available runtime profile", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-homerail-profile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }) });
  const adapter = createHomeRailExecutionAdapter({
    client: {
      runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
      workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 2, canonical_hash: "a5ea80a2755e94d5e77819507502d4a4f747e72ec3e68d3618f2eebf66c486e2" }),
      profiles: async () => ({ profiles: [{ profile_id: "arbitrary-first-profile" }] }),
    },
    taskService,
    linkStore: createHomeRailLinkStore({ file: join(directory, "links.json") }),
  });
  const status = await adapter.status();
  assert.equal(status.state, "configuration-required");
  assert.match(status.message, /PREACHERMAN_HOMERAIL_PROFILE/);
  assert.equal(status.profile, undefined);
});

test("provider diagnostics expose only a credential-free Manager origin", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-homerail-manager-summary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const adapter = createHomeRailExecutionAdapter({
    client: {
      runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
      workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 2, canonical_hash: "a5ea80a2755e94d5e77819507502d4a4f747e72ec3e68d3618f2eebf66c486e2" }),
      profiles: async () => ({ profiles: [{ profile_id: "local-main" }] }),
    },
    taskService: createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }) }),
    linkStore: createHomeRailLinkStore({ file: join(directory, "links.json") }),
    profile: "local-main",
    managerUrl: "https://user:password@manager.example:19443/private?token=secret",
    now: () => "2026-08-12T00:00:00.000Z",
  });
  const status = await adapter.status();
  assert.equal(status.connection.managerAddress, "https://manager.example:19443");
  assert.equal(status.connection.lastConnectedAt, "2026-08-12T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(status), /user|password|private|token|secret/i);
});

test("HomeRail link conflicts fail closed", async (t) => {
  const { linkStore } = await setup(t);
  await linkStore.save({ taskId: "task-a", externalRunId: "run-a", idempotencyKey: "same" });
  await assert.rejects(linkStore.save({ taskId: "task-b", externalRunId: "run-b", idempotencyKey: "same" }), { code: "HOMERAIL_LINK_CONFLICT", statusCode: 409 });
});
