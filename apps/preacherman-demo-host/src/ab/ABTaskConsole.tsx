import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Locale } from "../preferences";
import { localServiceUrl } from "../serviceConfig";
import { beginNewConversation, saveConversation, type LedgerMessage } from "../conversationLedger";
import { useLiveCoordinator } from "../live/LiveCoordinatorContext";
import "./ab-task-console.css";

interface TaskProposal {
  readonly proposalId: string;
  readonly executor: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  objective: string;
}

interface TaskRun {
  readonly runId: string;
  readonly objective: string;
  readonly status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  readonly events: readonly { readonly stage: string; readonly message: string }[];
  readonly artifact: { readonly name: string; readonly path: string } | null;
  readonly error: string | null;
}

interface Message extends LedgerMessage {}

interface TurnDiagnostics {
  readonly source: "deepseek" | "deepseek-unstructured" | "fallback";
  readonly model: string | null;
  readonly reason: string | null;
}

const copy = {
  en: {
    eyebrow: "Preacherman · Agent coordination",
    title: "Talk to your companion",
    placeholder: "Ask a question or describe a PitchKit you want to create…",
    send: "Send",
    confirm: "Confirm and run",
    running: "Your PitchKit is being prepared",
    artifact: "Artifact ready",
    stopTask: "Stop task",
    retry: "Retry",
    newConversation: "New conversation",
    deepseekReply: "DeepSeek reply",
    deepseekPlainReply: "DeepSeek reply (plain text)",
    fallbackReply: "Local fallback — DeepSeek did not return a usable reply",
    taskStarted: "I’m preparing your PitchKit now. You can keep talking to me while it runs—tell me what you want to emphasize, simplify, or add.",
  },
  "zh-CN": {
    eyebrow: "Preacherman · Agent 协作",
    title: "和你的数字伙伴对话",
    placeholder: "说说你的想法，或描述要生成的 PitchKit…",
    send: "发送",
    confirm: "确认并执行",
    running: "正在生成 PitchKit",
    artifact: "产物已完成",
    stopTask: "停止任务",
    retry: "重试",
    newConversation: "新对话",
    deepseekReply: "DeepSeek 已回复",
    deepseekPlainReply: "DeepSeek 已回复（非结构化）",
    fallbackReply: "本地兜底回复：DeepSeek 未返回可用结果",
    taskStarted: "好的，我正在生成 PitchKit。执行期间你仍然可以继续告诉我：想重点强调什么、删减什么，或补充哪些信息。",
  },
} as const;

