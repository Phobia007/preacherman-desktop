import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  loadRecentConversations,
  loadRecentTasks,
  type ConversationLedgerEntry,
  type TaskLedgerEntry,
} from "../conversationLedger";
import { loadAiriCapabilityEvents, type AiriCapabilityEvent } from "../airi/capabilityClient";
import type { Locale } from "../preferences";
import { AiriMemoryPersonaPanel } from "../airi/AiriMemoryPersonaPanel";
import { openLocalSurface } from "../demo/screenRoute";

type LedgerView = "conversations" | "tasks" | "artifacts" | "capabilities";
type LedgerMode = "activity" | "memory" | "widgets";

function ledgerModeForControl(controlId?: string | null): LedgerMode {
  if (controlId?.startsWith("memory.")) return "memory";
  if (controlId === "plugin.widgets") return "widgets";
  return "activity";
}

function ledgerViewForControl(controlId?: string | null): LedgerView {
  if (controlId === "task.events") return "tasks";
  if (controlId === "task.artifacts") return "artifacts";
  if (controlId === "runtime.io-history" || controlId === "plugin.activity") return "capabilities";
  return "conversations";
}

function taskArtifacts(task: TaskLedgerEntry) {
  if (task.artifacts?.length) return task.artifacts;
  return task.artifact ? [task.artifact] : [];
}

