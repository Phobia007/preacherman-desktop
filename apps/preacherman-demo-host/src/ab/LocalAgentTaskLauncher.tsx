import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { Locale } from "../preferences";
import "./local-agent-task-launcher.css";

export type LocalAgentLauncherServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type ExecutionMode = "preacherman-local" | "local-agent";
type AgentAuthState = "ready" | "login-required" | "unknown" | "error";

export interface LocalAgentDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly installed: boolean;
  readonly version: string | null;
  readonly auth: { readonly state: AgentAuthState };
  readonly capabilities: Readonly<Record<string, boolean>>;
}

export interface LocalAgentWorkspace {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export interface LocalAgentTask {
  readonly taskId: string;
  readonly status: string;
  readonly objective?: string;
  readonly [key: string]: unknown;
}

export interface LocalAgentTaskLauncherProps {
  readonly locale: Locale;
  readonly serviceRequest: LocalAgentLauncherServiceRequest;
  readonly embedded?: boolean;
  readonly onPreachermanSubmit?: (objective: string) => void | Promise<void>;
  readonly onTaskCreated?: (task: LocalAgentTask) => void | Promise<void>;
}

interface LauncherOptions {
  readonly agents: readonly LocalAgentDescriptor[];
  readonly workspaces: readonly LocalAgentWorkspace[];
}

const copy = {
  en: {
    eyebrow: "Execution agent",
    title: "Run a task",
    description: "Use Preacherman directly or hand the task to a signed-in local Agent subscription.",
    objective: "Task",
    objectivePlaceholder: "Describe the outcome you want the Agent to produce.",
    mode: "Execution method",
    local: "Preacherman Local",
    localHint: "Use the built-in Preacherman execution route.",
    agentMode: "Local Agent",
    agentModeHint: "Run an installed Agent with your existing login.",
    agent: "Agent",
    workspace: "Workspace",
    workspaceHint: "Only folders approved by the local Preacherman service are available.",
    loading: "Checking local Agents and approved workspaces...",
    loadError: "Local execution options could not be loaded.",
    retry: "Try again",
    noAgents: "No ready local Agent is available. Install and sign in to an Agent, then refresh.",
    noWorkspaces: "No approved workspace is available. Add one in Preacherman settings first.",
    ready: "Ready",
    notInstalled: "Not installed",
    loginRequired: "Login required",
    unknown: "Status unknown",
    agentError: "Unavailable",
    version: "Version",
    submit: "Create task",
    submitting: "Starting task...",
    created: "Task created",
    prepared: "Proposal ready",
    started: "Agent started",
    submitError: "The task could not be started.",
  },
  "zh-CN": {
    eyebrow: "执行 Agent",
    title: "运行任务",
    description: "直接使用 Preacherman，或把任务交给已登录的本地 Agent 订阅执行。",
    objective: "任务",
    objectivePlaceholder: "描述你希望 Agent 完成的结果。",
    mode: "执行方式",
    local: "Preacherman Local",
    localHint: "使用 Preacherman 内置执行路径。",
    agentMode: "本地 Agent",
    agentModeHint: "通过已有登录运行本机安装的 Agent。",
    agent: "Agent",
    workspace: "工作目录",
    workspaceHint: "这里只提供 Preacherman 本地服务已批准的目录。",
    loading: "正在检查本地 Agent 与已批准工作目录...",
    loadError: "无法加载本地执行选项。",
    retry: "重试",
    noAgents: "当前没有可用的本地 Agent。请先安装并登录 Agent，然后刷新。",
    noWorkspaces: "当前没有已批准的工作目录，请先在 Preacherman 设置中添加。",
    ready: "可用",
    notInstalled: "未安装",
    loginRequired: "需要登录",
    unknown: "状态未知",
    agentError: "不可用",
    version: "版本",
    submit: "创建任务",
    submitting: "正在启动任务...",
    created: "任务已创建",
    prepared: "任务方案已生成",
    started: "Agent 已启动",
    submitError: "任务未能启动。",
  },
} as const;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid response.`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function parseAgent(value: unknown): LocalAgentDescriptor {
  const item = object(value, "Local Agent");
  const auth = object(item.auth, "Local Agent authentication");
  const state = auth.state;
  if (!new Set<unknown>(["ready", "login-required", "unknown", "error"]).has(state)) {
    throw new Error("Local Agent authentication state is invalid.");
  }
  const rawCapabilities = object(item.capabilities ?? {}, "Local Agent capabilities");
  const capabilities = Object.fromEntries(
    Object.entries(rawCapabilities).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
  return {
    id: nonEmptyString(item.id, "Local Agent id"),
    label: nonEmptyString(item.label, "Local Agent label"),
    kind: nonEmptyString(item.kind, "Local Agent kind"),
    installed: item.installed === true,
    version: typeof item.version === "string" && item.version.trim() ? item.version.trim() : null,
    auth: { state: state as AgentAuthState },
    capabilities,
  };
}

function parseWorkspace(value: unknown): LocalAgentWorkspace {
  const item = object(value, "Workspace");
  return {
    id: nonEmptyString(item.id, "Workspace id"),
    label: nonEmptyString(item.label, "Workspace label"),
    path: nonEmptyString(item.path, "Workspace path"),
  };
}

function parseTask(value: unknown): LocalAgentTask {
  const response = object(value, "Task service");
  const task = object(response.task, "Task service task");
  return {
    ...task,
    taskId: nonEmptyString(task.taskId ?? task.runId, "Task id"),
    status: nonEmptyString(task.status, "Task status"),
  } as LocalAgentTask;
}

export async function loadLocalAgentLauncherOptions(serviceRequest: LocalAgentLauncherServiceRequest): Promise<LauncherOptions> {
  const [agentResponse, workspaceResponse] = await Promise.all([
    serviceRequest<unknown>("/api/execution/local-agents"),
    serviceRequest<unknown>("/api/execution/workspaces"),
  ]);
  const agentPayload = object(agentResponse, "Local Agent service");
  const workspacePayload = object(workspaceResponse, "Workspace service");
  if (!Array.isArray(agentPayload.agents)) throw new Error("Local Agent service returned an invalid Agent list.");
  if (!Array.isArray(workspacePayload.workspaces)) throw new Error("Workspace service returned an invalid workspace list.");
  return {
    agents: agentPayload.agents.map(parseAgent),
    workspaces: workspacePayload.workspaces.map(parseWorkspace),
  };
}

export async function createLauncherTask(
  serviceRequest: LocalAgentLauncherServiceRequest,
  input: { readonly objective: string; readonly mode: ExecutionMode; readonly agentId?: string; readonly workspaceId?: string },
): Promise<LocalAgentTask> {
  const objective = input.objective.trim();
  if (!objective) throw new Error("Task objective is required.");
  const created = parseTask(await serviceRequest<unknown>("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective, source: "local-agent-runner" }),
  }));
  if (input.mode === "preacherman-local") return created;
  if (!input.agentId || !input.workspaceId) throw new Error("A ready Agent and approved workspace are required.");
  return parseTask(await serviceRequest<unknown>(`/api/tasks/${encodeURIComponent(created.taskId)}/local-agent/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: input.agentId, workspaceId: input.workspaceId, policy: "workspace-write" }),
  }));
}

