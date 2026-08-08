import { useEffect, useState } from "react";
import type { Appearance, Locale } from "../preferences";
import { localServiceUrl, localServiceUrlForPort, readServicePort, saveServicePort } from "../serviceConfig";
import { McpSettings } from "./McpSettings";
import { PluginSettings } from "./PluginSettings";
import { AiriProviderConnectionsPanel } from "../airi/AiriProviderConnectionsPanel";

interface SettingsScreenProps {
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly onLocaleChange: (locale: Locale) => void;
}

interface ProviderStatus {
  readonly deepseekConfigured: boolean;
  readonly dashscopeWorkspaceConfigured: boolean;
  readonly asrConfigured: boolean;
  readonly ttsConfigured: boolean;
}

interface TestResult {
  readonly deepseek: { readonly configured: boolean; readonly ok: boolean; readonly message: string };
  readonly asr: { readonly configured: boolean; readonly ok: boolean; readonly message: string };
  readonly tts: { readonly configured: boolean; readonly ok: boolean; readonly message: string };
}

async function serviceRequest<T>(path: string, init?: RequestInit, servicePort?: number): Promise<T> {
  const response = await fetch(servicePort ? localServiceUrlForPort(servicePort, path) : localServiceUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Service request failed.");
  return payload;
}

export function SettingsScreen({ appearance, locale, onAppearanceChange, onLocaleChange }: SettingsScreenProps) {
  const isChinese = locale === "zh-CN";
  const [port, setPort] = useState(readServicePort);
  const [deepseekKey, setDeepseekKey] = useState("");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [dashscopeWorkspaceId, setDashscopeWorkspaceId] = useState("");
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const appearanceValue = appearance === "light" ? (isChinese ? "浅色" : "Light") : (isChinese ? "深色" : "Dark");
  const languageValue = isChinese ? "简体中文" : "English";

  const loadStatus = async () => {
    const next = await serviceRequest<ProviderStatus>("/api/settings/providers");
    setStatus(next);
  };
  useEffect(() => { void loadStatus().catch(() => setMessage(isChinese ? "无法连接本地服务。请检查端口。" : "Cannot reach the local service. Check the port.")); }, [isChinese]);

  const saveAndTest = async () => {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1024 || parsedPort > 65535) {
      setMessage(isChinese ? "端口必须在 1024 到 65535 之间。" : "Port must be between 1024 and 65535.");
      return;
    }
    setBusy(true); setMessage(""); setTest(null);
    try {
      await serviceRequest<{ ok: boolean }>("/api/health", undefined, parsedPort);
      saveServicePort(parsedPort);
      const next = await serviceRequest<ProviderStatus>("/api/settings/providers", {
        method: "PUT", body: JSON.stringify({ deepseekApiKey: deepseekKey, dashscopeApiKey: dashscopeKey, dashscopeWorkspaceId }),
      });
      setStatus(next); setDeepseekKey(""); setDashscopeKey(""); setDashscopeWorkspaceId("");
      const result = await serviceRequest<TestResult>("/api/settings/test", { method: "POST", body: "{}" });
      setTest(result);
      setMessage(isChinese ? "配置已保存，测试已完成。" : "Settings saved and tested.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Service test failed.");
    } finally { setBusy(false); }
  };

  return <main aria-label={isChinese ? "设置" : "Settings"} className="demo-host demo-settings">
    <div className="demo-settings__controls">
      <button aria-pressed={appearance === "dark"} className="demo-settings__button" data-airi-control="appearance.select" onClick={() => onAppearanceChange(appearance === "light" ? "dark" : "light")} type="button"><span>{isChinese ? "外观" : "Appearance"}</span><span aria-hidden="true">·</span><strong>{appearanceValue}</strong></button>
      <button aria-pressed={locale === "zh-CN"} className="demo-settings__button" data-airi-control="locale.select" onClick={() => onLocaleChange(locale === "en" ? "zh-CN" : "en")} type="button"><span>{isChinese ? "语言" : "Language"}</span><span aria-hidden="true">·</span><strong>{languageValue}</strong></button>
      <section className="demo-settings__service" data-airi-control="provider.credentials voice.providers" tabIndex={-1}>
        <header><span>{isChinese ? "AI 与语音服务" : "AI & Voice services"}</span><small>{isChinese ? "Key 仅保存在本机服务端，不会回显。" : "Keys stay in the local service and are never shown again."}</small></header>
        <label>{isChinese ? "本地服务端口" : "Local service port"}<input inputMode="numeric" max="65535" min="1024" onChange={(event) => setPort(event.target.valueAsNumber || 0)} type="number" value={port} /></label>
        <label>DeepSeek API Key <input autoComplete="off" onChange={(event) => setDeepseekKey(event.target.value)} placeholder={status?.deepseekConfigured ? (isChinese ? "已配置；留空可保留当前 Key" : "Configured; leave blank to keep it") : "sk-…"} type="password" value={deepseekKey} /></label>
        <label>DashScope API Key <input autoComplete="off" onChange={(event) => setDashscopeKey(event.target.value)} placeholder={status?.ttsConfigured ? (isChinese ? "已配置；留空可保留当前 Key" : "Configured; leave blank to keep it") : "sk-…"} type="password" value={dashscopeKey} /></label>
        <label>{isChinese ? "DashScope 工作空间 ID（北京）" : "DashScope workspace ID (Beijing)"}<input autoComplete="off" onChange={(event) => setDashscopeWorkspaceId(event.target.value)} placeholder={status?.dashscopeWorkspaceConfigured ? (isChinese ? "已配置；留空可保留当前 ID" : "Configured; leave blank to keep it") : (isChinese ? "百炼控制台的 Workspace ID" : "Model Studio workspace ID")} value={dashscopeWorkspaceId} /></label>
        <button className="demo-settings__button demo-settings__button--test" disabled={busy} onClick={() => void saveAndTest()} type="button">{busy ? (isChinese ? "正在测试…" : "Testing…") : (isChinese ? "保存并测试连接" : "Save and test")}</button>
        {message ? <p className="demo-settings__message" role="status">{message}</p> : null}
        {test ? <dl className="demo-settings__results"><div><dt>DeepSeek</dt><dd data-ok={test.deepseek.ok}>{test.deepseek.message}</dd></div><div><dt>Qwen ASR</dt><dd data-ok={test.asr.ok}>{test.asr.message}</dd></div><div><dt>Qwen TTS</dt><dd data-ok={test.tts.ok}>{test.tts.message}</dd></div></dl> : null}
      </section>
      <AiriProviderConnectionsPanel locale={locale} serviceRequest={serviceRequest} />
      <McpSettings locale={locale} serviceRequest={serviceRequest} />
      <PluginSettings locale={locale} serviceRequest={serviceRequest} />
    </div>
  </main>;
}
