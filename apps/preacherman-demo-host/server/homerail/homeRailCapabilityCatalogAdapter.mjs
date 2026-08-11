function providerState(state, message, details = {}) {
  return { id: "homerail", state, message, ...details };
}

function safeManagerAddress(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "configured-manager";
  }
}

export const PREACHERMAN_HOMERAIL_WORKFLOW_REVISION = 2;
export const PREACHERMAN_HOMERAIL_CANONICAL_HASH = "a5ea80a2755e94d5e77819507502d4a4f747e72ec3e68d3618f2eebf66c486e2";

export function createHomeRailCapabilityCatalogAdapter({
  client,
  workflowId = "preacherman-complex-task-v1",
  expectedWorkflowRevision = PREACHERMAN_HOMERAIL_WORKFLOW_REVISION,
  expectedCanonicalHash = PREACHERMAN_HOMERAIL_CANONICAL_HASH,
  profile,
  managerUrl = "http://127.0.0.1:19191",
  enabled = true,
  now = () => new Date().toISOString(),
}) {
  const managerAddress = safeManagerAddress(managerUrl);
  let lastConnectedAt;
  let lastError;

  function connection() {
    return {
      managerAddress,
      ...(lastConnectedAt ? { lastConnectedAt } : {}),
      ...(lastError ? { lastError } : {}),
    };
  }

  async function status() {
    if (!enabled) return providerState("disabled", "HomeRail complex execution is disabled.", { connection: connection() });
    try {
      const [runtime, workflow, profiles] = await Promise.all([
        client.runtimeStatus(),
        client.workflow(workflowId),
        client.profiles(workflowId),
      ]);
      lastConnectedAt = now();
      lastError = undefined;
      const reasons = [];
      if ((runtime.connected_nodes ?? 0) < 1) reasons.push("No HomeRail execution node is connected.");
      if (workflow.workflow_id !== workflowId) reasons.push(`HomeRail returned workflow ${workflow.workflow_id ?? "unknown"} instead of ${workflowId}.`);
      if (workflow.head_revision !== expectedWorkflowRevision) reasons.push(`Pinned workflow revision ${expectedWorkflowRevision} is unavailable; HomeRail reports revision ${workflow.head_revision ?? "unknown"}.`);
      if (workflow.canonical_hash !== expectedCanonicalHash) reasons.push("The HomeRail workflow canonical hash does not match the pinned Preacherman workflow.");
      const availableProfiles = Array.isArray(profiles.profiles) ? profiles.profiles : [];
      if (!profile) reasons.push("No runtime profile is selected. Set PREACHERMAN_HOMERAIL_PROFILE explicitly.");
      else if (!availableProfiles.some((candidate) => candidate.profile_id === profile || candidate.id === profile || candidate.name === profile)) reasons.push(`Runtime profile ${profile} is not available.`);
      const details = {
        runtime: { phase: runtime.phase, connectedWorkers: runtime.connected_workers ?? 0, connectedNodes: runtime.connected_nodes ?? 0 },
        workflow: { id: workflow.workflow_id, revision: workflow.head_revision, canonicalHash: workflow.canonical_hash, expectedRevision: expectedWorkflowRevision, expectedCanonicalHash },
        connection: connection(),
      };
      if (reasons.length) return providerState("configuration-required", reasons.join(" "), details);
      return providerState("ready", "HomeRail complex execution is ready.", { ...details, profile });
    } catch (error) {
      lastError = { code: error.code ?? "HOMERAIL_STATUS_FAILED", at: now() };
      return providerState(error?.code === "HOMERAIL_UNREACHABLE" || error?.code === "HOMERAIL_TIMEOUT" ? "unreachable" : "error", error.message, {
        error: { code: error.code ?? "HOMERAIL_STATUS_FAILED" },
        connection: connection(),
      });
    }
  }

  async function workflows() {
    const response = await client.workflows();
    const entries = Array.isArray(response?.workflows) ? response.workflows : [];
    return {
      workflowId,
      expectedRevision: expectedWorkflowRevision,
      expectedCanonicalHash,
      workflows: entries.map((entry) => ({
        id: entry.workflow_id,
        name: entry.name,
        description: entry.description,
        revision: entry.head_revision,
        canonicalHash: entry.canonical_hash,
        compilerVersion: entry.compiler_version,
        pinned: entry.workflow_id === workflowId && entry.head_revision === expectedWorkflowRevision && entry.canonical_hash === expectedCanonicalHash,
      })),
    };
  }

  return { status, workflows };
}