function agentReady(agent: LocalAgentDescriptor): boolean {
  return agent.installed && agent.auth.state === "ready";
}

export function LocalAgentTaskLauncher({
  locale,
  serviceRequest,
  embedded = false,
  onPreachermanSubmit,
  onTaskCreated,
}: LocalAgentTaskLauncherProps) {
  const text = copy[locale];
  const baseId = useId();
  const [mode, setMode] = useState<ExecutionMode>("preacherman-local");
  const [objective, setObjective] = useState("");
  const [options, setOptions] = useState<LauncherOptions | null>(null);
  const [agentId, setAgentId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "succeeded" | "error">("idle");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    setMessage("");
    try {
      const next = await loadLocalAgentLauncherOptions(serviceRequest);
      setOptions(next);
      setAgentId((current) => next.agents.some((agent) => agent.id === current && agentReady(agent))
        ? current
        : next.agents.find(agentReady)?.id ?? "");
      setWorkspaceId((current) => next.workspaces.some((workspace) => workspace.id === current)
        ? current
        : next.workspaces[0]?.id ?? "");
      setLoadState("ready");
    } catch (error) {
      setOptions(null);
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : text.loadError);
    }
  }, [serviceRequest, text.loadError]);

  useEffect(() => { void load(); }, [load]);

  const selectedAgent = useMemo(() => options?.agents.find((agent) => agent.id === agentId) ?? null, [agentId, options]);
  const localAgentBlocked = mode === "local-agent" && (!selectedAgent || !agentReady(selectedAgent) || !workspaceId);
  const submitDisabled = loadState !== "ready" || submitState === "submitting" || !objective.trim() || localAgentBlocked;

  const statusLabel = useCallback((agent: LocalAgentDescriptor) => {
    if (!agent.installed) return text.notInstalled;
    if (agent.auth.state === "ready") return text.ready;
    if (agent.auth.state === "login-required") return text.loginRequired;
    if (agent.auth.state === "error") return text.agentError;
    return text.unknown;
  }, [text]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled) return;
    setSubmitState("submitting");
    setMessage("");
    try {
      if (mode === "preacherman-local" && onPreachermanSubmit) {
        await onPreachermanSubmit(objective.trim());
        setSubmitState("succeeded");
        setMessage(text.prepared);
        return;
      }
      const task = await createLauncherTask(serviceRequest, { objective, mode, agentId, workspaceId });
      setSubmitState("succeeded");
      setMessage(mode === "local-agent" ? `${text.started} · ${task.taskId}` : `${text.created} · ${task.taskId}`);
      void Promise.resolve(onTaskCreated?.(task)).catch(() => undefined);
    } catch (error) {
      setSubmitState("error");
      setMessage(error instanceof Error ? error.message : text.submitError);
    }
  }

  return (
    <section className="local-agent-launcher" data-embedded={embedded} aria-labelledby={`${baseId}-title`}>
      <header className="local-agent-launcher__header" hidden={embedded}>
        <p className="local-agent-launcher__eyebrow">{text.eyebrow}</p>
        <h2 id={`${baseId}-title`}>{text.title}</h2>
        <p>{text.description}</p>
      </header>

      {loadState === "loading" ? <p className="local-agent-launcher__notice" role="status">{text.loading}</p> : null}
      {loadState === "error" ? (
        <div className="local-agent-launcher__notice local-agent-launcher__notice--error" role="alert">
          <span>{text.loadError} {message}</span>
          <button type="button" onClick={() => void load()}>{text.retry}</button>
        </div>
      ) : null}

      {loadState === "ready" && options ? (
        <form className="local-agent-launcher__form" onSubmit={submit}>
          <div className="local-agent-launcher__field">
            <label htmlFor={`${baseId}-objective`}>{text.objective}</label>
            <textarea
              id={`${baseId}-objective`}
              value={objective}
              onChange={(event) => setObjective(event.currentTarget.value)}
              placeholder={text.objectivePlaceholder}
              maxLength={2_000}
              rows={4}
              required
            />
          </div>

          <fieldset className="local-agent-launcher__mode">
            <legend>{text.mode}</legend>
            <label className="local-agent-launcher__choice">
              <input type="radio" name={`${baseId}-mode`} checked={mode === "preacherman-local"} onChange={() => setMode("preacherman-local")} />
              <span><strong>{text.local}</strong><small>{text.localHint}</small></span>
            </label>
            <label className="local-agent-launcher__choice">
              <input type="radio" name={`${baseId}-mode`} checked={mode === "local-agent"} onChange={() => setMode("local-agent")} />
              <span><strong>{text.agentMode}</strong><small>{text.agentModeHint}</small></span>
            </label>
          </fieldset>

          {mode === "local-agent" ? (
            <div className="local-agent-launcher__agent-fields">
              <div className="local-agent-launcher__field">
                <label htmlFor={`${baseId}-agent`}>{text.agent}</label>
                <select id={`${baseId}-agent`} value={agentId} onChange={(event) => setAgentId(event.currentTarget.value)} disabled={!options.agents.some(agentReady)} required>
                  {!options.agents.some(agentReady) ? <option value="">{text.noAgents}</option> : null}
                  {options.agents.map((agent) => (
                    <option key={agent.id} value={agent.id} disabled={!agentReady(agent)}>
                      {agent.label} · {statusLabel(agent)}{agent.version ? ` · ${text.version} ${agent.version}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="local-agent-launcher__field">
                <label htmlFor={`${baseId}-workspace`}>{text.workspace}</label>
                <select id={`${baseId}-workspace`} value={workspaceId} onChange={(event) => setWorkspaceId(event.currentTarget.value)} disabled={options.workspaces.length === 0} required>
                  {options.workspaces.length === 0 ? <option value="">{text.noWorkspaces}</option> : null}
                  {options.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label} · {workspace.path}</option>)}
                </select>
                <small>{text.workspaceHint}</small>
              </div>
            </div>
          ) : null}

          <footer className="local-agent-launcher__footer">
            <p className={`local-agent-launcher__result local-agent-launcher__result--${submitState}`} aria-live="polite">
              {submitState === "submitting" ? text.submitting : message}
            </p>
            <button className="local-agent-launcher__submit" type="submit" disabled={submitDisabled}>
              {submitState === "submitting" ? text.submitting : text.submit}
            </button>
          </footer>
        </form>
      ) : null}
    </section>
  );
}
