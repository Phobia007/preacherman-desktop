import type { Locale } from "./preferences";
import { localServiceUrl } from "./serviceConfig";

export interface LedgerMessage { readonly role: "user" | "assistant"; readonly text: string; }
export interface ConversationLedgerEntry { readonly id: string; readonly locale: Locale; readonly updatedAt: string; readonly messages: readonly LedgerMessage[]; }
export interface TaskLedgerEntry {
  readonly taskId: string;
  readonly objective: string;
  readonly status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  readonly updatedAt: string;
  readonly events: readonly { readonly stage: string; readonly message: string }[];
  readonly artifact: { readonly name: string; readonly path: string } | null;
}

const LEDGER_KEY = "preacherman.conversation-ledger.v1";
const CURRENT_ID_KEY = "preacherman.current-conversation-id";

function readEntries(): ConversationLedgerEntry[] {
  try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]") as ConversationLedgerEntry[]; } catch { return []; }
}

function currentId(): string {
  const stored = localStorage.getItem(CURRENT_ID_KEY);
  if (stored) return stored;
  const id = `conversation:${crypto.randomUUID()}`;
  localStorage.setItem(CURRENT_ID_KEY, id);
  return id;
}

/** Starts a fresh local conversation without deleting the saved conversation history. */
export function beginNewConversation(): string {
  const id = `conversation:${crypto.randomUUID()}`;
  localStorage.setItem(CURRENT_ID_KEY, id);
  return id;
}

export function saveConversation(locale: Locale, messages: readonly LedgerMessage[]): void {
  // A blank draft should not overwrite the previous conversation or appear in history.
  if (messages.length === 0) return;
  const id = currentId();
  const next: ConversationLedgerEntry = { id, locale, updatedAt: new Date().toISOString(), messages: messages.slice(-20) };
  const entries = readEntries().filter((entry) => entry.id !== id);
  localStorage.setItem(LEDGER_KEY, JSON.stringify([next, ...entries].slice(0, 10)));
  void fetch(localServiceUrl(`/api/conversations/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  }).catch(() => undefined);
}

export function readRecentConversations(): readonly ConversationLedgerEntry[] { return readEntries(); }

export async function loadRecentConversations(): Promise<readonly ConversationLedgerEntry[]> {
  try {
    const response = await fetch(localServiceUrl("/api/conversations/recent"));
    if (!response.ok) throw new Error("Local service unavailable");
    const payload = await response.json() as { entries?: ConversationLedgerEntry[] };
    return Array.isArray(payload.entries) ? payload.entries : readEntries();
  } catch {
    return readEntries();
  }
}

export async function loadRecentTasks(): Promise<readonly TaskLedgerEntry[]> {
  try {
    const response = await fetch(localServiceUrl("/api/tasks?limit=10"));
    if (!response.ok) return [];
    const payload = await response.json() as { tasks?: TaskLedgerEntry[] };
    return Array.isArray(payload.tasks) ? payload.tasks : [];
  } catch {
    return [];
  }
}
