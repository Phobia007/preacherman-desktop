import { useCallback, useEffect, useState } from "react";
import type { Locale } from "../preferences";
import type { TaskLedgerEntry } from "../conversationLedger";
import "./preacherman-execution-fusion-panel.css";

type AcceptanceStepId = "connection" | "proposal" | "idempotency" | "execution" | "artifacts";
type AcceptanceStepState = "idle" | "running" | "passed" | "failed";

interface ProviderStatus {
  readonly id: string;
  readonly state: string;
  readonly message: string;
  readonly runtime?: { readonly connectedWorkers?: number; readonly connectedNodes?: number; readonly phase?: string };
  readonly workflow?: { readonly id?: string; readonly revision?: number; readonly canonicalHash?: string };
  readonly profile?: string;
}

interface AcceptanceTask {
  readonly taskId: string;
  readonly status: string;
  readonly execution?: { readonly kind?: string; readonly workflowId?: string; readonly workflowRevision?: number; readonly canonicalHash?: string };
  readonly attempts?: readonly { readonly attempt: number; readonly externalRunId?: string }[];
}

interface AcceptanceArtifact {
  readonly artifactId: string;
  readonly name: string;
  readonly status: string;
  readonly sha256?: string;
  readonly sizeBytes?: number;
}

export interface PreachermanExecutionAcceptanceResult {
  readonly taskId: string;
  readonly externalRunId: string;
  readonly workflowId?: string;
  readonly workflowRevision?: number;
  readonly canonicalHash?: string;
  readonly artifacts: readonly AcceptanceArtifact[];
}

const ACCEPTANCE_STEP_IDS: readonly AcceptanceStepId[] = ["connection", "proposal", "idempotency", "execution", "artifacts"];
const TERMINAL_TASK_STATES = new Set(["succeeded", "failed", "cancelled"]);
const ACCEPTANCE_OBJECTIVE = "Research three practical launch options in parallel, cite grounded evidence, and independently verify the final recommendation.";

function acceptanceError(message: string): Error {
  return new Error(message);
}

