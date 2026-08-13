import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { Locale } from "../preferences";
import "./preacherman-agent-workspace.css";

export type AgentWorkspaceServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export type AgentWorkspaceAvailability =
  | "ready"
  | "configuration-required"
  | "login-required"
  | "external-runtime-required"
  | "error";

export type AgentWorkspacePolicy = "auto" | "ask" | "strict";
export type AgentWorkspaceTaskStatus =
  | "queued"
  | "submitting"
  | "running"
  | "waiting_for_input"
  | "waiting_for_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AgentWorkspaceModel {
  readonly id: string;
  readonly label: string;
  readonly status: AgentWorkspaceAvailability;
  readonly verified?: boolean;
}

export interface AgentWorkspaceProvider {
  readonly id: string;
  readonly label: string;
  readonly status: AgentWorkspaceAvailability;
  readonly models: readonly AgentWorkspaceModel[];
}

export interface AgentWorkspaceAgent {
  readonly id: string;
  readonly label: string;
  readonly status: AgentWorkspaceAvailability;
  readonly description?: string;
  readonly providers: readonly AgentWorkspaceProvider[];
}

export interface AgentWorkspaceApprovedWorkspace {
  readonly id: string;
  readonly label: string;
  readonly path?: string;
}

export interface AgentWorkspaceArtifact {
  readonly artifactId: string;
  readonly name: string;
  readonly mediaType?: string;
  readonly status?: string;
}

export interface AgentWorkspaceProposal {
  readonly proposalId: string;
  readonly taskId?: string;
  readonly approvalId?: string;
  readonly objective: string;
  readonly executor?: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
}

export interface AgentWorkspaceTask {
  readonly taskId: string;
  readonly objective: string;
  readonly status: AgentWorkspaceTaskStatus;
  readonly events: readonly { readonly stage: string; readonly message: string; readonly at?: string }[];
  readonly artifacts: readonly AgentWorkspaceArtifact[];
  readonly error?: string;
  readonly summary?: string;
}

export interface AgentWorkspaceTurnResult {
  readonly displayText?: string;
  readonly proposal?: AgentWorkspaceProposal;
  readonly task?: AgentWorkspaceTask;
}

export interface PreachermanAgentWorkspaceProps {
  readonly locale: Locale;
  readonly serviceRequest: AgentWorkspaceServiceRequest;
  readonly onOpenSettings?: () => void;
  readonly onOpenTask?: (taskId: string) => void;
  readonly onOpenArtifact?: (artifact: AgentWorkspaceArtifact, taskId: string) => void;
}

interface AgentWorkspaceCatalog {
  readonly agents: readonly AgentWorkspaceAgent[];
  readonly workspaces: readonly AgentWorkspaceApprovedWorkspace[];
}

const availabilityValues = new Set<unknown>([
  "ready", "configuration-required", "login-required", "external-runtime-required", "error",
]);
const taskStatusValues = new Set<unknown>([
  "queued", "submitting", "running", "waiting_for_input", "waiting_for_approval",
  "succeeded", "failed", "cancelled", "interrupted",
]);
const activeTaskStatuses = new Set<AgentWorkspaceTaskStatus>([
  "queued", "submitting", "running", "waiting_for_input", "waiting_for_approval",
]);

