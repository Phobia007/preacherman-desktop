import { useEffect, useId, useMemo, useState } from "react";
import type { Locale } from "../preferences";
import "./agent-access-settings.css";

export type AgentAccessServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface AgentAccessSettingsProps {
  readonly locale: Locale;
  readonly serviceRequest: AgentAccessServiceRequest;
}

type ClientId = "codex" | "claude-code" | "gemini-cli" | "generic";
type GatewayState = "ready" | "blocked" | "error" | "loading";

interface GatewaySnapshot {
  readonly state?: string;
  readonly status?: string;
  readonly version?: string;
  readonly transport?: string;
  readonly port?: number;
  readonly sessionCount?: number;
  readonly security?: { readonly loopbackOnly?: boolean; readonly approvalRequired?: boolean };
}

interface ClientTemplate {
  readonly id?: string;
  readonly client?: string;
  readonly name?: string;
  readonly configuration?: unknown;
  readonly config?: unknown;
  readonly text?: string;
}

interface GatewaySession {
  readonly id?: string;
  readonly sessionId?: string;
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly lastSeenAt?: string;
  readonly grantedScopes?: readonly string[];
  readonly revokedAt?: string | null;
}

interface LocalAgent {
  readonly id?: string;
  readonly label?: string;
  readonly installed?: boolean;
  readonly version?: string;
  readonly authStatus?: string;
  readonly auth?: { readonly state?: string };
  readonly status?: string;
  readonly capabilities?: unknown;
}

const clients: readonly { readonly id: ClientId; readonly label: string }[] = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
  { id: "gemini-cli", label: "Gemini CLI" },
  { id: "generic", label: "Generic MCP" },
];

