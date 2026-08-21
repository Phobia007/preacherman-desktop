import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Locale } from "../preferences";
import { localServiceUrl } from "../serviceConfig";
import { beginNewConversation, saveConversation, type LedgerMessage } from "../conversationLedger";
import { openLocalSurface } from "../demo/screenRoute";
import { useLiveCoordinator } from "../live/LiveCoordinatorContext";
import { LocalAgentTaskLauncher, type LocalAgentTask } from "./LocalAgentTaskLauncher";
import "./ab-task-console.css";

interface TaskProposal {
  readonly proposalId: string;
  readonly kind?: "plugin-tool";
  readonly executor: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  objective: string;
}

type TaskStatus = "queued" | "running" | "waiting_for_input" | "waiting_for_approval" | "succeeded" | "failed" | "cancelled";

interface TaskAttempt {
  readonly attempt: number;
  readonly provider: string;
  readonly status: string;
  readonly externalRunId?: string;
}

interface TaskArtifact {
  readonly artifactId?: string;
  readonly name: string;
  readonly path?: string;
  readonly contentPath?: string;
  readonly mediaType?: string;
  readonly status?: string;
  readonly primary?: boolean;
}

interface TaskApproval {
  readonly approvalId: string;
  readonly title: string;
  readonly description: string;
}

interface TaskRun {
  readonly taskId?: string;
  readonly runId: string;
  readonly objective: string;
  readonly source?: "preacherman-plugin" | "mcp-gateway" | "local-agent-runner";
  readonly status: TaskStatus;
  readonly execution?: { readonly kind?: string; readonly adapter?: string };
  readonly attempts?: readonly TaskAttempt[];
  readonly events: readonly { readonly stage: string; readonly message: string; readonly at?: string }[];
  readonly artifacts?: readonly TaskArtifact[];
  readonly pendingApproval?: TaskApproval | null;
  readonly toolCall?: { readonly name: string; readonly structuredResult: Readonly<Record<string, unknown>> };
  readonly artifact: TaskArtifact | null;
  readonly error: string | { readonly message?: string } | null;
}

interface Message extends LedgerMessage {}

interface TurnDiagnostics {
  readonly source: "deepseek" | "deepseek-unstructured" | "fallback";
  readonly model: string | null;
  readonly reason: string | null;
}

interface TaskWorkspaceValue {
  readonly messages: readonly Message[];
  readonly input: string;
  readonly proposal: TaskProposal | null;
  readonly run: TaskRun | null;
  readonly error: string | null;
  readonly diagnostics: TurnDiagnostics | null;
  readonly busy: boolean;
  setInput(value: string): void;
  setProposal(value: TaskProposal): void;
  sendText(value: string): Promise<void>;
  confirm(): Promise<void>;
  command(type: "approve" | "cancel" | "reject" | "resume" | "retry" | "steer", input?: string): Promise<void>;
  startNewConversation(): void;
  adoptTask(task: LocalAgentTask): void;
}

const TaskWorkspaceContext = createContext<TaskWorkspaceValue | null>(null);