const copy = {
  en: {
    eyebrow: "Preacherman Agent",
    title: "What would you like to work on?",
    description: "Describe the outcome. Preacherman keeps approval and the TaskRun record while the selected Agent executes.",
    placeholder: "Ask anything, investigate a question, or describe work to complete...",
    send: "Send",
    stop: "Stop",
    stopping: "Stopping",
    sending: "Sending",
    reload: "Reload options",
    addContext: "Add context",
    contextTitle: "Workspace and context",
    contextHint: "Only service-approved workspaces are exposed here. File upload is not available yet.",
    conversationContext: "Recent conversation context is included by Preacherman.",
    noWorkspace: "No approved workspace",
    policy: "Approval policy",
    policies: {
      auto: "Auto for low risk",
      ask: "Ask before actions",
      strict: "Strict approval",
    },
    policyHints: {
      auto: "Low-risk reads may start automatically; risky actions still require approval.",
      ask: "Preacherman asks before an action needs approval.",
      strict: "Every executable action requires explicit approval.",
    },
    configuration: "Agent, provider and model",
    chooseConfiguration: "Choose execution configuration",
    agent: "Agent",
    provider: "Provider",
    model: "Model",
    close: "Close",
    loading: "Loading available Agents, providers and models...",
    empty: "No Agent configuration was reported by the local service.",
    loadError: "Execution options could not be loaded.",
    retry: "Try again",
    unavailable: "The selected execution configuration is not ready.",
    configure: "Open Settings",
    selectionMissing: "Choose a ready Agent, provider and model before sending.",
    workspaceMissing: "Choose an approved workspace for workspace write access.",
    proposal: "Proposal",
    reviewTask: "Review approval and execution controls in the existing Task workspace.",
    approveAndRun: "Approve and run",
    approving: "Approving",
    openTask: "Open task",
    taskRun: "TaskRun",
    artifacts: "Artifacts",
    openArtifact: "Open artifact",
    noActivity: "Start with a question or a concrete outcome. Responses, proposals and real TaskRun results will appear here.",
    you: "You",
    preacherman: "Preacherman",
    requestError: "Preacherman could not complete the request.",
    status: {
      ready: "Ready", "configuration-required": "Configuration required", "login-required": "Login required",
      "external-runtime-required": "Runtime required", error: "Unavailable",
    },
    taskStatus: {
      queued: "Queued", submitting: "Submitting", running: "Running", waiting_for_input: "Input needed",
      waiting_for_approval: "Approval needed", succeeded: "Completed", failed: "Failed", cancelled: "Cancelled",
      interrupted: "Interrupted",
    },
  },
  "zh-CN": {
    eyebrow: "Preacherman Agent",
    title: "你想完成什么？",
    description: "描述目标。Preacherman 负责审批与 TaskRun 记录，所选 Agent 负责执行。",
    placeholder: "随意提问、调查问题，或描述需要完成的工作…",
    send: "发送",
    stop: "停止",
    stopping: "停止中",
    sending: "发送中",
    reload: "重新加载选项",
    addContext: "添加上下文",
    contextTitle: "工作区与上下文",
    contextHint: "这里只呈现服务端批准的工作区。当前版本尚未提供文件上传。",
    conversationContext: "Preacherman 会自动带上近期对话上下文。",
    noWorkspace: "没有已批准的工作区",
    policy: "审批策略",
    policies: {
      auto: "低风险自动执行",
      ask: "执行前询问",
      strict: "严格审批",
    },
    policyHints: {
      auto: "低风险读取可以自动开始，高风险动作仍需审批。",
      ask: "需要批准的动作会先由 Preacherman 询问。",
      strict: "所有可执行动作都需要明确批准。",
    },
    configuration: "Agent、接口与模型",
    chooseConfiguration: "选择执行配置",
    agent: "Agent",
    provider: "API / Provider",
    model: "模型",
    close: "关闭",
    loading: "正在加载可用 Agent、接口与模型…",
    empty: "本地服务尚未返回任何 Agent 配置。",
    loadError: "无法加载执行选项。",
    retry: "重试",
    unavailable: "当前执行配置尚未就绪。",
    configure: "打开设置",
    selectionMissing: "请先选择可用的 Agent、接口与模型。",
    workspaceMissing: "工作区写入需要选择一个已批准的工作区。",
    proposal: "任务提案",
    reviewTask: "审批与执行控制仍统一放在现有任务工作台。",
    approveAndRun: "批准并执行",
    approving: "批准中",
    openTask: "打开任务",
    taskRun: "TaskRun",
    artifacts: "产物",
    openArtifact: "打开产物",
    noActivity: "从问题或明确目标开始。回复、提案和真实 TaskRun 结果会显示在这里。",
    you: "你",
    preacherman: "Preacherman",
    requestError: "Preacherman 无法完成本次请求。",
    status: {
      ready: "可用", "configuration-required": "需要配置", "login-required": "需要登录",
      "external-runtime-required": "需要运行环境", error: "不可用",
    },
    taskStatus: {
      queued: "排队中", submitting: "提交中", running: "执行中", waiting_for_input: "等待输入",
      waiting_for_approval: "等待审批", succeeded: "已完成", failed: "失败", cancelled: "已取消",
      interrupted: "已中断",
    },
  },
} as const;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid response.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function availability(value: unknown, label: string): AgentWorkspaceAvailability {
  if (!availabilityValues.has(value)) throw new Error(`${label} status is invalid.`);
  return value as AgentWorkspaceAvailability;
}