function completionSummary(locale: Locale, objective: string): string {
  const conciseObjective = objective.trim().slice(0, 72) || (locale === "zh-CN" ? "你的目标" : "your objective");
  return locale === "zh-CN"
    ? `PitchKit 已完成。我已经围绕“${conciseObjective}”整理出一份 10 页路演框架，包含受众、价值主张、演示大纲和下一步建议。你可以查看产物，或继续让我帮你优化其中一页。`
    : `Your PitchKit is ready. I created a 10-slide framework for “${conciseObjective}” with audience, value proposition, presentation outline, and next steps. You can review it or ask me to refine any slide.`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(localServiceUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The local service is unavailable.");
  return payload;
}

export function ABTaskConsole({ locale }: { readonly locale: Locale }) {
  const labels = copy[locale];
  const coordinator = useLiveCoordinator();
  const sessionKey = useMemo(() => `preacherman.conversation.${locale}`, [locale]);
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(sessionKey) || "[]") as Message[]; } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState<TaskProposal | null>(null);
  const [run, setRun] = useState<TaskRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TurnDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const announcedRunIds = useRef(new Set<string>());

  useEffect(() => {
    if (messages.length) localStorage.setItem(sessionKey, JSON.stringify(messages.slice(-10)));
    else localStorage.removeItem(sessionKey);
    saveConversation(locale, messages);
  }, [locale, messages, sessionKey]);
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return undefined;
    const timer = window.setInterval(() => {
      void request<{ run: TaskRun }>(`/api/agent/runs/${run.runId}`).then(({ run: next }) => setRun(next)).catch((reason: Error) => setError(reason.message));
    }, 700);
    return () => window.clearInterval(timer);
  }, [run]);
  useEffect(() => {
    if (!run || run.status !== "succeeded" || announcedRunIds.current.has(run.runId)) return;
    announcedRunIds.current.add(run.runId);
    const summary = completionSummary(locale, run.objective);
    setMessages((current) => [...current, { role: "assistant", text: summary }]);
    coordinator.requestSpeech(summary.slice(0, 160), locale, run.runId);
  }, [coordinator, locale, run]);

  const sendText = useCallback(async (candidate: string) => {
    const text = candidate.trim();
    if (!text || busy) return;
    setBusy(true); setError(null); setInput("");
    setMessages((current) => [...current, { role: "user", text }]);
    try {
      const response = await request<{ displayText: string; proposal: TaskProposal | null; diagnostics: TurnDiagnostics }>("/api/agent/turn", {
        method: "POST", body: JSON.stringify({ input: text, locale, history: [...messages, { role: "user", text }].slice(-10) }),
      });
      setMessages((current) => [...current, { role: "assistant", text: response.displayText }]);
      setDiagnostics(response.diagnostics);
      coordinator.requestSpeech(response.displayText.slice(0, 160), locale);
      setProposal(response.proposal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reach the companion service.");
    } finally { setBusy(false); }
  }, [busy, coordinator, locale, messages]);

  useEffect(() => {
    return coordinator.onFinalTranscript((transcript) => void sendText(transcript));
  }, [coordinator, sendText]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendText(input);
  };

  const confirm = async () => {
    if (!proposal || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await request<{ run: TaskRun }>(`/api/agent/proposals/${proposal.proposalId}/confirm`, {
        method: "POST", body: JSON.stringify({ objective: proposal.objective }),
      });
      setRun(response.run); setProposal(null);
      setMessages((current) => [...current, { role: "assistant", text: labels.taskStarted }]);
      coordinator.requestSpeech(labels.taskStarted.slice(0, 160), locale, response.run.runId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start the task.");
    } finally { setBusy(false); }
  };

  const controlRun = useCallback(async (taskRunId: string, action: "cancel" | "retry") => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await request<{ run: TaskRun }>(`/api/agent/runs/${taskRunId}/${action}`, { method: "POST", body: "{}" });
      setRun(response.run);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update task."); }
    finally { setBusy(false); }
  }, [busy]);

  useEffect(() => coordinator.connectTaskCancellationAdapter({
    cancelTask: async (taskRunId) => {
      const response = await request<{ task: TaskRun }>(`/api/tasks/${taskRunId}/commands`, {
        method: "POST",
        body: JSON.stringify({ type: "cancel" }),
      });
      setRun(response.task);
    },
  }), [coordinator]);

  const startNewConversation = () => {
    beginNewConversation();
    localStorage.removeItem(sessionKey);
    announcedRunIds.current.clear();
    setMessages([]);
    setInput("");
    setProposal(null);
    setRun(null);
    setError(null);
    setDiagnostics(null);
  };

  const hasActiveTask = run ? ["queued", "running"].includes(run.status) : false;

  return (
    <section className="ab-task-console" data-state={run?.status || "idle"}>
      <header className="ab-task-console__header"><div><span className="ab-task-console__eyebrow">{labels.eyebrow}</span><h2>{labels.title}</h2></div><button aria-label={labels.newConversation} className="ab-task-console__button ab-task-console__button--quiet" disabled={busy || hasActiveTask} onClick={startNewConversation} type="button">{labels.newConversation}</button></header>
      <div aria-live="polite" className="ab-task-console__result">
        {messages.slice(-4).map((message, index) => <p key={`${message.role}-${index}`}><strong>{message.role === "user" ? (locale === "zh-CN" ? "你" : "You") : "Preacherman"}</strong> {message.text}</p>)}
        {error ? <p data-error="true">{error}</p> : null}
        {diagnostics ? <span className="ab-task-console__diagnostic" data-source={diagnostics.source}>{diagnostics.source === "deepseek" ? labels.deepseekReply : diagnostics.source === "deepseek-unstructured" ? labels.deepseekPlainReply : labels.fallbackReply}{diagnostics.model ? ` · ${diagnostics.model}` : null}</span> : null}
      </div>
      <form className="ab-task-console__form" onSubmit={submit}>
        <textarea aria-label={labels.placeholder} data-airi-control="task.create" disabled={busy} onChange={(event) => setInput(event.target.value)} placeholder={labels.placeholder} rows={3} value={input} />
        <div className="ab-task-console__actions"><button className="ab-task-console__button ab-task-console__button--primary" disabled={!input.trim() || busy} type="submit">{labels.send}</button></div>
      </form>
      {proposal ? <section className="ab-task-console__approval"><span>{proposal.executor}</span><textarea aria-label="PitchKit objective" onChange={(event) => setProposal({ ...proposal, objective: event.target.value })} value={proposal.objective} /><p>{proposal.inputs.join(" · ")} → {proposal.outputs.join(" · ")}</p><button className="ab-task-console__button ab-task-console__button--primary" data-airi-control="task.confirm" disabled={busy || !proposal.objective.trim()} onClick={() => void confirm()} type="button">{labels.confirm}</button></section> : null}
      {run ? <section className="ab-task-console__activity"><strong>{run.status === "succeeded" ? labels.artifact : labels.running}</strong><p>{run.events.at(-1)?.message || "Queued"}</p>{run.artifact ? <p><code>{run.artifact.path}</code></p> : null}{run.error ? <p data-error="true">{run.error}</p> : null}{["queued", "running"].includes(run.status) ? <button className="ab-task-console__button ab-task-console__button--quiet" data-airi-control="task.cancel" disabled={busy} onClick={() => void coordinator.cancelTask(run.runId)} type="button">{labels.stopTask}</button> : null}{["failed", "cancelled"].includes(run.status) ? <button className="ab-task-console__button ab-task-console__button--primary" data-airi-control="task.retry" disabled={busy} onClick={() => void controlRun(run.runId, "retry")} type="button">{labels.retry}</button> : null}</section> : null}
    </section>
  );
}
