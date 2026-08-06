import { useEffect, useState } from "react";
import { loadRecentConversations, type ConversationLedgerEntry } from "../conversationLedger";
import type { Locale } from "../preferences";

export function ConversationLedgerScreen({ locale }: { readonly locale: Locale }) {
  const [entries, setEntries] = useState<readonly ConversationLedgerEntry[]>([]);
  useEffect(() => { void loadRecentConversations().then(setEntries); }, []);
  const chinese = locale === "zh-CN";
  return <main className="demo-host demo-ledger" aria-label={chinese ? "会话账本" : "Conversation ledger"}>
    <header><span>{chinese ? "最近会话" : "Recent conversations"}</span><small>{chinese ? "仅保存文本、任务和产物引用；不保存音频或密钥。" : "Only text, task state, and artifact references are retained; never audio or keys."}</small></header>
    {entries.length ? <ol>{entries.map((entry) => <li key={entry.id}><time>{new Date(entry.updatedAt).toLocaleString()}</time><p>{entry.messages.at(-1)?.text || (chinese ? "空会话" : "Empty conversation")}</p></li>)}</ol> : <p>{chinese ? "还没有已保存的会话。" : "No saved conversations yet."}</p>}
  </main>;
}