function parseModel(value: unknown): AgentWorkspaceModel {
  const item = object(value, "Model");
  return { id: string(item.id, "Model id"), label: string(item.label, "Model label"), status: availability(item.status, "Model"), verified: item.verified === true };
}

function parseProvider(value: unknown): AgentWorkspaceProvider {
  const item = object(value, "Provider");
  if (!Array.isArray(item.models)) throw new Error("Provider returned an invalid model list.");
  return { id: string(item.id, "Provider id"), label: string(item.label, "Provider label"), status: availability(item.status, "Provider"), models: item.models.map(parseModel) };
}

function parseAgent(value: unknown): AgentWorkspaceAgent {
  const item = object(value, "Agent");
  if (!Array.isArray(item.providers)) throw new Error("Agent returned an invalid provider list.");
  return {
    id: string(item.id, "Agent id"), label: string(item.label, "Agent label"), status: availability(item.status, "Agent"),
    description: optionalString(item.description), providers: item.providers.map(parseProvider),
  };
}

function parseWorkspace(value: unknown): AgentWorkspaceApprovedWorkspace {
  const item = object(value, "Workspace");
  return { id: string(item.id, "Workspace id"), label: string(item.label, "Workspace label"), path: optionalString(item.path) };
}

function parseArtifact(value: unknown): AgentWorkspaceArtifact {
  const item = object(value, "Artifact");
  return {
    artifactId: string(item.artifactId ?? item.id, "Artifact id"), name: string(item.name, "Artifact name"),
    mediaType: optionalString(item.mediaType), status: optionalString(item.status),
  };
}

function parseProposal(value: unknown): AgentWorkspaceProposal {
  const item = object(value, "Proposal");
  if (!Array.isArray(item.inputs) || !item.inputs.every((entry) => typeof entry === "string")) throw new Error("Proposal inputs are invalid.");
  if (!Array.isArray(item.outputs) || !item.outputs.every((entry) => typeof entry === "string")) throw new Error("Proposal outputs are invalid.");
  return {
    proposalId: string(item.proposalId, "Proposal id"), taskId: optionalString(item.taskId ?? item.runId),
    approvalId: optionalString(item.approvalId), objective: string(item.objective, "Proposal objective"),
    executor: optionalString(item.executor), inputs: item.inputs.map(String), outputs: item.outputs.map(String),
  };
}

export function parseAgentWorkspaceTask(value: unknown): AgentWorkspaceTask {
  const wrapped = object(value, "Task service");
  const item = "task" in wrapped ? object(wrapped.task, "Task") : wrapped;
  if (!taskStatusValues.has(item.status)) throw new Error("Task status is invalid.");
  const rawEvents = item.events ?? [];
  const rawArtifacts = item.artifacts ?? (item.artifact ? [item.artifact] : []);
  if (!Array.isArray(rawEvents) || !Array.isArray(rawArtifacts)) throw new Error("Task activity is invalid.");
  const events = rawEvents.map((value) => {
    const event = object(value, "Task event");
    return { stage: string(event.stage, "Task event stage"), message: string(event.message, "Task event message"), at: optionalString(event.at) };
  });
  return {
    taskId: string(item.taskId ?? item.runId, "Task id"), objective: string(item.objective, "Task objective"),
    status: item.status as AgentWorkspaceTaskStatus, events, artifacts: rawArtifacts.map(parseArtifact),
    error: optionalString(item.error) ?? optionalString(object(item.error ?? {}, "Task error").message),
    summary: optionalString(item.aAgentSummary),
  };
}