const copy = {
  en: {
    eyebrow: "Preacherman · Agent coordination",
    homeTitle: "Talk to your companion",
    workTitle: "Task workspace",
    placeholder: "Ask a question or describe a task you want to complete…",
    send: "Send",
    confirm: "Confirm and run",
    stopTask: "Cancel task",
    retry: "Retry task",
    newConversation: "New conversation",
    tryDemo: "Try complex demo",
    demoPrompt: "Run a multi-agent research task for a concise Preacherman demo pitch, independently verify the claims, and produce reviewable artifacts.",
    viewLedger: "Review evidence in Ledger",
    openWork: "Open task workspace",
    proposalReady: "A task proposal is ready. Review and approve it in Work.",
    noTask: "No task is running. Start with the companion on Home or describe a task here.",
    taskStarted: "The task has started. Progress and approvals are available in Work; evidence will be retained in Ledger.",
    pluginTaskStarted: "The approved Preacherman plugin tool is running. Its structured result will be written to Ledger.",
    taskBlocked: "The task was accepted, but its execution service still needs attention. Review the failure below and retry after configuration.",
  },
  "zh-CN": {
    eyebrow: "Preacherman · Agent 协作",
    homeTitle: "与数字伙伴对话",
    workTitle: "任务工作台",
    placeholder: "提出问题，或描述一个需要完成的任务…",
    send: "发送",
    confirm: "确认并执行",
    stopTask: "取消任务",
    retry: "重试任务",
    newConversation: "新对话",
    tryDemo: "体验复杂任务",
    demoPrompt: "发起一个多智能体研究任务，为 Preacherman 制作精简演示方案，独立核验关键信息，并生成可审阅的产物。",
    viewLedger: "在 Ledger 审阅证据",
    openWork: "打开任务工作台",
    proposalReady: "任务方案已经准备好，请前往 Work 审阅并批准执行。",
    noTask: "当前没有执行中的任务。可以从 Home 与伙伴对话，也可以在这里描述任务。",
    taskStarted: "任务已开始。进度与审批集中在 Work，执行证据会保留到 Ledger。",
    pluginTaskStarted: "已批准的 Preacherman 插件工具正在执行，结构化结果会写入 Ledger。",
    taskBlocked: "任务已被接受，但执行服务还需要处理。请查看下方原因，完成配置后重试。",
  },
} as const;

function taskId(run: TaskRun): string { return run.taskId ?? run.runId; }
function isActive(run: TaskRun | null): boolean {
  return Boolean(run && ["queued", "running", "waiting_for_input", "waiting_for_approval"].includes(run.status));
}
function errorText(error: TaskRun["error"]): string | null {
  if (!error) return null;
  return typeof error === "string" ? error : error.message ?? "Task execution failed.";
}

function completionSummary(locale: Locale, objective: string): string {
  const conciseObjective = objective.trim().slice(0, 72) || (locale === "zh-CN" ? "你的目标" : "your objective");
  return locale === "zh-CN"
    ? `任务已完成：${conciseObjective}。产物与执行证据已经保存到 Ledger。`
    : `Task completed: ${conciseObjective}. Artifacts and execution evidence are available in Ledger.`;
}

