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
  readonly permissions?: readonly string[];
  readonly sourceDirectory?: string;
  readonly kits?: readonly string[];
  readonly usedKits?: readonly string[];
  readonly providedKits?: readonly string[];
  readonly bindings?: readonly string[];
  readonly error?: string | null;
  readonly manifest: {
    readonly apiVersion: string;
    readonly kind: string;
    readonly name: string;
  };
}

interface PluginTool {
  readonly name: string;
  readonly description: string;
  readonly requiresApproval: boolean;
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
  const [installDirectory, setInstallDirectory] = useState("");
  const [resultText, setResultText] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const selectedToolDetails = tools.find((tool) => tool.name === selectedTool);

  const load = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [pluginResponse, toolResponse] = await Promise.all([
        serviceRequest<{ readonly plugins: readonly PluginSession[] }>("/api/plugins"),
        serviceRequest<{ readonly tools: readonly PluginTool[] }>("/api/plugins/tools"),
      ]);
      setPlugins(pluginResponse.plugins);
      setTools(toolResponse.tools);
      setSelectedTool((current) => toolResponse.tools.some((tool) => tool.name === current) ? current : toolResponse.tools[0]?.name || "");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void load(true).catch((reason: Error) => {
      setMessageIsError(true);
      setMessage(reason.message);
    });
  }, [serviceRequest]);

  const beginAction = () => {
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    setResultText("");
  };

  const failAction = (reason: unknown, fallback: string) => {
    setMessageIsError(true);
    setMessage(reason instanceof Error ? reason.message : fallback);
  };

  const installPlugin = async () => {
    const directory = installDirectory.trim();
    if (!directory) {
      setMessageIsError(true);
      setMessage(chinese ? "请输入可信的本地插件目录。" : "Enter a trusted local plugin directory.");
      return;
    }
    beginAction();
    try {
      await serviceRequest("/api/plugins/install", {
        method: "POST",
        body: JSON.stringify({ directory }),
      });
      await load();
      setInstallDirectory("");
      setMessage(chinese ? "外部插件已安装并由本地服务加载。" : "External plugin installed and loaded by the local service.");
    } catch (reason) {
      failAction(reason, "Plugin installation failed.");
    } finally {
      setBusy(false);
    }
  };

  const uninstallPlugin = async (plugin: PluginSession) => {
    beginAction();
    try {
      await serviceRequest("/api/plugins/uninstall", {
        method: "POST",
        body: JSON.stringify({ name: plugin.id }),
      });
      await load();
      setMessage(chinese ? `外部插件 ${plugin.manifest.name} 已卸载。` : `External plugin ${plugin.manifest.name} uninstalled.`);
    } catch (reason) {
      failAction(reason, "Plugin uninstall failed.");
    } finally {
      setBusy(false);
    }
  };

  const togglePlugin = async (plugin: PluginSession) => {
    beginAction();
    try {
      await serviceRequest(`/api/plugins/${encodeURIComponent(plugin.id)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !plugin.enabled }),
      });
      await load();
      setMessage(chinese ? `插件已${plugin.enabled ? "停用" : "启用"}。` : `Plugin ${plugin.enabled ? "disabled" : "enabled"}.`);
    } catch (reason) {
      failAction(reason, "Plugin update failed.");
    } finally {
      setBusy(false);
    }
  };

  const reloadPlugin = async (plugin: PluginSession) => {
    beginAction();
    try {
      await serviceRequest("/api/plugins/reload", { method: "POST", body: JSON.stringify({ name: plugin.id }) });
      await load();
      setMessage(chinese ? "插件生命周期已重新加载。" : "Plugin lifecycle reloaded.");
    } catch (reason) {
      failAction(reason, "Plugin reload failed.");
    } finally {
      setBusy(false);
    }
  };

  const executeTool = async () => {
    if (!selectedTool) return;
    beginAction();
    try {
      const args = JSON.parse(argumentsText) as unknown;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(chinese ? "工具参数必须是 JSON 对象。" : "Tool arguments must be a JSON object.");
      const response = await serviceRequest<{ readonly result: unknown }>("/api/plugins/tools/call", {
        method: "POST",
        body: JSON.stringify({ name: selectedTool, arguments: args, approved: true }),
      });
      setResultText(JSON.stringify(response.result, null, 2));
      setMessage(chinese ? "插件工具已执行。" : "Plugin tool executed.");
    } catch (reason) {
      failAction(reason, "Plugin tool execution failed.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="demo-settings__service demo-settings__service--plugins" data-airi-control="plugin.manager agent.plugin-tools runtime.plugin-inspector plugin.hot-reload" tabIndex={-1}>
    <header>
      <span>{chinese ? "插件管理" : "Plugin manager"}</span>
      <small>{chinese ? "管理 AIRI ManifestV1 生命周期、Kits、Bindings 与插件工具。" : "Manage AIRI ManifestV1 lifecycles, Kits, Bindings, and plugin tools."}</small>
    </header>
    <p className="demo-settings__plugin-warning" role="note">
      {chinese ? "仅安装你信任的目录。插件代码以 Preacherman 本地服务权限运行，可以访问该服务有权访问的数据和系统资源。" : "Install trusted directories only. Plugin code runs with Preacherman local service permissions and can access data and system resources available to that service."}
    </p>
    <div className="demo-settings__plugin-install">
      <label>{chinese ? "可信本地插件目录" : "Trusted local plugin directory"}<input disabled={busy} onChange={(event) => setInstallDirectory(event.target.value)} placeholder={chinese ? "例如 D:\\plugins\\my-airi-plugin" : "For example, D:\\plugins\\my-airi-plugin"} spellCheck={false} value={installDirectory} /></label>
      <button className="demo-settings__service-button demo-settings__service-button--primary" disabled={busy || !installDirectory.trim()} onClick={() => void installPlugin()} type="button">{busy ? (chinese ? "处理中…" : "Working…") : (chinese ? "安装插件" : "Install plugin")}</button>
    </div>
    <div className="demo-settings__plugin-list" aria-busy={loading}>
      {loading ? <p className="demo-settings__plugin-empty">{chinese ? "正在加载插件…" : "Loading plugins…"}</p> : null}
      {!loading && plugins.length === 0 ? <p className="demo-settings__plugin-empty">{chinese ? "尚未加载插件。" : "No plugins loaded."}</p> : null}
      {plugins.map((plugin) => <article key={plugin.id} data-enabled={plugin.enabled} data-state={plugin.error ? "error" : plugin.phase}>
        <div className="demo-settings__plugin-heading"><strong>{plugin.manifest.name}</strong><span>{plugin.phase} · r{plugin.revision}</span></div>
        <small>{plugin.manifest.kind} · {plugin.toolCount} {chinese ? "个工具" : "tools"} · {plugin.enabled ? (chinese ? "已启用" : "enabled") : (chinese ? "已停用" : "disabled")}</small>
        {plugin.sourceDirectory ? <code className="demo-settings__plugin-source" title={plugin.sourceDirectory}>{plugin.sourceDirectory}</code> : <small>{chinese ? "内置插件" : "Built-in plugin"}</small>}
        <div className="demo-settings__plugin-contracts">
          <div><span>{chinese ? "权限 Permissions" : "Permissions"}</span><p>{plugin.permissions?.length ? plugin.permissions.join(" · ") : (chinese ? "无宿主权限" : "No host permissions")}</p></div>
          <div><span>{chinese ? "使用的能力包" : "Used Kits"}</span><p>{(plugin.usedKits ?? plugin.kits)?.length ? (plugin.usedKits ?? plugin.kits)?.join(" · ") : (chinese ? "未使用" : "None used")}</p></div>
          <div><span>{chinese ? "提供的能力包" : "Provided Kits"}</span><p>{plugin.providedKits?.length ? plugin.providedKits.join(" · ") : (chinese ? "未提供" : "None provided")}</p></div>
          <div><span>{chinese ? "自有绑定" : "Owned Bindings"}</span><p>{plugin.bindings?.length ? plugin.bindings.join(" · ") : (chinese ? "未声明" : "None declared")}</p></div>
        </div>
        {plugin.error ? <p className="demo-settings__plugin-error" role="alert">{plugin.error}</p> : null}
        <div className="demo-settings__mcp-actions">
          <button className="demo-settings__service-button" disabled={busy} onClick={() => void togglePlugin(plugin)} type="button">{plugin.enabled ? (chinese ? "停用" : "Disable") : (chinese ? "启用" : "Enable")}</button>
          <button className="demo-settings__service-button" disabled={busy || !plugin.enabled} onClick={() => void reloadPlugin(plugin)} type="button">{chinese ? "热重载" : "Hot reload"}</button>
        </div>
        {plugin.sourceDirectory ? <button className="demo-settings__service-button demo-settings__plugin-uninstall" disabled={busy} onClick={() => void uninstallPlugin(plugin)} type="button">{chinese ? "卸载外部插件" : "Uninstall external plugin"}</button> : null}
      </article>)}
    </div>
    <label>{chinese ? "插件工具" : "Plugin tool"}<select disabled={busy || tools.length === 0} onChange={(event) => setSelectedTool(event.target.value)} value={selectedTool}><option value="">{chinese ? "选择工具" : "Select a tool"}</option>{tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}{tool.requiresApproval ? (chinese ? " · 需批准" : " · approval required") : ""}</option>)}</select></label>
    {selectedToolDetails ? <p className="demo-settings__plugin-approval" data-required={selectedToolDetails.requiresApproval} role="note">
      {selectedToolDetails.requiresApproval
        ? (chinese ? "此工具需要审批。点击下方按钮表示仅批准本次执行，后续调用仍需重新批准。" : "This tool requires approval. Clicking below approves this invocation only; future calls require approval again.")
        : (chinese ? "此内置工具无需额外审批。" : "This built-in tool does not require additional approval.")}
    </p> : null}
    <label>{chinese ? "JSON 参数" : "JSON arguments"}<textarea className="demo-settings__mcp-arguments" disabled={busy || tools.length === 0} onChange={(event) => setArgumentsText(event.target.value)} spellCheck={false} value={argumentsText} /></label>
    <button className="demo-settings__service-button demo-settings__service-button--primary" disabled={busy || !selectedTool} onClick={() => void executeTool()} type="button">{selectedToolDetails?.requiresApproval ? (chinese ? "批准并执行一次" : "Approve & execute once") : (chinese ? "执行插件工具" : "Execute plugin tool")}</button>
    {message ? <p className="demo-settings__message demo-settings__plugin-message" data-error={messageIsError} role={messageIsError ? "alert" : "status"}>{message}</p> : null}
    {resultText ? <pre className="demo-settings__mcp-result">{resultText}</pre> : null}
  </section>;
}
