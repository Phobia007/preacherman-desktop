import { useEffect, useState } from "react";
import {
  loadRecentConversations,
  loadRecentTasks,
  type ConversationLedgerEntry,
  type TaskLedgerEntry,
} from "../conversationLedger";
import { loadAiriCapabilityEvents, type AiriCapabilityEvent } from "../airi/capabilityClient";
import type { Locale } from "../preferences";
import { AiriMemoryPersonaPanel } from "../airi/AiriMemoryPersonaPanel";

type LedgerView = "conversations" | "tasks" | "artifacts" | "capabilities";

export function ConversationLedgerScreen({ locale, serviceRequest }: {
  readonly locale: Locale;
  readonly serviceRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [entries, setEntries] = useState<readonly ConversationLedgerEntry[]>([]);
  const [tasks, setTasks] = useState<readonly TaskLedgerEntry[]>([]);
  const [capabilityEvents, setCapabilityEvents] = useState<readonly AiriCapabilityEvent[]>([]);
  const [view, setView] = useState<LedgerView>(() => {
    const requested = sessionStorage.getItem("preacherman.ledger-view");
    sessionStorage.removeItem("preacherman.ledger-view");
    return requested === "tasks" || requested === "artifacts" || requested === "capabilities" ? requested : "conversations";
  });

  useEffect(() => {
    void Promise.all([loadRecentConversations(), loadRecentTasks(), loadAiriCapabilityEvents()]).then(([nextEntries, nextTasks, nextCapabilityEvents]) => {
      setEntries(nextEntries);
      setTasks(nextTasks);
      setCapabilityEvents(nextCapabilityEvents);
    });
  }, []);

  const chinese = locale === "zh-CN";
  const artifactTasks = tasks.filter((task) => task.artifact);

  return <main className="demo-host demo-ledger" aria-label={chinese ? "会话账本" : "Conversation ledger"}>
    <div className="demo-ledger__content">
      <header><span>{chinese ? "记忆与执行记录" : "Memory & execution ledger"}</span><small>{chinese ? "保留对话、TaskRun 事件和产物引用；不保存音频或密钥。" : "Conversation, TaskRun events, and artifact references are retained; never audio or keys."}</small></header>
      <nav aria-label={chinese ? "Ledger 分类" : "Ledger views"} className="demo-ledger__tabs">
        <button aria-pressed={view === "conversations"} data-airi-control="conversation.history" onClick={() => setView("conversations")} type="button">{chinese ? "对话" : "Conversations"}</button>
        <button aria-pressed={view === "tasks"} data-airi-control="task.events" onClick={() => setView("tasks")} type="button">{chinese ? "任务事件" : "Task events"}</button>
        <button aria-pressed={view === "artifacts"} data-airi-control="task.artifacts" onClick={() => setView("artifacts")} type="button">{chinese ? "产物" : "Artifacts"}</button>
        <button aria-pressed={view === "capabilities"} data-airi-control="runtime.io-history plugin.activity" onClick={() => setView("capabilities")} type="button">{chinese ? "AIRI 调用" : "AIRI calls"}</button>
      </nav>
      {view === "conversations" ? entries.length ? <ol className="demo-ledger__list">{entries.map((entry) => <li key={entry.id}><time>{new Date(entry.updatedAt).toLocaleString()}</time><p>{entry.messages.at(-1)?.text || (chinese ? "空会话" : "Empty conversation")}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "还没有已保存的会话。" : "No saved conversations yet."}</p> : null}
      {view === "tasks" ? tasks.length ? <ol className="demo-ledger__list">{tasks.map((task) => <li data-status={task.status} key={task.taskId}><time>{new Date(task.updatedAt).toLocaleString()} · {task.status}</time><strong>{task.objective}</strong>{task.toolCall ? <dl className="demo-ledger__metadata"><div><dt>{chinese ? "插件" : "Plugin"}</dt><dd><code>{task.providerPluginId ?? task.pluginId ?? (chinese ? "宿主" : "Host")}</code></dd></div><div><dt>{chinese ? "工具" : "Tool"}</dt><dd><code>{task.toolCall.qualifiedName ?? task.toolCall.name}</code></dd></div><div><dt>{chinese ? "参数摘要" : "Parameter summary"}</dt><dd>{task.toolCall.parameterSummary?.keys.length ? task.toolCall.parameterSummary.keys.join(", ") : (chinese ? "无参数" : "No parameters")}{task.toolCall.parameterSummary ? ` · ${task.toolCall.parameterSummary.byteLength} B` : null}</dd></div></dl> : null}<p>{task.events.at(-1)?.message || (chinese ? "等待执行" : "Waiting to run")}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "还没有 TaskRun。" : "No TaskRuns yet."}</p> : null}
      {view === "artifacts" ? artifactTasks.length ? <ol className="demo-ledger__list">{artifactTasks.map((task) => <li key={task.taskId}><time>{new Date(task.updatedAt).toLocaleString()}</time><strong>{task.artifact?.name}</strong><p><code>{task.artifact?.path}</code></p>{task.artifact?.content !== undefined ? <pre className="demo-ledger__artifact-preview">{JSON.stringify(task.artifact.content, null, 2)}</pre> : null}</li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "任务完成后，产物会出现在这里。" : "Completed task artifacts will appear here."}</p> : null}
      {view === "capabilities" ? capabilityEvents.length ? <ol className="demo-ledger__list">{capabilityEvents.map((event) => <li data-status={event.state} key={event.eventId}><time>{new Date(event.at).toLocaleString()} · {event.state}</time><strong>{event.capabilityId}</strong><p>{event.message}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "点击任一 AIRI 功能后，后端适配结果会记录在这里。" : "Backend adapter results appear here after any AIRI capability is clicked."}</p> : null}
    </div>
    <AiriMemoryPersonaPanel locale={locale} serviceRequest={serviceRequest} />
  </main>;
}
