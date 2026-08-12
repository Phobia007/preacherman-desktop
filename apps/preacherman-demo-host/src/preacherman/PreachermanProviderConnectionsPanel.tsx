import { useCallback, useEffect, useId, useState } from "react";
import type { Locale } from "../preferences";
import "./preacherman-provider-connections-panel.css";

const CAPABILITIES = ["chat", "asr", "tts", "vision", "image"] as const;
const CONNECTIONS = ["discord", "telegram", "youtube", "minecraft", "factorio"] as const;
const CONNECTION_CONFIGURATION_FIELDS = {
  discord: [{ name: "botToken", type: "password" }],
  telegram: [{ name: "botToken", type: "password" }],
  youtube: [{ name: "videoId", type: "text" }, { name: "accessToken", type: "password" }],
  minecraft: [{ name: "host", type: "text" }, { name: "port", type: "number" }, { name: "password", type: "password" }],
  factorio: [{ name: "host", type: "text" }, { name: "port", type: "number" }, { name: "password", type: "password" }],
} as const;

type Capability = typeof CAPABILITIES[number];
type CommercialState = "ready" | "configuration-required" | "external-runtime-required" | "adapter-required" | "error";
type ProviderServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface ProviderCapabilityStatus {
  readonly state: CommercialState;
  readonly requirements?: readonly { readonly key: string; readonly label: string; readonly required?: boolean; readonly configured: boolean }[];
}

interface ProviderModel {
  readonly id: string;
  readonly label: string;
  readonly capability: Capability;
  readonly source: "declared" | "provider";
}

interface ProviderSnapshot {
  readonly id: string;
  readonly label: string;
  readonly adapter: { readonly pluginId: string; readonly capabilities: readonly string[] } | null;
  readonly capabilities: Readonly<Partial<Record<Capability, ProviderCapabilityStatus>>>;
  readonly models?: readonly ProviderModel[];
}

interface ConnectionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly configured: boolean;
  readonly connected: boolean;
  readonly adapter: { readonly pluginId: string } | null;
  readonly configuration: {
    readonly values: Readonly<Record<string, string | number>>;
    readonly secrets: Readonly<Record<string, boolean>>;
  };
  readonly lastError?: { readonly message?: string } | null;
}

