import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";
const workflowHash = "bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee";

function readyEnv(dataDirectory) {
  return { PREACHERMAN_DATA_DIR: dataDirectory, PREACHERMAN_HOMERAIL_PROFILE: "local-main" };
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

test("complex Proposal confirm creates one Preacherman Task and one HomeRail Attempt", async (t) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "preacherman-homerail-http-"));
  const launches = [];
  const homeRailClient = {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 1, connected_nodes: 1 }),
    workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: workflowHash }),
    workflows: async () => ({ workflows: [{ workflow_id: "preacherman-complex-task-v1", name: "Complex Task", description: "Pinned", head_revision: 3, canonical_hash: workflowHash, compiler_version: "6", yaml_text: "must not escape", source_path: "D:\\private" }] }),
    profiles: async () => ({ profiles: [{ profile_id: "local-main" }] }),
    createAndRun: async (body) => { launches.push(body); return { run_id: body.runId }; },
  };
  const service = createPreachermanServer({ env: readyEnv(dataDirectory), homeRailClient });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDirectory, { recursive: true, force: true }); });

  const provider = await request(baseUrl, "/api/execution/providers/status");
  assert.equal(provider.body.providers[0].state, "ready");
  assert.equal(provider.body.providers[0].connection.managerAddress, "http://127.0.0.1:19191");
  assert.match(provider.body.providers[0].connection.lastConnectedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(JSON.stringify(provider.body), /token|authorization|username|password|secret/i);
  const catalog = await request(baseUrl, "/api/execution/providers/homerail/workflows");
  assert.equal(catalog.body.workflows.length, 1);
  assert.equal(catalog.body.workflows[0].pinned, true);
  assert.doesNotMatch(JSON.stringify(catalog.body), /yaml_text|source_path|sourcePath/);

  const turn = await request(baseUrl, "/api/agent/turn", {
    method: "POST",
    body: JSON.stringify({ input: "Research three launch markets in parallel and independently verify the evidence", locale: "en" }),
  });
  assert.equal(turn.body.action, "propose_task");
  assert.ok(turn.body.proposal.proposalId);

  const confirmPath = `/api/agent/proposals/${encodeURIComponent(turn.body.proposal.proposalId)}/confirm`;
  const first = await request(baseUrl, confirmPath, { method: "POST", body: "{}" });
  const second = await request(baseUrl, confirmPath, { method: "POST", body: "{}" });
  assert.equal(first.response.status, 202);
  assert.equal(second.response.status, 202);
  assert.equal(first.body.run.taskId, second.body.run.taskId);
  assert.equal(first.body.run.status, "running");
  assert.equal(first.body.run.execution.kind, "homerail-dag");
  assert.equal(first.body.run.attempts.length, 1);
  assert.equal(first.body.run.attempts[0].externalRunId, launches[0].runId);
  assert.equal(launches.length, 1);

  const tasks = await request(baseUrl, "/api/tasks");
  assert.equal(tasks.body.tasks.length, 1);
  assert.equal(tasks.body.tasks[0].taskId, first.body.run.taskId);
});

test("unconfigured HomeRail fails honestly while retaining one retryable parent task", async (t) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "preacherman-homerail-config-"));
  const homeRailClient = {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
    workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: workflowHash }),
    profiles: async () => ({ profiles: [] }),
    createAndRun: async () => { throw new Error("must not launch"); },
  };
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDirectory }, homeRailClient });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDirectory, { recursive: true, force: true }); });

  const turn = await request(baseUrl, "/api/agent/turn", {
    method: "POST",
    body: JSON.stringify({ input: "Run a multi-agent research and independent verification task", locale: "en" }),
  });
  const confirmed = await request(baseUrl, `/api/agent/proposals/${turn.body.proposal.proposalId}/confirm`, { method: "POST", body: "{}" });
  assert.equal(confirmed.response.status, 202);
  assert.equal(confirmed.body.run.status, "failed");
  assert.match(confirmed.body.run.error.message, /worker|profile/i);
  const tasks = await request(baseUrl, "/api/tasks");
  assert.equal(tasks.body.tasks.length, 1);
  assert.equal(tasks.body.tasks[0].status, "failed");
  assert.equal(tasks.body.tasks[0].attempts.length, 0);
  assert.equal(tasks.body.tasks[0].error.code, "HOMERAIL_CONFIGURATION_REQUIRED");
});

