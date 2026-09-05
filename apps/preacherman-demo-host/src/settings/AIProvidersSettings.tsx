import { useCallback, useEffect, useId, useState } from "react";
import type { Locale } from "../preferences";
import { localServiceUrlForPort, readServicePort, saveServicePort } from "../serviceConfig";
import "./ai-providers-settings.css";

type ProviderTab = "providers" | "credentials" | "routing" | "local";
type ProviderState = "ready" | "configuration-required" | "adapter-required" | "error";
type ProviderId = "deepseek" | "dashscope";

interface ProviderCapabilityStatus {
  readonly state: ProviderState;
}

interface ProviderSnapshot {
  readonly id: string;
  readonly label: string;
  readonly adapter: { readonly pluginId: string } | null;
  readonly capabilities: Readonly<Record<string, ProviderCapabilityStatus>>;
  readonly models?: readonly { readonly id: string; readonly label: string; readonly capability: string }[];
}

interface ProviderSettingsStatus {
  readonly deepseekConfigured: boolean;
  readonly dashscopeWorkspaceConfigured: boolean;
  readonly asrConfigured: boolean;
  readonly ttsConfigured: boolean;
}

interface ProviderTestResponse {
  readonly result?: { readonly state?: string; readonly ok?: boolean; readonly message?: string };
}

interface Feedback {
  readonly state: "idle" | "busy" | "success" | "error";
  readonly message: string;
}

const providerCapabilities: Record<ProviderId, readonly string[]> = {
  deepseek: ["Chat"],
  dashscope: ["Speech", "Vision"],
};

const copy = {
  en: {
    title: "AI Providers",
    tabs: { providers: "Providers", credentials: "Credentials", routing: "Routing", local: "Advanced" },
    connected: "connected",
    description: "Your models, connected.",
    providerHeading: "Model providers",
    providerHint: "Choose a provider to connect or manage.",
    configure: "Configure",
    manage: "Manage",
    connection: "Connection",
    credentialsHint: "Add your API key, then save and test the connection.",
    modelsHeading: "Available models",
    routingHeading: "Capability routing",
    routingHint: "The providers used for each capability.",
    localHeading: "Local connection",
    localHint: "Connect to the Preacherman service on this device.",
    currentPort: "Active port",
    configuredPlaceholder: "Saved · leave blank to keep",
    workspaceHint: "Beijing region",
    selected: "Selected",
    capabilities: { chat: "Chat", asr: "Speech recognition", tts: "Speech synthesis", vision: "Vision" },
    serviceUnknown: "Unavailable",
    loadingState: "Checking",
    refresh: "Refresh",

    retry: "Retry",
    refreshing: "Refreshing…",
    noModels: "No models",
    test: "Test",
    testing: "Testing…",
    deepseekKey: "DeepSeek API key",
    dashscopeKey: "DashScope API key",
    workspaceId: "Workspace ID",
    configured: "Configured",
    newKey: "API key",
    newWorkspace: "Workspace ID",
    show: "Show",
    hide: "Hide",
    save: "Save",
    saving: "Saving…",
    enterCredential: "Enter a credential.",
    saved: "Saved",
    port: "Port",
    savePort: "Connect",
    checkingPort: "Checking…",
    portSaved: "Connected",
    invalidPort: "Use 1024–65535.",
    unavailable: "Service unavailable.",
    empty: "No providers",
    states: { ready: "Ready", "configuration-required": "Setup", "adapter-required": "Adapter", error: "Offline" },
  },
  "zh-CN": {
    title: "AI 服务商",
    tabs: { providers: "服务商", credentials: "认证", routing: "路由", local: "高级" },
    connected: "已连接",
    description: "连接你的模型。",
    providerHeading: "模型服务商",
    providerHint: "选择服务商，配置连接。",
    configure: "配置",
    manage: "管理",
    connection: "连接配置",
    credentialsHint: "填写 API 密钥，保存后测试连接。",
    modelsHeading: "可用模型",
    routingHeading: "能力路由",
    routingHint: "查看各项能力当前使用的服务商。",
    localHeading: "本地连接",
    localHint: "连接此设备上的 Preacherman 服务。",
    currentPort: "当前端口",
    configuredPlaceholder: "已保存 · 留空保留",
    workspaceHint: "北京地域",
    selected: "已选择",
    capabilities: { chat: "对话", asr: "语音识别", tts: "语音合成", vision: "视觉" },
    serviceUnknown: "不可用",
    loadingState: "检查中",
    refresh: "刷新",

    retry: "重试",
    refreshing: "正在刷新…",
    noModels: "暂无模型",
    test: "测试",
    testing: "正在测试…",
    deepseekKey: "DeepSeek API 密钥",
    dashscopeKey: "DashScope API 密钥",
    workspaceId: "工作空间 ID",
    configured: "已配置",
    newKey: "API 密钥",
    newWorkspace: "工作空间 ID",
    show: "显示",
    hide: "隐藏",
    save: "保存",
    saving: "正在保存…",
    enterCredential: "请输入凭据。",
    saved: "已保存",
    port: "端口",
    savePort: "连接",
    checkingPort: "正在检查…",
    portSaved: "已连接",
    invalidPort: "端口范围为 1024–65535。",
    unavailable: "服务不可用。",
    empty: "暂无服务商",
    states: { ready: "就绪", "configuration-required": "待配置", "adapter-required": "待接入", error: "离线" },
  },
} as const;

