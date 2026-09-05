// Reference-led CC Switch preset -> inline form workflow.
// Preserve original Settings split, blank left column, divider and Back.
// Existing providers only; semantic dark canvas; one primary save/test action.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../preferences";
import { localServiceUrlForPort, readServicePort, saveServicePort } from "../serviceConfig";
import ApiKeyInput from "./cc-switch/ApiKeyInput";
import { ProviderPresetSelector } from "./cc-switch/ProviderPresetSelector";
import "./ai-providers-settings.css";

type ProviderId = "deepseek" | "dashscope";
type ProviderState = "ready" | "configuration-required" | "adapter-required" | "error";
interface ProviderSnapshot {
  readonly id: string;
  readonly capabilities: Readonly<Record<string, { readonly state: ProviderState }>>;
  readonly models?: readonly { readonly id: string; readonly label: string; readonly capability: string }[];
}
interface ProviderSettingsStatus {
  readonly deepseekConfigured: boolean;
  readonly dashscopeWorkspaceConfigured: boolean;
  readonly asrConfigured: boolean;
  readonly ttsConfigured: boolean;
}
interface Feedback { state: "idle" | "busy" | "success" | "error"; message: string }
interface ProviderTestResponse { result?: { state?: string; ok?: boolean; message?: string } }

const copy = {
  en: {
    title: "AI Providers", description: "Choose a provider. Paste your API key.",
    presets: "Provider preset", chat: "Chat", voice: "Voice & vision",
    connection: "Connection", key: "API Key", keyPlaceholder: "Paste your API key",
    savedPlaceholder: "Key saved · leave blank to keep",
    keyHelp: { deepseek: "Create an API key in the DeepSeek platform, then paste it here.", dashscope: "Use an API key from Alibaba Cloud Model Studio (Beijing)." },
    workspace: "Workspace ID", optional: "Required for speech recognition",
    workspacePlaceholder: "Needed for speech recognition; optional for speech synthesis",
    savedWorkspace: "Workspace saved · leave blank to keep",
    saveTest: "Save & test", saveOnly: "Save only", test: "Test connection",
    saving: "Saving…", testing: "Testing connection…", saved: "Key saved. Connection not tested.",
    tested: "Connection successful.", testFailed: "Connection test failed.",
    savedTestFailed: "Saved, but the connection test failed.",
    checkFailed: "Check the key and try again.", enterKey: "Paste an API key to continue.",
    unchanged: "No changes to save.", configured: "Key saved", unconfigured: "Not configured",
    advanced: "Advanced settings", advancedHint: "Models, routing and local service",
    models: "Available models", noModels: "No models returned by the service.",
    routing: "Capability routing", port: "Local service port", connect: "Connect",
    portInvalid: "Use a port from 1024 to 65535.", connected: "Local service connected.",
    checking: "Checking…", refresh: "Refresh status", offline: "Local service unavailable. Check that Preacherman is running, then retry.",
    retry: "Retry", show: "Show API key", hide: "Hide API key", requestFailed: "Request failed. Check the connection and retry.",
    states: { ready: "Configured", "configuration-required": "Needs configuration", "adapter-required": "Not connected", error: "Unavailable" },
    capabilities: { chat: "Chat", asr: "Speech recognition", tts: "Speech synthesis", vision: "Vision" },
  },
  "zh-CN": {
    title: "AI 服务商", description: "选择服务商，粘贴 API 密钥。",
    presets: "服务商预设", chat: "对话", voice: "语音与视觉",
    connection: "连接配置", key: "API 密钥", keyPlaceholder: "粘贴你的 API 密钥",
    savedPlaceholder: "密钥已保存 · 留空保留",
    keyHelp: { deepseek: "在 DeepSeek 开放平台创建 API 密钥，然后粘贴到这里。", dashscope: "使用阿里云百炼北京地域的 API 密钥。" },
    workspace: "工作空间 ID", optional: "语音识别需要填写",
    workspacePlaceholder: "语音识别必填；仅使用语音合成可留空",
    savedWorkspace: "工作空间已保存 · 留空保留",
    saveTest: "保存并测试", saveOnly: "仅保存", test: "测试连接",
    saving: "正在保存…", testing: "正在测试连接…", saved: "密钥已保存，尚未测试连接。",
    tested: "连接成功。", testFailed: "连接测试失败。",
    savedTestFailed: "配置已保存，但连接测试失败。",
    checkFailed: "请检查密钥后重试。", enterKey: "请粘贴 API 密钥后继续。",
    unchanged: "没有需要保存的修改。", configured: "密钥已保存", unconfigured: "未配置",
    advanced: "高级设置", advancedHint: "模型、路由与本地服务",
    models: "可用模型", noModels: "服务尚未返回模型。",
    routing: "能力路由", port: "本地服务端口", connect: "连接",
    portInvalid: "端口范围为 1024–65535。", connected: "本地服务已连接。",
    checking: "检查中…", refresh: "刷新状态", offline: "本地服务不可用，请确认 Preacherman 正在运行后重试。",
    retry: "重试", show: "显示 API 密钥", hide: "隐藏 API 密钥", requestFailed: "请求失败，请检查连接后重试。",
    states: { ready: "已配置", "configuration-required": "待配置", "adapter-required": "待接入", error: "不可用" },
    capabilities: { chat: "对话", asr: "语音识别", tts: "语音合成", vision: "视觉" },
  },
} as const;

