import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanExecutionArtifactAdapter } from "../server/preacherman-execution/preachermanExecutionArtifactAdapter.mjs";
import { createTaskService } from "../server/taskService.mjs";
import { createTaskStore } from "../server/taskStore.mjs";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(t, records, contentByName = {}) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-hr-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskService = createTaskService({ taskStore: createTaskStore({ file: join(directory, "tasks.json") }), createId: () => "artifact-task" });
  const created = await taskService.create({ objective: "Create evidence", execution: { kind: "preacherman-execution-dag", adapter: "preacherman-execution" } });
  await taskService.startAttempt(created.taskId, { provider: "preacherman-execution" });
  await taskService.linkExternalRun(created.taskId, { externalRunId: "run-artifacts", workflowId: "wf", workflowRevision: 1, canonicalHash: "a".repeat(64) });
  const contentCalls = [];
  const adapter = createPreachermanExecutionArtifactAdapter({
    client: {
      runArtifacts: async () => ({ artifacts: records }),
      artifactContent: async (runId, name, options) => {
        contentCalls.push({ runId, name, options });
        const record = records.find((candidate) => candidate.name === name);
        const bytes = contentByName[name] ?? Buffer.from("artifact-content");
        return new Response(bytes, { status: 200, headers: { "Content-Type": record?.media_type ?? "application/octet-stream", "Content-Length": String(bytes.byteLength) } });
      },
    },
    taskService,
    cacheDirectory: join(directory, "artifact-cache"),
  });
  return { adapter, contentCalls, taskId: created.taskId, taskService };
}

test("all Preacherman Execution artifacts validate, project once, and keep a canonical primary alias", async (t) => {
  const summary = Buffer.from("summary-content");
  const evidence = Buffer.from('{"verified":true}\n');
  const records = [
    { artifact_id: "summary", run_id: "run-artifacts", name: "summary.md", status: "ready", media_type: "text/markdown", required: true, size_bytes: summary.byteLength, sha256: digest(summary) },
    { artifact_id: "evidence", run_id: "run-artifacts", name: "evidence.json", status: "ready", media_type: "application/json", required: false, size_bytes: evidence.byteLength, sha256: digest(evidence) },
  ];
  const { adapter, taskId, taskService, contentCalls } = await fixture(t, records, { "summary.md": summary, "evidence.json": evidence });
  assert.equal((await adapter.sync(taskId)).gate, "ready");
  const eventCount = (await taskService.get(taskId)).events.length;
  await adapter.sync(taskId);
  const task = await taskService.get(taskId);
  assert.equal(task.artifacts.length, 2);
  assert.equal(task.artifact.artifactId, "summary");
  assert.equal(task.artifact.contentPath, `/api/tasks/${taskId}/artifacts/summary/content`);
  assert.equal(task.events.length, eventCount);
  assert.equal(contentCalls.length, 2, "the second sync reuses the verified private copies");
  assert.ok(task.artifacts.every((artifact) => artifact.validatedAt && artifact.cacheKey));
});

test("required artifact failure blocks completion and verified cache preserves Range", async (t) => {
  const failed = [{ artifact_id: "required", run_id: "run-artifacts", name: "required.json", status: "failed", media_type: "application/json", required: true, error: { code: "upload_failed", message: "Upload failed" } }];
  const first = await fixture(t, failed);
  assert.equal((await first.adapter.sync(first.taskId)).gate, "failed");

  const bytes = Buffer.from("0123456789abcdef");
  const ready = [{ artifact_id: "ready", run_id: "run-artifacts", name: "ready.txt", status: "ready", media_type: "text/plain", required: true, size_bytes: bytes.byteLength, sha256: digest(bytes) }];
  const second = await fixture(t, ready, { "ready.txt": bytes });
  await second.adapter.sync(second.taskId);
  const response = await second.adapter.content(second.taskId, "ready", { range: "bytes=0-15" });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "0123456789abcdef");
  assert.equal(response.headers.get("etag"), `"${digest(bytes)}"`);
  assert.deepEqual(second.contentCalls, [{ runId: "run-artifacts", name: "ready.txt", options: {} }]);
});

test("ready artifacts fail closed on hash, size, media type, and invalid range mismatches", async (t) => {
  const bytes = Buffer.from("trusted bytes");
  const mismatchedHash = [{ artifact_id: "hash", name: "hash.txt", status: "ready", media_type: "text/plain", required: true, size_bytes: bytes.byteLength, sha256: "0".repeat(64) }];
  const hashFixture = await fixture(t, mismatchedHash, { "hash.txt": bytes });
  assert.equal((await hashFixture.adapter.sync(hashFixture.taskId)).gate, "failed");
  assert.equal((await hashFixture.taskService.get(hashFixture.taskId)).artifacts[0].error.code, "PREACHERMAN_EXECUTION_ARTIFACT_HASH_MISMATCH");

  const badSize = [{ artifact_id: "size", name: "size.txt", status: "ready", media_type: "text/plain", required: true, size_bytes: bytes.byteLength + 1, sha256: digest(bytes) }];
  const sizeFixture = await fixture(t, badSize, { "size.txt": bytes });
  assert.equal((await sizeFixture.adapter.sync(sizeFixture.taskId)).gate, "failed");
  assert.equal((await sizeFixture.taskService.get(sizeFixture.taskId)).artifacts[0].error.code, "PREACHERMAN_EXECUTION_ARTIFACT_SIZE_MISMATCH");

  const badMedia = [{ artifact_id: "html", name: "page.html", status: "ready", media_type: "text/html", required: true, size_bytes: bytes.byteLength, sha256: digest(bytes) }];
  const mediaFixture = await fixture(t, badMedia, { "page.html": bytes });
  assert.equal((await mediaFixture.adapter.sync(mediaFixture.taskId)).gate, "failed");
  assert.equal(mediaFixture.contentCalls.length, 0, "rejected metadata is never fetched");

  const valid = [{ artifact_id: "range", name: "range.txt", status: "ready", media_type: "text/plain", required: true, size_bytes: bytes.byteLength, sha256: digest(bytes) }];
  const rangeFixture = await fixture(t, valid, { "range.txt": bytes });
  await rangeFixture.adapter.sync(rangeFixture.taskId);
  const unsatisfied = await rangeFixture.adapter.content(rangeFixture.taskId, "range", { range: "bytes=999-1000" });
  assert.equal(unsatisfied.status, 416);
  assert.equal(unsatisfied.headers.get("content-range"), `bytes */${bytes.byteLength}`);
});
