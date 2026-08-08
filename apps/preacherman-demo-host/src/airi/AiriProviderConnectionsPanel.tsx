import { useCallback, useEffect, useId, useState } from "react";
import type { Locale } from "../preferences";
import "./airi-provider-connections-panel.css";

const CAPABILITIES = ["chat", "asr", "tts", "vision", "image"] as const;
const CONNECTIONS = ["discord", "telegram", "youtube", "minecraft", "factorio"] as const;

type Capability = typeof CAPABILITIES[number];
type CommercialState = "ready" | "configuration-required" | "external-runtime-required" | "adapter-required" | "error";
type ProviderServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface ProviderCapabilityStatus {
  readonly state: CommercialState;
  readonly requirements?: readonly { readonly key: string; readonly label: string; readonly configured: boolean }[];
}

interface ProviderSnapshot {
  readonly id: string;
  readonly label: string;
  readonly adapter: { readonly pluginId: string; readonly capabilities: readonly string[] } | null;
  readonly capabilities: Readonly<Partial<Record<Capability, ProviderCapabilityStatus>>>;
}

interface ConnectionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly configured: boolean;
  readonly connected: boolean;
  readonly adapter: { readonly pluginId: string } | null;
  readonly lastError?: { readonly message?: string } | null;
}

export interface AiriProviderConnectionsData {
  readonly providers: readonly ProviderSnapshot[];
  readonly connections: readonly ConnectionSnapshot[];
}

export interface AiriProviderConnectionsPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: ProviderServiceRequest;
}

const copy = {
  en: {
    eyebrow: "AIRI operations",
    title: "Providers & connections",
    description: "Live readiness from the local service. Credentials remain server-side and unavailable integrations stay visibly blocked.",
    refresh: "Refresh status",
    refreshing: "Refreshing…",
    loading: "Loading provider and connection status…",
    loadError: "Could not load the live integration status.",
    providers: "AI providers",
    providersHint: "One operational lane for every model capability.",
    connections: "External connections",
    connectionsHint: "Channels and game runtimes managed by local adapters.",
    noProvider: "No provider declares this capability.",
    missingConnection: "Not reported by the local service.",
    adapter: "Adapter",
    noAdapter: "No adapter registered",
    connected: "Connected",
    disconnected: "Ready · disconnected",
    states: {
      ready: "Ready",
      "configuration-required": "Configuration required",
      "external-runtime-required": "External runtime required",
      "adapter-required": "Adapter required",
      error: "Error",
    },
    capabilities: { chat: "Chat", asr: "Speech recognition", tts: "Speech synthesis", vision: "Vision", image: "Image generation" },
  },
  "zh-CN": {
    eyebrow: "AIRI 运营状态",
    title: "服务商与外部连接",
    description: "状态来自本地服务实时结果。凭据仅保留在服务端，尚不可用的集成会明确标为阻塞。",
    refresh: "刷新状态",
    refreshing: "正在刷新…",
    loading: "正在加载服务商与连接状态…",
    loadError: "无法加载实时集成状态。",
    providers: "AI 服务商",
    providersHint: "按模型能力查看每条可执行链路。",
    connections: "外部连接",
    connectionsHint: "由本地适配器管理的频道与游戏运行时。",
    noProvider: "暂无服务商声明此项能力。",
    missingConnection: "本地服务未返回此连接。",
    adapter: "适配器",
    noAdapter: "尚未注册适配器",
    connected: "已连接",
    disconnected: "就绪 · 未连接",
    states: {
      ready: "就绪",
      "configuration-required": "需要配置",
      "external-runtime-required": "需要外部运行时",
      "adapter-required": "需要适配器",
      error: "错误",
    },
    capabilities: { chat: "对话", asr: "语音识别", tts: "语音合成", vision: "视觉理解", image: "图像生成" },
  },
} as const;