async function serviceRequest<T>(port: number, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(localServiceUrlForPort(port, path), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json().catch(() => ({})) as T & { readonly error?: string };
  if (!response.ok) throw new Error(payload.error || `Local service returned HTTP ${response.status}.`);
  return payload;
}

function providerState(provider: ProviderSnapshot | undefined): ProviderState {
  if (!provider) return "error";
  const states = Object.values(provider.capabilities).map((capability) => capability.state);
  if (states.length > 0 && states.every((state) => state === "ready")) return "ready";
  if (states.includes("configuration-required")) return "configuration-required";
  if (states.includes("adapter-required")) return "adapter-required";
  return "error";
}

export function AIProvidersSettings({ locale }: { readonly locale: Locale }) {
  const text = copy[locale];
  const instanceId = useId();
  const [tab, setTab] = useState<ProviderTab>("providers");
  const [selectedId, setSelectedId] = useState<ProviderId>("deepseek");
  const [providers, setProviders] = useState<readonly ProviderSnapshot[]>([]);
  const [settings, setSettings] = useState<ProviderSettingsStatus>({ deepseekConfigured: false, dashscopeWorkspaceConfigured: false, asrConfigured: false, ttsConfigured: false });
  const [port, setPort] = useState(readServicePort);
  const [draftPort, setDraftPort] = useState(() => String(readServicePort()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [revealSecret, setRevealSecret] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ state: "idle", message: "" });

  const load = useCallback(async (nextPort = readServicePort()) => {
    setLoading(true);
    setLoadError("");
    try {
      const [catalog, status] = await Promise.all([
        serviceRequest<{ readonly providers?: readonly ProviderSnapshot[] }>(nextPort, "/api/providers/catalog"),
        serviceRequest<ProviderSettingsStatus>(nextPort, "/api/settings/providers"),
      ]);
      setProviders(Array.isArray(catalog.providers) ? catalog.providers : []);
      setSettings(status);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : text.unavailable);
    } finally {
      setLoading(false);
    }
  }, [text.unavailable]);

  useEffect(() => { void load(); }, [load]);

  const selectedProvider = providers.find((provider) => provider.id === selectedId);
  const connectedCount = providers.filter((provider) => providerState(provider) === "ready").length;
  const selectedState = providerState(selectedProvider);
  const tabEntries = Object.entries(text.tabs) as [ProviderTab, string][];
  const routeEntries = [
    ["chat", "DeepSeek", "deepseek"],
    ["asr", "DashScope", "dashscope"],
    ["tts", "DashScope", "dashscope"],
    ["vision", "DashScope", "dashscope"],
  ] as const;
  const busy = feedback.state === "busy";

  const changeTab = (next: ProviderTab) => {
    setTab(next);
    setFeedback({ state: "idle", message: "" });
    setRevealSecret(false);
  };

  const selectProvider = (id: ProviderId) => {
    setSelectedId(id);
    setRevealSecret(false);
    setFeedback({ state: "idle", message: "" });
  };

  const stateLabel = (state: ProviderState) => loading ? text.loadingState : loadError ? text.serviceUnknown : text.states[state];

  const testSelectedProvider = async () => {
    if (!selectedProvider || selectedState !== "ready") return;
    const capability = selectedId === "deepseek" ? "chat" : "tts";
    setFeedback({ state: "busy", message: text.testing });
    try {
      const response = await serviceRequest<ProviderTestResponse>(port, `/api/providers/${encodeURIComponent(selectedId)}/test`, {
        method: "POST",
        body: JSON.stringify({ capability }),
      });
      if (response.result?.state !== "ready" || response.result.ok !== true) throw new Error(response.result?.message || text.unavailable);
      const next = { state: "success", message: response.result.message || text.states.ready } as const;
      setFeedback(next);
      await load(port);
    } catch (reason) {
      const next = { state: "error", message: reason instanceof Error ? reason.message : text.unavailable } as const;
      setFeedback(next);
    }
  };

  const saveCredentials = async () => {
    const payload = selectedId === "deepseek"
      ? (deepseekKey.trim() ? { deepseekApiKey: deepseekKey.trim() } : {})
      : {
          ...(dashscopeKey.trim() ? { dashscopeApiKey: dashscopeKey.trim() } : {}),
          ...(workspaceId.trim() ? { dashscopeWorkspaceId: workspaceId.trim() } : {}),
        };
    if (Object.keys(payload).length === 0) {
      setFeedback({ state: "error", message: text.enterCredential });
      return;
    }
    setFeedback({ state: "busy", message: text.saving });
    try {
      await serviceRequest<ProviderSettingsStatus>(port, "/api/settings/providers", { method: "PUT", body: JSON.stringify(payload) });
      setDeepseekKey("");
      setDashscopeKey("");
      setWorkspaceId("");
      setRevealSecret(false);
      await load(port);
      setFeedback({ state: "success", message: text.saved });
    } catch (reason) {
      setFeedback({ state: "error", message: reason instanceof Error ? reason.message : text.unavailable });
    }
  };

  const verifyPort = async () => {
    const nextPort = Number(draftPort);
    if (!Number.isInteger(nextPort) || nextPort < 1024 || nextPort > 65535) {
      setFeedback({ state: "error", message: text.invalidPort });
      return;
    }
    setFeedback({ state: "busy", message: text.checkingPort });
    try {
      await serviceRequest<unknown>(nextPort, "/api/health");
      saveServicePort(nextPort);
      setPort(nextPort);
      await load(nextPort);
      setFeedback({ state: "success", message: text.portSaved });
    } catch (reason) {
      setFeedback({ state: "error", message: reason instanceof Error ? reason.message : text.unavailable });
    }
  };

  const configured = selectedId === "deepseek" ? settings.deepseekConfigured : settings.ttsConfigured;


  return (
    <section aria-label={text.title} className="ai-provider-settings" data-preacherman-control="provider.credentials">
      <header className="ai-provider-settings__header">
        <div>
          <h2>{text.title}</h2>
          <p>{text.description}</p>
        </div>
        <span className="ai-provider-settings__summary">
          <span className="ai-provider-settings__dot" data-state={connectedCount ? "ready" : "idle"} />
          {loading ? text.loadingState : loadError ? text.serviceUnknown : `${connectedCount} / ${providers.length} ${text.connected}`}
        </span>
      </header>

      <nav aria-label={text.title} className="ai-provider-settings__tabs" role="tablist">
        {tabEntries.map(([id, label], index) => (
          <button
            aria-selected={tab === id}
            aria-controls={`${instanceId}-panel`}
            id={`${instanceId}-tab-${id}`}
            key={id}
            disabled={busy}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => changeTab(id)}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabEntries.length - 1 : (index + offset + tabEntries.length) % tabEntries.length;
              changeTab(tabEntries[next][0]);
              document.getElementById(`${instanceId}-tab-${tabEntries[next][0]}`)?.focus();
            }}
            role="tab"
            type="button"
          >{label}</button>
        ))}
      </nav>

      <div aria-busy={loading} aria-labelledby={`${instanceId}-tab-${tab}`} id={`${instanceId}-panel`} className="ai-provider-settings__body" role="tabpanel">
        {loadError ? <div className="ai-provider-settings__error" role="alert">
          <span>{text.unavailable}</span>
          <button disabled={loading || busy} onClick={() => void load(port)} type="button">{text.retry}</button>
        </div> : null}

        {tab === "providers" ? <>
          <div className="ai-provider-settings__section-heading">
            <div><h3>{text.providerHeading}</h3><p>{text.providerHint}</p></div>
            <button className="ai-provider-settings__quiet" disabled={loading || busy} onClick={() => void load(port)} type="button">{text.refresh}</button>
          </div>
          <div className="ai-provider-settings__provider-list">
            {(["deepseek", "dashscope"] as const).map((id) => {
              const provider = providers.find((candidate) => candidate.id === id);
              const state = providerState(provider);
              return <div className="ai-provider-settings__provider-row" key={id}>
                <span className="ai-provider-settings__provider-mark" aria-hidden="true">{id === "deepseek" ? "D" : "Q"}</span>
                <div className="ai-provider-settings__provider-name">
                  <strong>{provider?.label || (id === "deepseek" ? "DeepSeek" : "DashScope")}</strong>
                  <span>{providerCapabilities[id].join(" · ")}</span>
                </div>
                <span className="ai-provider-settings__status" data-state={loading || loadError ? "idle" : state}>
                  <span className="ai-provider-settings__dot" data-state={loading || loadError ? "idle" : state} />
                  {stateLabel(state)}
                </span>
                <button onClick={() => { selectProvider(id); changeTab("credentials"); }} type="button">{state === "ready" ? text.manage : text.configure}<span aria-hidden="true"> →</span></button>
              </div>;
            })}
          </div>
        </> : null}

        {tab === "credentials" ? <>
          <div className="ai-provider-settings__section-heading">
            <div><h3>{text.connection}</h3><p>{text.credentialsHint}</p></div>
          </div>
          <div className="ai-provider-settings__provider-switch" role="group" aria-label={text.providerHeading}>
            {(["deepseek", "dashscope"] as const).map((id) => (
              <button aria-pressed={selectedId === id} disabled={busy} key={id} onClick={() => selectProvider(id)} type="button">
                {id === "deepseek" ? "DeepSeek" : "DashScope"}
              </button>
            ))}
          </div>
          <form className="ai-provider-settings__credential-form" onSubmit={(event) => { event.preventDefault(); void saveCredentials(); }}>
            <div className="ai-provider-settings__field">
              <label htmlFor={`${instanceId}-key`}>{selectedId === "deepseek" ? text.deepseekKey : text.dashscopeKey}</label>
              <div className="ai-provider-settings__secret">
                <input id={`${instanceId}-key`} autoComplete="new-password" autoCapitalize="none" spellCheck={false} data-secret="true" disabled={busy}
                  onChange={(event) => selectedId === "deepseek" ? setDeepseekKey(event.target.value) : setDashscopeKey(event.target.value)}
                  placeholder={configured ? text.configuredPlaceholder : text.newKey}
                  type={revealSecret ? "text" : "password"} value={selectedId === "deepseek" ? deepseekKey : dashscopeKey} />
                <button aria-pressed={revealSecret} onClick={() => setRevealSecret((current) => !current)} type="button">{revealSecret ? text.hide : text.show}</button>
              </div>
            </div>
            {selectedId === "dashscope" ? <div className="ai-provider-settings__field">
              <label htmlFor={`${instanceId}-workspace`}>{text.workspaceId}<span>{text.workspaceHint}</span></label>
              <input id={`${instanceId}-workspace`} autoComplete="off" disabled={busy} onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder={settings.dashscopeWorkspaceConfigured ? text.configuredPlaceholder : text.newWorkspace} type="text" value={workspaceId} />
            </div> : null}
            <div className="ai-provider-settings__actions">
              <button className="ai-provider-settings__primary" disabled={busy || loading || !!loadError} type="submit">{busy && feedback.message === text.saving ? text.saving : text.save}</button>
              <button disabled={selectedState !== "ready" || busy || loading || !!loadError} onClick={() => void testSelectedProvider()} type="button">{busy && feedback.message === text.testing ? text.testing : text.test}</button>
              <span className="ai-provider-settings__status" data-state={loading || loadError ? "idle" : selectedState}>{stateLabel(selectedState)}</span>
            </div>
          </form>
          {!!selectedProvider?.models?.length && <section className="ai-provider-settings__models" aria-label={text.modelsHeading}>
            <h3>{text.modelsHeading}</h3>
            <div>{selectedProvider.models.map((model) => <span key={`${model.capability}:${model.id}`}>{model.label}</span>)}</div>
          </section>}
        </> : null}

        {tab === "routing" ? <>
          <div className="ai-provider-settings__section-heading"><div><h3>{text.routingHeading}</h3><p>{text.routingHint}</p></div></div>
          <div className="ai-provider-settings__route-list">
            {routeEntries.map(([capability, providerName, providerId]) => {
              const provider = providers.find((candidate) => candidate.id === providerId);
              const state = provider?.capabilities[capability]?.state || "error";
              return <div key={capability}>
                <span>{text.capabilities[capability]}</span>
                <strong>{providerName}</strong>
                <span className="ai-provider-settings__status" data-state={loading || loadError ? "idle" : state}><span className="ai-provider-settings__dot" data-state={loading || loadError ? "idle" : state} />{stateLabel(state)}</span>
              </div>;
            })}
          </div>
        </> : null}

        {tab === "local" ? <>
          <div className="ai-provider-settings__section-heading"><div><h3>{text.localHeading}</h3><p>{text.localHint}</p></div></div>
          <form className="ai-provider-settings__port-form" onSubmit={(event) => { event.preventDefault(); void verifyPort(); }}>
            <div className="ai-provider-settings__field"><label htmlFor={`${instanceId}-port`}>{text.port}</label>
              <input id={`${instanceId}-port`} disabled={busy} inputMode="numeric" max="65535" min="1024" onChange={(event) => setDraftPort(event.target.value)} type="number" value={draftPort} />
            </div>
            <button className="ai-provider-settings__primary" disabled={busy} type="submit">{busy ? text.checkingPort : text.savePort}</button>
          </form>
          <p className="ai-provider-settings__port-status">{text.currentPort}<code>127.0.0.1:{port}</code></p>
        </> : null}

        {feedback.message ? <p className="ai-provider-settings__feedback" data-state={feedback.state} role={feedback.state === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
      </div>
    </section>
  );
}