export async function runPreachermanExecutionFusionAcceptance(
  serviceRequest: <T>(path: string, init?: RequestInit) => Promise<T>,
  options: {
    readonly timeoutMs?: number;
    readonly pollIntervalMs?: number;
    readonly onStep?: (id: AcceptanceStepId, state: AcceptanceStepState, message: string) => void;
  } = {},
): Promise<PreachermanExecutionAcceptanceResult> {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const report = options.onStep ?? (() => undefined);
  const step = async <T,>(id: AcceptanceStepId, operation: () => Promise<T>, passed: string): Promise<T> => {
    report(id, "running", "Running");
    try {
      const result = await operation();
      report(id, "passed", passed);
      return result;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Acceptance step failed.";
      report(id, "failed", message);
      throw reason;
    }
  };

  await step("connection", async () => {
    const response = await serviceRequest<{ providers: readonly ProviderStatus[] }>("/api/execution/providers/status");
    const provider = response.providers.find((candidate) => candidate.id === "preacherman-execution");
    if (!provider || provider.state !== "ready") throw acceptanceError(provider?.message ?? "Preacherman execution status is unavailable.");
    if ((provider.runtime?.connectedNodes ?? 0) < 1 || !provider.workflow?.revision || !provider.profile) {
      throw acceptanceError("Preacherman execution readiness is missing a node, pinned workflow revision, or runtime profile.");
    }
  }, "Provider, node, workflow, and profile are ready.");

  const turn = await step("proposal", async () => {
    const response = await serviceRequest<{ action?: string; proposal?: { readonly proposalId?: string; readonly objective?: string } }>("/api/agent/turn", {
      method: "POST",
      body: JSON.stringify({ input: ACCEPTANCE_OBJECTIVE, locale: "en" }),
    });
    if (response.action !== "propose_task" || !response.proposal?.proposalId || !response.proposal.objective) {
      throw acceptanceError("The agent did not produce a reviewable complex-task proposal.");
    }
    return response.proposal;
  }, "A reviewable complex-task proposal was created.");

  const confirmed = await step("idempotency", async () => {
    const path = `/api/agent/proposals/${encodeURIComponent(turn.proposalId!)}/confirm`;
    const init = { method: "POST", body: JSON.stringify({ objective: turn.objective }) };
    const first = await serviceRequest<{ run?: AcceptanceTask }>(path, init);
    const repeated = await serviceRequest<{ run?: AcceptanceTask }>(path, init);
    if (!first.run?.taskId || repeated.run?.taskId !== first.run.taskId) {
      throw acceptanceError("Duplicate confirmation did not preserve one parent TaskRun.");
    }
    if (first.run.attempts?.length !== 1 || repeated.run.attempts?.length !== 1) {
      throw acceptanceError("Duplicate confirmation created more than one execution Attempt.");
    }
    return first.run;
  }, "Duplicate confirmation preserved one TaskRun and one Attempt.");

  const terminal = await step("execution", async () => {
    const deadline = Date.now() + timeoutMs;
    let latest = confirmed;
    while (!TERMINAL_TASK_STATES.has(latest.status) && Date.now() < deadline) {
      if (pollIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      latest = (await serviceRequest<{ task: AcceptanceTask }>(`/api/tasks/${encodeURIComponent(confirmed.taskId)}`)).task;
    }
    if (latest.status !== "succeeded") {
      throw acceptanceError(latest.status === "failed" || latest.status === "cancelled"
        ? `The Preacherman execution task finished as ${latest.status}.`
        : "The Preacherman execution task did not finish before the acceptance timeout.");
    }
    const attempt = latest.attempts?.[0];
    if (latest.execution?.kind !== "preacherman-execution-dag" || latest.attempts?.length !== 1 || !attempt?.externalRunId) {
      throw acceptanceError("The successful TaskRun is missing its single Preacherman execution link.");
    }
    return latest;
  }, "The real Preacherman execution completed through its parent TaskRun.");

  const artifacts = await step("artifacts", async () => {
    const response = await serviceRequest<{ artifacts: readonly AcceptanceArtifact[] }>(`/api/tasks/${encodeURIComponent(terminal.taskId)}/artifacts`);
    const required = new Set(["plan.json", "verification.json"]);
    for (const artifact of response.artifacts) required.delete(artifact.name);
    if (required.size > 0) throw acceptanceError(`Required artifacts are missing: ${Array.from(required).join(", ")}.`);
    for (const artifact of response.artifacts) {
      if (artifact.status !== "ready" || !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? "") || !Number.isSafeInteger(artifact.sizeBytes)) {
        throw acceptanceError(`Artifact ${artifact.name} is not a validated ready artifact.`);
      }
    }
    return response.artifacts;
  }, "Required artifacts were projected with validated size and SHA-256.");

  return {
    taskId: terminal.taskId,
    externalRunId: terminal.attempts![0]!.externalRunId!,
    workflowId: terminal.execution?.workflowId,
    workflowRevision: terminal.execution?.workflowRevision,
    canonicalHash: terminal.execution?.canonicalHash,
    artifacts,
  };
}

function initialSteps(): Record<AcceptanceStepId, { state: AcceptanceStepState; message: string }> {
  return Object.fromEntries(ACCEPTANCE_STEP_IDS.map((id) => [id, { state: "idle", message: "Not run" }])) as Record<AcceptanceStepId, { state: AcceptanceStepState; message: string }>;
}

