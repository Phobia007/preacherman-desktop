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

export const PREACHERMAN_HOMERAIL_WORKFLOW_REVISION = 3;
export const PREACHERMAN_HOMERAIL_CANONICAL_HASH = "bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee";

export function createHomeRailCapabilityCatalogAdapter({
  client,
  workflowId = "preacherman-complex-task-v1",
  expectedWorkflowRevision = PREACHERMAN_HOMERAIL_WORKFLOW_REVISION,
  expectedCanonicalHash = PREACHERMAN_HOMERAIL_CANONICAL_HASH,
  profile,
  managerUrl = "http://127.0.0.1:19191",
  enabled = true,
  now = () => new Date().toISOString(),
  modelProbeTtlMs = 60_000,
}) {
  const managerAddress = safeManagerAddress(managerUrl);
  let lastConnectedAt;
  let lastError;
  let modelProbeCache;

  async function detectModelRuntime(settingId) {
    if (typeof client.detectModelRuntime !== "function") return undefined;
    const checkedAt = Date.now();
    if (modelProbeCache?.settingId === settingId && checkedAt - modelProbeCache.checkedAt < modelProbeTtlMs) {
      return modelProbeCache.result;
    }
    const response = await client.detectModelRuntime(settingId);
    const responses = response?.endpoints?.responses;
    const result = {
      available: response?.available === true && responses?.available === true,
      responsesAvailable: responses?.available === true,
      preferredHarness: typeof response?.preferred_harness === "string" ? response.preferred_harness : undefined,
      status: Number.isSafeInteger(responses?.status) ? responses.status : undefined,
    };
    modelProbeCache = { settingId, checkedAt, result };
    return result;
  }

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
      const selectedProfile = profile
        ? availableProfiles.find((candidate) => candidate.profile_id === profile || candidate.id === profile || candidate.name === profile)
        : undefined;
      if (!profile) reasons.push("No runtime profile is selected. Set PREACHERMAN_HOMERAIL_PROFILE explicitly.");
      else if (!selectedProfile) reasons.push(`Runtime profile ${profile} is not available.`);
      let model;
      if (selectedProfile && typeof client.detectModelRuntime === "function") {
        const settingId = selectedProfile.default?.llm_setting_id;
        if (typeof settingId !== "string" || !settingId) {
          reasons.push(`Runtime profile ${profile} does not select an LLM setting.`);
        } else {
          model = await detectModelRuntime(settingId);
          if (!model.available) {
            reasons.push(model.status === 401
              ? "The configured HomeRail model credential was rejected by the provider."
              : "The configured HomeRail model did not pass a live Responses runtime probe.");
          }
        }
      }
      const details = {
        runtime: { phase: runtime.phase, connectedWorkers: runtime.connected_workers ?? 0, connectedNodes: runtime.connected_nodes ?? 0 },
        workflow: { id: workflow.workflow_id, revision: workflow.head_revision, canonicalHash: workflow.canonical_hash, expectedRevision: expectedWorkflowRevision, expectedCanonicalHash },
        connection: connection(),
        ...(model ? { model } : {}),
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