export async function loadAgentWorkspaceCatalog(serviceRequest: AgentWorkspaceServiceRequest): Promise<AgentWorkspaceCatalog> {
  const payload = object(await serviceRequest<unknown>("/api/agent-workspace/catalog"), "Agent workspace catalog");
  if (!Array.isArray(payload.agents) || !Array.isArray(payload.workspaces)) throw new Error("Agent workspace catalog is incomplete.");
  return { agents: payload.agents.map(parseAgent), workspaces: payload.workspaces.map(parseWorkspace) };
}

export async function submitAgentWorkspaceTurn(
  serviceRequest: AgentWorkspaceServiceRequest,
  input: {
    readonly text: string; readonly locale: Locale; readonly agentId: string; readonly providerId: string;
    readonly modelId: string; readonly policy: AgentWorkspacePolicy; readonly workspaceId?: string;
  },
): Promise<AgentWorkspaceTurnResult> {
  const text = input.text.trim();
  if (!text) throw new Error("Input is required.");
  const payload = object(await serviceRequest<unknown>("/api/agent-workspace/turn", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: text, locale: input.locale,
      selection: { agentId: input.agentId, providerId: input.providerId, modelId: input.modelId },
      policy: input.policy, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    }),
  }), "Agent workspace turn");
  const displayText = optionalString(payload.displayText);
  const proposal = payload.proposal == null ? undefined : parseProposal(payload.proposal);
  const task = payload.task == null ? undefined : parseAgentWorkspaceTask(payload.task);
  if (!displayText && !proposal && !task) throw new Error("Agent workspace turn returned no displayable result.");
  return { displayText, proposal, task };
}

function firstReadyAgent(agents: readonly AgentWorkspaceAgent[]): AgentWorkspaceAgent | undefined {
  return agents.find((agent) => agent.id === "preacherman-native")
    ?? agents.find((agent) => agent.status === "ready" && agent.providers.some((provider) => provider.status === "ready" && provider.models.some((model) => model.status === "ready")))
    ?? agents[0];
}

