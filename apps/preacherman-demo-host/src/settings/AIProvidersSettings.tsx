import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "../preferences";
import { localServiceUrlForPort, readServicePort, saveServicePort } from "../serviceConfig";
import "./ai-providers-settings.css";

type ProviderTab = "general" | "routing" | "authentication" | "advanced" | "usage" | "about";
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

const providerMeta: Record<ProviderId, { readonly endpoint: string; readonly capabilities: readonly string[] }> = {
  deepseek: { endpoint: "api.deepseek.com", capabilities: ["Chat"] },
  dashscope: { endpoint: "dashscope.aliyuncs.com", capabilities: ["Speech", "Vision"] },
};

const copy = {
  en: {
    title: "AI Providers",
    subtitle: "Configure model services, credentials, routing, and connection readiness.",
    tabs: { general: "General", routing: "Routing", authentication: "Authentication", advanced: "Advanced", usage: "Usage", about: "About" },
    connected: "connected",
    registered: "registered",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    providers: "Registered providers",
    providersHint: "Select a provider to inspect its live local-runtime state.",
    endpoint: "Endpoint",
    adapter: "Adapter",
    capabilities: "Capabilities",
    models: "Models",
    noModels: "Models appear after the provider confirms them.",
    test: "Test provider",
    testing: "Testing…",
    configuration: "Provider credentials",
    configurationHint: "Secrets are sent only to the local service. They are never returned or shown again.",
    deepseekKey: "DeepSeek API key",
    dashscopeKey: "DashScope API key",
    workspaceId: "DashScope workspace ID (Beijing)",
    configured: "Configured · leave blank to keep it",
    newKey: "Enter a new API key",
    newWorkspace: "Enter the Model Studio workspace ID",
    show: "Show",
    hide: "Hide",
    save: "Save credentials",
    saving: "Saving…",
    enterCredential: "Enter at least one new credential value.",
    saved: "Credentials saved. The local service did not return any secret values.",
    routes: "Capability routing",
    routesHint: "Current first-party routing used by Task and the companion runtime.",
    service: "Local service",
    serviceHint: "Change the port only when the Preacherman service is already listening elsewhere.",
    port: "Service port",
    savePort: "Verify & use port",
    checkingPort: "Checking…",
    portSaved: "Local service verified. This port is now active.",
    invalidPort: "Use a port between 1024 and 65535.",
    usage: "Connection activity",
    usageHint: "Live request accounting is not connected yet. Connection checks from this session appear here.",
    noActivity: "No provider check has run in this session.",
    about: "Local-first provider settings",
    aboutHint: "Provider definitions come from the bundled runtime. Credentials stay in the local service data directory with restricted file permissions.",
    unavailable: "The local service is unavailable. Check the service port in Advanced.",
    empty: "No providers were returned by the local runtime.",
    states: { ready: "Ready", "configuration-required": "Configuration required", "adapter-required": "Adapter required", error: "Unavailable" },
  },
  "zh-CN": {
    title: "AI 服务商",
    subtitle: "配置模型服务、认证凭据、能力路由与连接状态。",
    tabs: { general: "通用", routing: "路由", authentication: "认证", advanced: "高级", usage: "使用统计", about: "关于" },
    connected: "项已连接",
    registered: "项已注册",
    refresh: "刷新",
    refreshing: "正在刷新…",
    providers: "已注册服务商",
    providersHint: "选择一个服务商，查看本地运行时返回的实时状态。",
    endpoint: "接口地址",
    adapter: "适配器",
    capabilities: "能力",
    models: "模型",
    noModels: "服务商确认后将在这里显示模型。",
    test: "测试服务商",
    testing: "正在测试…",
    configuration: "服务商凭据",
    configurationHint: "密钥只发送到本地服务；保存后不会返回，也不会再次显示。",
    deepseekKey: "DeepSeek API 密钥",
    dashscopeKey: "DashScope API 密钥",
    workspaceId: "DashScope 工作空间 ID（北京）",
    configured: "已配置 · 留空可保留",
    newKey: "输入新的 API 密钥",
    newWorkspace: "输入百炼工作空间 ID",
    show: "显示",
    hide: "隐藏",
    save: "保存凭据",
    saving: "正在保存…",
    enterCredential: "请至少输入一项新的凭据。",
    saved: "凭据已保存；本地服务没有返回任何密钥内容。",
    routes: "能力路由",
    routesHint: "Task 与虚拟伙伴运行时当前使用的第一方路由。",
    service: "本地服务",
    serviceHint: "只有当 Preacherman 服务已在其他端口监听时才需要修改。",
    port: "服务端口",
    savePort: "验证并使用端口",
    checkingPort: "正在检查…",
    portSaved: "本地服务验证通过，已切换到这个端口。",
    invalidPort: "端口必须在 1024 到 65535 之间。",
    usage: "连接活动",
    usageHint: "请求用量统计尚未接入；本次会话的连接检查会显示在这里。",
    noActivity: "本次会话尚未运行服务商检查。",
    about: "本地优先的服务商设置",
    aboutHint: "服务商定义来自应用内置运行时；凭据保存在本地服务数据目录，并使用受限文件权限。",
    unavailable: "无法连接本地服务，请在“高级”中检查服务端口。",
    empty: "本地运行时没有返回服务商。",
    states: { ready: "已就绪", "configuration-required": "需要配置", "adapter-required": "需要适配器", error: "不可用" },
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
  const [tab, setTab] = useState<ProviderTab>("general");
  const [selectedId, setSelectedId] = useState<ProviderId>("deepseek");
  const [providers, setProviders] = useState<readonly ProviderSnapshot[]>([]);
  const [settings, setSettings] = useState<ProviderSettingsStatus>({ deepseekConfigured: false, dashscopeWorkspaceConfigured: false, asrConfigured: false, ttsConfigured: false });
  const [port, setPort] = useState(readServicePort);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [revealSecret, setRevealSecret] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ state: "idle", message: "" });
  const [lastChecks, setLastChecks] = useState<Readonly<Record<string, Feedback>>>({});

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
  const routeEntries = useMemo(() => [
    ["Chat", "DeepSeek", providers.find((provider) => provider.id === "deepseek")],
    ["Speech recognition", "DashScope", providers.find((provider) => provider.id === "dashscope")],
    ["Speech synthesis", "DashScope", providers.find((provider) => provider.id === "dashscope")],
    ["Vision", "DashScope", providers.find((provider) => provider.id === "dashscope")],
  ] as const, [providers]);

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
      setLastChecks((current) => ({ ...current, [selectedId]: next }));
      await load(port);
    } catch (reason) {
      const next = { state: "error", message: reason instanceof Error ? reason.message : text.unavailable } as const;
      setFeedback(next);
      setLastChecks((current) => ({ ...current, [selectedId]: next }));
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
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      setFeedback({ state: "error", message: text.invalidPort });
      return;
    }
    setFeedback({ state: "busy", message: text.checkingPort });
    try {
      await serviceRequest<unknown>(port, "/api/health");
      saveServicePort(port);
      await load(port);
      setFeedback({ state: "success", message: text.portSaved });
    } catch (reason) {
      setFeedback({ state: "error", message: reason instanceof Error ? reason.message : text.unavailable });
    }
  };

  const configured = selectedId === "deepseek" ? settings.deepseekConfigured : settings.ttsConfigured;

  return (
    <section aria-label={text.title} className="ai-provider-settings" data-preacherman-control="provider.credentials">
      <header className="ai-provider-settings__header">
        <div><h2>{text.title}</h2><p>{text.subtitle}</p></div>
        <span><strong>{connectedCount}</strong> {text.connected} · {providers.length} {text.registered}</span>
      </header>

      <nav aria-label={text.title} className="ai-provider-settings__tabs" role="tablist">
        {tabEntries.map(([id, label]) => (
          <button aria-selected={tab === id} key={id} onClick={() => { setTab(id); setFeedback({ state: "idle", message: "" }); }} role="tab" type="button">{label}</button>
        ))}
      </nav>

      <div aria-busy={loading} className="ai-provider-settings__body" role="tabpanel">
        {tab === "general" ? <>
          <div className="ai-provider-settings__section-heading"><div><h3>{text.providers}</h3><p>{text.providersHint}</p></div><button disabled={loading} onClick={() => void load(port)} type="button">{loading ? text.refreshing : text.refresh}</button></div>
          {loadError ? <p className="ai-provider-settings__feedback" data-state="error" role="alert">{text.unavailable} {loadError}</p> : null}
          <div className="ai-provider-settings__provider-switch" role="group">
            {(["deepseek", "dashscope"] as const).map((id) => {
              const provider = providers.find((candidate) => candidate.id === id);
              const state = providerState(provider);
              return <button aria-pressed={selectedId === id} data-state={state} key={id} onClick={() => { setSelectedId(id); setFeedback({ state: "idle", message: "" }); }} type="button"><span>{provider?.label || (id === "deepseek" ? "DeepSeek" : "DashScope")}</span><small>{text.states[state]}</small></button>;
            })}
          </div>
          {selectedProvider ? <article className="ai-provider-settings__provider-card" data-state={selectedState}>
            <header><div><span>{selectedProvider.label}</span><strong>{text.states[selectedState]}</strong></div><button disabled={selectedState !== "ready" || feedback.state === "busy"} onClick={() => void testSelectedProvider()} type="button">{feedback.state === "busy" ? text.testing : text.test}</button></header>
            <dl><div><dt>{text.endpoint}</dt><dd>{providerMeta[selectedId].endpoint}</dd></div><div><dt>{text.adapter}</dt><dd>{selectedProvider.adapter?.pluginId || "—"}</dd></div><div><dt>{text.capabilities}</dt><dd>{providerMeta[selectedId].capabilities.join(" · ")}</dd></div></dl>
            <div className="ai-provider-settings__models"><span>{text.models}</span>{selectedProvider.models?.length ? <div>{selectedProvider.models.map((model) => <code key={`${model.capability}:${model.id}`}>{model.label}</code>)}</div> : <small>{text.noModels}</small>}</div>
          </article> : loading ? <p className="ai-provider-settings__feedback" data-state="busy">{text.refreshing}</p> : <p className="ai-provider-settings__feedback">{text.empty}</p>}
        </> : null}

        {tab === "routing" ? <><div className="ai-provider-settings__section-heading"><div><h3>{text.routes}</h3><p>{text.routesHint}</p></div></div><div className="ai-provider-settings__route-list">{routeEntries.map(([capability, providerName, provider]) => { const state = providerState(provider); return <div data-state={state} key={capability}><span>{capability}</span><strong>{providerName}</strong><small>{text.states[state]}</small></div>; })}</div></> : null}

        {tab === "authentication" ? <><div className="ai-provider-settings__section-heading"><div><h3>{text.configuration}</h3><p>{text.configurationHint}</p></div></div><div className="ai-provider-settings__provider-switch" role="group">{(["deepseek", "dashscope"] as const).map((id) => <button aria-pressed={selectedId === id} key={id} onClick={() => { setSelectedId(id); setFeedback({ state: "idle", message: "" }); }} type="button"><span>{id === "deepseek" ? "DeepSeek" : "DashScope"}</span><small>{id === "deepseek" ? (settings.deepseekConfigured ? text.states.ready : text.states["configuration-required"]) : (settings.ttsConfigured ? text.states.ready : text.states["configuration-required"])}</small></button>)}</div><form className="ai-provider-settings__credential-form" onSubmit={(event) => { event.preventDefault(); void saveCredentials(); }}>
          {selectedId === "deepseek" ? <label>{text.deepseekKey}<span><input autoComplete="new-password" data-secret="true" onChange={(event) => setDeepseekKey(event.target.value)} placeholder={configured ? text.configured : text.newKey} type={revealSecret ? "text" : "password"} value={deepseekKey} /><button onClick={() => setRevealSecret((current) => !current)} type="button">{revealSecret ? text.hide : text.show}</button></span></label> : <><label>{text.dashscopeKey}<span><input autoComplete="new-password" data-secret="true" onChange={(event) => setDashscopeKey(event.target.value)} placeholder={configured ? text.configured : text.newKey} type={revealSecret ? "text" : "password"} value={dashscopeKey} /><button onClick={() => setRevealSecret((current) => !current)} type="button">{revealSecret ? text.hide : text.show}</button></span></label><label>{text.workspaceId}<input autoComplete="off" onChange={(event) => setWorkspaceId(event.target.value)} placeholder={settings.dashscopeWorkspaceConfigured ? text.configured : text.newWorkspace} type="text" value={workspaceId} /></label></>}
          <button className="ai-provider-settings__primary" disabled={feedback.state === "busy"} type="submit">{feedback.state === "busy" ? text.saving : text.save}</button>
        </form></> : null}

        {tab === "advanced" ? <><div className="ai-provider-settings__section-heading"><div><h3>{text.service}</h3><p>{text.serviceHint}</p></div></div><form className="ai-provider-settings__port-form" onSubmit={(event) => { event.preventDefault(); void verifyPort(); }}><label>{text.port}<input max="65535" min="1024" onChange={(event) => setPort(event.target.valueAsNumber || 0)} type="number" value={port} /></label><button className="ai-provider-settings__primary" disabled={feedback.state === "busy"} type="submit">{feedback.state === "busy" ? text.checkingPort : text.savePort}</button></form></> : null}

        {tab === "usage" ? <><div className="ai-provider-settings__section-heading"><div><h3>{text.usage}</h3><p>{text.usageHint}</p></div></div><div className="ai-provider-settings__activity">{Object.keys(lastChecks).length === 0 ? <p>{text.noActivity}</p> : Object.entries(lastChecks).map(([id, result]) => <div data-state={result.state} key={id}><strong>{id === "deepseek" ? "DeepSeek" : "DashScope"}</strong><span>{result.message}</span></div>)}</div></> : null}

        {tab === "about" ? <><div className="ai-provider-settings__section-heading"><div><h3>{text.about}</h3><p>{text.aboutHint}</p></div></div><dl className="ai-provider-settings__about"><div><dt>Runtime</dt><dd>Preacherman local service</dd></div><div><dt>Storage</dt><dd>Local restricted configuration</dd></div><div><dt>Secrets</dt><dd>Write-only from this interface</dd></div></dl></> : null}

        {feedback.message ? <p className="ai-provider-settings__feedback" data-state={feedback.state} role={feedback.state === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
      </div>
    </section>
  );
}
