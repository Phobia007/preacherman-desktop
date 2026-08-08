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
  readonly requirements?: readonly { readonly key: string; readonly label: string; readonly required?: boolean; readonly configured: boolean }[];
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

interface ProviderTestResult {
  readonly state: CommercialState;
  readonly ok: boolean;
  readonly message?: string;
}

interface ProviderTestStatus {
  readonly phase: "testing" | "succeeded" | "failed";
  readonly message: string;
}

type ConnectionAction = "test" | "connect" | "disconnect";

interface ConnectionActionStatus {
  readonly operation: ConnectionAction;
  readonly phase: "running" | "succeeded" | "failed";
  readonly message: string;
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
    test: "Test",
    testing: "Testing…",
    testPassed: "Provider test passed.",
    testFailed: "Provider test failed.",
    testNotConfirmed: "The provider did not confirm readiness.",
    connectionTest: "Test connection",
    connect: "Connect",
    disconnect: "Disconnect",
    connectionTesting: "Testing connection…",
    connecting: "Connecting…",
    disconnecting: "Disconnecting…",
    connectionTestPassed: "Connection test passed.",
    connectionConnected: "Connection established.",
    connectionDisconnected: "Connection closed.",
    connectionActionFailed: "The connection did not confirm the requested state.",
    configureFirst: "Add the required configuration in Settings before testing or connecting.",
    runtimeFirst: "Register the external runtime adapter before testing or connecting.",
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
    test: "测试",
    testing: "正在测试…",
    testPassed: "服务商测试通过。",
    testFailed: "服务商测试失败。",
    testNotConfirmed: "服务商未确认已就绪。",
    connectionTest: "测试连接",
    connect: "连接",
    disconnect: "断开",
    connectionTesting: "正在测试连接…",
    connecting: "正在连接…",
    disconnecting: "正在断开…",
    connectionTestPassed: "连接测试通过。",
    connectionConnected: "连接已建立。",
    connectionDisconnected: "连接已断开。",
    connectionActionFailed: "连接未确认目标状态。",
    configureFirst: "请先在设置中补齐必需配置，再测试或连接。",
    runtimeFirst: "请先注册外部运行时适配器，再测试或连接。",
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

export function canRunConnectionAction(status: string | undefined, action: ConnectionAction): boolean {
  if (action === "disconnect") return status === "connected";
  return status === "disconnected";
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
  const [providerTests, setProviderTests] = useState<Readonly<Record<string, ProviderTestStatus>>>({});
  const [connectionActions, setConnectionActions] = useState<Readonly<Record<string, ConnectionActionStatus>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setProviderTests({});
    setConnectionActions({});
    try {
      setData(await loadAiriProviderConnections(serviceRequest));
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : text.loadError);
    } finally {
      setLoading(false);
    }
  }, [serviceRequest, text.loadError]);

  useEffect(() => { void load(); }, [load]);

  const testProvider = async (provider: ProviderSnapshot, capability: Capability, state: CommercialState) => {
    const key = `${provider.id}:${capability}`;
    if (state !== "ready" || providerTests[key]?.phase === "testing") return;
    setProviderTests((current) => ({ ...current, [key]: { phase: "testing", message: text.testing } }));
    try {
      const response = await serviceRequest<{ readonly result?: ProviderTestResult }>(
        `/api/providers/${encodeURIComponent(provider.id)}/test`,
        { method: "POST", body: JSON.stringify({ capability }) },
      );
      if (response.result?.state !== "ready" || response.result.ok !== true) {
        throw new Error(response.result?.message || text.testNotConfirmed);
      }
      setProviderTests((current) => ({
        ...current,
        [key]: { phase: "succeeded", message: response.result?.message || text.testPassed },
      }));
    } catch (reason) {
      setProviderTests((current) => ({
        ...current,
        [key]: { phase: "failed", message: reason instanceof Error && reason.message ? reason.message : text.testFailed },
      }));
    }
  };

  const runConnectionAction = async (connection: ConnectionSnapshot, action: ConnectionAction) => {
    if (!canRunConnectionAction(connection.status, action) || connectionActions[connection.id]?.phase === "running") return;
    const runningMessage = action === "test" ? text.connectionTesting : action === "connect" ? text.connecting : text.disconnecting;
    setConnectionActions((current) => ({ ...current, [connection.id]: { operation: action, phase: "running", message: runningMessage } }));
    try {
      const response = await serviceRequest<{ readonly connection?: ConnectionSnapshot }>(
        `/api/connections/${encodeURIComponent(connection.id)}/${action}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const updated = response.connection;
      if (!updated || updated.id !== connection.id) throw new Error(text.connectionActionFailed);
      setData((current) => ({
        ...current,
        connections: current.connections.map((candidate) => candidate.id === updated.id ? updated : candidate),
      }));
      const expectedStatus = action === "connect" ? "connected" : "disconnected";
      if (updated.status !== expectedStatus) {
        throw new Error(updated.lastError?.message || `${text.connectionActionFailed} (${updated.status})`);
      }
      const message = action === "test"
        ? text.connectionTestPassed
        : action === "connect" ? text.connectionConnected : text.connectionDisconnected;
      setConnectionActions((current) => ({ ...current, [connection.id]: { operation: action, phase: "succeeded", message } }));
    } catch (reason) {
      setConnectionActions((current) => ({
        ...current,
        [connection.id]: { operation: action, phase: "failed", message: reason instanceof Error && reason.message ? reason.message : text.connectionActionFailed },
      }));
    }
  };

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
                  const requirements = status?.requirements?.filter((requirement) => requirement.required !== false) || [];
                  const configured = requirements.filter((requirement) => requirement.configured).length;
                  const required = requirements.length;
                  const testKey = `${provider.id}:${capability}`;
                  const testStatus = providerTests[testKey];
                  return <li data-state={state} key={provider.id}>
                    <div>
                      <strong>{provider.label}</strong>
                      <small>{provider.adapter ? `${text.adapter}: ${provider.adapter.pluginId}` : text.noAdapter}{required ? ` · ${configured}/${required}` : ""}</small>
                    </div>
                    <div className="demo-airi-provider-connections__provider-actions">
                      <StatusBadge state={state} label={text.states[state]} />
                      <button
                        aria-label={`${text.test} ${provider.label} ${text.capabilities[capability]}`}
                        className="demo-airi-provider-connections__test-button"
                        disabled={state !== "ready" || testStatus?.phase === "testing"}
                        onClick={() => void testProvider(provider, capability, state)}
                        type="button"
                      >{testStatus?.phase === "testing" ? text.testing : text.test}</button>
                    </div>
                    {testStatus ? <small
                      className="demo-airi-provider-connections__test-result"
                      data-state={testStatus.phase}
                      role={testStatus.phase === "failed" ? "alert" : "status"}
                    >{testStatus.message}</small> : null}
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
            const actionStatus = connectionActions[connectionId];
            const busy = actionStatus?.phase === "running";
            const blockedReason = !connection
              ? text.missingConnection
              : connection.status === "configuration-required"
                ? text.configureFirst
                : connection.status === "external-runtime-required" || connection.status === "adapter-required"
                  ? text.runtimeFirst
                  : "";
            return <li data-state={state} key={connectionId}>
              <div className="demo-airi-provider-connections__connection-heading">
                <div><strong>{connection?.name || connectionId[0].toUpperCase() + connectionId.slice(1)}</strong><code>{connectionId}</code></div>
                <StatusBadge state={state} label={text.states[state]} />
              </div>
              <p>{connection?.description || text.missingConnection}</p>
              <small>{connection
                ? connection.lastError?.message || blockedReason || (connection.connected ? text.connected : connection.status === "disconnected" ? text.disconnected : connection.status)
                : text.missingConnection}</small>
              <span>{connection?.adapter ? `${text.adapter}: ${connection.adapter.pluginId}` : text.noAdapter}</span>
              <div className="demo-airi-provider-connections__connection-actions">
                {connection?.status === "connected" ? <button
                  aria-busy={busy && actionStatus?.operation === "disconnect"}
                  aria-label={`${text.disconnect} ${connection.name}`}
                  className="demo-airi-provider-connections__connection-action-button"
                  disabled={!canRunConnectionAction(connection.status, "disconnect") || busy}
                  onClick={() => void runConnectionAction(connection, "disconnect")}
                  type="button"
                >{busy && actionStatus?.operation === "disconnect" ? text.disconnecting : text.disconnect}</button> : <>
                  <button
                    aria-busy={busy && actionStatus?.operation === "test"}
                    aria-label={`${text.connectionTest} ${connection?.name || connectionId}`}
                    className="demo-airi-provider-connections__connection-action-button"
                    disabled={!canRunConnectionAction(connection?.status, "test") || busy}
                    onClick={() => connection && void runConnectionAction(connection, "test")}
                    type="button"
                  >{busy && actionStatus?.operation === "test" ? text.connectionTesting : text.connectionTest}</button>
                  <button
                    aria-busy={busy && actionStatus?.operation === "connect"}
                    aria-label={`${text.connect} ${connection?.name || connectionId}`}
                    className="demo-airi-provider-connections__connection-action-button"
                    disabled={!canRunConnectionAction(connection?.status, "connect") || busy}
                    onClick={() => connection && void runConnectionAction(connection, "connect")}
                    type="button"
                  >{busy && actionStatus?.operation === "connect" ? text.connecting : text.connect}</button>
                </>}
              </div>
              {actionStatus ? <small
                className="demo-airi-provider-connections__connection-action-result"
                data-state={actionStatus.phase}
                role={actionStatus.phase === "failed" ? "alert" : "status"}
              >{actionStatus.message}</small> : null}
            </li>;
          })}
        </ul>
      </section>
    </div> : null}
  </section>;
}
