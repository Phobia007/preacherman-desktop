import { useEffect, useState } from "react";
import {
  loadRecentConversations,
  loadRecentTasks,
  type ConversationLedgerEntry,
  type TaskLedgerEntry,
} from "../conversationLedger";
import type { Locale } from "../preferences";

type LedgerView = "conversations" | "tasks" | "artifacts";

export function ConversationLedgerScreen({ locale }: { readonly locale: Locale }) {
  const [entries, setEntries] = useState<readonly ConversationLedgerEntry[]>([]);
  const [tasks, setTasks] = useState<readonly TaskLedgerEntry[]>([]);
  const [view, setView] = useState<LedgerView>(() => {
    const requested = sessionStorage.getItem("preacherman.ledger-view");
    sessionStorage.removeItem("preacherman.ledger-view");
    return requested === "tasks" || requested === "artifacts" ? requested : "conversations";
  });
  useEffect(() => {
    void Promise.all([loadRecentConversations(), loadRecentTasks()]).then(([nextEntries, nextTasks]) => {
      setEntries(nextEntries);
      setTasks(nextTasks);
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
      </nav>
      {view === "conversations" ? entries.length ? <ol className="demo-ledger__list">{entries.map((entry) => <li key={entry.id}><time>{new Date(entry.updatedAt).toLocaleString()}</time><p>{entry.messages.at(-1)?.text || (chinese ? "空会话" : "Empty conversation")}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "还没有已保存的会话。" : "No saved conversations yet."}</p> : null}
      {view === "tasks" ? tasks.length ? <ol className="demo-ledger__list">{tasks.map((task) => <li data-status={task.status} key={task.taskId}><time>{new Date(task.updatedAt).toLocaleString()} · {task.status}</time><strong>{task.objective}</strong><p>{task.events.at(-1)?.message || (chinese ? "等待执行" : "Waiting to run")}</p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "还没有 TaskRun。" : "No TaskRuns yet."}</p> : null}
      {view === "artifacts" ? artifactTasks.length ? <ol className="demo-ledger__list">{artifactTasks.map((task) => <li key={task.taskId}><time>{new Date(task.updatedAt).toLocaleString()}</time><strong>{task.artifact?.name}</strong><p><code>{task.artifact?.path}</code></p></li>)}</ol> : <p className="demo-ledger__empty">{chinese ? "任务完成后，产物会出现在这里。" : "Completed task artifacts will appear here."}</p> : null}
    </div>
  </main>;
}