export function PreachermanExecutionFusionPanel({ locale, serviceRequest, view = "diagnostics" }: {
  readonly locale: Locale;
  readonly serviceRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  readonly view?: "diagnostics" | "trace";
}) {
  const chinese = locale === "zh-CN";
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [tasks, setTasks] = useState<readonly TaskLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [steps, setSteps] = useState(initialSteps);
  const [acceptance, setAcceptance] = useState<PreachermanExecutionAcceptanceResult | null>(null);
  const [acceptanceFailure, setAcceptanceFailure] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [providers, recentTasks] = await Promise.all([
        serviceRequest<{ providers: readonly ProviderStatus[] }>("/api/execution/providers/status"),
        serviceRequest<{ tasks: readonly TaskLedgerEntry[] }>("/api/tasks?limit=8"),
      ]);
      setProvider(providers.providers.find((candidate) => candidate.id === "preacherman-execution") ?? null);
      setTasks(recentTasks.tasks);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Fusion diagnostics failed."); }
    finally { setLoading(false); }
  }, [serviceRequest]);
  useEffect(() => { void refresh(); }, [refresh]);

  const runAcceptance = useCallback(async () => {
    setAccepting(true); setAcceptanceFailure(null); setAcceptance(null); setSteps(initialSteps());
    try {
      const result = await runPreachermanExecutionFusionAcceptance(serviceRequest, {
        onStep: (id, state, message) => setSteps((current) => ({ ...current, [id]: { state, message } })),
      });
      setAcceptance(result);
      await refresh();
    } catch (reason) {
      setAcceptanceFailure(reason instanceof Error ? reason.message : "Fusion acceptance failed.");
    } finally { setAccepting(false); }
  }, [refresh, serviceRequest]);

  const preachermanExecutionTasks = tasks.filter((task) => task.execution?.kind === "preacherman-execution-dag");
  const stepLabels: Record<AcceptanceStepId, string> = chinese
    ? { connection: "连接与配置", proposal: "任务提案", idempotency: "单任务幂等", execution: "真实协同执行", artifacts: "产物校验" }
    : { connection: "Connection & config", proposal: "Task proposal", idempotency: "Single-task idempotency", execution: "Real collaborative run", artifacts: "Artifact validation" };
  return <section className="preacherman-execution-fusion" data-preacherman-control={view === "trace" ? "execution.trace runtime.task-attempt-run" : "runtime.preacherman-execution-diagnostics"}>
    <header><div><span>{view === "trace" ? (chinese ? "执行映射" : "Execution mapping") : (chinese ? "融合诊断" : "Fusion diagnostics")}</span><h3>{view === "trace" ? "Task → Attempt → Run" : "Preacherman Execution"}</h3></div><button disabled={loading || accepting} onClick={() => void refresh()} type="button">{loading ? (chinese ? "检查中" : "Checking") : (chinese ? "重新检查" : "Check again")}</button></header>
    {error ? <p className="preacherman-execution-fusion__error" role="alert">{error}</p> : null}
    {view === "diagnostics" ? <>
      <div className="preacherman-execution-fusion__checks">
        <article><span>{chinese ? "本地服务" : "Local service"}</span><strong data-state={error ? "error" : "ready"}>{error ? (chinese ? "异常" : "Error") : (chinese ? "已连接" : "Connected")}</strong><p>{chinese ? "任务与证据 API 可访问" : "Task and evidence APIs are reachable"}</p></article>
        <article><span>Preacherman Execution</span><strong data-state={provider?.state ?? "error"}>{provider?.state ?? (chinese ? "未知" : "Unknown")}</strong><p>{provider?.message ?? (chinese ? "没有状态" : "No status")}</p></article>
        <article><span>{chinese ? "执行资源" : "Execution resources"}</span><strong data-state={(provider?.runtime?.connectedNodes ?? 0) > 0 ? "ready" : "configuration-required"}>{provider?.runtime?.connectedNodes ?? 0} {chinese ? "个 Node" : "nodes"}</strong><p>{provider?.runtime?.connectedWorkers ?? 0} {chinese ? "个活动 Worker；空闲为 0 属正常" : "active workers; zero is normal while idle"}</p></article>
        <article><span>{chinese ? "固定工作流" : "Pinned workflow"}</span><strong data-state={provider?.workflow?.revision ? "ready" : "configuration-required"}>{provider?.workflow?.id ?? "—"}</strong><p>revision {provider?.workflow?.revision ?? "—"} · {provider?.workflow?.canonicalHash?.slice(0, 12) ?? "—"}</p></article>
      </div>
      <div className="preacherman-execution-fusion__acceptance">
        <div><strong>{chinese ? "真实融合验收" : "Real fusion acceptance"}</strong><p>{chinese ? "创建一个真实复杂任务，并验证单 Task、单 Attempt、单 Run 和受校验产物。" : "Creates one real complex task and verifies one Task, one Attempt, one Run, and validated artifacts."}</p></div>
        <button data-preacherman-control="execution.acceptance" disabled={accepting || loading || provider?.state !== "ready"} onClick={() => void runAcceptance()} type="button">{accepting ? (chinese ? "正在运行验收" : "Running acceptance") : (chinese ? "运行融合验收" : "Run fusion acceptance")}</button>
      </div>
      {acceptanceFailure ? <p className="preacherman-execution-fusion__error" role="alert">{acceptanceFailure}</p> : null}
      <ol className="preacherman-execution-fusion__steps">{ACCEPTANCE_STEP_IDS.map((id) => <li key={id} data-state={steps[id].state}><span>{stepLabels[id]}</span><strong>{steps[id].state}</strong><small>{steps[id].message}</small></li>)}</ol>
      {acceptance ? <div className="preacherman-execution-fusion__result" role="status"><strong>{chinese ? "验收通过" : "Acceptance passed"}</strong><code>Task · {acceptance.taskId}</code><code>Run · {acceptance.externalRunId}</code><span>{acceptance.artifacts.length} {chinese ? "个已校验产物" : "validated artifacts"}</span></div> : null}
      <small>{provider?.state === "ready"
        ? (chinese ? "验收只通过 Preacherman API 运行；浏览器不会直接访问底层执行服务。" : "Acceptance runs only through Preacherman APIs; the browser never contacts the underlying execution service directly.")
        : (chinese ? "请先在 Settings / Connections 完成真实模型与运行配置；未就绪时不会创建假 Run。" : "Configure a real model and runtime profile in Settings / Connections first; no fake Run is created while blocked.")}</small>
    </> : preachermanExecutionTasks.length ? <ol className="preacherman-execution-fusion__trace">{preachermanExecutionTasks.map((task) => {
      const projected = task.events.filter((event) => event.evidence?.provider === "preacherman-execution" || event.sourceId?.startsWith(task.attempts?.[0]?.externalRunId ?? "never:"));
      return <li key={task.taskId}>
        <div><span>Task</span><strong>{task.taskId}</strong><small>{task.status}</small><code>{task.execution?.workflowId ?? "workflow"} · rev {task.execution?.workflowRevision ?? "—"} · {task.execution?.canonicalHash?.slice(0, 12) ?? "—"}</code></div>
        {task.attempts?.length ? task.attempts.map((attempt) => <div key={attempt.attempt}><span>Attempt #{attempt.attempt}</span><strong>{attempt.provider}</strong><small>{attempt.status}</small>{attempt.externalRunId ? <code>Run · {attempt.externalRunId}</code> : <code>{chinese ? "尚未创建 Run" : "Run not created"}</code>}</div>) : <div><span>Attempt</span><strong>{chinese ? "尚未开始" : "Not started"}</strong></div>}
        {task.pendingApproval ? <div><span>{chinese ? "待审批" : "Approval"}</span><strong>{task.pendingApproval.title}</strong><small>pending</small><code>{task.pendingApproval.approvalId}</code></div> : null}
        {projected.slice(-8).map((event, index) => <div className="preacherman-execution-fusion__event" key={event.sourceId ?? `${task.taskId}:${index}`}><span>{event.evidence?.sourceEvent ?? event.type ?? "event"}</span><strong>{event.stage}</strong><small>#{event.evidence?.sourceIndex ?? "—"}</small><code>{event.message}</code></div>)}
      </li>;
    })}</ol> : <p className="preacherman-execution-fusion__empty">{chinese ? "还没有 Preacherman 复杂任务。发起复杂任务后，这里会显示真实的 Task、Attempt、Run 与事件投影。" : "No Preacherman complex task yet. Real Task, Attempt, Run, and event projections will appear after a complex task starts."}</p>}
  </section>;
}