function asArray<T>(value: unknown, label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} response is invalid.`);
  return value as readonly T[];
}

export async function loadAiriProviderConnections(serviceRequest: ProviderServiceRequest): Promise<AiriProviderConnectionsData> {
  const [providerResponse, connectionResponse] = await Promise.all([
    serviceRequest<{ readonly providers?: unknown }>("/api/providers/catalog"),
    serviceRequest<{ readonly connections?: unknown }>("/api/connections"),
  ]);
  return {
    providers: asArray<ProviderSnapshot>(providerResponse.providers, "Provider catalog"),
    connections: asArray<ConnectionSnapshot>(connectionResponse.connections, "Connections"),
  };
}

export function normalizeConnectionState(status: string): CommercialState {
  if (["ready", "configuration-required", "external-runtime-required", "adapter-required", "error"].includes(status)) {
    return status as CommercialState;
  }
  if (["connected", "disconnected", "testing", "connecting", "disconnecting"].includes(status)) return "ready";
  return "error";
}

export function normalizeProviderState(state: string): CommercialState {
  if (["ready", "configuration-required", "external-runtime-required", "adapter-required", "error"].includes(state)) {
    return state as CommercialState;
  }
  return "error";
}

function StatusBadge({ state, label }: { readonly state: CommercialState; readonly label: string }) {
  return <span className="demo-airi-provider-connections__status" data-state={state} aria-label={label}>
    <span aria-hidden="true" />{label}
  </span>;
}

export function AiriProviderConnectionsPanel({ locale, serviceRequest }: AiriProviderConnectionsPanelProps) {
  const text = copy[locale];
  const titleId = useId();
  const [data, setData] = useState<AiriProviderConnectionsData>({ providers: [], connections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadAiriProviderConnections(serviceRequest));
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : text.loadError);
    } finally {
      setLoading(false);
    }
  }, [serviceRequest, text.loadError]);

  useEffect(() => { void load(); }, [load]);

  return <section className="demo-airi-provider-connections" data-airi-control="provider.catalog connection.catalog" aria-labelledby={titleId}>
    <header className="demo-airi-provider-connections__header">
      <div>
        <span className="demo-airi-provider-connections__eyebrow">{text.eyebrow}</span>
        <h2 id={titleId}>{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <button aria-busy={loading} disabled={loading} onClick={() => void load()} type="button">
        {loading ? text.refreshing : text.refresh}
      </button>
    </header>

    {loading && data.providers.length === 0 && data.connections.length === 0
      ? <p className="demo-airi-provider-connections__notice" role="status" aria-live="polite">{text.loading}</p>
      : null}
    {error ? <div className="demo-airi-provider-connections__error" role="alert">
      <p>{text.loadError} <small>{error}</small></p>
      <button onClick={() => void load()} type="button">{text.refresh}</button>
    </div> : null}

    {!loading && !error ? <div className="demo-airi-provider-connections__sections" aria-live="polite">
      <section aria-labelledby={`${titleId}-providers`}>
        <div className="demo-airi-provider-connections__section-heading">
          <div><h3 id={`${titleId}-providers`}>{text.providers}</h3><p>{text.providersHint}</p></div>
          <span>{CAPABILITIES.length}</span>
        </div>
        <div className="demo-airi-provider-connections__provider-grid">
          {CAPABILITIES.map((capability) => {
            const matches = data.providers.filter((provider) => provider.capabilities[capability]);
            return <article className="demo-airi-provider-connections__capability" key={capability}>
              <h4>{text.capabilities[capability]}</h4>
              <code>{capability}</code>
              <ul>
                {matches.length === 0 ? <li data-state="adapter-required">
                  <div><strong>{text.noProvider}</strong><small>{text.noAdapter}</small></div>
                  <StatusBadge state="adapter-required" label={text.states["adapter-required"]} />
                </li> : matches.map((provider) => {
                  const status = provider.capabilities[capability];
                  const state = normalizeProviderState(status?.state || "error");
                  const configured = status?.requirements?.filter((requirement) => requirement.configured).length || 0;
                  const required = status?.requirements?.length || 0;
                  return <li data-state={state} key={provider.id}>
                    <div>
                      <strong>{provider.label}</strong>
                      <small>{provider.adapter ? `${text.adapter}: ${provider.adapter.pluginId}` : text.noAdapter}{required ? ` · ${configured}/${required}` : ""}</small>
                    </div>
                    <StatusBadge state={state} label={text.states[state]} />
                  </li>;
                })}
              </ul>
            </article>;
          })}
        </div>
      </section>

      <section aria-labelledby={`${titleId}-connections`}>
        <div className="demo-airi-provider-connections__section-heading">
          <div><h3 id={`${titleId}-connections`}>{text.connections}</h3><p>{text.connectionsHint}</p></div>
          <span>{CONNECTIONS.length}</span>
        </div>
        <ul className="demo-airi-provider-connections__connection-grid">
          {CONNECTIONS.map((connectionId) => {
            const connection = data.connections.find(({ id }) => id === connectionId);
            const state = connection ? normalizeConnectionState(connection.status) : "error";
            return <li data-state={state} key={connectionId}>
              <div className="demo-airi-provider-connections__connection-heading">
                <div><strong>{connection?.name || connectionId[0].toUpperCase() + connectionId.slice(1)}</strong><code>{connectionId}</code></div>
                <StatusBadge state={state} label={text.states[state]} />
              </div>
              <p>{connection?.description || text.missingConnection}</p>
              <small>{connection
                ? connection.lastError?.message || (connection.connected ? text.connected : connection.status === "disconnected" ? text.disconnected : connection.status)
                : text.missingConnection}</small>
              <span>{connection?.adapter ? `${text.adapter}: ${connection.adapter.pluginId}` : text.noAdapter}</span>
            </li>;
          })}
        </ul>
      </section>
    </div> : null}
  </section>;
}
