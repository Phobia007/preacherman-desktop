import { FormEvent, useEffect, useState } from "react";
import type { Locale } from "../preferences";
import "./airi-memory-persona-panel.css";

export type AiriMemoryPersonaServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface AiriPersonaSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly selected?: boolean;
}

export interface AiriMemoryResult {
  readonly id: string;
  readonly personaId: string;
  readonly namespace: string;
  readonly text: string;
  readonly tags: readonly string[];
  readonly redacted: boolean;
  readonly temporal: {
    readonly recordedAt: string;
    readonly occurredAt: string;
    readonly timezone: string;
    readonly expiresAt: string | null;
    readonly ageMs: number;
    readonly isExpired: boolean;
  };
}

export interface AiriMemoryPersonaPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: AiriMemoryPersonaServiceRequest;
}

interface PersonaResponse {
  readonly personas: readonly AiriPersonaSummary[];
  readonly selected: AiriPersonaSummary | null;
}

const copy = {
  en: {
    eyebrow: "AIRI Memory Kit",
    title: "Memory & persona",
    description: "Store and recall private local context for the active persona.",
    currentPersona: "Current persona",
    noPersona: "No persona is selected",
    personaList: "Available personas",
    selected: "Selected",
    switchingUnavailable: "Persona switching is unavailable because the local service does not expose a selection endpoint.",
    namespace: "Namespace",
    namespaceHint: "Memories are isolated by persona and namespace.",
    memory: "Memory content",
    memoryPlaceholder: "Remember a useful fact or preference",
    remember: "Remember",
    remembering: "Saving…",
    rememberSuccess: "Memory saved locally.",
    query: "Search memories",
    queryPlaceholder: "Optional words or tags",
    recall: "Recall",
    recalling: "Recalling…",
    results: "Recalled memories",
    noResults: "No memories matched this persona and namespace.",
    loading: "Loading personas…",
    privacy: "Do not enter passwords, tokens, API keys, credentials, or audio. The service rejects or redacts sensitive data.",
    redacted: "Sensitive text redacted",
    expired: "Expired",
    justNow: "just now",
    minutesAgo: (value: number) => `${value}m ago`,
    hoursAgo: (value: number) => `${value}h ago`,
    daysAgo: (value: number) => `${value}d ago`,
  },
  "zh-CN": {
    eyebrow: "AIRI 记忆能力包",
    title: "记忆与人格",
    description: "为当前人格保存并召回本地私有上下文。",
    currentPersona: "当前人格",
    noPersona: "尚未选择人格",
    personaList: "可用人格",
    selected: "已选择",
    switchingUnavailable: "本地服务尚未提供人格切换接口，因此此处仅展示当前选择，不会模拟切换成功。",
    namespace: "命名空间",
    namespaceHint: "记忆按人格和命名空间严格隔离。",
    memory: "记忆内容",
    memoryPlaceholder: "记录一条有用的事实或偏好",
    remember: "记住",
    remembering: "保存中…",
    rememberSuccess: "记忆已保存到本地。",
    query: "搜索记忆",
    queryPlaceholder: "可选关键词或标签",
    recall: "召回",
    recalling: "召回中…",
    results: "召回结果",
    noResults: "此人格与命名空间下没有匹配的记忆。",
    loading: "正在加载人格…",
    privacy: "请勿输入密码、令牌、API 密钥、凭据或音频；服务会拒绝或脱敏敏感数据。",
    redacted: "敏感文本已脱敏",
    expired: "已过期",
    justNow: "刚刚",
    minutesAgo: (value: number) => `${value} 分钟前`,
    hoursAgo: (value: number) => `${value} 小时前`,
    daysAgo: (value: number) => `${value} 天前`,
  },
} as const;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid response.`);
  return value as Record<string, unknown>;
}

function requirePersona(value: unknown): AiriPersonaSummary {
  const persona = requireObject(value, "Persona service");
  if (typeof persona.id !== "string" || typeof persona.name !== "string") throw new Error("Persona service returned an invalid persona.");
  return persona as unknown as AiriPersonaSummary;
}

function requireMemory(value: unknown): AiriMemoryResult {
  const memory = requireObject(value, "Memory service");
  const temporal = requireObject(memory.temporal, "Memory time metadata");
  if (typeof memory.id !== "string" || typeof memory.text !== "string" || typeof memory.namespace !== "string"
    || typeof temporal.recordedAt !== "string" || typeof temporal.occurredAt !== "string") {
    throw new Error("Memory service returned an invalid memory.");
  }
  return memory as unknown as AiriMemoryResult;
}

export async function loadAiriPersonas(serviceRequest: AiriMemoryPersonaServiceRequest): Promise<PersonaResponse> {
  const response = requireObject(await serviceRequest<unknown>("/api/personas"), "Persona service");
  if (!Array.isArray(response.personas)) throw new Error("Persona service did not return a persona list.");
  return {
    personas: response.personas.map(requirePersona),
    selected: response.selected === null ? null : requirePersona(response.selected),
  };
}

export async function rememberAiriMemory(
  serviceRequest: AiriMemoryPersonaServiceRequest,
  input: { readonly personaId: string; readonly namespace: string; readonly text: string },
): Promise<AiriMemoryResult> {
  const response = requireObject(await serviceRequest<unknown>("/api/memory/remember", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }), "Memory service");
  return requireMemory(response.memory);
}

export async function recallAiriMemories(
  serviceRequest: AiriMemoryPersonaServiceRequest,
  input: { readonly personaId: string; readonly namespace: string; readonly query: string; readonly limit: number },
): Promise<readonly AiriMemoryResult[]> {
  const response = requireObject(await serviceRequest<unknown>("/api/memory/recall", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }), "Memory service");
  if (!Array.isArray(response.memories)) throw new Error("Memory service did not return a memory list.");
  return response.memories.map(requireMemory);
}

export function formatMemoryAge(ageMs: number, locale: Locale): string {
  const text = copy[locale];
  if (!Number.isFinite(ageMs) || ageMs < 60_000) return text.justNow;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return text.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return text.hoursAgo(hours);
  return text.daysAgo(Math.floor(hours / 24));
}

export function AiriMemoryPersonaPanel({ locale, serviceRequest }: AiriMemoryPersonaPanelProps) {
  const text = copy[locale];
  const [personas, setPersonas] = useState<readonly AiriPersonaSummary[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<AiriPersonaSummary | null>(null);
  const [namespace, setNamespace] = useState("general");
  const [memoryText, setMemoryText] = useState("");
  const [query, setQuery] = useState("");
  const [memories, setMemories] = useState<readonly AiriMemoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"remember" | "recall" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadAiriPersonas(serviceRequest).then((response) => {
      if (!active) return;
      setPersonas(response.personas);
      setSelectedPersona(response.selected);
      setError("");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [serviceRequest]);

  const remember = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPersona || !namespace.trim() || !memoryText.trim() || busy) return;
    setBusy("remember");
    setError("");
    setMessage("");
    try {
      await rememberAiriMemory(serviceRequest, {
        personaId: selectedPersona.id,
        namespace: namespace.trim(),
        text: memoryText.trim(),
      });
      setMemoryText("");
      setMessage(text.rememberSuccess);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const recall = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPersona || !namespace.trim() || busy) return;
    setBusy("recall");
    setError("");
    setMessage("");
    try {
      setMemories(await recallAiriMemories(serviceRequest, {
        personaId: selectedPersona.id,
        namespace: namespace.trim(),
        query: query.trim(),
        limit: 20,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const controlsDisabled = loading || !selectedPersona || busy !== null;

  return <section className="demo-airi-memory" data-airi-control="memory.persona memory.remember memory.recall" aria-labelledby="airi-memory-title">
    <header className="demo-airi-memory__header">
      <div>
        <span className="demo-airi-memory__eyebrow">{text.eyebrow}</span>
        <h2 id="airi-memory-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <div className="demo-airi-memory__persona" aria-live="polite">
        <span>{text.currentPersona}</span>
        <strong>{loading ? text.loading : selectedPersona?.name ?? text.noPersona}</strong>
        {selectedPersona?.description ? <small>{selectedPersona.description}</small> : null}
      </div>
    </header>

    <div className="demo-airi-memory__persona-list" aria-label={text.personaList}>
      {personas.map((persona) => <span key={persona.id} data-selected={persona.id === selectedPersona?.id}>
        {persona.name}{persona.id === selectedPersona?.id ? <small>{text.selected}</small> : null}
      </span>)}
    </div>
    <p className="demo-airi-memory__unavailable" role="note">{text.switchingUnavailable}</p>

    <label className="demo-airi-memory__namespace" htmlFor="airi-memory-namespace">
      <span>{text.namespace}</span>
      <input id="airi-memory-namespace" maxLength={64} onChange={(event) => setNamespace(event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_.-]{0,63}" required spellCheck={false} value={namespace} />
      <small>{text.namespaceHint}</small>
    </label>

    <div className="demo-airi-memory__workflows">
      <form onSubmit={(event) => void remember(event)}>
        <label htmlFor="airi-memory-content">{text.memory}</label>
        <textarea autoComplete="off" disabled={controlsDisabled} id="airi-memory-content" maxLength={8192} onChange={(event) => setMemoryText(event.target.value)} placeholder={text.memoryPlaceholder} required value={memoryText} />
        <button disabled={controlsDisabled || !namespace.trim() || !memoryText.trim()} type="submit">
          {busy === "remember" ? text.remembering : text.remember}
        </button>
      </form>

      <form onSubmit={(event) => void recall(event)}>
        <label htmlFor="airi-memory-query">{text.query}</label>
        <input autoComplete="off" disabled={controlsDisabled} id="airi-memory-query" onChange={(event) => setQuery(event.target.value)} placeholder={text.queryPlaceholder} value={query} />
        <button disabled={controlsDisabled || !namespace.trim()} type="submit">
          {busy === "recall" ? text.recalling : text.recall}
        </button>
      </form>
    </div>

    <p className="demo-airi-memory__privacy" role="note">{text.privacy}</p>
    {message ? <p className="demo-airi-memory__message" role="status">{message}</p> : null}
    {error ? <p className="demo-airi-memory__error" role="alert">{error}</p> : null}

    <section className="demo-airi-memory__results" aria-labelledby="airi-memory-results-title" aria-busy={busy === "recall"}>
      <h3 id="airi-memory-results-title">{text.results}</h3>
      {memories.length === 0 ? <p>{text.noResults}</p> : <ol aria-live="polite">
        {memories.map((memory) => <li key={memory.id} data-expired={memory.temporal.isExpired}>
          <p>{memory.text}</p>
          <div>
            <span>{memory.namespace}</span>
            <time dateTime={memory.temporal.occurredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(memory.temporal.occurredAt))}</time>
            <span>{memory.temporal.timezone} · {formatMemoryAge(memory.temporal.ageMs, locale)}</span>
            {memory.redacted ? <strong>{text.redacted}</strong> : null}
            {memory.temporal.isExpired ? <strong>{text.expired}</strong> : null}
          </div>
        </li>)}
      </ol>}
    </section>
  </section>;
}