const copy = {
  en: {
    title: "Agent Access",
    intro: "Connect your existing Agent login or subscription to Preacherman through MCP. Preacherman never reads your Agent account password.",
    gateway: "Connect your Agent to Preacherman",
    gatewayHelp: "Choose a client, copy the host-generated configuration, then add it to that Agent.",
    status: "Status", version: "Service version", transport: "Transport", port: "Local port", sessions: "Connected sessions",
    ready: "Ready", blocked: "Blocked", error: "Error", loading: "Loading",
    clients: "Client configuration", preview: "Configuration preview", copyConfig: "Copy configuration", copied: "Configuration copied.", copyFailed: "Could not copy the configuration.",
    test: "Test connection", testing: "Testing", testPassed: "The MCP capabilities probe completed successfully.", testFailed: "The MCP capabilities probe failed.",
    noTemplate: "The service did not provide a configuration for this client.",
    connected: "Connected Agents", noSessions: "No Agent sessions are connected.", scopes: "Scopes", lastSeen: "Last active", revoke: "Revoke", revoked: "Session revoked.", revokeFailed: "Could not revoke the session.",
    security: "Security", securityCopy: "External Agents may create and track tasks. Dangerous actions still require approval inside Preacherman.",
    local: "Local Agents", localHelp: "Installed and login states come from each official CLI probe. Preacherman does not read authentication files.",
    installed: "Installed", notInstalled: "Not installed", loginRequired: "Login required", unknown: "Unknown", capabilities: "Capabilities", noAgents: "No local Agent adapters were reported.",
    loginHelp: "Complete login in the Agent's official CLI, then refresh this panel. Preacherman never collects that account password.",
    advanced: "Advanced settings", rotate: "Rotate Gateway credential", rotating: "Rotating", rotated: "Gateway credential rotated. Existing sessions may need to reconnect.", rotateFailed: "Could not rotate the Gateway credential.",
    permissions: "Least-privilege permissions", permissionsCopy: "Sessions can only use server-granted scopes and their own tasks. Credentials and arbitrary command arguments are never shown here.",
    retry: "Retry", loadFailed: "Agent Access could not reach the local service.", refresh: "Refresh",
  },
  "zh-CN": {
    title: "Agent 接入",
    intro: "使用你已有的 Agent 登录或订阅，通过 MCP 接入 Preacherman。Preacherman 不会读取你的 Agent 账号密码。",
    gateway: "将你的 Agent 连接到 Preacherman",
    gatewayHelp: "选择客户端，复制由本机服务生成的配置，再添加到对应 Agent。",
    status: "状态", version: "服务版本", transport: "传输方式", port: "本地端口", sessions: "已连接会话",
    ready: "就绪", blocked: "受阻", error: "错误", loading: "加载中",
    clients: "客户端配置", preview: "配置预览", copyConfig: "复制配置", copied: "配置已复制。", copyFailed: "无法复制配置。",
    test: "测试连接", testing: "正在测试", testPassed: "MCP capabilities 真实探针测试成功。", testFailed: "MCP capabilities 探针测试失败。",
    noTemplate: "服务端没有为该客户端提供配置。",
    connected: "已连接 Agent", noSessions: "当前没有已连接的 Agent 会话。", scopes: "授权范围", lastSeen: "最近活动", revoke: "撤销", revoked: "会话已撤销。", revokeFailed: "无法撤销该会话。",
    security: "安全说明", securityCopy: "外部 Agent 可以创建和跟踪任务，但危险操作仍必须在 Preacherman 内批准。",
    local: "本地 Agent", localHelp: "安装与登录状态来自各官方 CLI 探针。Preacherman 不读取认证文件。",
    installed: "已安装", notInstalled: "未安装", loginRequired: "需要登录", unknown: "未知", capabilities: "能力", noAgents: "服务端尚未报告本地 Agent Adapter。",
    loginHelp: "请在 Agent 官方 CLI 中完成登录，然后刷新本面板。Preacherman 不会代收账号密码。",
    advanced: "高级设置", rotate: "轮换 Gateway 凭据", rotating: "正在轮换", rotated: "Gateway 凭据已轮换，现有会话可能需要重新连接。", rotateFailed: "无法轮换 Gateway 凭据。",
    permissions: "最小权限", permissionsCopy: "会话只能使用服务端授予的权限并访问自己的任务。这里不会显示凭据，也不提供任意命令参数。",
    retry: "重试", loadFailed: "Agent 接入无法连接本地服务。", refresh: "刷新",
  },
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray<T>(value: unknown): readonly T[] { return Array.isArray(value) ? value as readonly T[] : []; }

function unwrapArray<T>(value: unknown, keys: readonly string[]): readonly T[] {
  if (Array.isArray(value)) return value as readonly T[];
  const record = asRecord(value);
  for (const key of keys) if (Array.isArray(record[key])) return record[key] as readonly T[];
  return [];
}

function normalizeGateway(value: unknown): GatewaySnapshot {
  const record = asRecord(value);
  const nested = asRecord(record.gateway);
  return (Object.keys(nested).length ? nested : record) as GatewaySnapshot;
}

function gatewayState(snapshot: GatewaySnapshot | null): GatewayState {
  if (!snapshot) return "loading";
  const state = snapshot.state || snapshot.status;
  return state === "ready" ? "ready" : state === "blocked" || state === "configuration-required" ? "blocked" : "error";
}

function templateId(template: ClientTemplate): string {
  const id = (template.id || template.client || template.name || "").toLowerCase();
  if (id.includes("claude")) return "claude-code";
  if (id.includes("gemini")) return "gemini-cli";
  if (id.includes("generic")) return "generic";
  if (id.includes("codex")) return "codex";
  return id;
}

function templateText(template: ClientTemplate | undefined): string {
  if (!template) return "";
  if (typeof template.text === "string") return template.text;
  const configuration = template.configuration ?? template.config;
  return typeof configuration === "string" ? configuration : configuration === undefined ? "" : JSON.stringify(configuration, null, 2);
}

function capabilityLabels(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return Object.entries(asRecord(value)).filter(([, enabled]) => enabled === true).map(([name]) => name);
}

function errorMessage(reason: unknown, fallback: string): string { return reason instanceof Error && reason.message ? reason.message : fallback; }

export function AgentAccessSettings({ locale, serviceRequest }: AgentAccessSettingsProps) {
  const text = copy[locale];
  const titleId = useId();
  const [gateway, setGateway] = useState<GatewaySnapshot | null>(null);
  const [templates, setTemplates] = useState<readonly ClientTemplate[]>([]);
  const [sessions, setSessions] = useState<readonly GatewaySession[]>([]);
  const [agents, setAgents] = useState<readonly LocalAgent[]>([]);
  const [client, setClient] = useState<ClientId>("codex");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [operation, setOperation] = useState("");
  const [notice, setNotice] = useState<{ readonly kind: "status" | "alert"; readonly message: string } | null>(null);

  const load = async () => {
    setLoading(true); setLoadError("");
    try {
      const [gatewayResponse, templateResponse, sessionResponse, agentResponse] = await Promise.all([
        serviceRequest<unknown>("/api/mcp/gateway"),
        serviceRequest<unknown>("/api/mcp/gateway/templates"),
        serviceRequest<unknown>("/api/mcp/gateway/sessions"),
        serviceRequest<unknown>("/api/execution/local-agents"),
      ]);
      setGateway(normalizeGateway(gatewayResponse));
      setTemplates(unwrapArray<ClientTemplate>(templateResponse, ["templates", "clients"]));
      setSessions(unwrapArray<GatewaySession>(sessionResponse, ["sessions"]));
      setAgents(unwrapArray<LocalAgent>(agentResponse, ["agents", "localAgents"]));
    } catch (reason) { setLoadError(errorMessage(reason, text.loadFailed)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [serviceRequest, locale]);

  const selectedTemplate = useMemo(() => templates.find((candidate) => templateId(candidate) === client), [client, templates]);
  const configText = templateText(selectedTemplate);
  const state = gatewayState(gateway);

  const copyConfiguration = async () => {
    if (!configText) return;
    setOperation("copy"); setNotice(null);
    try {
      await navigator.clipboard.writeText(configText);
      setNotice({ kind: "status", message: text.copied });
    } catch (reason) { setNotice({ kind: "alert", message: errorMessage(reason, text.copyFailed) }); }
    finally { setOperation(""); }
  };

  const testConnection = async () => {
    setOperation("test"); setNotice(null);
    try {
      const response = asRecord(await serviceRequest<unknown>("/api/mcp/gateway/test", { method: "POST", body: JSON.stringify({ client }) }));
      const result = asRecord(response.result);
      if (response.ok !== true && result.ok !== true && response.state !== "ready" && result.state !== "ready") throw new Error(text.testFailed);
      setNotice({ kind: "status", message: text.testPassed });
      await load();
    } catch (reason) { setNotice({ kind: "alert", message: errorMessage(reason, text.testFailed) }); }
    finally { setOperation(""); }
  };

  const revokeSession = async (session: GatewaySession) => {
    const sessionId = session.sessionId || session.id;
    if (!sessionId) return;
    setOperation(`revoke:${sessionId}`); setNotice(null);
    try {
      await serviceRequest<unknown>(`/api/mcp/gateway/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST", body: JSON.stringify({}) });
      setSessions((current) => current.filter((candidate) => (candidate.sessionId || candidate.id) !== sessionId));
      setNotice({ kind: "status", message: text.revoked });
    } catch (reason) { setNotice({ kind: "alert", message: errorMessage(reason, text.revokeFailed) }); }
    finally { setOperation(""); }
  };

  const rotateCredential = async () => {
    setOperation("rotate"); setNotice(null);
    try {
      await serviceRequest<unknown>("/api/mcp/gateway/credentials/rotate", { method: "POST", body: JSON.stringify({}) });
      setNotice({ kind: "status", message: text.rotated });
      await load();
    } catch (reason) { setNotice({ kind: "alert", message: errorMessage(reason, text.rotateFailed) }); }
    finally { setOperation(""); }
  };

  return <section aria-busy={loading} aria-labelledby={titleId} className="agent-access-settings" data-preacherman-control="mcp.agent-access">
    <header className="agent-access-settings__intro">
      <div><h2 id={titleId}>{text.title}</h2><p>{text.intro}</p></div>
      <button className="agent-access-settings__button" disabled={loading} onClick={() => void load()} type="button">{text.refresh}</button>
    </header>

    {loadError ? <div className="agent-access-settings__load-error" role="alert"><p>{loadError}</p><button className="agent-access-settings__button" onClick={() => void load()} type="button">{text.retry}</button></div> : null}

    {!loadError ? <>
      <section className="agent-access-settings__gateway" aria-labelledby={`${titleId}-gateway`}>
        <header><div><h3 id={`${titleId}-gateway`}>{text.gateway}</h3><p>{text.gatewayHelp}</p></div><span className="agent-access-settings__state" data-state={state}>{text[state]}</span></header>
        <dl className="agent-access-settings__facts">
          <div><dt>{text.version}</dt><dd>{gateway?.version || text.unknown}</dd></div>
          <div><dt>{text.transport}</dt><dd>{gateway?.transport || text.unknown}</dd></div>
          <div><dt>{text.port}</dt><dd>{gateway?.port ?? text.unknown}</dd></div>
          <div><dt>{text.sessions}</dt><dd>{gateway?.sessionCount ?? sessions.filter((session) => !session.revokedAt).length}</dd></div>
        </dl>

        <div className="agent-access-settings__template">
          <div><h4>{text.clients}</h4><div aria-label={text.clients} className="agent-access-settings__client-tabs" role="tablist">{clients.map((candidate) => <button aria-selected={client === candidate.id} key={candidate.id} onClick={() => setClient(candidate.id)} role="tab" type="button">{candidate.label}</button>)}</div></div>
          <div><label htmlFor={`${titleId}-config`}>{text.preview}</label><pre aria-label={text.preview} id={`${titleId}-config`} tabIndex={0}>{configText || text.noTemplate}</pre></div>
          <div className="agent-access-settings__actions">
            <button className="agent-access-settings__button agent-access-settings__button--primary" disabled={!configText || loading || operation !== ""} onClick={() => void copyConfiguration()} type="button">{text.copyConfig}</button>
            <button className="agent-access-settings__button" disabled={state !== "ready" || loading || operation !== ""} onClick={() => void testConnection()} type="button">{operation === "test" ? text.testing : text.test}</button>
          </div>
        </div>
      </section>

      <aside className="agent-access-settings__security" aria-labelledby={`${titleId}-security`}><h3 id={`${titleId}-security`}>{text.security}</h3><p>{text.securityCopy}</p></aside>

      <section className="agent-access-settings__section" aria-labelledby={`${titleId}-local`}><header><h3 id={`${titleId}-local`}>{text.local}</h3><p>{text.localHelp}</p></header>
        {agents.length ? <ul className="agent-access-settings__agent-list">{agents.map((agent, index) => {
          const installed = agent.installed === true;
          const auth = agent.auth?.state || agent.authStatus || agent.status || text.unknown;
          const capabilities = capabilityLabels(agent.capabilities);
          return <li key={agent.id || `${agent.label || "agent"}-${index}`}><div><strong>{agent.label || agent.id || text.unknown}</strong><span>{agent.version || text.unknown}</span></div><p><span data-state={installed ? "ready" : "blocked"}>{installed ? text.installed : text.notInstalled}</span><span data-state={auth === "ready" ? "ready" : "blocked"}>{auth === "ready" ? text.ready : auth === "login-required" ? text.loginRequired : auth}</span></p>{capabilities.length ? <small>{text.capabilities}: {capabilities.join(", ")}</small> : null}{installed && auth === "login-required" ? <small>{text.loginHelp}</small> : null}</li>;
        })}</ul> : <p className="agent-access-settings__empty">{text.noAgents}</p>}
      </section>

      <section className="agent-access-settings__section" aria-labelledby={`${titleId}-sessions`}><header><h3 id={`${titleId}-sessions`}>{text.connected}</h3></header>
        {sessions.filter((session) => !session.revokedAt).length ? <ul className="agent-access-settings__session-list">{sessions.filter((session) => !session.revokedAt).map((session, index) => {
          const sessionId = session.sessionId || session.id || `session-${index}`;
          return <li key={sessionId}><div><strong>{session.clientName || text.unknown}</strong><small>{session.clientVersion || sessionId}</small></div><div><small>{text.lastSeen}: {session.lastSeenAt || text.unknown}</small><small>{text.scopes}: {asArray<string>(session.grantedScopes).join(", ") || text.unknown}</small></div><button className="agent-access-settings__button agent-access-settings__button--danger" disabled={operation !== ""} onClick={() => void revokeSession(session)} type="button">{text.revoke}</button></li>;
        })}</ul> : <p className="agent-access-settings__empty">{text.noSessions}</p>}
      </section>

      <details className="agent-access-settings__advanced"><summary>{text.advanced}</summary><div><section><h3>{text.permissions}</h3><p>{text.permissionsCopy}</p></section><button className="agent-access-settings__button agent-access-settings__button--danger" disabled={operation !== ""} onClick={() => void rotateCredential()} type="button">{operation === "rotate" ? text.rotating : text.rotate}</button></div></details>
    </> : null}

    {notice ? <p className="agent-access-settings__notice" data-state={notice.kind} role={notice.kind}>{notice.message}</p> : null}
  </section>;
}
