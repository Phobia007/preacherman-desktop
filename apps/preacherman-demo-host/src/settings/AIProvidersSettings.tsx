import { useCallback, useEffect, useMemo, useState } from "react";
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
    tabs: { providers: "Providers", credentials: "Keys", routing: "Routing", local: "Local" },
    connected: "connected providers",
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
    tabs: { providers: "服务商", credentials: "密钥", routing: "路由", local: "本地" },
    connected: "个服务商已连接",
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
  const [tab, setTab] = useState<ProviderTab>("providers");
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
        <h2>{text.title}</h2>
        <span aria-label={`${connectedCount} ${text.connected}`}><strong>{connectedCount}</strong> / {providers.length}</span>
      </header>

      <nav aria-label={text.title} className="ai-provider-settings__tabs" role="tablist">
        {tabEntries.map(([id, label]) => (
          <button aria-selected={tab === id} key={id} onClick={() => { setTab(id); setFeedback({ state: "idle", message: "" }); }} role="tab" type="button">{label}</button>
        ))}
      </nav>

      <div aria-busy={loading} className="ai-provider-settings__body" role="tabpanel">
        {tab === "providers" ? <>
          {loadError ? <div className="ai-provider-settings__error" role="alert"><span>{text.unavailable}</span><button disabled={loading} onClick={() => void load(port)} type="button">{loading ? text.refreshing : text.retry}</button></div> : null}
          <div className="ai-provider-settings__provider-list" role="group">
            {(["deepseek", "dashscope"] as const).map((id) => {
              const provider = providers.find((candidate) => candidate.id === id);
              const state = providerState(provider);
              return <button aria-pressed={selectedId === id} data-state={state} key={id} onClick={() => { setSelectedId(id); setFeedback({ state: "idle", message: "" }); }} type="button"><span><strong>{provider?.label || (id === "deepseek" ? "DeepSeek" : "DashScope")}</strong><small>{providerCapabilities[id].join(" · ")}</small></span><small>{text.states[state]}</small></button>;
            })}
          </div>
          {selectedProvider ? <div className="ai-provider-settings__provider-actions"><div className="ai-provider-settings__models">{selectedProvider.models?.length ? selectedProvider.models.map((model) => <code key={`${model.capability}:${model.id}`}>{model.label}</code>) : <small>{text.noModels}</small>}</div><button disabled={selectedState !== "ready" || feedback.state === "busy"} onClick={() => void testSelectedProvider()} type="button">{feedback.state === "busy" ? text.testing : text.test}</button></div> : loading ? <p className="ai-provider-settings__feedback" data-state="busy">{text.refreshing}</p> : <p className="ai-provider-settings__feedback">{text.empty}</p>}
        </> : null}

        {tab === "routing" ? <div className="ai-provider-settings__route-list">{routeEntries.map(([capability, providerName, provider]) => { const state = providerState(provider); return <div data-state={state} key={capability}><span>{capability}</span><strong>{providerName}</strong><small>{text.states[state]}</small></div>; })}</div> : null}

        {tab === "credentials" ? <><div className="ai-provider-settings__provider-switch" role="group">{(["deepseek", "dashscope"] as const).map((id) => <button aria-pressed={selectedId === id} key={id} onClick={() => { setSelectedId(id); setFeedback({ state: "idle", message: "" }); }} type="button"><span>{id === "deepseek" ? "DeepSeek" : "DashScope"}</span><small>{id === "deepseek" ? (settings.deepseekConfigured ? text.states.ready : text.states["configuration-required"]) : (settings.ttsConfigured ? text.states.ready : text.states["configuration-required"])}</small></button>)}</div><form className="ai-provider-settings__credential-form" onSubmit={(event) => { event.preventDefault(); void saveCredentials(); }}>
          {selectedId === "deepseek" ? <label>{text.deepseekKey}<span><input autoComplete="new-password" data-secret="true" onChange={(event) => setDeepseekKey(event.target.value)} placeholder={configured ? text.configured : text.newKey} type={revealSecret ? "text" : "password"} value={deepseekKey} /><button onClick={() => setRevealSecret((current) => !current)} type="button">{revealSecret ? text.hide : text.show}</button></span></label> : <><label>{text.dashscopeKey}<span><input autoComplete="new-password" data-secret="true" onChange={(event) => setDashscopeKey(event.target.value)} placeholder={configured ? text.configured : text.newKey} type={revealSecret ? "text" : "password"} value={dashscopeKey} /><button onClick={() => setRevealSecret((current) => !current)} type="button">{revealSecret ? text.hide : text.show}</button></span></label><label>{text.workspaceId}<input autoComplete="off" onChange={(event) => setWorkspaceId(event.target.value)} placeholder={settings.dashscopeWorkspaceConfigured ? text.configured : text.newWorkspace} type="text" value={workspaceId} /></label></>}
          <button className="ai-provider-settings__primary" disabled={feedback.state === "busy"} type="submit">{feedback.state === "busy" ? text.saving : text.save}</button>
        </form></> : null}

        {tab === "local" ? <form className="ai-provider-settings__port-form" onSubmit={(event) => { event.preventDefault(); void verifyPort(); }}><label>{text.port}<input max="65535" min="1024" onChange={(event) => setPort(event.target.valueAsNumber || 0)} type="number" value={port} /></label><button className="ai-provider-settings__primary" disabled={feedback.state === "busy"} type="submit">{feedback.state === "busy" ? text.checkingPort : text.savePort}</button></form> : null}

        {feedback.message ? <p className="ai-provider-settings__feedback" data-state={feedback.state} role={feedback.state === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
      </div>
    </section>
  );
}