export function PreachermanAgentWorkspace({ locale, serviceRequest, onOpenSettings, onOpenTask, onOpenArtifact }: PreachermanAgentWorkspaceProps) {
  const text = copy[locale];
  const baseId = useId();
  const [catalog, setCatalog] = useState<AgentWorkspaceCatalog | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [policy, setPolicy] = useState<AgentWorkspacePolicy>("ask");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [turnState, setTurnState] = useState<"idle" | "submitting" | "approving" | "stopping">("idle");
  const [messages, setMessages] = useState<readonly { readonly role: "user" | "assistant"; readonly text: string }[]>([]);
  const [proposal, setProposal] = useState<AgentWorkspaceProposal | null>(null);
  const [task, setTask] = useState<AgentWorkspaceTask | null>(null);
  const [reportedTaskId, setReportedTaskId] = useState("");

  const selectedAgent = useMemo(() => catalog?.agents.find((agent) => agent.id === agentId), [agentId, catalog]);
  const selectedProvider = useMemo(() => selectedAgent?.providers.find((provider) => provider.id === providerId), [providerId, selectedAgent]);
  const selectedModel = useMemo(() => selectedProvider?.models.find((model) => model.id === modelId), [modelId, selectedProvider]);
  const activeTask = Boolean(task && activeTaskStatuses.has(task.status));
  const selectionReady = selectedAgent?.status === "ready" && selectedProvider?.status === "ready" && selectedModel?.status === "ready";
  const canSend = loadState === "ready" && selectionReady && input.trim() && turnState === "idle" && !activeTask;

  const chooseAgent = useCallback((next: AgentWorkspaceAgent | undefined) => {
    setAgentId(next?.id ?? "");
    const provider = next?.providers.find((item) => item.status === "ready" && item.models.some((model) => model.status === "ready")) ?? next?.providers[0];
    setProviderId(provider?.id ?? "");
    setModelId(provider?.models.find((model) => model.status === "ready")?.id ?? provider?.models[0]?.id ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading"); setError("");
    try {
      const next = await loadAgentWorkspaceCatalog(serviceRequest);
      setCatalog(next);
      chooseAgent(firstReadyAgent(next.agents));
      setWorkspaceId((current) => next.workspaces.some((workspace) => workspace.id === current) ? current : next.workspaces[0]?.id ?? "");
      setLoadState("ready");
    } catch (reason) {
      setCatalog(null); setLoadState("error"); setError(reason instanceof Error ? reason.message : text.loadError);
    }
  }, [chooseAgent, serviceRequest, text.loadError]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!task || !activeTask) return undefined;
    const timer = window.setInterval(() => {
      void serviceRequest<unknown>(`/api/tasks/${encodeURIComponent(task.taskId)}`)
        .then((payload) => setTask(parseAgentWorkspaceTask(payload)))
        .catch((reason) => setError(reason instanceof Error ? reason.message : text.requestError));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [activeTask, serviceRequest, task, text.requestError]);

  useEffect(() => {
    if (!task || activeTask || task.taskId === reportedTaskId) return;
    if (task.summary || task.status !== "succeeded") {
      if (task.summary || task.error) setMessages((current) => [...current, { role: "assistant", text: task.summary ?? task.error! }]);
      setReportedTaskId(task.taskId);
      return;
    }
    let cancelled = false;
    void serviceRequest<unknown>(`/api/tasks/${encodeURIComponent(task.taskId)}/summary`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }),
    }).then((payload) => {
      if (cancelled) return;
      const summarized = parseAgentWorkspaceTask(payload);
      setTask(summarized);
      if (summarized.summary) setMessages((current) => [...current, { role: "assistant", text: summarized.summary! }]);
      setReportedTaskId(summarized.taskId);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : text.requestError);
    });
    return () => { cancelled = true; };
  }, [activeTask, locale, reportedTaskId, serviceRequest, task, text.requestError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || !selectedAgent || !selectedProvider || !selectedModel) return;
    const candidate = input.trim();
    setTurnState("submitting"); setError(""); setProposal(null);
    setMessages((current) => [...current, { role: "user", text: candidate }]);
    try {
      const result = await submitAgentWorkspaceTurn(serviceRequest, {
        text: candidate, locale, agentId: selectedAgent.id, providerId: selectedProvider.id, modelId: selectedModel.id,
        policy, ...(workspaceId ? { workspaceId } : {}),
      });
      setInput("");
      if (result.displayText) setMessages((current) => [...current, { role: "assistant", text: result.displayText! }]);
      setProposal(result.proposal ?? null);
      if (result.task) setTask(result.task);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.requestError);
    } finally { setTurnState("idle"); }
  }

  async function stopTask() {
    if (!task || !activeTask || turnState !== "idle") return;
    setTurnState("stopping"); setError("");
    try {
      const payload = await serviceRequest<unknown>(`/api/tasks/${encodeURIComponent(task.taskId)}/commands`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "cancel" }),
      });
      setTask(parseAgentWorkspaceTask(payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.requestError);
    } finally { setTurnState("idle"); }
  }

  async function approveProposal() {
    const proposalTaskId = proposal?.taskId ?? task?.taskId;
    if (!proposal?.approvalId || !proposalTaskId || turnState !== "idle") return;
    setTurnState("approving"); setError("");
    try {
      const payload = await serviceRequest<unknown>(`/api/tasks/${encodeURIComponent(proposalTaskId)}/commands`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approve", approvalId: proposal.approvalId }),
      });
      setTask(parseAgentWorkspaceTask(payload));
      setProposal(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.requestError);
    } finally { setTurnState("idle"); }
  }

  function selectProvider(provider: AgentWorkspaceProvider) {
    setProviderId(provider.id);
    setModelId(provider.models.find((model) => model.status === "ready")?.id ?? provider.models[0]?.id ?? "");
  }

  const selectionSummary = [selectedAgent?.label, selectedProvider?.label, selectedModel?.label].filter(Boolean).join(" / ");
  const sendDisabledReason = !selectionReady ? text.selectionMissing : "";

  return (
    <section className="preacherman-agent-workspace" aria-labelledby={`${baseId}-title`} data-load-state={loadState}>
      <header className="preacherman-agent-workspace__header">
        <div><p className="preacherman-agent-workspace__eyebrow">{text.eyebrow}</p><h2 id={`${baseId}-title`}>{text.title}</h2><p>{text.description}</p></div>
        <button className="preacherman-agent-workspace__quiet-button" disabled={loadState === "loading" || turnState !== "idle"} onClick={() => void load()} type="button">{text.reload}</button>
      </header>

      {loadState === "loading" ? <div className="preacherman-agent-workspace__notice" role="status"><span aria-hidden="true" className="preacherman-agent-workspace__spinner" />{text.loading}</div> : null}
      {loadState === "error" ? <div className="preacherman-agent-workspace__notice" data-kind="error" role="alert"><span><strong>{text.loadError}</strong> {error}</span><button onClick={() => void load()} type="button">{text.retry}</button></div> : null}
      {loadState === "ready" && catalog?.agents.length === 0 ? <div className="preacherman-agent-workspace__notice" data-kind="empty"><span>{text.empty}</span>{onOpenSettings ? <button onClick={onOpenSettings} type="button">{text.configure}</button> : null}</div> : null}

      {loadState === "ready" && catalog && catalog.agents.length > 0 ? <>
        <div className="preacherman-agent-workspace__activity" aria-live="polite">
          {messages.length === 0 && !proposal && !task ? <p className="preacherman-agent-workspace__empty">{text.noActivity}</p> : null}
          {messages.slice(-6).map((message, index) => <article className="preacherman-agent-workspace__message" data-role={message.role} key={`${message.role}-${index}`}><strong>{message.role === "user" ? text.you : text.preacherman}</strong><p>{message.text}</p></article>)}
          {proposal ? <article className="preacherman-agent-workspace__proposal"><header><span>{text.proposal}</span>{proposal.executor ? <small>{proposal.executor}</small> : null}</header><h3>{proposal.objective}</h3><p>{proposal.inputs.join(" · ")} → {proposal.outputs.join(" · ")}</p><footer><small>{text.reviewTask}</small><div>{proposal.approvalId && (proposal.taskId || task?.taskId) ? <button disabled={turnState !== "idle"} onClick={() => void approveProposal()} type="button">{turnState === "approving" ? text.approving : text.approveAndRun}</button> : null}{onOpenTask && (proposal.taskId || task?.taskId) ? <button onClick={() => onOpenTask(proposal.taskId ?? task!.taskId)} type="button">{text.openTask}</button> : null}</div></footer></article> : null}
          {task ? <article className="preacherman-agent-workspace__task" data-status={task.status}><header><div><span>{text.taskRun}</span><strong>{text.taskStatus[task.status]}</strong></div><small>{task.taskId}</small></header><h3>{task.objective}</h3>{task.events.length ? <ol>{task.events.slice(-4).map((event, index) => <li key={`${event.stage}-${index}`}><span>{event.stage}</span><p>{event.message}</p></li>)}</ol> : null}{task.error ? <p className="preacherman-agent-workspace__task-error" role="alert">{task.error}</p> : null}{task.artifacts.length ? <div className="preacherman-agent-workspace__artifacts"><strong>{text.artifacts}</strong>{task.artifacts.map((artifact) => <button disabled={!onOpenArtifact} key={artifact.artifactId} onClick={() => onOpenArtifact?.(artifact, task.taskId)} type="button"><span>{artifact.name}</span><small>{artifact.mediaType ?? artifact.status ?? text.openArtifact}</small></button>)}</div> : null}{onOpenTask ? <footer><button onClick={() => onOpenTask(task.taskId)} type="button">{text.openTask}</button></footer> : null}</article> : null}
          {error ? <p className="preacherman-agent-workspace__inline-error" role="alert">{error}</p> : null}
        </div>

        <form className="preacherman-agent-workspace__composer" onSubmit={submit}>
          <label className="preacherman-agent-workspace__input-label" htmlFor={`${baseId}-input`}>{text.placeholder}</label>
          <textarea id={`${baseId}-input`} aria-describedby={`${baseId}-composer-hint`} disabled={activeTask || turnState !== "idle"} maxLength={8_000} onChange={(event) => setInput(event.currentTarget.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} placeholder={text.placeholder} rows={4} value={input} />
          <div className="preacherman-agent-workspace__toolbar">
            <div className="preacherman-agent-workspace__toolbar-left">
              <button aria-expanded={contextOpen} aria-label={text.addContext} className="preacherman-agent-workspace__icon-button" onClick={() => { setContextOpen((current) => !current); setSelectorOpen(false); }} type="button">+</button>
              <label className="preacherman-agent-workspace__policy"><span>{text.policy}</span><select aria-label={text.policy} disabled={activeTask} onChange={(event) => setPolicy(event.currentTarget.value as AgentWorkspacePolicy)} value={policy}><option value="auto">{text.policies.auto}</option><option value="ask">{text.policies.ask}</option><option value="strict">{text.policies.strict}</option></select></label>
            </div>
            <div className="preacherman-agent-workspace__toolbar-right">
              <button aria-expanded={selectorOpen} className="preacherman-agent-workspace__selection-button" data-ready={selectionReady} onClick={() => { setSelectorOpen((current) => !current); setContextOpen(false); }} type="button"><span>{selectionSummary || text.configuration}</span><small>{selectedModel ? text.status[selectedModel.status] : text.unavailable}</small></button>
              {activeTask ? <button aria-label={turnState === "stopping" ? text.stopping : text.stop} className="preacherman-agent-workspace__send-button" data-action="stop" disabled={turnState !== "idle"} onClick={() => void stopTask()} type="button">{turnState === "stopping" ? "…" : "■"}</button> : <button aria-label={turnState === "submitting" ? text.sending : text.send} className="preacherman-agent-workspace__send-button" disabled={!canSend} title={sendDisabledReason} type="submit">{turnState === "submitting" ? "…" : "↑"}</button>}
            </div>
          </div>
          <p id={`${baseId}-composer-hint`} className="preacherman-agent-workspace__composer-hint">{text.policyHints[policy]}{sendDisabledReason ? ` ${sendDisabledReason}` : ""}</p>

          {contextOpen ? <section className="preacherman-agent-workspace__popover preacherman-agent-workspace__context-popover" aria-label={text.contextTitle}><header><strong>{text.contextTitle}</strong><button onClick={() => setContextOpen(false)} type="button">{text.close}</button></header><p>{text.contextHint}</p><label htmlFor={`${baseId}-workspace`}>{text.contextTitle}</label><select disabled={catalog.workspaces.length === 0} id={`${baseId}-workspace`} onChange={(event) => setWorkspaceId(event.currentTarget.value)} value={workspaceId}>{catalog.workspaces.length === 0 ? <option value="">{text.noWorkspace}</option> : null}{catalog.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label}{workspace.path ? ` · ${workspace.path}` : ""}</option>)}</select><small>{text.conversationContext}</small></section> : null}

          {selectorOpen ? <section className="preacherman-agent-workspace__popover preacherman-agent-workspace__selector" aria-label={text.chooseConfiguration}><header><strong>{text.chooseConfiguration}</strong><button onClick={() => setSelectorOpen(false)} type="button">{text.close}</button></header><div className="preacherman-agent-workspace__selector-grid"><div><h3>{text.agent}</h3>{catalog.agents.map((agent) => <button aria-pressed={agent.id === agentId} data-state={agent.status} key={agent.id} onClick={() => chooseAgent(agent)} type="button"><span>{agent.label}</span><small>{text.status[agent.status]}</small></button>)}</div><div><h3>{text.provider}</h3>{selectedAgent?.providers.map((provider) => <button aria-pressed={provider.id === providerId} data-state={provider.status} key={provider.id} onClick={() => selectProvider(provider)} type="button"><span>{provider.label}</span><small>{text.status[provider.status]}</small></button>)}</div><div><h3>{text.model}</h3>{selectedProvider?.models.map((model) => <button aria-pressed={model.id === modelId} data-state={model.status} key={model.id} onClick={() => setModelId(model.id)} type="button"><span>{model.label}</span><small>{model.verified ? `${text.status[model.status]} · verified` : text.status[model.status]}</small></button>)}</div></div>{!selectionReady ? <footer><span>{text.unavailable}</span>{onOpenSettings ? <button onClick={onOpenSettings} type="button">{text.configure}</button> : null}</footer> : null}</section> : null}
        </form>
      </> : null}
    </section>
  );
}
