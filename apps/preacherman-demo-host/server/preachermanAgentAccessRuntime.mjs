import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createPreachermanMcpGatewayRuntime } from "./mcp-gateway/preachermanMcpGatewayRuntime.mjs";
import { generateClientTemplates } from "./mcp-gateway/preachermanMcpGatewayBridge.mjs";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const LOCAL_ACTIVE = new Set(["queued", "running", "waiting_for_input", "waiting_for_approval"]);

function codedError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function proposalHash(task) {
  return createHash("sha256").update(JSON.stringify({ taskId: task.taskId, objective: task.objective, revision: task.revision })).digest("hex");
}

function approvalHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeTask(task) {
  return {
    taskId: task.taskId,
    runId: task.taskId,
    objective: task.objective,
    status: task.status,
    revision: task.revision,
    ownerPrincipalId: task.ownership?.principalId,
    execution: { kind: task.execution?.kind, adapter: task.execution?.adapter },
    attempts: (task.attempts ?? []).map((attempt) => ({
      attempt: attempt.attempt, provider: attempt.provider, status: attempt.status,
      startedAt: attempt.startedAt, completedAt: attempt.completedAt,
    })),
    pendingApproval: task.pendingApproval ? {
      approvalId: task.pendingApproval.approvalId,
      title: task.pendingApproval.title,
      description: task.pendingApproval.description,
      status: task.pendingApproval.status,
      requestedAt: task.pendingApproval.requestedAt,
    } : null,
    artifacts: (task.artifacts ?? []).map((artifact) => ({
      artifactId: artifact.artifactId, name: artifact.name, mediaType: artifact.mediaType,
      status: artifact.status, size: artifact.size, primary: artifact.primary,
    })),
    events: (task.events ?? []).slice(-50).map((event) => ({
      sequence: event.sequence, type: event.type, stage: event.stage, message: event.message, at: event.at,
    })),
    error: task.error ? { code: task.error?.code ?? "TASK_FAILED", message: task.error?.message ?? String(task.error) } : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function safeLedger(task) {
  return {
    taskId: task.taskId,
    ownerPrincipalId: task.ownership?.principalId,
    createdBy: task.createdBy ? {
      clientName: task.createdBy.clientName,
      transport: task.createdBy.transport,
    } : { clientName: "preacherman-host", transport: "local-ui" },
    status: task.status,
    execution: { kind: task.execution?.kind, adapter: task.execution?.adapter },
    attempts: (task.attempts ?? []).map(({ attempt, provider, status, startedAt, completedAt }) => ({ attempt, provider, status, startedAt, completedAt })),
    milestones: (task.events ?? []).map(({ sequence, type, stage, message, at }) => ({ sequence, type, stage, message, at })).slice(-100),
    approvals: (task.approvalHistory ?? []).map(({ approvalId, title, status, actor, requestedAt, decidedAt }) => ({ approvalId, title, status, actorType: actor === "preacherman-user" ? "host-user" : "host", requestedAt, decidedAt })),
    artifacts: (task.artifacts ?? []).map(({ artifactId, name, mediaType, status, size, hash }) => ({ artifactId, name, mediaType, status, size, hash })),
  };
}

function localEventProjection(event) {
  const messages = {
    lifecycle: `Local Agent ${event.status ?? "updated"}.`,
    progress: `Local Agent progress: ${event.phase ?? "working"}.`,
    message: "Local Agent produced a result update.",
    reasoning: "Local Agent reported reasoning progress.",
    action: `Local Agent action: ${event.action ?? "operation"}.`,
    error: event.message || "Local Agent reported an error.",
    "parser-warning": "A malformed Local Agent event was safely ignored.",
    generic: `Local Agent event: ${event.externalType ?? "unknown"}.`,
    session: "Local Agent session started.",
    approval: event.phase === "requested" ? "Local Agent requires approval." : "Local Agent approval was resolved.",
  };
  return {
    type: `local_agent_${event.type ?? "event"}`,
    stage: event.type === "error" ? "error" : event.type === "lifecycle" ? "execution" : "progress",
    message: messages[event.type] ?? "Local Agent progress updated.",
    cursor: event.cursor,
  };
}

async function privateCredential(file) {
  await mkdir(dirname(file), { recursive: true });
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing.length >= 24) return existing;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const credential = randomBytes(32).toString("base64url");
  await writeFile(file, `${credential}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(file, 0o600);
  return credential;
}

export function createPreachermanAgentAccessRuntime({
  taskService,
  localAgentRegistry,
  workspaces,
  gatewayCredentialFile,
  gatewayScript,
  artifactRoots = [],
  visionEnhancementRuntime,
  gatewayAuthenticate,
  startApprovedTask,
  commandTask,
  now = () => new Date().toISOString(),
  pollIntervalMs = 250,
} = {}) {
  if (!taskService || !localAgentRegistry || !Array.isArray(workspaces)) throw new TypeError("Agent Access requires TaskService, LocalAgentRegistry, and workspaces.");
  const localRuns = new Map();
  let bootstrapCredential;
  let gateway;
  let port;

  const workspaceRecords = workspaces.map((workspace, index) => ({
    id: workspace.id ?? `workspace-${index + 1}`,
    label: workspace.label ?? `Workspace ${index + 1}`,
    path: resolve(workspace.path),
  }));

  function contains(root, target) {
    const result = relative(root, target);
    return result === "" || (!result.startsWith("..") && !isAbsolute(result));
  }

  async function resolveGatewaySessionContext({ workspacePath }) {
    if (typeof workspacePath !== "string" || !workspacePath) return {};
    const requested = await realpath(resolve(workspacePath)).catch(() => null);
    if (!requested) return {};
    const candidates = await Promise.all(workspaceRecords.map(async (workspace) => ({
      workspace,
      root: await realpath(workspace.path).catch(() => null),
    })));
    const matched = candidates
      .filter(({ root }) => root && contains(root, requested))
      .sort((left, right) => right.root.length - left.root.length)[0];
    return matched ? { workspaceId: matched.workspace.id } : {};
  }

  async function owned(actor, taskId) {
    return taskService.getOwned(taskId, actor.principalId);
  }

  async function readArtifact(task, artifactId, offset = 0, limit = 65_536) {
    const artifact = (task.artifacts ?? []).find((candidate) => candidate.artifactId === artifactId);
    if (!artifact) throw codedError("ARTIFACT_NOT_FOUND", "Artifact was not found.", 404);
    let buffer;
    if (artifact.content !== undefined) buffer = Buffer.from(JSON.stringify(artifact.content, null, 2), "utf8");
    else {
      const candidate = artifact.path ?? artifact.contentPath;
      if (typeof candidate !== "string" || !candidate) throw codedError("ARTIFACT_UNAVAILABLE", "Artifact content is unavailable.", 404);
      const resolvedPath = await realpath(candidate).catch(() => null);
      if (!resolvedPath) throw codedError("ARTIFACT_UNAVAILABLE", "Artifact content is unavailable.", 404);
      const canonicalRoots = await Promise.all(artifactRoots.map((root) => realpath(root).catch(() => null)));
      const allowed = canonicalRoots.some((root) => root && (resolvedPath === root || resolvedPath.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)));
      if (!allowed) throw codedError("ARTIFACT_ACCESS_DENIED", "Artifact path is outside the host-owned artifact roots.", 403);
      const info = await stat(resolvedPath);
      if (!info.isFile() || info.size > 2 * 1024 * 1024) throw codedError("ARTIFACT_TOO_LARGE", "Artifact exceeds the safe read limit.", 413);
      buffer = await readFile(resolvedPath);
    }
    const chunk = buffer.subarray(offset, offset + limit);
    return {
      artifactId: artifact.artifactId,
      taskId: task.taskId,
      name: artifact.name,
      mimeType: artifact.mediaType,
      size: buffer.length,
      encoding: "utf8",
      content: chunk.toString("utf8"),
      truncated: offset + chunk.length < buffer.length,
      nextOffset: offset + chunk.length < buffer.length ? offset + chunk.length : null,
    };
  }

  function gatewayBridge() {
    return {
      capabilities: async ({ actor } = {}) => {
        const vision = visionEnhancementRuntime ? await visionEnhancementRuntime.status() : { state: "unsupported" };
        const visionState = actor?.workspaceId ? vision.state : "configuration-required";
        return {
          tools: {
            "preacherman.vision.analyze": {
              state: visionState,
              ...(actor?.workspaceId ? {} : { reason: "Start the MCP client inside an approved Preacherman workspace." }),
            },
          },
          executionBackends: [
          { id: "preacherman-local", state: "ready", progress: true, approval: true, cancellation: true, retry: true, resume: false, steering: true, artifacts: true },
          ...(await localAgentRegistry.list()).map((agent) => ({ id: agent.id, state: agent.installed && agent.auth.state === "ready" ? "ready" : agent.installed ? "configuration-required" : "external-runtime-required", ...agent.capabilities })),
          ],
        };
      },
      task: {
        create: async ({ actor, input }) => {
          const task = await taskService.createOwned({
            objective: input.objective,
            source: "mcp-gateway",
            execution: { kind: "gateway-pending", adapter: input.backend ?? "execution-router" },
            proposalSnapshot: { objective: input.objective, title: input.title, backend: input.backend, workspaceId: input.workspaceId },
          }, actor);
          const waiting = await taskService.requestApproval(task.taskId, {
            proposalHash: proposalHash(task),
            title: input.title || "Start external Agent task",
            description: "An external MCP Agent requested a Preacherman task. Review it here before execution starts.",
          }, { sourceId: `gateway:${actor.sessionId}:${task.taskId}` });
          return { task: safeTask(waiting), ownerPrincipalId: actor.principalId };
        },
        get: async ({ actor, input }) => ({ task: safeTask(await owned(actor, input.taskId)), ownerPrincipalId: actor.principalId }),
        list: async ({ actor, input }) => ({ items: (await taskService.listOwned(actor.principalId, input.limit)).map((task) => ({ ...safeTask(task), ownerPrincipalId: actor.principalId })) }),
        events: async ({ actor, input }) => {
          const task = await owned(actor, input.taskId);
          const cursor = Number.parseInt(input.cursor ?? "0", 10) || 0;
          const events = (task.events ?? []).filter((event) => event.sequence > cursor).slice(0, input.limit);
          return { taskId: task.taskId, status: task.status, events, nextCursor: events.at(-1)?.sequence ?? cursor };
        },
        cancel: async ({ actor, input }) => {
          const task = await owned(actor, input.taskId);
          return { task: safeTask(await commandTask(task, "cancel", input, { actor })) };
        },
        retry: async ({ actor, input }) => {
          const task = await owned(actor, input.taskId);
          return { task: safeTask(await commandTask(task, "retry", input, { actor })) };
        },
        steer: async ({ actor, input }) => {
          const task = await owned(actor, input.taskId);
          return { task: safeTask(await commandTask(task, "steer", input, { actor })) };
        },
      },
      artifact: {
        list: async ({ actor, input }) => {
          const task = await owned(actor, input.taskId);
          return { taskId: task.taskId, items: safeTask(task).artifacts };
        },
        read: async ({ actor, input }) => readArtifact(await owned(actor, input.taskId), input.artifactId, input.offset, input.limit),
      },
      ledger: { get: async ({ actor, input }) => safeLedger(await owned(actor, input.taskId)) },
      ...(visionEnhancementRuntime ? {
        vision: {
          analyze: async ({ actor, input }) => {
            const workspace = workspaceRecords.find((candidate) => candidate.id === actor.workspaceId);
            if (!workspace) throw codedError("VISION_WORKSPACE_REQUIRED", "Vision analysis requires an approved workspace.", 409);
            return visionEnhancementRuntime.analyze({
              workspaceRoot: workspace.path,
              filePath: input.filePath,
              question: input.question,
            });
          },
        },
      } : {}),
    };
  }

  async function initialize(servicePort) {
    port = servicePort;
    bootstrapCredential = await privateCredential(gatewayCredentialFile);
    gateway = createPreachermanMcpGatewayRuntime({
      bridge: gatewayBridge(),
      bootstrapCredential,
      authenticate: gatewayAuthenticate,
      resolveSessionContext: resolveGatewaySessionContext,
    });
  }

  function requireGateway() {
    if (!gateway) throw codedError("GATEWAY_NOT_READY", "MCP Gateway is not initialized.", 503);
    return gateway;
  }

  async function templateList() {
    const scriptPath = await realpath(gatewayScript);
    return generateClientTemplates({
      command: process.execPath,
      args: [scriptPath],
      env: {
        PREACHERMAN_MCP_GATEWAY_URL: `http://127.0.0.1:${port}`,
        PREACHERMAN_MCP_BOOTSTRAP_FILE: gatewayCredentialFile,
      },
    });
  }

  async function testGateway() {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [await realpath(gatewayScript)],
      env: { ...process.env, PREACHERMAN_MCP_GATEWAY_URL: `http://127.0.0.1:${port}`, PREACHERMAN_MCP_BOOTSTRAP_FILE: gatewayCredentialFile },
      stderr: "pipe",
    });
    const client = new Client({ name: "preacherman-settings-probe", version: "1.0.0" });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: "preacherman.capabilities", arguments: {} });
      return { ok: result.isError !== true, state: result.isError === true ? "error" : "ready", capabilities: result.structuredContent };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async function rotateCredential() {
    const next = randomBytes(32).toString("base64url");
    const result = requireGateway().rotateCredential(next);
    await writeFile(gatewayCredentialFile, `${next}\n`, { encoding: "utf8", mode: 0o600 });
    bootstrapCredential = next;
    return { rotatedAt: result.rotatedAt, revokedSessionCount: result.revokedSessionCount };
  }

  async function pollLocalTask(taskId, agentId, runId, cursor = 0) {
    try {
      const snapshot = await localAgentRegistry.events(agentId, runId, cursor);
      for (const event of snapshot.events ?? []) {
        if (event.type === "approval" && event.phase === "requested" && event.permissionId) {
          const hash = approvalHash({ taskId, agentId, runId, permissionId: event.permissionId, toolCallId: event.toolCallId, options: event.options });
          await taskService.requestApproval(taskId, {
            approvalId: event.permissionId,
            proposalHash: hash,
            title: event.title || "Preacherman Native requests permission",
            description: "Review this one-time Harness tool permission before execution continues.",
            nodeId: event.permissionId,
            externalRunId: runId,
          }, { sourceId: `local:${agentId}:${runId}:approval:${event.permissionId}` });
        }
        await taskService.appendEvent(taskId, localEventProjection(event), { sourceId: `local:${agentId}:${runId}:${event.cursor}` });
      }
      await taskService.update(taskId, (task) => {
        const attempt = task.attempts.at(-1);
        if (attempt) attempt.eventCursor = snapshot.nextCursor;
        task.localAgentSummary = snapshot.summary || task.localAgentSummary;
      });
      if (!TERMINAL.has(snapshot.status)) {
        const timer = setTimeout(() => void pollLocalTask(taskId, agentId, runId, snapshot.nextCursor), pollIntervalMs);
        timer.unref?.();
        localRuns.set(taskId, { agentId, runId, timer });
        return;
      }
      localRuns.delete(taskId);
      const latest = await taskService.get(taskId);
      if (TERMINAL.has(latest.status)) return;
      if (snapshot.status === "succeeded") {
        await taskService.addArtifact(taskId, {
          name: "local-agent-result.json",
          mediaType: "application/json",
          provider: agentId,
          content: {
            summary: snapshot.summary ?? "Local Agent completed.",
            changedFiles: (snapshot.events ?? []).flatMap((event) => event.action === "file-change" ? event.files ?? [] : []).slice(0, 100),
            completedAt: snapshot.completedAt,
          },
        });
        await taskService.transition(taskId, "succeeded", { event: { type: "completed", stage: "terminal", message: "Local Agent completed and wrote a reviewable artifact." } });
      } else if (snapshot.status === "cancelled") {
        await taskService.transition(taskId, "cancelled", { event: { type: "cancelled", stage: "terminal", message: "Local Agent process was cancelled." } });
      } else {
        await taskService.transition(taskId, "failed", { error: snapshot.failure ?? { code: "LOCAL_AGENT_FAILED", message: "Local Agent failed." }, event: { type: "failed", stage: "terminal", message: snapshot.failure?.message ?? "Local Agent failed." } });
      }
    } catch (error) {
      localRuns.delete(taskId);
      const latest = await taskService.get(taskId).catch(() => null);
      if (latest && LOCAL_ACTIVE.has(latest.status)) {
        await taskService.transition(taskId, "failed", { error: { code: error.code ?? "LOCAL_AGENT_PROJECTOR_FAILED", message: error.message, retryable: true }, event: { type: "failed", stage: "terminal", message: error.message } });
      }
    }
  }

  async function startLocalTask(taskId, { agentId, workspaceId, policy = "workspace-write", providerId, modelId, reuseAttempt = false } = {}) {
    const task = await taskService.get(taskId);
    if (!new Set(["local-agent-runner", "agent-workspace"]).has(task.source) || task.execution?.kind !== "local-agent") throw codedError("LOCAL_AGENT_TASK_INVALID", "TaskRun is not a Local Agent task.", 409);
    const workspace = workspaceRecords.find((candidate) => candidate.id === workspaceId);
    if (!workspace) throw codedError("LOCAL_AGENT_WORKSPACE_NOT_ALLOWED", "Workspace is not registered by the host.", 403);
    if (policy !== "workspace-write") throw codedError("LOCAL_AGENT_UNSAFE_POLICY", "Only the workspace-write policy is available.", 400);
    const capabilities = localAgentRegistry.capabilities(agentId);
    if (!capabilities.workspaceWrite) throw codedError("LOCAL_AGENT_CAPABILITY_REQUIRED", "Selected Agent does not support workspace-write.", 409);
    if (!reuseAttempt) await taskService.startAttempt(taskId, { provider: agentId, status: "submitting" });
    try {
      const run = await localAgentRegistry.start(agentId, {
        taskId,
        objective: task.objective,
        workspace: workspace.path,
        policy: { sandbox: policy },
        providerId: providerId ?? task.executionSnapshot?.providerId,
        modelId: modelId ?? task.executionSnapshot?.modelId,
      });
      await taskService.linkAttemptRun(taskId, { provider: agentId, externalRunId: run.runId, eventCursor: 0 });
      await taskService.update(taskId, (current) => {
        current.execution = { kind: "local-agent", adapter: agentId, agentId, workspaceId, localRunId: run.runId };
      });
      void pollLocalTask(taskId, agentId, run.runId, 0);
      return taskService.get(taskId);
    } catch (error) {
      const latest = await taskService.get(taskId);
      if (LOCAL_ACTIVE.has(latest.status)) await taskService.transition(taskId, "failed", { error: { code: error.code ?? "LOCAL_AGENT_START_FAILED", message: error.message, retryable: true }, event: { type: "failed", stage: "terminal", message: error.message } });
      throw error;
    }
  }

  async function createLocalTask(objective) {
    return taskService.create({ objective, source: "local-agent-runner", execution: { kind: "local-agent", adapter: "unselected" } });
  }

  async function createAgentWorkspaceTask({ objective, agentId, providerId, modelId, workspaceId, policy, adapterVersion, capabilities }) {
    const workspace = workspaceRecords.find((candidate) => candidate.id === workspaceId);
    if (!workspace) throw codedError("LOCAL_AGENT_WORKSPACE_NOT_ALLOWED", "Workspace is not registered by the host.", 403);
    const created = await taskService.create({
      objective,
      source: "agent-workspace",
      execution: { kind: "local-agent", adapter: agentId, agentId, workspaceId },
      executionSnapshot: {
        agentId, providerId, modelId, workspaceId,
        policy: { sandbox: "workspace-write", approvalMode: policy },
        adapterVersion: adapterVersion ?? null,
        capabilities: structuredClone(capabilities),
        capturedAt: now(),
      },
    });
    const hash = approvalHash({ taskId: created.taskId, objective: created.objective, executionSnapshot: created.executionSnapshot });
    return taskService.requestApproval(created.taskId, {
      approvalId: `start_${created.taskId}`,
      proposalHash: hash,
      title: agentId === "preacherman-native" ? "Start Preacherman Native task" : "Start local Agent task",
      description: "Approve the selected Agent, provider, model, workspace and permission policy before execution starts.",
      nodeId: "host-start",
    });
  }

  async function decideLocalTaskApproval(task, decision) {
    const approval = task.pendingApproval;
    if (!approval) throw codedError("TASK_APPROVAL_NOT_FOUND", "No Local Agent approval is pending.", 404);
    if (approval.nodeId === "host-start") {
      const resolved = await taskService.resolveApproval(task.taskId, {
        approvalId: approval.approvalId,
        proposalHash: approval.proposalHash,
        decision,
        actor: "preacherman-user",
      });
      if (decision === "rejected") {
        return taskService.transition(resolved.taskId, "cancelled", { event: { type: "rejected", stage: "terminal", message: "User rejected the Local Agent start request." } });
      }
      return startLocalTask(resolved.taskId, {
        agentId: resolved.executionSnapshot.agentId,
        providerId: resolved.executionSnapshot.providerId,
        modelId: resolved.executionSnapshot.modelId,
        workspaceId: resolved.executionSnapshot.workspaceId,
        policy: resolved.executionSnapshot.policy.sandbox,
      });
    }
    const runId = approval.externalRunId ?? task.execution?.localRunId;
    const agentId = task.executionSnapshot?.agentId ?? task.execution?.agentId ?? task.execution?.adapter;
    if (decision === "approved") await localAgentRegistry.approve(agentId, runId, approval.approvalId);
    else await localAgentRegistry.reject(agentId, runId, approval.approvalId);
    return taskService.resolveApproval(task.taskId, {
      approvalId: approval.approvalId,
      proposalHash: approval.proposalHash,
      decision,
      actor: "preacherman-user",
    });
  }

  async function cancelLocalTask(task) {
    const active = localRuns.get(task.taskId);
    const runId = active?.runId ?? task.execution?.localRunId;
    const agentId = active?.agentId ?? task.execution?.agentId ?? task.execution?.adapter;
    if (!runId || !agentId) throw codedError("LOCAL_AGENT_RUN_NOT_FOUND", "Local Agent process is not available.", 409);
    await localAgentRegistry.cancel(agentId, runId);
    if (active?.timer) clearTimeout(active.timer);
    localRuns.delete(task.taskId);
    const snapshot = await localAgentRegistry.events(agentId, runId, active?.cursor ?? 0);
    if (snapshot.status !== "cancelled") {
      await taskService.appendEvent(task.taskId, { type: "cancellation_requested", stage: "execution", message: "Waiting for the Local Agent process to exit." });
      const timer = setTimeout(() => void pollLocalTask(task.taskId, agentId, runId, snapshot.nextCursor), pollIntervalMs);
      timer.unref?.();
      localRuns.set(task.taskId, { agentId, runId, cursor: snapshot.nextCursor, timer });
      return taskService.get(task.taskId);
    }
    const latest = await taskService.get(task.taskId);
    if (TERMINAL.has(latest.status)) return latest;
    return taskService.transition(task.taskId, "cancelled", { event: { type: "cancelled", stage: "terminal", message: "Local Agent process exited after cancellation." } });
  }

  async function retryLocalTask(task) {
    const agentId = task.executionSnapshot?.agentId ?? task.execution?.agentId ?? task.execution?.adapter;
    const workspaceId = task.executionSnapshot?.workspaceId ?? task.execution?.workspaceId;
    await taskService.retry(task.taskId, { provider: agentId });
    return startLocalTask(task.taskId, {
      agentId,
      workspaceId,
      providerId: task.executionSnapshot?.providerId,
      modelId: task.executionSnapshot?.modelId,
      policy: task.executionSnapshot?.policy?.sandbox ?? "workspace-write",
      reuseAttempt: true,
    });
  }

  async function close() {
    for (const active of localRuns.values()) clearTimeout(active.timer);
    localRuns.clear();
    await localAgentRegistry.close();
  }

  return {
    initialize,
    close,
    gatewayStatus: () => ({ ...requireGateway().status(), version: "1.0", transport: "stdio", port, security: { loopbackOnly: true, approvalRequired: true } }),
    gatewayTemplates: templateList,
    gatewaySessions: () => requireGateway().listSessions(),
    gatewayCreateSession: (input) => requireGateway().createSession(input),
    gatewayCall: (input) => requireGateway().call(input),
    gatewayCloseSession: (sessionId, accessToken) => requireGateway().closeAuthenticated(sessionId, accessToken),
    gatewayRevokeSession: (sessionId) => requireGateway().revokeSession(sessionId),
    gatewayRotateCredential: rotateCredential,
    gatewayTest: testGateway,
    gatewayAudit: () => requireGateway().audit.list(),
    listLocalAgents: () => localAgentRegistry.list(),
    listWorkspaces: () => workspaceRecords.map(({ id, label, path }) => ({ id, label, path })),
    createLocalTask,
    createAgentWorkspaceTask,
    startLocalTask,
    decideLocalTaskApproval,
    cancelLocalTask,
    retryLocalTask,
    startApprovedTask,
  };
}
