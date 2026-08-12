import { createHash } from "node:crypto";

let serviceUrl = (process.env.PREACHERMAN_SERVICE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const objective = process.env.PREACHERMAN_FUSION_OBJECTIVE
  || [
    "Using only the supplied facts below, assess three explicitly named Preacherman demo launch tracks in parallel and independently verify one recommendation.",
    "FACT A: Track A is a closed 10-user pilot lasting 2 weeks, operated by one internal operator, with no external integrations.",
    "FACT B: Track B is a 50-user invite-only beta lasting 4 weeks and requires onboarding plus user support.",
    "FACT C: Track C is a 1-week public showcase using read-only sample data and no account creation.",
    "Create exactly one non-overlapping work item for Track A, Track B, and Track C. Each worker must cite the relevant FACT label, assess prerequisites, effort, stated timeline, feasibility, and risks, explicitly mark unknown cost instead of inventing a number, and return grounded evidence. The independent verifier must compare all three results, reject invented facts, and recommend a track with stated tradeoffs.",
  ].join(" ");
const timeoutMs = Number(process.env.PREACHERMAN_FUSION_TIMEOUT_MS || 15 * 60 * 1_000);
const origin = process.env.PREACHERMAN_PREVIEW_ORIGIN || "http://127.0.0.1:1420";
const existingTaskId = process.env.PREACHERMAN_FUSION_TASK_ID || "";

function failure(message, details) {
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  return error;
}

async function request(path, init = {}) {
  const response = await fetch(`${serviceUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Origin: origin,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw failure(`${init.method || "GET"} ${path} returned HTTP ${response.status}.`, body);
  return body;
}

async function waitForTerminal(taskId) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = (await request(`/api/tasks/${encodeURIComponent(taskId)}`)).task;
    if (new Set(["succeeded", "failed", "cancelled"]).has(latest?.status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw failure(`Task ${taskId} did not reach a terminal state within ${timeoutMs}ms.`, latest);
}

async function verifyArtifact(taskId, artifact) {
  if (artifact.status !== "ready" || !/^[a-f0-9]{64}$/i.test(artifact.sha256 || "") || !Number.isSafeInteger(artifact.sizeBytes)) {
    throw failure(`Artifact ${artifact.artifactId} is not a validated ready artifact.`, artifact);
  }
  const response = await fetch(`${serviceUrl}${artifact.contentPath}`, { headers: { Origin: origin } });
  if (!response.ok) throw failure(`Artifact ${artifact.artifactId} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== artifact.sizeBytes || digest !== artifact.sha256.toLowerCase()) {
    throw failure(`Artifact ${artifact.artifactId} content does not match its Ledger descriptor.`);
  }
  return { artifactId: artifact.artifactId, name: artifact.name, sizeBytes: bytes.byteLength, sha256: digest };
}

async function main() {
  const status = await request("/api/execution/providers/status");
  const provider = status.providers?.find((candidate) => candidate.id === "preacherman-execution");
  if (provider?.state !== "ready") {
    throw failure("Preacherman execution is not ready. Configure an active model setting and runtime profile before running acceptance.", provider);
  }
  let taskId = existingTaskId;
  if (!taskId) {
    const turn = await request("/api/agent/turn", {
      method: "POST",
      body: JSON.stringify({ input: objective, locale: "en" }),
    });
    if (turn.action !== "propose_task" || !turn.proposal?.proposalId) throw failure("Agent turn did not produce a reviewable task proposal.", turn);
    const confirmPath = `/api/agent/proposals/${encodeURIComponent(turn.proposal.proposalId)}/confirm`;
    const first = await request(confirmPath, { method: "POST", body: JSON.stringify({ objective: turn.proposal.objective }) });
    const repeated = await request(confirmPath, { method: "POST", body: JSON.stringify({ objective: turn.proposal.objective }) });
    if (!first.run?.taskId || repeated.run?.taskId !== first.run.taskId) {
      throw failure("Duplicate confirmation did not preserve exactly one parent Task and one Attempt.", { first: first.run, repeated: repeated.run });
    }
    const confirmed = (await request(`/api/tasks/${encodeURIComponent(first.run.taskId)}`)).task;
    if (confirmed?.attempts?.length !== 1) {
      throw failure("Duplicate confirmation did not preserve exactly one parent Task and one Attempt.", { first: first.run, repeated: repeated.run, confirmed });
    }
    taskId = first.run.taskId;
  }
  const task = await waitForTerminal(taskId);
  if (task.status !== "succeeded") throw failure(`Preacherman execution task finished as ${task.status}.`, task);
  if (task.execution?.kind !== "preacherman-execution-dag" || task.attempts?.length !== 1 || !task.attempts[0]?.externalRunId) {
    throw failure("Successful task is missing its Preacherman execution Attempt link.", task);
  }
  const index = await request(`/api/tasks/${encodeURIComponent(task.taskId)}/artifacts`);
  const requiredArtifacts = Array.isArray(index.artifacts) ? index.artifacts.filter((artifact) => artifact.required === true) : [];
  if (requiredArtifacts.length < 2) {
    throw failure("Successful fixed workflow did not publish the required plan and verification artifacts.", index);
  }
  const artifacts = [];
  for (const artifact of requiredArtifacts) artifacts.push(await verifyArtifact(task.taskId, artifact));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    taskId: task.taskId,
    attempt: task.attempts[0].attempt,
    externalRunId: task.attempts[0].externalRunId,
    workflowId: task.execution.workflowId,
    workflowRevision: task.execution.workflowRevision,
    canonicalHash: task.execution.canonicalHash,
    artifacts,
  }, null, 2)}\n`);
}

async function run() {
  let embeddedService;
  try {
    if (process.env.PREACHERMAN_FUSION_EMBED_SERVICE === "true") {
      const { createPreachermanServer } = await import("../server/preachermanServer.mjs");
      embeddedService = createPreachermanServer();
      const address = await embeddedService.listen(0);
      if (!address || typeof address !== "object") throw failure("Embedded Preacherman service did not return a listening address.");
      serviceUrl = `http://127.0.0.1:${address.port}`;
    }
    await main();
  } finally {
    await embeddedService?.close();
  }
}

run().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, details: error.details }, null, 2)}\n`);
  process.exitCode = 1;
});
