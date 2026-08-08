import { useEffect, useState } from "react";
import type { Locale } from "../preferences";

type PluginServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface PluginSession {
  readonly id: string;
  readonly enabled: boolean;
  readonly phase: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly toolCount: number;
  readonly capabilities: readonly string[];
  readonly manifest: {
    readonly apiVersion: string;
    readonly kind: string;
    readonly name: string;
  };
}

interface PluginTool {
  readonly name: string;
  readonly description: string;
}

interface PluginSettingsProps {
  readonly locale: Locale;
  readonly serviceRequest: PluginServiceRequest;
}

export function PluginSettings({ locale, serviceRequest }: PluginSettingsProps) {
  const chinese = locale === "zh-CN";
  const [plugins, setPlugins] = useState<readonly PluginSession[]>([]);
  const [tools, setTools] = useState<readonly PluginTool[]>([]);
  const [selectedTool, setSelectedTool] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [resultText, setResultText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [pluginResponse, toolResponse] = await Promise.all([
      serviceRequest<{ readonly plugins: readonly PluginSession[] }>("/api/plugins"),
      serviceRequest<{ readonly tools: readonly PluginTool[] }>("/api/plugins/tools"),
    ]);
    setPlugins(pluginResponse.plugins);
    setTools(toolResponse.tools);
    setSelectedTool((current) => toolResponse.tools.some((tool) => tool.name === current) ? current : toolResponse.tools[0]?.name || "");
  };

  useEffect(() => {
    void load().catch((reason: Error) => setMessage(reason.message));
  }, [serviceRequest]);

  const togglePlugin = async (plugin: PluginSession) => {
    setBusy(true); setMessage(""); setResultText("");
    try {
      await serviceRequest(`/api/plugins/${encodeURIComponent(plugin.id)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !plugin.enabled }),
      });
      await load();
      setMessage(chinese ? `插件已${plugin.enabled ? "停用" : "启用"}。` : `Plugin ${plugin.enabled ? "disabled" : "enabled"}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Plugin update failed.");
    } finally { setBusy(false); }
  };

  const reloadPlugin = async (plugin: PluginSession) => {
    setBusy(true); setMessage(""); setResultText("");
    try {
      await serviceRequest("/api/plugins/reload", { method: "POST", body: JSON.stringify({ name: plugin.id }) });
      await load();
      setMessage(chinese ? "插件生命周期已重新加载。" : "Plugin lifecycle reloaded.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Plugin reload failed.");
    } finally { setBusy(false); }
  };

  const executeTool = async () => {
    if (!selectedTool) return;
    setBusy(true); setMessage(""); setResultText("");
    try {
      const args = JSON.parse(argumentsText) as unknown;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(chinese ? "工具参数必须是 JSON 对象。" : "Tool arguments must be a JSON object.");
      const response = await serviceRequest<{ readonly result: unknown }>("/api/plugins/tools/call", {
        method: "POST",
        body: JSON.stringify({ name: selectedTool, arguments: args }),
      });
      setResultText(JSON.stringify(response.result, null, 2));
      setMessage(chinese ? "插件工具已执行。" : "Plugin tool executed.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Plugin tool execution failed.");
    } finally { setBusy(false); }
  };

  return <section className="demo-settings__service demo-settings__service--plugins" data-airi-control="plugin.manager agent.plugin-tools runtime.plugin-inspector plugin.hot-reload" tabIndex={-1}>
    <header>
      <span>{chinese ? "插件管理" : "Plugin manager"}</span>
      <small>{chinese ? "AIRI ManifestV1 生命周期桥接。插件在本地服务权限范围内运行。" : "AIRI ManifestV1 lifecycle bridge. Plugins run with local service permissions."}</small>
    </header>
    <div className="demo-settings__plugin-list">
      {plugins.map((plugin) => <article key={plugin.id} data-ready={plugin.phase === "ready"}>
        <div><strong>{plugin.manifest.name}</strong><span>{plugin.phase} · r{plugin.revision}</span></div>
        <small>{plugin.manifest.kind} · {plugin.toolCount} {chinese ? "个工具" : "tools"}</small>
        <div className="demo-settings__mcp-actions">
          <button className="demo-settings__service-button" disabled={busy} onClick={() => void togglePlugin(plugin)} type="button">{plugin.enabled ? (chinese ? "停用" : "Disable") : (chinese ? "启用" : "Enable")}</button>
          <button className="demo-settings__service-button" disabled={busy || !plugin.enabled} onClick={() => void reloadPlugin(plugin)} type="button">{chinese ? "热重载" : "Hot reload"}</button>
        </div>
      </article>)}
    </div>
    <label>{chinese ? "插件工具" : "Plugin tool"}<select onChange={(event) => setSelectedTool(event.target.value)} value={selectedTool}>{tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}</select></label>
    <label>{chinese ? "JSON 参数" : "JSON arguments"}<textarea className="demo-settings__mcp-arguments" onChange={(event) => setArgumentsText(event.target.value)} spellCheck={false} value={argumentsText} /></label>
    <button className="demo-settings__service-button demo-settings__service-button--primary" disabled={busy || !selectedTool} onClick={() => void executeTool()} type="button">{chinese ? "执行插件工具" : "Execute plugin tool"}</button>
    {message ? <p className="demo-settings__message" role="status">{message}</p> : null}
    {resultText ? <pre className="demo-settings__mcp-result">{resultText}</pre> : null}
  </section>;
}