function runCompletionSummary(locale: Locale, run: TaskRun): string {
  if (run.toolCall && run.artifact?.name !== "pitch-kit.md") {
    return locale === "zh-CN"
      ? `插件工具 ${run.toolCall.name} 已执行完成，结构化结果已写入 ${run.artifact?.name ?? "Ledger 产物"}。`
      : `Plugin tool ${run.toolCall.name} completed. Its structured result is available in ${run.artifact?.name ?? "the Ledger artifact"}.`;
  }
  return completionSummary(locale, run.objective);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(localServiceUrl(path), { headers: { "Content-Type": "application/json" }, ...init });
  const payload = await response.json() as T & { error?: string; task?: TaskRun };
  if (!response.ok) {
    const error = new Error(payload.error || "The local service is unavailable.") as Error & { payload?: typeof payload };
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function TaskWorkspaceProvider({ children, locale }: { readonly children: ReactNode; readonly locale: Locale }) {
  const coordinator = useLiveCoordinator();
  const sessionKey = useMemo(() => `preacherman.conversation.${locale}`, [locale]);
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(sessionKey) || "[]") as Message[]; } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [proposal, setProposalState] = useState<TaskProposal | null>(null);
  const [run, setRun] = useState<TaskRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TurnDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const announcedRunIds = useRef(new Set<string>());

  useEffect(() => {
    if (run) return;
    void request<{ tasks: TaskRun[] }>("/api/tasks?limit=20").then(({ tasks }) => {
      const pending = tasks.find((task) => task.source === "mcp-gateway" && task.status === "waiting_for_approval");
      if (pending) setRun(pending);
    }).catch(() => undefined);
  }, [run]);

  useEffect(() => {
    if (messages.length) localStorage.setItem(sessionKey, JSON.stringify(messages.slice(-10)));
    else localStorage.removeItem(sessionKey);
    saveConversation(locale, messages);
  }, [locale, messages, sessionKey]);

  useEffect(() => {
    if (!isActive(run)) return undefined;
    const conversationEpoch = coordinator.getConversationEpoch();
    const timer = window.setInterval(() => {
      void request<{ task: TaskRun }>(`/api/tasks/${taskId(run!)}`).then(({ task }) => {
        if (coordinator.isConversationEpochCurrent(conversationEpoch)) setRun(task);
      }).catch((reason: Error) => {
        if (coordinator.isConversationEpochCurrent(conversationEpoch)) setError(reason.message);
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [coordinator, run]);

  useEffect(() => {
    if (!run || run.status !== "succeeded" || announcedRunIds.current.has(taskId(run))) return;
    announcedRunIds.current.add(taskId(run));
    const summary = runCompletionSummary(locale, run);
    setMessages((current) => [...current, { role: "assistant", text: summary }]);
    coordinator.requestSpeech(summary.slice(0, 160), locale, taskId(run));
  }, [coordinator, locale, run]);

  const sendText = useCallback(async (candidate: string) => {
    const text = candidate.trim();
    if (!text || busy) return;
    const conversationEpoch = coordinator.getConversationEpoch();
    setBusy(true); setError(null); setInput("");
    setMessages((current) => [...current, { role: "user", text }]);
    try {
      const response = await request<{ displayText: string; speechText?: string; proposal: TaskProposal | null; diagnostics: TurnDiagnostics }>("/api/agent/turn", {
        method: "POST",
        body: JSON.stringify({ input: text, locale, history: [...messages, { role: "user", text }].slice(-10) }),
      });
      if (!coordinator.isConversationEpochCurrent(conversationEpoch)) return;
      setMessages((current) => [...current, { role: "assistant", text: response.displayText }]);
      setDiagnostics(response.diagnostics);
      setProposalState(response.proposal);
      coordinator.requestSpeech((response.speechText || response.displayText).slice(0, 160), locale);
    } catch (reason) {
      if (coordinator.isConversationEpochCurrent(conversationEpoch)) setError(reason instanceof Error ? reason.message : "Unable to reach the companion service.");
    } finally {
      if (coordinator.isConversationEpochCurrent(conversationEpoch)) setBusy(false);
    }
  }, [busy, coordinator, locale, messages]);

  useEffect(() => coordinator.onFinalTranscript((transcript) => void sendText(transcript)), [coordinator, sendText]);

  const confirm = useCallback(async () => {
    if (!proposal || busy) return;
    const conversationEpoch = coordinator.getConversationEpoch();
    setBusy(true); setError(null);
    try {
      const response = await request<{ run: TaskRun }>(`/api/agent/proposals/${proposal.proposalId}/confirm`, {
        method: "POST", body: JSON.stringify({ objective: proposal.objective }),
      });
      if (!coordinator.isConversationEpochCurrent(conversationEpoch)) return;
      setRun(response.run); setProposalState(null);
      const startedMessage = response.run.status === "failed"
        ? copy[locale].taskBlocked
        : proposal.kind === "plugin-tool" ? copy[locale].pluginTaskStarted : copy[locale].taskStarted;
      setMessages((current) => [...current, { role: "assistant", text: startedMessage }]);
      coordinator.requestSpeech(startedMessage.slice(0, 160), locale, taskId(response.run));
    } catch (reason) {
      if (coordinator.isConversationEpochCurrent(conversationEpoch)) {
        const failedTask = (reason as Error & { payload?: { task?: TaskRun } }).payload?.task;
        if (failedTask) { setRun(failedTask); setProposalState(null); }
        setError(reason instanceof Error ? reason.message : "Unable to start the task.");
      }
    } finally {
      if (coordinator.isConversationEpochCurrent(conversationEpoch)) setBusy(false);
    }
  }, [busy, coordinator, locale, proposal]);

  const command = useCallback(async (type: "approve" | "cancel" | "reject" | "resume" | "retry" | "steer", commandInput = "") => {
    if (!run || busy) return;
    setBusy(true); setError(null);
    try {
      if (type === "retry" && run.execution?.kind !== "preacherman-execution-dag" && run.execution?.kind !== "local-agent" && run.source !== "mcp-gateway") {
        const response = await request<{ run: TaskRun }>(`/api/agent/runs/${taskId(run)}/retry`, {
          method: "POST",
          body: JSON.stringify({ approved: run.source === "preacherman-plugin" }),
        });
        setRun(response.run);
        return;
      }
      const response = await request<{ task: TaskRun }>(`/api/tasks/${taskId(run)}/commands`, {
        method: "POST",
        body: JSON.stringify({
          type,
          ...(run.pendingApproval ? { approvalId: run.pendingApproval.approvalId } : {}),
          ...(commandInput.trim() ? { input: commandInput.trim(), instruction: commandInput.trim() } : {}),
        }),
      });
      setRun(response.task);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the task.");
    } finally { setBusy(false); }
  }, [busy, run]);

  useEffect(() => coordinator.connectTaskCancellationAdapter({ cancelTask: async () => { await command("cancel"); } }), [command, coordinator]);

  const startNewConversation = useCallback(() => {
    coordinator.beginConversationEpoch();
    beginNewConversation();
    localStorage.removeItem(sessionKey);
    announcedRunIds.current.clear();
    setMessages([]); setInput(""); setProposalState(null); setRun(null); setError(null); setDiagnostics(null); setBusy(false);
  }, [coordinator, sessionKey]);

  const adoptTask = useCallback((task: LocalAgentTask) => {
    setProposalState(null);
    setError(null);
    setRun(task as unknown as TaskRun);
  }, []);

  const value = useMemo<TaskWorkspaceValue>(() => ({
    messages, input, proposal, run, error, diagnostics, busy, setInput,
    setProposal: setProposalState, sendText, confirm, command, startNewConversation, adoptTask,
  }), [adoptTask, busy, command, confirm, diagnostics, error, input, messages, proposal, run, sendText, startNewConversation]);
  return <TaskWorkspaceContext.Provider value={value}>{children}</TaskWorkspaceContext.Provider>;
}

function useTaskWorkspace(): TaskWorkspaceValue {
  const value = useContext(TaskWorkspaceContext);
  if (!value) throw new Error("ABTaskConsole must be rendered inside TaskWorkspaceProvider.");
  return value;
}

function StatusBadge({ locale, status }: { readonly locale: Locale; readonly status: TaskStatus }) {
  const names: Record<Locale, Record<TaskStatus, string>> = {
    en: { queued: "Queued", running: "Running", waiting_for_input: "Input needed", waiting_for_approval: "Approval needed", succeeded: "Completed", failed: "Failed", cancelled: "Cancelled" },
    "zh-CN": { queued: "排队中", running: "执行中", waiting_for_input: "等待输入", waiting_for_approval: "等待审批", succeeded: "已完成", failed: "失败", cancelled: "已取消" },
  };
  return <span className="ab-task-console__status" data-status={status}>{names[locale][status]}</span>;
}

export function ABTaskConsole({ locale, mode = "work" }: { readonly locale: Locale; readonly mode?: "home" | "work" }) {
  const labels = copy[locale];
  const workspace = useTaskWorkspace();
  const [instruction, setInstruction] = useState("");
  const hasActiveTask = isActive(workspace.run);
  const submit = (event: FormEvent) => { event.preventDefault(); void workspace.sendText(workspace.input); };
  const sendCommand = (type: "resume" | "steer") => {
    const value = instruction.trim();
    if (!value) return;
    void workspace.command(type, value).then(() => setInstruction(""));
  };
  const openWork = () => openLocalSurface("workspace");
  const openLedger = () => { sessionStorage.setItem("preacherman.ledger-view", "artifacts"); openLocalSurface("ledger"); };

  return (
    <section className="ab-task-console" data-preacherman-control="companion.chat" data-mode={mode} data-state={workspace.run?.status || "idle"} tabIndex={-1}>
      <header className="ab-task-console__header">
        <div><span className="ab-task-console__eyebrow">{labels.eyebrow}</span><h2>{mode === "home" ? labels.homeTitle : labels.workTitle}</h2></div>
        <button aria-label={labels.newConversation} className="ab-task-console__button ab-task-console__button--quiet" disabled={workspace.busy || hasActiveTask} onClick={workspace.startNewConversation} type="button">{labels.newConversation}</button>
      </header>

      <div aria-live="polite" className="ab-task-console__result">
        {workspace.messages.slice(-4).map((message, index) => <p key={`${message.role}-${index}`}><strong>{message.role === "user" ? (locale === "zh-CN" ? "你" : "You") : "Preacherman"}</strong> {message.text}</p>)}
        {workspace.error ? <p data-error="true" role="alert">{workspace.error}</p> : null}
        {workspace.diagnostics ? <span className="ab-task-console__diagnostic" data-source={workspace.diagnostics.source}>{workspace.diagnostics.source}{workspace.diagnostics.model ? ` · ${workspace.diagnostics.model}` : null}</span> : null}
      </div>

      {mode === "home" ? <form className="ab-task-console__form" onSubmit={submit}>
        <textarea aria-label={labels.placeholder} data-preacherman-control="task.create" disabled={workspace.busy} onChange={(event) => workspace.setInput(event.target.value)} placeholder={labels.placeholder} rows={mode === "home" ? 2 : 3} value={workspace.input} />
        <div className="ab-task-console__actions">
          <button className="ab-task-console__button ab-task-console__button--quiet" disabled={workspace.busy || hasActiveTask} onClick={() => void workspace.sendText(labels.demoPrompt)} type="button">{labels.tryDemo}</button>
          <button className="ab-task-console__button ab-task-console__button--primary" disabled={!workspace.input.trim() || workspace.busy} type="submit">{labels.send}</button>
        </div>
      </form> : <LocalAgentTaskLauncher
        embedded
        locale={locale}
        onPreachermanSubmit={workspace.sendText}
        onTaskCreated={workspace.adoptTask}
        serviceRequest={request}
      />}

      {mode === "home" ? <div className="ab-task-console__home-summary">
        {workspace.proposal ? <><p>{labels.proposalReady}</p><button className="ab-task-console__button ab-task-console__button--primary" onClick={openWork} type="button">{labels.openWork}</button></> : null}
        {workspace.run ? <><div className="ab-task-console__summary-line"><StatusBadge locale={locale} status={workspace.run.status} /><strong>{workspace.run.objective}</strong></div><button className="ab-task-console__button ab-task-console__button--quiet" onClick={workspace.run.status === "succeeded" ? openLedger : openWork} type="button">{workspace.run.status === "succeeded" ? labels.viewLedger : labels.openWork}</button></> : null}
      </div> : null}

      {mode === "work" ? <>
        {workspace.proposal ? <section className="ab-task-console__approval" data-preacherman-control="task.proposal">
          <span>{workspace.proposal.executor}</span>
          <textarea aria-label={locale === "zh-CN" ? "任务目标" : "Task objective"} onChange={(event) => workspace.setProposal({ ...workspace.proposal!, objective: event.target.value })} value={workspace.proposal.objective} />
          <p>{workspace.proposal.inputs.join(" · ")} → {workspace.proposal.outputs.join(" · ")}</p>
          <button className="ab-task-console__button ab-task-console__button--primary" data-preacherman-control="task.confirm" disabled={workspace.busy || !workspace.proposal.objective.trim()} onClick={() => void workspace.confirm()} type="button">{labels.confirm}</button>
        </section> : null}
        {workspace.run ? <section className="ab-task-console__activity">
          <div className="ab-task-console__summary-line"><StatusBadge locale={locale} status={workspace.run.status} /><strong>{workspace.run.objective}</strong></div>
          <dl className="ab-task-console__attempts"><div><dt>{locale === "zh-CN" ? "执行方式" : "Executor"}</dt><dd>{workspace.run.execution?.kind === "preacherman-execution-dag" ? "Preacherman Execution DAG" : workspace.run.execution?.kind === "local-agent" ? `Local Agent · ${workspace.run.execution.adapter}` : workspace.run.source === "mcp-gateway" ? "External Agent via MCP" : "Preacherman local"}</dd></div><div><dt>{locale === "zh-CN" ? "尝试" : "Attempt"}</dt><dd>{workspace.run.attempts?.at(-1)?.attempt ?? 0}</dd></div></dl>
          {workspace.run.pendingApproval ? <div className="ab-task-console__decision" data-preacherman-control="task.approval"><strong>{workspace.run.pendingApproval.title}</strong><p>{workspace.run.pendingApproval.description}</p><div><button className="ab-task-console__button ab-task-console__button--primary" data-preacherman-control="task.approve" disabled={workspace.busy} onClick={() => void workspace.command("approve")} type="button">{locale === "zh-CN" ? "批准" : "Approve"}</button><button className="ab-task-console__button ab-task-console__button--quiet" data-preacherman-control="task.reject" disabled={workspace.busy} onClick={() => void workspace.command("reject")} type="button">{locale === "zh-CN" ? "拒绝" : "Reject"}</button></div></div> : null}
          {["running", "waiting_for_input"].includes(workspace.run.status) && workspace.run.execution?.kind !== "local-agent" ? <div className="ab-task-console__steer"><label htmlFor="task-instruction">{workspace.run.status === "waiting_for_input" ? (locale === "zh-CN" ? "补充所需信息" : "Provide requested input") : (locale === "zh-CN" ? "追加执行指令" : "Steer this task")}</label><textarea id="task-instruction" onChange={(event) => setInstruction(event.target.value)} rows={2} value={instruction} /><button className="ab-task-console__button ab-task-console__button--quiet" data-preacherman-control={workspace.run.status === "waiting_for_input" ? "task.resume" : "task.steer"} disabled={workspace.busy || !instruction.trim()} onClick={() => sendCommand(workspace.run!.status === "waiting_for_input" ? "resume" : "steer")} type="button">{workspace.run.status === "waiting_for_input" ? (locale === "zh-CN" ? "提交并继续" : "Submit and resume") : (locale === "zh-CN" ? "发送指令" : "Send direction")}</button></div> : null}
          <ol className="ab-task-console__timeline">{workspace.run.events.slice(-6).map((event, index) => <li key={`${event.stage}-${index}`}><span>{event.stage}</span><p>{event.message}</p></li>)}</ol>
          {errorText(workspace.run.error) ? <p data-error="true">{errorText(workspace.run.error)}</p> : null}
          <div className="ab-task-console__actions">
            {["queued", "running", "waiting_for_input", "waiting_for_approval"].includes(workspace.run.status) ? <button className="ab-task-console__button ab-task-console__button--quiet" data-preacherman-control="task.cancel" disabled={workspace.busy} onClick={() => void workspace.command("cancel")} type="button">{labels.stopTask}</button> : null}
            {["failed", "cancelled"].includes(workspace.run.status) ? <button className="ab-task-console__button ab-task-console__button--primary" data-preacherman-control="task.retry" disabled={workspace.busy} onClick={() => void workspace.command("retry")} type="button">{labels.retry}</button> : null}
            {workspace.run.artifacts?.length || workspace.run.artifact ? <button className="ab-task-console__button ab-task-console__button--quiet" onClick={openLedger} type="button">{labels.viewLedger}</button> : null}
          </div>
        </section> : !workspace.proposal ? <p className="ab-task-console__empty">{labels.noTask}</p> : null}
      </> : null}
    </section>
  );
}