test("approval and waiting input use the single Preacherman command API", async (t) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "preacherman-homerail-commands-"));
  let runState = "active";
  let events = [];
  const approvals = [];
  const commands = [];
  const homeRailClient = {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 1, connected_nodes: 1 }),
    workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: workflowHash }),
    profiles: async () => ({ profiles: [{ profile_id: "local-main" }] }),
    createAndRun: async (body) => ({ run_id: body.runId }),
    runStatus: async () => ({ status: runState, current_round: { round_id: "round-2", target_actor_ids: ["researcher"] } }),
    runEvents: async () => ({ events }),
    approveRun: async (runId, nodeId, body) => { approvals.push({ runId, nodeId, body }); return { accepted: true }; },
    sendCommands: async (runId, body) => { commands.push({ runId, body }); return { delivery_mode: "resumed" }; },
    cancelRun: async () => ({ cancelled: true }),
  };
  const service = createPreachermanServer({ env: readyEnv(dataDirectory), homeRailClient });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDirectory, { recursive: true, force: true }); });

  const turn = await request(baseUrl, "/api/agent/turn", {
    method: "POST",
    body: JSON.stringify({ input: "Run a multi-agent research and verification task", locale: "en" }),
  });
  const started = await request(baseUrl, `/api/agent/proposals/${turn.body.proposal.proposalId}/confirm`, { method: "POST", body: "{}" });
  const taskId = started.body.run.taskId;

  runState = "waiting";
  events = [{ type: "dag:approval_requested", timestamp: new Date().toISOString(), details: { nodeId: "publish", approvalId: "approval-http", proposalHash: "sha256:http" } }];
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const waitingApproval = await request(baseUrl, `/api/tasks/${taskId}`);
  assert.equal(waitingApproval.body.task.status, "waiting_for_approval");
  const approved = await request(baseUrl, `/api/tasks/${taskId}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "approve", approvalId: "approval-http" }),
  });
  runState = "active";
  assert.equal(approved.body.task.status, "running");
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].body.proposal_hash, "sha256:http");

  runState = "waiting";
  events = [...events, { type: "dag:run_waiting", timestamp: new Date().toISOString(), details: { roundId: "round-2", awaitNodeId: "await-input" } }];
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const resumed = await request(baseUrl, `/api/tasks/${taskId}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "resume", input: "Use only verified public sources." }),
  });
  runState = "active";
  assert.equal(resumed.body.task.status, "running");
  assert.equal(commands.length, 1);
  assert.equal(commands[0].body.expected_round_id, "round-2");
  assert.doesNotMatch(JSON.stringify(resumed.body.task), /verified public sources/i);
});

test("completed HomeRail artifacts are indexed and range-proxied through Preacherman", async (t) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "preacherman-homerail-artifacts-http-"));
  let runState = "active";
  const content = Buffer.from("0123456789abcdef", "utf8");
  const contentHash = createHash("sha256").update(content).digest("hex");
  const contentCalls = [];
  const homeRailClient = {
    runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 1, connected_nodes: 1 }),
    workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: workflowHash }),
    profiles: async () => ({ profiles: [{ profile_id: "local-main" }] }),
    createAndRun: async (body) => ({ run_id: body.runId }),
    runStatus: async () => ({ status: runState }),
    runEvents: async () => ({ events: [] }),
    runArtifacts: async () => ({ artifacts: [{ artifact_id: "report", name: "report.txt", status: "ready", media_type: "text/plain", required: true, size_bytes: content.length, sha256: contentHash }] }),
    artifactContent: async (_runId, _name, options) => {
      contentCalls.push(options);
      return new Response(content, { status: 200, headers: { "Content-Type": "text/plain", "Content-Length": String(content.length), ETag: `\"${contentHash}\"` } });
    },
  };
  const service = createPreachermanServer({ env: readyEnv(dataDirectory), homeRailClient });
  const address = await service.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await service.close(); await rm(dataDirectory, { recursive: true, force: true }); });

  const turn = await request(baseUrl, "/api/agent/turn", { method: "POST", body: JSON.stringify({ input: "Run multi-agent research and independent verification", locale: "en" }) });
  const started = await request(baseUrl, `/api/agent/proposals/${turn.body.proposal.proposalId}/confirm`, { method: "POST", body: "{}" });
  const taskId = started.body.run.taskId;
  runState = "completed";
  await new Promise((resolve) => setTimeout(resolve, 2_100));

  const index = await request(baseUrl, `/api/tasks/${taskId}/artifacts`);
  assert.equal(index.body.total, 1);
  assert.equal(index.body.artifacts[0].artifactId, "report");
  assert.equal(index.body.artifacts[0].primary, true);
  const proxied = await fetch(`${baseUrl}/api/tasks/${taskId}/artifacts/report/content`, { headers: { Origin: origin, Range: "bytes=2-5" } });
  assert.equal(proxied.status, 206);
  assert.equal(proxied.headers.get("content-range"), `bytes 2-5/${content.length}`);
  assert.equal(await proxied.text(), "2345");
  assert.deepEqual(contentCalls, [{}], "the browser Range response comes from the validated Preacherman copy");
  const task = await request(baseUrl, `/api/tasks/${taskId}`);
  assert.equal(task.body.task.status, "succeeded");
  assert.equal(task.body.task.artifact.artifactId, "report");
});