export function ConversationLedgerScreen({ locale, requestedControl, serviceRequest, widgets }: {
  readonly locale: Locale;
  readonly requestedControl?: string | null;
  readonly serviceRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  readonly widgets?: ReactNode;
}) {
  const [entries, setEntries] = useState<readonly ConversationLedgerEntry[]>([]);
  const [tasks, setTasks] = useState<readonly TaskLedgerEntry[]>([]);
  const [capabilityEvents, setCapabilityEvents] = useState<readonly AiriCapabilityEvent[]>([]);
  const [mode, setMode] = useState<LedgerMode>(() => ledgerModeForControl(requestedControl));
  const [view, setView] = useState<LedgerView>(() => ledgerViewForControl(requestedControl));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [nextEntries, nextTasks, nextCapabilityEvents] = await Promise.all([loadRecentConversations(), loadRecentTasks(), loadAiriCapabilityEvents()]);
    setEntries(nextEntries); setTasks(nextTasks); setCapabilityEvents(nextCapabilityEvents); setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!requestedControl) return;
    setMode(ledgerModeForControl(requestedControl));
    setView(ledgerViewForControl(requestedControl));
  }, [requestedControl]);
  useEffect(() => {
    const revealControl = (event: Event) => {
      const controlId = (event as CustomEvent<{ readonly controlId?: string }>).detail?.controlId ?? "";
      setMode(ledgerModeForControl(controlId));
      setView(ledgerViewForControl(controlId));
    };
    window.addEventListener("preacherman:reveal-control", revealControl);
    return () => window.removeEventListener("preacherman:reveal-control", revealControl);
  }, []);

  const chinese = locale === "zh-CN";
  const artifactTasks = tasks.filter((task) => taskArtifacts(task).length > 0);

  return <main className="demo-host demo-ledger" aria-label={chinese ? "任务与会话账本" : "Task and conversation ledger"}>
    <nav aria-label={chinese ? "账本分类" : "Ledger categories"} className="demo-ledger__mode-tabs">
      <button aria-pressed={mode === "activity"} onClick={() => setMode("activity")} type="button">{chinese ? "活动与证据" : "Activity & evidence"}</button>
      <button aria-pressed={mode === "memory"} data-airi-control="memory.recall" onClick={() => setMode("memory")} type="button">{chinese ? "记忆" : "Memory"}</button>
      <button aria-pressed={mode === "widgets"} data-airi-control="plugin.widgets" onClick={() => setMode("widgets")} type="button">{chinese ? "组件" : "Widgets"}</button>
    </nav>
    {mode === "activity" ? <div className="demo-ledger__content">
      <header><div><span>{chinese ? "可审阅的任务记录" : "Reviewable task record"}</span><small>{chinese ? "Ledger 保存父任务、每次尝试、审批和产物引用；任务操作统一回到 Work。" : "Ledger retains parent tasks, attempts, approvals, and artifact references. Task actions stay in Work."}</small></div><button className="demo-ledger__refresh" disabled={loading} onClick={() => void refresh()} type="button">{loading ? (chinese ? "刷新中" : "Refreshing") : (chinese ? "刷新" : "Refresh")}</button></header>
      <nav aria-label={chinese ? "Ledger 视图" : "Ledger views"} className="demo-ledger__tabs">
        <button aria-pressed={view === "conversations"} data-airi-control="conversation.history" onClick={() => setView("conversations")} type="button">{chinese ? "对话" : "Conversations"}</button>
        <button aria-pressed={view === "tasks"} data-airi-control="task.events" onClick={() => setView("tasks")} type="button">{chinese ? "任务与尝试" : "Tasks & attempts"}</button>
        <button aria-pressed={view === "artifacts"} data-airi-control="task.artifacts" onClick={() => setView("artifacts")} type="button">{chinese ? "产物" : "Artifacts"}</button>
        <button aria-pressed={view === "capabilities"} data-airi-control="runtime.io-history plugin.activity" onClick={() => setView("capabilities")} type="button">{chinese ? "AIRI 调用" : "AIRI calls"}</button>
      </nav>

      {view === "conversations" ? entries.length ? <ol className="demo-ledger__list">{entries.map((entry) => <li key={entry.id}><time>{new Date(entry.updatedAt).toLocaleString()}</time><p>{entry.messages.at(-1)?.text || (chinese ? "空对话" : "Empty conversation")}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "还没有保存的对话。" : "No saved conversations yet."}</p> : null}

      {view === "tasks" ? tasks.length ? <ol className="demo-ledger__list demo-ledger__task-list">{tasks.map((task) => <li data-status={task.status} key={task.taskId}>
        <div className="demo-ledger__task-heading"><div><time>{new Date(task.updatedAt).toLocaleString()}</time><strong>{task.objective}</strong></div><span data-status={task.status}>{task.status.replaceAll("_", " ")}</span></div>
        <dl className="demo-ledger__metadata"><div><dt>{chinese ? "执行方式" : "Executor"}</dt><dd>{task.execution?.kind === "homerail-dag" ? "HomeRail DAG" : "Preacherman local"}</dd></div><div><dt>{chinese ? "尝试次数" : "Attempts"}</dt><dd>{task.attempts?.length ?? 0}</dd></div><div><dt>{chinese ? "产物" : "Artifacts"}</dt><dd>{taskArtifacts(task).length}</dd></div><div><dt>{chinese ? "审批" : "Approval"}</dt><dd>{task.pendingApproval ? (chinese ? "等待决定" : "Pending") : task.approvalHistory?.at(-1)?.status ?? "—"}</dd></div></dl>
        {task.toolCall ? <dl className="demo-ledger__metadata"><div><dt>{chinese ? "插件" : "Plugin"}</dt><dd><code>{task.providerPluginId ?? task.pluginId ?? (chinese ? "宿主" : "Host")}</code></dd></div><div><dt>{chinese ? "工具" : "Tool"}</dt><dd><code>{task.toolCall.qualifiedName ?? task.toolCall.name}</code></dd></div><div><dt>{chinese ? "参数摘要" : "Parameter summary"}</dt><dd>{task.toolCall.parameterSummary?.keys.length ? task.toolCall.parameterSummary.keys.join(", ") : (chinese ? "无参数" : "No parameters")}{task.toolCall.parameterSummary ? ` · ${task.toolCall.parameterSummary.byteLength} B` : null}</dd></div></dl> : null}
        {task.attempts?.length ? <ol className="demo-ledger__attempt-list">{task.attempts.map((attempt) => <li key={attempt.attempt}><span>#{attempt.attempt}</span><strong>{attempt.provider === "homerail" ? "HomeRail" : "Local"}</strong><small>{attempt.status}</small>{attempt.externalRunId ? <code>{attempt.externalRunId}</code> : null}</li>)}</ol> : null}
        {task.pendingApproval ? <p className="demo-ledger__approval-note">{task.pendingApproval.title} · {task.pendingApproval.description}</p> : null}
        {!task.pendingApproval && task.approvalHistory?.at(-1) ? <p className="demo-ledger__approval-note">{chinese ? "审批记录" : "Approval record"} · {task.approvalHistory.at(-1)?.actor ?? (chinese ? "未知审批人" : "Unknown actor")} · <time>{task.approvalHistory.at(-1)?.decidedAt ? new Date(task.approvalHistory.at(-1)!.decidedAt!).toLocaleString() : "—"}</time></p> : null}
        <p>{task.events.at(-1)?.message || (chinese ? "等待执行" : "Waiting to run")}</p>
        <button className="demo-ledger__work-link" onClick={() => openLocalSurface("workspace")} type="button">{chinese ? "前往 Work 操作" : "Open in Work"}</button>
      </li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "还没有任务记录。" : "No tasks yet."}</p> : null}

      {view === "artifacts" ? artifactTasks.length ? <ol className="demo-ledger__list">{artifactTasks.flatMap((task) => taskArtifacts(task).map((artifact) => <li key={`${task.taskId}-${artifact.artifactId ?? artifact.name}`}>
        <time>{new Date(task.updatedAt).toLocaleString()} · {artifact.status ?? "ready"}</time><strong>{artifact.name}</strong><p>{task.objective}</p><p><code>{artifact.contentPath ?? artifact.path ?? task.artifact?.path}</code></p>{artifact.content !== undefined ? <pre className="demo-ledger__artifact-preview">{JSON.stringify(artifact.content, null, 2)}</pre> : null}
      </li>))}</ol> : <p className="demo-ledger__empty">{chinese ? "任务生成产物后，会在这里留下可审阅引用。" : "Reviewable artifact references appear here after a task produces them."}</p> : null}

      {view === "capabilities" ? capabilityEvents.length ? <ol className="demo-ledger__list">{capabilityEvents.map((event) => <li data-status={event.state} key={event.eventId}><time>{new Date(event.at).toLocaleString()} · {event.state}</time><strong>{event.capabilityId}</strong><p>{event.message}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "AIRI 能力调用后，后端适配结果会记录在这里。" : "Backend adapter results appear here after an AIRI capability is invoked."}</p> : null}
    </div> : null}
    {mode === "memory" ? <AiriMemoryPersonaPanel locale={locale} serviceRequest={serviceRequest} /> : null}
    {mode === "widgets" ? widgets : null}
  </main>;
}