interface ProviderTestResult {
  readonly state: CommercialState;
  readonly ok: boolean;
  readonly message?: string;
  readonly models?: readonly ProviderModel[];
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

interface ConnectionConfigurationStatus {
  readonly phase: "saving" | "succeeded" | "failed";
  readonly message: string;
}

interface ProviderSettingsStatus {
  readonly deepseekConfigured: boolean;
  readonly dashscopeWorkspaceConfigured: boolean;
  readonly asrConfigured: boolean;
  readonly ttsConfigured: boolean;
}

interface ProviderSettingsTestResult {
  readonly deepseek: { readonly configured: boolean; readonly ok: boolean; readonly message: string };
  readonly asr: { readonly configured: boolean; readonly ok: boolean; readonly message: string };
  readonly tts: { readonly configured: boolean; readonly ok: boolean; readonly message: string };
}

export interface PreachermanProviderConnectionsData {
  readonly providers: readonly ProviderSnapshot[];
  readonly connections: readonly ConnectionSnapshot[];
  readonly settings: ProviderSettingsStatus;
}

export interface PreachermanProviderConnectionsPanelProps {
  readonly locale: Locale;
  readonly serviceRequest: ProviderServiceRequest;
}

const copy = {
  en: {
    eyebrow: "Preacherman operations",
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
    connectionConfiguration: "Configuration",
    connectionConfigurationHint: "Secrets are sent to the local runtime and never returned.",
    configureConnection: "Save connection configuration",
    configuringConnection: "Saving…",
    connectionConfigured: "Configuration saved. Connection is ready for testing.",
    connectionNeedsRuntime: "Configuration saved. An external protocol adapter is still required.",
    connectionIncomplete: "Configuration saved, but required fields are still missing.",
    connectionConfigureFailed: "Connection configuration could not be saved.",
    enterConnectionConfiguration: "Enter at least one new connection value.",
    fieldConfigured: "Configured; leave blank to keep it",
    connectionFields: { botToken: "Bot token", videoId: "Video ID", accessToken: "Access token", host: "Host", port: "Port", password: "RCON password" },
    configuration: "Provider configuration",
    configurationHint: "Saved by the local service. Secret values are never returned or shown again.",
    deepseekKey: "DeepSeek API key",
    dashscopeKey: "DashScope API key",
    workspaceId: "DashScope workspace ID (Beijing)",
    configuredPlaceholder: "Configured; leave blank to keep it",
    keyPlaceholder: "Enter a new key",
    workspacePlaceholder: "Enter the Model Studio workspace ID",
    saveAndTest: "Save & run connection tests",
    savingAndTesting: "Saving & testing…",
    enterConfiguration: "Enter at least one new configuration value.",
    settingsPassed: "Settings saved. Configured connections passed.",
    settingsFailed: "Settings saved, but one or more configured connections failed.",
    settingsUntested: "Settings saved. No complete connection is configured for testing yet.",
    settingsSaveFailed: "Provider settings could not be saved.",
    settingsTestFailed: "Settings were saved, but connection tests could not run.",
    models: "Models",
    declaredModel: "Declared",
    providerModel: "Verified by provider",
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
    eyebrow: "Preacherman 运营状态",
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
    connectionConfiguration: "连接配置",
    connectionConfigurationHint: "密钥只发送到本地运行时，之后不会返回。",
    configureConnection: "保存连接配置",
    configuringConnection: "正在保存…",
    connectionConfigured: "配置已保存，可以开始测试连接。",
    connectionNeedsRuntime: "配置已保存，仍需外部协议适配器。",
    connectionIncomplete: "配置已保存，但仍缺少必需字段。",
    connectionConfigureFailed: "无法保存连接配置。",
    enterConnectionConfiguration: "请至少输入一项新的连接配置。",
    fieldConfigured: "已配置；留空可保留",
    connectionFields: { botToken: "机器人令牌", videoId: "视频 ID", accessToken: "访问令牌", host: "主机", port: "端口", password: "RCON 密码" },
    configuration: "服务商配置",
    configurationHint: "由本地服务保存；密钥内容不会返回，也不会再次显示。",
    deepseekKey: "DeepSeek API 密钥",
    dashscopeKey: "DashScope API 密钥",
    workspaceId: "DashScope 工作空间 ID（北京）",
    configuredPlaceholder: "已配置；留空可保留",
    keyPlaceholder: "输入新密钥",
    workspacePlaceholder: "输入百炼工作空间 ID",
    saveAndTest: "保存并运行连接测试",
    savingAndTesting: "正在保存并测试…",
    enterConfiguration: "请至少输入一项新的配置。",
    settingsPassed: "配置已保存，已配置的连接测试通过。",
    settingsFailed: "配置已保存，但一个或多个连接测试失败。",
    settingsUntested: "配置已保存，目前尚无完整连接可供测试。",
    settingsSaveFailed: "无法保存服务商配置。",
    settingsTestFailed: "配置已保存，但无法运行连接测试。",
    models: "模型",
    declaredModel: "目录声明",
    providerModel: "服务商已验证",
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

export async function loadPreachermanProviderConnections(serviceRequest: ProviderServiceRequest): Promise<PreachermanProviderConnectionsData> {
  const [providerResponse, connectionResponse, settings] = await Promise.all([
    serviceRequest<{ readonly providers?: unknown }>("/api/providers/catalog"),
    serviceRequest<{ readonly connections?: unknown }>("/api/connections"),
    serviceRequest<ProviderSettingsStatus>("/api/settings/providers"),
  ]);
  return {
    providers: asArray<ProviderSnapshot>(providerResponse.providers, "Provider catalog"),
    connections: asArray<ConnectionSnapshot>(connectionResponse.connections, "Connections"),
    settings,
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
  return <span className="demo-preacherman-provider-connections__status" data-state={state} aria-label={label}>
    <span aria-hidden="true" />{label}
  </span>;
}

export function PreachermanProviderConnectionsPanel({ locale, serviceRequest }: PreachermanProviderConnectionsPanelProps) {
  const text = copy[locale];
  const titleId = useId();
  const [data, setData] = useState<PreachermanProviderConnectionsData>({
    providers: [],
    connections: [],
    settings: { deepseekConfigured: false, dashscopeWorkspaceConfigured: false, asrConfigured: false, ttsConfigured: false },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerTests, setProviderTests] = useState<Readonly<Record<string, ProviderTestStatus>>>({});
  const [connectionActions, setConnectionActions] = useState<Readonly<Record<string, ConnectionActionStatus>>>({});
  const [connectionDrafts, setConnectionDrafts] = useState<Readonly<Record<string, Readonly<Record<string, string>>>>>({});
  const [connectionConfigurations, setConnectionConfigurations] = useState<Readonly<Record<string, ConnectionConfigurationStatus>>>({});
  const [deepseekKey, setDeepseekKey] = useState("");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ readonly failed: boolean; readonly text: string } | null>(null);
  const [settingsTests, setSettingsTests] = useState<ProviderSettingsTestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setProviderTests({});
    setConnectionActions({});
    setConnectionConfigurations({});
    setConnectionDrafts({});
    try {
      setData(await loadPreachermanProviderConnections(serviceRequest));
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
      if (Array.isArray(response.result.models)) {
        setData((current) => ({
          ...current,
          providers: current.providers.map((candidate) => candidate.id === provider.id
            ? { ...candidate, models: response.result?.models }
            : candidate),
        }));
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

  const saveProviderSettings = async () => {
    const next = {
      ...(deepseekKey.trim() ? { deepseekApiKey: deepseekKey.trim() } : {}),
      ...(dashscopeKey.trim() ? { dashscopeApiKey: dashscopeKey.trim() } : {}),
      ...(workspaceId.trim() ? { dashscopeWorkspaceId: workspaceId.trim() } : {}),
    };
    if (Object.keys(next).length === 0) {
      setSettingsMessage({ failed: true, text: text.enterConfiguration });
      return;
    }
    setSettingsBusy(true);
    setSettingsMessage(null);
    setSettingsTests(null);
    let saved = false;
    try {
      await serviceRequest<ProviderSettingsStatus>("/api/settings/providers", { method: "PUT", body: JSON.stringify(next) });
      saved = true;
      setDeepseekKey("");
      setDashscopeKey("");
      setWorkspaceId("");
      setData(await loadPreachermanProviderConnections(serviceRequest));
      const results = await serviceRequest<ProviderSettingsTestResult>("/api/settings/test", { method: "POST", body: JSON.stringify({}) });
      setSettingsTests(results);
      const configured = Object.values(results).filter((result) => result.configured);
      const failed = configured.some((result) => !result.ok);
      setSettingsMessage({
        failed,
        text: configured.length === 0 ? text.settingsUntested : failed ? text.settingsFailed : text.settingsPassed,
      });
    } catch (reason) {
      const detail = reason instanceof Error && reason.message ? ` ${reason.message}` : "";
      setSettingsMessage({ failed: true, text: `${saved ? text.settingsTestFailed : text.settingsSaveFailed}${detail}` });
    } finally {
      setSettingsBusy(false);
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

  const updateConnectionDraft = (connectionId: string, field: string, value: string) => {
    setConnectionDrafts((current) => ({ ...current, [connectionId]: { ...current[connectionId], [field]: value } }));
  };

  const configureConnection = async (connection: ConnectionSnapshot) => {
    const draft = connectionDrafts[connection.id] || {};
    const fields = CONNECTION_CONFIGURATION_FIELDS[connection.id as keyof typeof CONNECTION_CONFIGURATION_FIELDS];
    const configuration: Record<string, string | number> = {};
    for (const field of fields) {
      const value = draft[field.name]?.trim();
      if (!value) continue;
      if (field.type === "number") {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
          setConnectionConfigurations((current) => ({ ...current, [connection.id]: { phase: "failed", message: `${text.connectionFields.port}: 1–65535` } }));
          return;
        }
        configuration[field.name] = parsed;
      } else {
        configuration[field.name] = value;
      }
    }
    if (Object.keys(configuration).length === 0) {
      setConnectionConfigurations((current) => ({ ...current, [connection.id]: { phase: "failed", message: text.enterConnectionConfiguration } }));
      return;
    }
    setConnectionConfigurations((current) => ({ ...current, [connection.id]: { phase: "saving", message: text.configuringConnection } }));
    try {
      const response = await serviceRequest<{ readonly connection?: ConnectionSnapshot }>(
        `/api/connections/${encodeURIComponent(connection.id)}/configure`,
        { method: "POST", body: JSON.stringify({ configuration }) },
      );
      const updated = response.connection;
      if (!updated || updated.id !== connection.id) throw new Error(text.connectionConfigureFailed);
      setData((current) => ({
        ...current,
        connections: current.connections.map((candidate) => candidate.id === updated.id ? updated : candidate),
      }));
      setConnectionDrafts((current) => ({ ...current, [connection.id]: {} }));
      const failed = updated.status === "error";
      const message = updated.status === "disconnected"
        ? text.connectionConfigured
        : updated.status === "external-runtime-required"
          ? text.connectionNeedsRuntime
          : updated.status === "configuration-required" ? text.connectionIncomplete : text.connectionConfigureFailed;
      setConnectionConfigurations((current) => ({ ...current, [connection.id]: { phase: failed ? "failed" : "succeeded", message } }));
    } catch (reason) {
      setConnectionConfigurations((current) => ({
        ...current,
        [connection.id]: { phase: "failed", message: reason instanceof Error && reason.message ? reason.message : text.connectionConfigureFailed },
      }));
    }
  };

  return <section className="demo-preacherman-provider-connections" data-preacherman-control="provider.catalog connection.catalog" aria-labelledby={titleId}>
    <header className="demo-preacherman-provider-connections__header">
      <div>
        <span className="demo-preacherman-provider-connections__eyebrow">{text.eyebrow}</span>
        <h2 id={titleId}>{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <button aria-busy={loading} disabled={loading} onClick={() => void load()} type="button">
        {loading ? text.refreshing : text.refresh}
      </button>
    </header>

    {loading && data.providers.length === 0 && data.connections.length === 0
      ? <p className="demo-preacherman-provider-connections__notice" role="status" aria-live="polite">{text.loading}</p>
      : null}
    {error ? <div className="demo-preacherman-provider-connections__error" role="alert">
      <p>{text.loadError} <small>{error}</small></p>
      <button onClick={() => void load()} type="button">{text.refresh}</button>
    </div> : null}

    {!loading && !error ? <details className="demo-preacherman-provider-connections__configuration" data-preacherman-control="provider.credentials voice.providers vision.providers">
      <summary>
        <span>{text.configuration}</span>
        <small>{text.configurationHint}</small>
      </summary>
      <div className="demo-preacherman-provider-connections__configuration-body">
        <label>{text.deepseekKey}<input
          autoComplete="off"
          onChange={(event) => setDeepseekKey(event.target.value)}
          placeholder={data.settings.deepseekConfigured ? text.configuredPlaceholder : text.keyPlaceholder}
          type="password"
          value={deepseekKey}
        /></label>
        <label>{text.dashscopeKey}<input
          autoComplete="off"
          onChange={(event) => setDashscopeKey(event.target.value)}
          placeholder={data.settings.ttsConfigured ? text.configuredPlaceholder : text.keyPlaceholder}
          type="password"
          value={dashscopeKey}
        /></label>
        <label>{text.workspaceId}<input
          autoComplete="off"
          onChange={(event) => setWorkspaceId(event.target.value)}
          placeholder={data.settings.dashscopeWorkspaceConfigured ? text.configuredPlaceholder : text.workspacePlaceholder}
          value={workspaceId}
        /></label>
        <button disabled={settingsBusy} onClick={() => void saveProviderSettings()} type="button">
          {settingsBusy ? text.savingAndTesting : text.saveAndTest}
        </button>
        {settingsMessage ? <p data-state={settingsMessage.failed ? "failed" : "succeeded"} role={settingsMessage.failed ? "alert" : "status"}>{settingsMessage.text}</p> : null}
        {settingsTests ? <dl>
          {(["deepseek", "asr", "tts"] as const).map((kind) => <div key={kind}>
            <dt>{kind === "deepseek" ? "DeepSeek LLM" : kind.toUpperCase()}</dt>
            <dd data-state={!settingsTests[kind].configured ? "unconfigured" : settingsTests[kind].ok ? "succeeded" : "failed"}>{settingsTests[kind].message}</dd>
          </div>)}
        </dl> : null}
      </div>
    </details> : null}

    {!loading && !error ? <div className="demo-preacherman-provider-connections__sections" aria-live="polite">
      <section aria-labelledby={`${titleId}-providers`}>
        <div className="demo-preacherman-provider-connections__section-heading">
          <div><h3 id={`${titleId}-providers`}>{text.providers}</h3><p>{text.providersHint}</p></div>
          <span>{CAPABILITIES.length}</span>
        </div>
        <div className="demo-preacherman-provider-connections__provider-grid">
          {CAPABILITIES.map((capability) => {
            const matches = data.providers.filter((provider) => provider.capabilities[capability]);
            return <article className="demo-preacherman-provider-connections__capability" key={capability}>
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
                  const models = (provider.models || []).filter((model) => model.capability === capability);
                  return <li data-state={state} key={provider.id}>
                    <div>
                      <strong>{provider.label}</strong>
                      <small>{provider.adapter ? `${text.adapter}: ${provider.adapter.pluginId}` : text.noAdapter}{required ? ` · ${configured}/${required}` : ""}</small>
                    </div>
                    <div className="demo-preacherman-provider-connections__provider-actions">
                      <StatusBadge state={state} label={text.states[state]} />
                      <button
                        aria-label={`${text.test} ${provider.label} ${text.capabilities[capability]}`}
                        className="demo-preacherman-provider-connections__test-button"
                        disabled={state !== "ready" || testStatus?.phase === "testing"}
                        onClick={() => void testProvider(provider, capability, state)}
                        type="button"
                      >{testStatus?.phase === "testing" ? text.testing : text.test}</button>
                    </div>
                    {testStatus ? <small
                      className="demo-preacherman-provider-connections__test-result"
                      data-state={testStatus.phase}
                      role={testStatus.phase === "failed" ? "alert" : "status"}
                    >{testStatus.message}</small> : null}
                    {models.length > 0 ? <details className="demo-preacherman-provider-connections__models">
                      <summary>{text.models} · {models.length}</summary>
                      <div>{models.map((model) => <span key={model.id}>
                        <code>{model.label}</code>
                        <small>{model.source === "provider" ? text.providerModel : text.declaredModel}</small>
                      </span>)}</div>
                    </details> : null}
                  </li>;
                })}
              </ul>
            </article>;
          })}
        </div>
      </section>

      <section aria-labelledby={`${titleId}-connections`}>
        <div className="demo-preacherman-provider-connections__section-heading">
          <div><h3 id={`${titleId}-connections`}>{text.connections}</h3><p>{text.connectionsHint}</p></div>
          <span>{CONNECTIONS.length}</span>
        </div>
        <ul className="demo-preacherman-provider-connections__connection-grid">
          {CONNECTIONS.map((connectionId) => {
            const connection = data.connections.find(({ id }) => id === connectionId);
            const state = connection ? normalizeConnectionState(connection.status) : "error";
            const actionStatus = connectionActions[connectionId];
            const configurationStatus = connectionConfigurations[connectionId];
            const actionBusy = actionStatus?.phase === "running";
            const configurationBusy = configurationStatus?.phase === "saving";
            const busy = actionBusy || configurationBusy;
            const fields = CONNECTION_CONFIGURATION_FIELDS[connectionId];
            const draft = connectionDrafts[connectionId] || {};
            const blockedReason = !connection
              ? text.missingConnection
              : connection.status === "configuration-required"
                ? text.configureFirst
                : connection.status === "external-runtime-required" || connection.status === "adapter-required"
                  ? text.runtimeFirst
                  : "";
            return <li data-state={state} key={connectionId}>
              <div className="demo-preacherman-provider-connections__connection-heading">
                <div><strong>{connection?.name || connectionId[0].toUpperCase() + connectionId.slice(1)}</strong><code>{connectionId}</code></div>
                <StatusBadge state={state} label={text.states[state]} />
              </div>
              <p>{connection?.description || text.missingConnection}</p>
              <small>{connection
                ? connection.lastError?.message || blockedReason || (connection.connected ? text.connected : connection.status === "disconnected" ? text.disconnected : connection.status)
                : text.missingConnection}</small>
              <span>{connection?.adapter ? `${text.adapter}: ${connection.adapter.pluginId}` : text.noAdapter}</span>
              {connection ? <details className="demo-preacherman-provider-connections__connection-configuration" data-preacherman-control={`connection.${connectionId}`}>
                <summary><span>{text.connectionConfiguration}</span><small>{text.connectionConfigurationHint}</small></summary>
                <form onSubmit={(event) => { event.preventDefault(); void configureConnection(connection); }}>
                  {fields.map((field) => {
                    const configuredSecret = field.type === "password" && connection.configuration.secrets[field.name] === true;
                    const currentValue = field.type !== "password" ? connection.configuration.values[field.name] : undefined;
                    return <label key={field.name}>{text.connectionFields[field.name]}<input
                      autoComplete={field.type === "password" ? "new-password" : "off"}
                      disabled={connection.connected || busy}
                      max={field.type === "number" ? 65_535 : undefined}
                      min={field.type === "number" ? 1 : undefined}
                      onChange={(event) => updateConnectionDraft(connection.id, field.name, event.target.value)}
                      placeholder={configuredSecret ? text.fieldConfigured : currentValue !== undefined ? String(currentValue) : text.connectionFields[field.name]}
                      type={field.type}
                      value={draft[field.name] || ""}
                    /></label>;
                  })}
                  <button className="demo-preacherman-provider-connections__connection-action-button" disabled={connection.connected || busy} type="submit">
                    {configurationBusy ? text.configuringConnection : text.configureConnection}
                  </button>
                  {configurationStatus ? <p data-state={configurationStatus.phase} role={configurationStatus.phase === "failed" ? "alert" : "status"}>{configurationStatus.message}</p> : null}
                </form>
              </details> : null}
              <div className="demo-preacherman-provider-connections__connection-actions">
                {connection?.status === "connected" ? <button
                  aria-busy={actionBusy && actionStatus?.operation === "disconnect"}
                  aria-label={`${text.disconnect} ${connection.name}`}
                  className="demo-preacherman-provider-connections__connection-action-button"
                  disabled={!canRunConnectionAction(connection.status, "disconnect") || busy}
                  onClick={() => void runConnectionAction(connection, "disconnect")}
                  type="button"
                >{actionBusy && actionStatus?.operation === "disconnect" ? text.disconnecting : text.disconnect}</button> : <>
                  <button
                    aria-busy={actionBusy && actionStatus?.operation === "test"}
                    aria-label={`${text.connectionTest} ${connection?.name || connectionId}`}
                    className="demo-preacherman-provider-connections__connection-action-button"
                    disabled={!canRunConnectionAction(connection?.status, "test") || busy}
                    onClick={() => connection && void runConnectionAction(connection, "test")}
                    type="button"
                  >{actionBusy && actionStatus?.operation === "test" ? text.connectionTesting : text.connectionTest}</button>
                  <button
                    aria-busy={actionBusy && actionStatus?.operation === "connect"}
                    aria-label={`${text.connect} ${connection?.name || connectionId}`}
                    className="demo-preacherman-provider-connections__connection-action-button"
                    disabled={!canRunConnectionAction(connection?.status, "connect") || busy}
                    onClick={() => connection && void runConnectionAction(connection, "connect")}
                    type="button"
                  >{actionBusy && actionStatus?.operation === "connect" ? text.connecting : text.connect}</button>
                </>}
              </div>
              {actionStatus ? <small
                className="demo-preacherman-provider-connections__connection-action-result"
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
