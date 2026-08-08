import { useEffect, useState } from "react";
import type { Locale } from "../preferences";

export type McpServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface McpServerStatus {
  readonly name: string;
  readonly state: "running" | "stopped" | "error";
  readonly command: string;
  readonly pid: number | null;
  readonly error: string | null;
}

interface McpRuntimeStatus {
  readonly path: string;
  readonly servers: readonly McpServerStatus[];
}

interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Readonly<Record<string, unknown>>;
}

interface McpConfigResponse {
  readonly text: string;
  readonly status: McpRuntimeStatus;
  readonly result?: {
    readonly started: readonly string[];
    readonly failed: readonly { readonly name: string; readonly error: string }[];
    readonly skipped: readonly string[];
  };
}

export function McpSettings({ locale, serviceRequest }: { readonly locale: Locale; readonly serviceRequest: McpServiceRequest }) {
  const chinese = locale === "zh-CN";
  const [configText, setConfigText] = useState("");
  const [status, setStatus] = useState<McpRuntimeStatus | null>(null);
  const [tools, setTools] = useState<readonly McpTool[]>([]);
  const [selectedTool, setSelectedTool] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [resultText, setResultText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTools = async () => {
    const response = await serviceRequest<{ readonly tools: readonly McpTool[]; readonly status: McpRuntimeStatus }>("/api/mcp/tools");
    setTools(response.tools);
    setStatus(response.status);
    setSelectedTool((current) => response.tools.some((tool) => tool.name === current) ? current : response.tools[0]?.name || "");
  };

  useEffect(() => {
    void Promise.all([
      serviceRequest<McpConfigResponse>("/api/mcp/config"),
      serviceRequest<{ readonly tools: readonly McpTool[]; readonly status: McpRuntimeStatus }>("/api/mcp/tools"),
    ]).then(([config, runtime]) => {
      setConfigText(config.text);
      setStatus(runtime.status);
      setTools(runtime.tools);
      setSelectedTool(runtime.tools[0]?.name || "");
    }).catch((reason: Error) => setMessage(reason.message));
  }, [serviceRequest]);

  const saveAndRestart = async () => {
    setBusy(true); setMessage(""); setResultText("");
    try {
      const response = await serviceRequest<McpConfigResponse>("/api/mcp/config", {
        method: "PUT",
        body: JSON.stringify({ text: configText }),
      });
      setConfigText(response.text);
      setStatus(response.status);
      await loadTools();
      const failed = response.result?.failed.length || 0;
      setMessage(failed
        ? (chinese ? `${failed} 个 MCP 服务启动失败。` : `${failed} MCP server failed to start.`)
        : (chinese ? "MCP 配置已保存，服务已重启。" : "MCP configuration saved and restarted."));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "MCP restart failed.");
    } finally { setBusy(false); }
  };

  const executeTool = async () => {
    if (!selectedTool) return;
    setBusy(true); setMessage(""); setResultText("");
    try {
      const args = JSON.parse(argumentsText) as unknown;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(chinese ? "工具参数必须是 JSON 对象。" : "Tool arguments must be a JSON object.");
      const response = await serviceRequest<{ readonly result: unknown }>("/api/mcp/tools/call", {
        method: "POST",
        body: JSON.stringify({ name: selectedTool, arguments: args }),
      });
      setResultText(JSON.stringify(response.result, null, 2));
      setMessage(chinese ? "MCP 工具已执行。" : "MCP tool executed.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "MCP tool execution failed.");
    } finally { setBusy(false); }
  };

  return <section className="demo-settings__service demo-settings__service--mcp" data-airi-control="mcp.servers runtime.mcp-test" tabIndex={-1}>
    <header>
      <span>{chinese ? "MCP 服务器" : "MCP servers"}</span>
      <small>{chinese ? "兼容 AIRI mcp.json；保存后在本地启动 stdio 服务。环境变量会显示在编辑器中。" : "AIRI-compatible mcp.json. Saving starts local stdio servers; environment values remain visible in this editor."}</small>
    </header>
    <label>{chinese ? "服务器配置" : "Server configuration"}<textarea aria-label={chinese ? "MCP 服务器配置" : "MCP server configuration"} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} value={configText} /></label>
    <div className="demo-settings__mcp-actions">
      <button className="demo-settings__service-button demo-settings__service-button--primary" disabled={busy} onClick={() => void saveAndRestart()} type="button">{busy ? (chinese ? "处理中…" : "Working…") : (chinese ? "保存并重启" : "Save & restart")}</button>
      <button className="demo-settings__service-button" disabled={busy} onClick={() => void loadTools().catch((reason: Error) => setMessage(reason.message))} type="button">{chinese ? "刷新工具" : "Refresh tools"}</button>
    </div>
    {status ? <dl className="demo-settings__results">{status.servers.map((server) => <div key={server.name}><dt>{server.name}</dt><dd data-ok={server.state === "running"}>{server.state}{server.pid ? ` · PID ${server.pid}` : ""}</dd></div>)}</dl> : null}
    <label>{chinese ? "选择工具" : "Select tool"}<select onChange={(event) => setSelectedTool(event.target.value)} value={selectedTool}>{tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}</select></label>
    <label>{chinese ? "JSON 参数" : "JSON arguments"}<textarea className="demo-settings__mcp-arguments" onChange={(event) => setArgumentsText(event.target.value)} spellCheck={false} value={argumentsText} /></label>
    <button className="demo-settings__service-button demo-settings__service-button--primary" disabled={busy || !selectedTool} onClick={() => void executeTool()} type="button">{chinese ? "执行所选工具" : "Execute selected tool"}</button>
    {message ? <p className="demo-settings__message" role="status">{message}</p> : null}
    {resultText ? <pre className="demo-settings__mcp-result">{resultText}</pre> : null}
  </section>;
}
