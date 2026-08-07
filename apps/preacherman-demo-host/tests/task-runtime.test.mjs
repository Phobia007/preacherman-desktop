import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

async function listen(service) {
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

async function waitForTask(baseUrl, taskId, expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { body } = await request(baseUrl, `/api/tasks/${taskId}`);
    if (body.task?.status === expected) return body.task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Task did not reach ${expected}.`);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function pitchFetch(firstGeneration, generationStarted) {
  let generations = 0;
  return async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.max_tokens === 600) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ message: "Ready to run.", action: "propose_task" }) } }],
      }), { status: 200 });
    }
    generations += 1;
    if (generations === 1) {
      generationStarted.resolve();
      await firstGeneration.promise;
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "invalid pitch" } }] }), { status: 200 });
  };
}

async function createBlockedTask(baseUrl) {
  const turn = await request(baseUrl, "/api/agent/turn", {
    method: "POST",
    body: JSON.stringify({ input: "Create a product pitch", locale: "en" }),
  });
  assert.equal(turn.response.status, 200);
  const confirmed = await request(baseUrl, `/api/agent/proposals/${turn.body.proposal.proposalId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ objective: "Create the original pitch" }),
  });
  assert.equal(confirmed.response.status, 202);
  return confirmed.body.run;
}

test("TaskRun persists, restarts stale revisions, and remains readable through the legacy route", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-task-runtime-"));
  const firstGeneration = deferred();
  const generationStarted = deferred();
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir, DEEPSEEK_API_KEY: "test-key" },
    fetchImpl: pitchFetch(firstGeneration, generationStarted),
  });
  const baseUrl = await listen(service);
  t.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

  const run = await createBlockedTask(baseUrl);
  await generationStarted.promise;
  const steered = await request(baseUrl, `/api/tasks/${run.taskId}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "steer", objective: "Create a privacy-first local-storage pitch" }),
  });
  assert.equal(steered.response.status, 202);
  assert.equal(steered.body.task.revision, 2);
  assert.equal(steered.body.task.events.at(-1).type, "steered");
  firstGeneration.resolve();

  const completed = await waitForTask(baseUrl, run.taskId, "succeeded");
  assert.equal(completed.revision, 2);
  assert.deepEqual(completed.events.map((event) => event.sequence), completed.events.map((_, index) => index + 1));
  assert.ok(completed.events.some((event) => event.type === "revision_restarted"));
  assert.match(await readFile(completed.artifact.path, "utf8"), /privacy-first local-storage/);
  const recent = await request(baseUrl, "/api/tasks?limit=1");
  assert.equal(recent.response.status, 200);
  assert.equal(recent.body.tasks.length, 1);
  assert.equal(recent.body.tasks[0].taskId, run.taskId);
  assert.equal(recent.body.tasks[0].artifact.name, "pitch-kit.md");

  const storeFile = join(dataDir, "task-store.v1.json");
  const persisted = JSON.parse(await readFile(storeFile, "utf8"));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.tasks[0].status, "succeeded");
  if (process.platform !== "win32") assert.equal((await stat(storeFile)).mode & 0o777, 0o600);

  await service.close();
  const restarted = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const restartedUrl = await listen(restarted);
  t.after(async () => { await restarted.close(); });
  const recovered = await request(restartedUrl, `/api/tasks/${run.taskId}`);
  assert.equal(recovered.body.task.status, "succeeded");
  assert.equal(recovered.body.task.revision, 2);
  const legacy = await request(restartedUrl, `/api/agent/runs/${run.runId}`);
  assert.equal(legacy.response.status, 200);
  assert.equal(legacy.body.run.taskId, run.taskId);
});

test("TaskRun cancel is durable and prevents a late executor result from completing", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-task-cancel-"));
  const firstGeneration = deferred();
  const generationStarted = deferred();
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir, DEEPSEEK_API_KEY: "test-key" },
    fetchImpl: pitchFetch(firstGeneration, generationStarted),
  });
  const baseUrl = await listen(service);
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const run = await createBlockedTask(baseUrl);
  await generationStarted.promise;
  const cancelled = await request(baseUrl, `/api/tasks/${run.taskId}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "cancel" }),
  });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.command.accepted, true);
  assert.equal(cancelled.body.task.status, "cancelled");
  assert.equal(cancelled.body.task.events.at(-1).type, "cancelled");

  firstGeneration.resolve();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const task = await waitForTask(baseUrl, run.taskId, "cancelled");
  assert.equal(task.artifact, null);
  assert.equal(task.events.at(-1).type, "cancelled");
});

test("an active TaskRun is recovered as an interrupted retryable run after restart", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-task-interrupted-"));
  const taskId = "run_interrupted-test";
  const createdAt = "2026-08-07T00:00:00.000Z";
  await writeFile(join(dataDir, "task-store.v1.json"), JSON.stringify({
    version: 1,
    tasks: [{
      taskId,
      runId: taskId,
      proposalId: "proposal_interrupted-test",
      executor: "pitchkit",
      objective: "Interrupted task",
      revision: 1,
      status: "running",
      retryable: false,
      events: [{ sequence: 1, revision: 1, type: "started", stage: "reading", message: "Started", at: createdAt }],
      artifact: null,
      error: null,
      createdAt,
      updatedAt: createdAt,
    }],
  }));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const baseUrl = await listen(service);
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const recovered = await request(baseUrl, `/api/tasks/${taskId}`);
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.task.status, "failed");
  assert.equal(recovered.body.task.retryable, true);
  assert.equal(recovered.body.task.events.at(-1).type, "interrupted");
  assert.deepEqual(recovered.body.task.events.map((event) => event.sequence), [1, 2]);
});
