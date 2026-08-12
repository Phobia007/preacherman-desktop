import { FormEvent, useEffect, useState } from "react";
import type { Locale } from "../preferences";
import "./preacherman-memory-persona-panel.css";

export type PreachermanMemoryPersonaServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export type PreachermanMemoryBoundary = "persona" | "session" | "long-term";

export interface PreachermanPersonaSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly selected?: boolean;
}

export interface PreachermanMemoryResult {
  readonly id: string;
  readonly owner: string;
  readonly personaId: string;
  readonly namespace: string;
  readonly boundary: PreachermanMemoryBoundary;
  readonly sessionId: string | null;
  readonly sensitivity: "private";
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

export interface PreachermanMemoryPersonaPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: PreachermanMemoryPersonaServiceRequest;
}

interface PersonaResponse {
  readonly personas: readonly PreachermanPersonaSummary[];
  readonly selected: PreachermanPersonaSummary | null;
}

const copy = {
  en: {
    eyebrow: "Preacherman Memory Kit",
    title: "Memory & persona",
    description: "Store and recall private local context for the active persona.",
    currentPersona: "Current persona",
    noPersona: "No persona is selected",
    personaList: "Available personas",
    selected: "Selected",
    selectPersona: "Select",
    selectingPersona: "Selecting…",
    namespace: "Namespace",
    namespaceHint: "Memories are isolated by owner, persona, boundary, and namespace.",
    boundary: "Memory boundary",
    boundaryPersona: "Persona",
    boundarySession: "Session",
    boundaryLongTerm: "Long-term",
    sessionId: "Session ID",
    sessionHint: "Required for session memory and never shared with another session.",
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
    privacy: "Private by default. Do not enter passwords, tokens, API keys, credentials, or audio. Sensitive data is rejected or redacted, and memory calls are audited without storing their text.",
    redacted: "Sensitive text redacted",
    expired: "Expired",
    justNow: "just now",
    minutesAgo: (value: number) => `${value}m ago`,
    hoursAgo: (value: number) => `${value}h ago`,
    daysAgo: (value: number) => `${value}d ago`,
  },
  "zh-CN": {
    eyebrow: "Preacherman 记忆能力包",
    title: "记忆与人格",
    description: "为当前人格保存并召回本地私有上下文。",
    currentPersona: "当前人格",
    noPersona: "尚未选择人格",
    personaList: "可用人格",
    selected: "已选择",
    selectPersona: "选择",
    selectingPersona: "选择中…",
    namespace: "命名空间",
    namespaceHint: "记忆按所有者、人格、边界和命名空间严格隔离。",
    boundary: "记忆边界",
    boundaryPersona: "人格",
    boundarySession: "会话",
    boundaryLongTerm: "长期",
    sessionId: "会话 ID",
    sessionHint: "会话记忆必须指定 ID，且不会与其他会话共享。",
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
    privacy: "默认私有。请勿输入密码、令牌、API 密钥、凭据或音频；敏感数据会被拒绝或脱敏，记忆调用只审计元数据而不记录正文。",
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

function requirePersona(value: unknown): PreachermanPersonaSummary {
  const persona = requireObject(value, "Persona service");
  if (typeof persona.id !== "string" || typeof persona.name !== "string") throw new Error("Persona service returned an invalid persona.");
  return persona as unknown as PreachermanPersonaSummary;
}

function requireMemory(value: unknown): PreachermanMemoryResult {
  const memory = requireObject(value, "Memory service");
  const temporal = requireObject(memory.temporal, "Memory time metadata");
  if (typeof memory.id !== "string" || typeof memory.owner !== "string" || typeof memory.text !== "string" || typeof memory.namespace !== "string"
    || !["persona", "session", "long-term"].includes(String(memory.boundary)) || memory.sensitivity !== "private"
    || typeof temporal.recordedAt !== "string" || typeof temporal.occurredAt !== "string") {
    throw new Error("Memory service returned an invalid memory.");
  }
  return memory as unknown as PreachermanMemoryResult;
}

export async function loadPreachermanPersonas(serviceRequest: PreachermanMemoryPersonaServiceRequest): Promise<PersonaResponse> {
  const response = requireObject(await serviceRequest<unknown>("/api/personas"), "Persona service");
  if (!Array.isArray(response.personas)) throw new Error("Persona service did not return a persona list.");
  return {
    personas: response.personas.map(requirePersona),
    selected: response.selected === null ? null : requirePersona(response.selected),
  };
}

export async function rememberPreachermanMemory(
  serviceRequest: PreachermanMemoryPersonaServiceRequest,
  input: { readonly personaId: string; readonly namespace: string; readonly boundary: PreachermanMemoryBoundary; readonly sessionId?: string; readonly text: string },
): Promise<PreachermanMemoryResult> {
  const response = requireObject(await serviceRequest<unknown>("/api/memory/remember", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }), "Memory service");
  return requireMemory(response.memory);
}

export async function selectPreachermanPersona(
  serviceRequest: PreachermanMemoryPersonaServiceRequest,
  personaId: string,
): Promise<PreachermanPersonaSummary> {
  const response = requireObject(await serviceRequest<unknown>(`/api/personas/${encodeURIComponent(personaId)}/select`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), "Persona selection service");
  return requirePersona(response.selected);
}

export async function recallPreachermanMemories(
  serviceRequest: PreachermanMemoryPersonaServiceRequest,
  input: { readonly personaId: string; readonly namespace: string; readonly boundary: PreachermanMemoryBoundary; readonly sessionId?: string; readonly query: string; readonly limit: number },
): Promise<readonly PreachermanMemoryResult[]> {
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

export function PreachermanMemoryPersonaPanel({ locale, serviceRequest }: PreachermanMemoryPersonaPanelProps) {
  const text = copy[locale];
  const [personas, setPersonas] = useState<readonly PreachermanPersonaSummary[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<PreachermanPersonaSummary | null>(null);
  const [namespace, setNamespace] = useState("general");
  const [boundary, setBoundary] = useState<PreachermanMemoryBoundary>("persona");
  const [sessionId, setSessionId] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [query, setQuery] = useState("");
  const [memories, setMemories] = useState<readonly PreachermanMemoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"select" | "remember" | "recall" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadPreachermanPersonas(serviceRequest).then((response) => {
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

  const selectPersona = async (personaId: string) => {
    if (busy || personaId === selectedPersona?.id) return;
    setBusy("select");
    setError("");
    setMessage("");
    try {
      const selected = await selectPreachermanPersona(serviceRequest, personaId);
      setSelectedPersona(selected);
      setPersonas((current) => current.map((persona) => ({ ...persona, selected: persona.id === selected.id })));
      setMemories([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const remember = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPersona || !namespace.trim() || !memoryText.trim() || busy) return;
    setBusy("remember");
    setError("");
    setMessage("");
    try {
      await rememberPreachermanMemory(serviceRequest, {
        personaId: selectedPersona.id,
        namespace: namespace.trim(),
        boundary,
        ...(boundary === "session" ? { sessionId: sessionId.trim() } : {}),
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
      setMemories(await recallPreachermanMemories(serviceRequest, {
        personaId: selectedPersona.id,
        namespace: namespace.trim(),
        boundary,
        ...(boundary === "session" ? { sessionId: sessionId.trim() } : {}),
        query: query.trim(),
        limit: 20,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const boundaryReady = boundary !== "session" || Boolean(sessionId.trim());
  const controlsDisabled = loading || !selectedPersona || busy !== null;

  return <section className="demo-preacherman-memory" data-preacherman-control="memory.persona memory.remember memory.recall" aria-labelledby="preacherman-memory-title">
    <header className="demo-preacherman-memory__header">
      <div>
        <span className="demo-preacherman-memory__eyebrow">{text.eyebrow}</span>
        <h2 id="preacherman-memory-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <div className="demo-preacherman-memory__persona" aria-live="polite">
        <span>{text.currentPersona}</span>
        <strong>{loading ? text.loading : selectedPersona?.name ?? text.noPersona}</strong>
        {selectedPersona?.description ? <small>{selectedPersona.description}</small> : null}
      </div>
    </header>

    <div className="demo-preacherman-memory__persona-list" aria-label={text.personaList}>
      {personas.map((persona) => {
        const selected = persona.id === selectedPersona?.id;
        return <button aria-pressed={selected} disabled={loading || busy !== null || selected} key={persona.id} onClick={() => void selectPersona(persona.id)} type="button">
          <span>{persona.name}</span>
          <small>{selected ? text.selected : busy === "select" ? text.selectingPersona : text.selectPersona}</small>
        </button>;
      })}
    </div>

    <div className="demo-preacherman-memory__scope">
      <label className="demo-preacherman-memory__namespace" htmlFor="preacherman-memory-namespace">
        <span>{text.namespace}</span>
        <input id="preacherman-memory-namespace" maxLength={64} onChange={(event) => setNamespace(event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_.-]{0,63}" required spellCheck={false} value={namespace} />
        <small>{text.namespaceHint}</small>
      </label>
      <label htmlFor="preacherman-memory-boundary">
        <span>{text.boundary}</span>
        <select id="preacherman-memory-boundary" onChange={(event) => setBoundary(event.target.value as PreachermanMemoryBoundary)} value={boundary}>
          <option value="persona">{text.boundaryPersona}</option>
          <option value="session">{text.boundarySession}</option>
          <option value="long-term">{text.boundaryLongTerm}</option>
        </select>
      </label>
      {boundary === "session" ? <label htmlFor="preacherman-memory-session">
        <span>{text.sessionId}</span>
        <input autoComplete="off" id="preacherman-memory-session" maxLength={100} onChange={(event) => setSessionId(event.target.value)} required value={sessionId} />
        <small>{text.sessionHint}</small>
      </label> : null}
    </div>

    <div className="demo-preacherman-memory__workflows">
      <form onSubmit={(event) => void remember(event)}>
        <label htmlFor="preacherman-memory-content">{text.memory}</label>
        <textarea autoComplete="off" disabled={controlsDisabled} id="preacherman-memory-content" maxLength={8192} onChange={(event) => setMemoryText(event.target.value)} placeholder={text.memoryPlaceholder} required value={memoryText} />
        <button disabled={controlsDisabled || !boundaryReady || !namespace.trim() || !memoryText.trim()} type="submit">
          {busy === "remember" ? text.remembering : text.remember}
        </button>
      </form>

      <form onSubmit={(event) => void recall(event)}>
        <label htmlFor="preacherman-memory-query">{text.query}</label>
        <input autoComplete="off" disabled={controlsDisabled} id="preacherman-memory-query" onChange={(event) => setQuery(event.target.value)} placeholder={text.queryPlaceholder} value={query} />
        <button disabled={controlsDisabled || !boundaryReady || !namespace.trim()} type="submit">
          {busy === "recall" ? text.recalling : text.recall}
        </button>
      </form>
    </div>

    <p className="demo-preacherman-memory__privacy" role="note">{text.privacy}</p>
    {message ? <p className="demo-preacherman-memory__message" role="status">{message}</p> : null}
    {error ? <p className="demo-preacherman-memory__error" role="alert">{error}</p> : null}

    <section className="demo-preacherman-memory__results" aria-labelledby="preacherman-memory-results-title" aria-busy={busy === "recall"}>
      <h3 id="preacherman-memory-results-title">{text.results}</h3>
      {memories.length === 0 ? <p>{text.noResults}</p> : <ol aria-live="polite">
        {memories.map((memory) => <li key={memory.id} data-expired={memory.temporal.isExpired}>
          <p>{memory.text}</p>
          <div>
            <span>{memory.namespace}</span>
            <span>{memory.boundary}{memory.sessionId ? ` · ${memory.sessionId}` : ""}</span>
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