async function serviceRequest<T>(port: number, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(localServiceUrlForPort(port, path), {
    headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), ...init,
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export function AIProvidersSettings({ locale }: { readonly locale: Locale }) {
  const text = copy[locale];
  const instanceId = useId();
  const [selectedId, setSelectedId] = useState<ProviderId>("deepseek");
  const [providers, setProviders] = useState<readonly ProviderSnapshot[]>([]);
  const [settings, setSettings] = useState<ProviderSettingsStatus>({
    deepseekConfigured: false, dashscopeWorkspaceConfigured: false, asrConfigured: false, ttsConfigured: false,
  });
  const [port, setPort] = useState(readServicePort);
  const [draftPort, setDraftPort] = useState(() => String(readServicePort()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState("");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [secretRevision, setSecretRevision] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({ state: "idle", message: "" });
  const operation = useRef(false);
  const busy = feedback.state === "busy";
  const configured = selectedId === "deepseek" ? settings.deepseekConfigured : settings.ttsConfigured;
  const keyValue = selectedId === "deepseek" ? deepseekKey : dashscopeKey;
  const dirty = Boolean(keyValue.trim() || (selectedId === "dashscope" && workspaceId.trim()));
  const selectedProvider = providers.find(provider => provider.id === selectedId);

  const load = useCallback(async (nextPort = readServicePort()) => {
    setLoading(true);
    try {
      const [catalog, status] = await Promise.all([
        serviceRequest<{ providers?: readonly ProviderSnapshot[] }>(nextPort, "/api/providers/catalog"),
        serviceRequest<ProviderSettingsStatus>(nextPort, "/api/settings/providers"),
      ]);
      setProviders(Array.isArray(catalog.providers) ? catalog.providers : []);
      setSettings(status);
      setLoadError(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectProvider = (id: ProviderId) => {
    if (operation.current) return;
    setSelectedId(id);
    setFeedback({ state: "idle", message: "" });
    setSecretRevision(value => value + 1);
  };

  // Do not surface arbitrary server error text: it may echo submitted secrets.
  const testSelectedProvider = async () => {
    setFeedback({ state: "busy", message: text.testing });
    const response = await serviceRequest<ProviderTestResponse>(port, `/api/providers/${encodeURIComponent(selectedId)}/test`, {
      method: "POST", body: JSON.stringify({ capability: selectedId === "deepseek" ? "chat" : "tts" }),
    });
    if (response.result?.state !== "ready" || response.result.ok !== true) throw new Error("test-failed");
  };

  const saveCredentials = async (testAfterSave: boolean) => {
    if (operation.current || loading || loadError) return;
    if (!keyValue.trim() && !configured) {
      setFeedback({ state: "error", message: text.enterKey });
      document.getElementById(`${instanceId}-key`)?.focus();
      return;
    }
    if (!dirty && !testAfterSave) {
      setFeedback({ state: "idle", message: text.unchanged });
      return;
    }
    operation.current = true;
    let saved = false;
    let testing = false;
    try {
      if (dirty) {
        setFeedback({ state: "busy", message: text.saving });
        const payload = selectedId === "deepseek"
          ? { deepseekApiKey: deepseekKey.trim() }
          : { ...(dashscopeKey.trim() ? { dashscopeApiKey: dashscopeKey.trim() } : {}),
              ...(workspaceId.trim() ? { dashscopeWorkspaceId: workspaceId.trim() } : {}) };
        const status = await serviceRequest<ProviderSettingsStatus>(port, "/api/settings/providers", {
          method: "PUT", body: JSON.stringify(payload),
        });
        setSettings(status);
        saved = true;
        if (selectedId === "deepseek") setDeepseekKey("");
        else { setDashscopeKey(""); setWorkspaceId(""); }
        setSecretRevision(value => value + 1);
      }
      if (testAfterSave) { testing = true; await testSelectedProvider(); }
      setFeedback({ state: "success", message: testAfterSave ? text.tested : text.saved });
      await load(port);
    } catch {
      setFeedback({ state: "error", message: testing
        ? `${saved ? text.savedTestFailed : text.testFailed} ${text.checkFailed}` : text.requestFailed });
    } finally { operation.current = false; }
  };

  const verifyPort = async () => {
    if (operation.current) return;
    const nextPort = Number(draftPort);
    if (!Number.isInteger(nextPort) || nextPort < 1024 || nextPort > 65535) {
      setFeedback({ state: "error", message: text.portInvalid }); return;
    }
    operation.current = true;
    setFeedback({ state: "busy", message: text.checking });
    try {
      await serviceRequest(nextPort, "/api/health");
      saveServicePort(nextPort);
      setPort(nextPort);
      await load(nextPort);
      setFeedback({ state: "success", message: text.connected });
    } catch { setFeedback({ state: "error", message: text.offline }); }
    finally { operation.current = false; }
  };

  return (
    <section aria-label={text.title} className="ai-provider-settings" data-preacherman-control="provider.credentials">
      <header className="ai-provider-settings__header">
        <div><h2>{text.title}</h2><p>{text.description}</p></div>
        <button className="ai-provider-settings__quiet" type="button" disabled={loading || busy} onClick={() => void load(port)}>{text.refresh}</button>
      </header>
      <div className="ai-provider-settings__body" aria-busy={busy || loading}>
        {loadError && <div className="ai-provider-settings__error" role="alert">
          <span>{text.offline}</span><button disabled={loading || busy} onClick={() => void load(port)} type="button">{text.retry}</button>
        </div>}
        <ProviderPresetSelector label={text.presets} disabled={busy}
          selectedPresetId={selectedId} onPresetChange={selectProvider}
          presetEntries={[{ id: "deepseek", name: "DeepSeek", description: text.chat },
            { id: "dashscope", name: "DashScope", description: text.voice }]} />
        <div className="ai-provider-settings__connection-heading">
          <h3>{text.connection}</h3>
          <span className="ai-provider-settings__status">{loading ? text.checking : loadError ? text.states.error : configured ? text.configured : text.unconfigured}</span>
        </div>
        <form className="ai-provider-settings__credential-form" onSubmit={event => { event.preventDefault(); void saveCredentials(true); }}>
          <ApiKeyInput key={`${selectedId}-${secretRevision}`} id={`${instanceId}-key`}
            value={keyValue} onChange={value => {
              if (selectedId === "deepseek") setDeepseekKey(value); else setDashscopeKey(value);
              setFeedback({ state: "idle", message: "" });
            }} label={`${selectedId === "deepseek" ? "DeepSeek" : "DashScope"} ${text.key}`}
            placeholder={configured ? text.savedPlaceholder : text.keyPlaceholder}
            showLabel={text.show} hideLabel={text.hide} disabled={busy} />
          <p className="ai-provider-settings__field-hint">{text.keyHelp[selectedId]}</p>
          {selectedId === "dashscope" && <div className="ai-provider-settings__field">
            <label htmlFor={`${instanceId}-workspace`}>{text.workspace}<span>{text.optional}</span></label>
            <input id={`${instanceId}-workspace`} autoComplete="off" disabled={busy} value={workspaceId}
              placeholder={settings.dashscopeWorkspaceConfigured ? text.savedWorkspace : text.workspacePlaceholder}
              onChange={event => { setWorkspaceId(event.target.value); setFeedback({ state: "idle", message: "" }); }} />
          </div>}
          <div className="ai-provider-settings__actions">
            <button className="ai-provider-settings__primary" type="submit" disabled={busy || loading || loadError}>
              {busy ? feedback.message : configured && !dirty ? text.test : text.saveTest}
            </button>
            <button type="button" disabled={busy || loading || loadError || !dirty} onClick={() => void saveCredentials(false)}>{text.saveOnly}</button>
          </div>
        </form>
        {feedback.message && <p className="ai-provider-settings__feedback" data-state={feedback.state} role={feedback.state === "error" ? "alert" : "status"}>{feedback.message}</p>}
        <details className="ai-provider-settings__advanced">
          <summary>{text.advanced}<span>{text.advancedHint}</span></summary>
          <section className="ai-provider-settings__models">
            <h3>{text.models}</h3>
            <div>{selectedProvider?.models?.length ? selectedProvider.models.map(model => <span key={`${model.capability}:${model.id}`}>{model.label}</span>) : <p>{text.noModels}</p>}</div>
          </section>
          <section className="ai-provider-settings__routes">
            <h3>{text.routing}</h3>
            <div className="ai-provider-settings__route-list">
              {(["chat", "asr", "tts", "vision"] as const).map(capability => {
                const id = capability === "chat" ? "deepseek" : "dashscope";
                const state = providers.find(provider => provider.id === id)?.capabilities[capability]?.state || "error";
                return <div key={capability}><span>{text.capabilities[capability]}</span><strong>{id === "deepseek" ? "DeepSeek" : "DashScope"}</strong><span>{loading ? text.checking : loadError ? text.states.error : text.states[state]}</span></div>;
              })}
            </div>
          </section>
          <form className="ai-provider-settings__port-form" onSubmit={event => { event.preventDefault(); void verifyPort(); }}>
            <div className="ai-provider-settings__field"><label htmlFor={`${instanceId}-port`}>{text.port}</label>
              <input id={`${instanceId}-port`} type="number" min="1024" max="65535" disabled={busy} value={draftPort} onChange={event => setDraftPort(event.target.value)} />
            </div>
            <button type="submit" disabled={busy || loading}>{text.connect}</button>
          </form>
        </details>
      </div>
    </section>
  );
}
