import { useEffect, useRef, useState } from "react";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";
import "./execution-mode.css";

type Mode = "api" | "cli";
interface Connection {
  id: string; name: string; protocol: string; baseUrl: string; model: string;
  maxTokens: number | null; reasoning: string; keySaved?: boolean; tested?: boolean;
}
interface Draft extends Omit<Connection, "maxTokens"> { apiKey: string; maxTokens: string }
interface Agent {
  id: string; label: string; installed: boolean; version: string | null; auth: { state: string };
  detection?: { state: string };
  execution?: { supported: boolean; models: { id: string; label: string }[]; workspaceRequired: boolean; reasoningManagedByAgent: boolean };
}
interface Snapshot {
  connections: Connection[];
  active: { mode: Mode; connectionId?: string; agentId?: string; workspaceId?: string; model: string } | null;
  local: { agentId: string; workspaceId: string; model: string } | null;
  presets: { id: string; label: string; protocol: string; baseUrl: string; model: string }[];
}
const blank: Draft = { id: "", name: "", protocol: "openai", baseUrl: "", model: "", apiKey: "", maxTokens: "", reasoning: "" };
const toDraft = (connection: Connection): Draft => ({ ...connection, apiKey: "", maxTokens: connection.maxTokens == null ? "" : String(connection.maxTokens) });

// Existing-world extension: Clash Display, transparent rounded controls and the
// protected focus stage. No competing panel chrome or replacement visual world.
export function ExecutionModeSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<Mode>("api");
  const [draft, setDraft] = useState<Draft>(blank);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [scanned, setScanned] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; label: string; path: string }[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verification, setVerification] = useState<{ tools: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const operating = useRef(false);
  const mounted = useRef(true);
  const request = <T,>(path: string, init?: RequestInit) => preachermanServiceRequest<T>(path, {
    ...init, signal: AbortSignal.any([controller.current!.signal, AbortSignal.timeout(70000)]),
  });
  const run = async (name: string, operation: () => Promise<void>) => {
    if (operating.current) return;
    operating.current = true;
    controller.current = new AbortController();
    setBusy(name); setError(""); setNotice("");
    try { await operation(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Connection unavailable. Retry."); }
    finally { operating.current = false; if (mounted.current) setBusy(""); }
  };
  const load = (initial = false) => run("load", async () => {
    const state = await request<Snapshot>("/api/settings/execution");
    if (!mounted.current) return;
    setSnapshot(state);
    if (initial) {
      setMode(state.active?.mode || "api");
      setWorkspace(state.local?.workspaceId || "");
      setAgentId(state.local?.agentId || "");
      const selected = state.connections.find(item => item.id === state.active?.connectionId) || state.connections[0];
      setDraft(selected ? toDraft(selected) : { ...blank, name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
      if (state.active?.mode === "cli") await readLocal(state.local?.workspaceId);
    }
  });
  useEffect(() => {
    mounted.current = true;
    void load(true);
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const update = (value: Partial<Draft>) => { setDraft(current => ({ ...current, ...value })); setVerification(null); setNotice(""); setError(""); };
  const select = (connection: Connection) => { setDraft(toDraft(connection)); setVerification(null); setModels([]); setShowKey(false); setNotice(""); setError(""); };
  const readLocal = async (preferredWorkspace?: string) => {
    const [local, roots] = await Promise.all([
      request<{ agents: Agent[] }>("/api/execution/local-agents"),
      request<{ workspaces: { id: string; label: string; path: string }[] }>("/api/execution/workspaces"),
    ]);
    if (!mounted.current) return;
    setAgents(local.agents); setWorkspaces(roots.workspaces); setScanned(true);
    setWorkspace(current => roots.workspaces.some(item => item.id === (preferredWorkspace || current)) ? preferredWorkspace || current : roots.workspaces[0]?.id || "");
  };
  const scan = () => run("scan", () => readLocal());
  const changeMode = (next: Mode) => {
    if (busy) return;
    setMode(next); setNotice(""); setError("");
    if (next === "cli" && !scanned) void scan();
  };
  const post = <T,>(action: string) => request<T>("/api/settings/execution/" + action, { method: "POST", body: JSON.stringify(draft) });
  const complete = Boolean(draft.name.trim() && draft.baseUrl.trim() && draft.model.trim() && (draft.apiKey.trim() || draft.keySaved));
  const selectedAgent = agents.find(agent => agent.id === agentId);
  const canConnect = (agent: Agent) => agent.execution?.supported && agent.installed && agent.auth.state === "ready";
  const connect = (agent: Agent) => {
    setAgentId(agent.id);
    if (!workspace) { setError("Choose an approved workspace before connecting this Agent."); return; }
    void run("local", async () => {
      const state = await request<Snapshot>("/api/settings/execution/local", { method: "POST", body: JSON.stringify({ agentId: agent.id, workspaceId: workspace }) });
      if (mounted.current) { setSnapshot(state); setNotice(agent.label + " connected. Starting a task still requires approval."); window.dispatchEvent(new Event("preacherman-execution-changed")); }
    });
  };
  const disconnect = () => void run("local", async () => {
    const state = await request<Snapshot>("/api/settings/execution/local", { method: "DELETE" });
    if (mounted.current) { setSnapshot(state); setNotice("Agent disconnected. Existing tasks are not cancelled."); window.dispatchEvent(new Event("preacherman-execution-changed")); }
  });
  return <section className="execution-mode" aria-label="Execution Mode configuration" aria-busy={Boolean(busy)} lang="en">
    <div className="execution-mode__tabs" role="tablist" aria-label="Connection method">
      {(["api", "cli"] as const).map(value => <button key={value} id={"execution-tab-" + value} role="tab" aria-selected={mode === value}
        aria-controls={"execution-panel-" + value} disabled={Boolean(busy)} onClick={() => changeMode(value)} type="button">{value === "api" ? "API / BYOK" : "Local CLI"}</button>)}
    </div>
    <p className="execution-mode__intro">{mode === "api" ? "Your model. Your connection." : "Your installed agent. Your approved workspace."}</p>
    {!snapshot && busy ? <p role="status">Reading saved connections…</p> : null}
    {!snapshot && !busy ? <button onClick={() => void load(true)} type="button">Retry connection</button> : null}
    {mode === "api" && snapshot ? <form id="execution-panel-api" role="tabpanel" aria-labelledby="execution-tab-api" onSubmit={event => {
      event.preventDefault();
      void run("save", async () => {
        await post("save");
        const state = await request<Snapshot>("/api/settings/execution");
        if (!mounted.current) return;
        setSnapshot(state);
        const saved = state.connections.find(item => item.id === state.active?.connectionId);
        if (saved) setDraft(toDraft(saved));
        setShowKey(false); setVerification(null); setNotice("Saved. New conversations use this connection; existing selections stay unchanged.");
        window.dispatchEvent(new Event("preacherman-execution-changed"));
      });
    }}>
      <fieldset disabled={Boolean(busy)}>
        <div className="execution-mode__connections" aria-label="Saved connections">
          {snapshot.connections.map(connection => <button key={connection.id} aria-pressed={draft.id === connection.id} onClick={() => select(connection)} type="button">{connection.name}{snapshot.active?.connectionId === connection.id ? " · Active" : ""}</button>)}
          <button type="button" onClick={() => { setDraft(blank); setVerification(null); setModels([]); setShowKey(false); setNotice(""); }}>Add connection</button>
        </div>
        <div className="execution-mode__presets" aria-label="Provider preset">
          {snapshot.presets.map(preset => <button type="button" key={preset.id} aria-pressed={!draft.id && draft.name === preset.label}
            onClick={() => { setDraft({ ...blank, name: preset.label, protocol: preset.protocol, baseUrl: preset.baseUrl, model: preset.model }); setVerification(null); setModels([]); setShowKey(false); setError(""); }}>{preset.label}</button>)}
        </div>
        <div className="execution-mode__fields">
          <label>Connection Name<input required maxLength={80} value={draft.name} onChange={event => update({ name: event.target.value })} placeholder="Name this connection" /></label>
          <label>API Key<span className="execution-mode__key"><input aria-label="API Key" data-secret="true" autoComplete="new-password" spellCheck={false} type={showKey ? "text" : "password"} value={draft.apiKey} onChange={event => update({ apiKey: event.target.value })} placeholder={draft.keySaved ? "Key saved · leave blank to keep" : "Your API key"} required={!draft.keySaved} maxLength={4096} /><button type="button" aria-label={showKey ? "Hide API key" : "Show API key"} onClick={() => setShowKey(value => !value)}>{showKey ? "Hide" : "Show"}</button></span></label>
          <label>Base URL<input type="url" required maxLength={2048} value={draft.baseUrl} onChange={event => update({ baseUrl: event.target.value, keySaved: false })} placeholder="https://your-provider.com/v1" /></label>
          <label>Model<span className="execution-mode__key"><input aria-label="Model" list="execution-model-options" required maxLength={200} value={draft.model} onChange={event => update({ model: event.target.value })} placeholder="Choose or enter a model ID" /><button type="button" disabled={!draft.baseUrl || !(draft.apiKey || draft.keySaved)} onClick={() => void run("models", async () => {
            const result = await post<{ models: { id: string; label: string }[] }>("models");
            if (mounted.current) { setModels(result.models); setNotice(result.models.length ? "Model list updated. Select a model or type its ID." : "No models returned. Enter a model ID manually."); }
          })}>{busy === "models" ? "Fetching…" : "Get models"}</button></span>
          <datalist id="execution-model-options">{models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</datalist></label>
        </div>
        <details className="execution-mode__advanced"><summary>Advanced</summary><div className="execution-mode__fields">
          <label>API protocol<select aria-label="API protocol" value={draft.protocol} onChange={event => update({ protocol: event.target.value, keySaved: false, reasoning: "" })}><option value="openai">OpenAI compatible</option><option value="anthropic">Anthropic Messages</option></select></label>
          <label>Max output tokens<input type="number" min={64} max={200000} step={1} value={draft.maxTokens} onChange={event => update({ maxTokens: event.target.value })} placeholder="Model default" /></label>
          {draft.protocol === "openai" ? <label>Reasoning effort<select aria-label="Reasoning effort" value={draft.reasoning} onChange={event => update({ reasoning: event.target.value })}><option value="">Model default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><small>Only override if this model supports reasoning_effort.</small></label> : null}
        </div></details>
        <p className="execution-mode__hint">Keys stay in the local service, never browser storage. Local storage is not encrypted. Changing a gateway requires its key again.</p>
        <p className="execution-mode__hint">Testing sends two small probes and may use API credits. Tool detection never executes a tool.</p>
        {verification ? <p className="execution-mode__result" role="status">Connected · Model replied · {verification.tools ? "Tool calling detected" : "Tool calling not verified"}<small>API mode sends text messages. File operations still require an approved local agent.</small></p> : null}
        <div className="execution-mode__actions">
          <button type="button" disabled={!complete} onClick={() => void run("test", async () => {
            setVerification(null);
            const result = await post<{ tools: boolean }>("test");
            if (mounted.current) setVerification(result);
          })}>{busy === "test" ? "Testing…" : "Test Connection"}</button>
          <button type="submit" disabled={!verification || !complete}>{busy === "save" ? "Saving…" : "Save & Use"}</button>
        </div>
      </fieldset>
    </form> : null}
    {mode === "cli" ? <div id="execution-panel-cli" role="tabpanel" aria-labelledby="execution-tab-cli">
      <div className="execution-mode__row"><h3>Local agents</h3><button type="button" disabled={Boolean(busy)} onClick={() => void scan()}>{busy === "scan" ? "Scanning…" : "Rescan"}</button></div>
      <p className="execution-mode__hint">Select an adapted Agent to connect. One local Agent is active at a time; selecting it never starts a task.</p>
      {scanned && !agents.length ? <p role="status">No local Agents detected. Install a supported CLI, then rescan.</p> : null}
      <div className="execution-mode__agent-list">
        {agents.filter(agent => agent.id !== "preacherman-native").map(agent => {
          const connected = snapshot?.local?.agentId === agent.id;
          const status = agent.detection?.state === "error" ? "Detection failed · Rescan" : !agent.installed ? "Not found · Install, then rescan" : !agent.execution?.supported ? "Detected · Execution adapter required" : agent.auth.state !== "ready" ? "Sign in to this CLI, then rescan" : connected ? "Connected" : "Signed in · Ready to connect";
          return <button key={agent.id} type="button" role="checkbox" aria-checked={connected} aria-label={"Connect " + agent.label}
            className="execution-mode__agent-choice" disabled={Boolean(busy) || (!connected && !canConnect(agent))}
            onClick={() => connected ? disconnect() : connect(agent)}>
            <span className="execution-mode__agent-check" aria-hidden="true">{connected ? <svg viewBox="0 0 20 20" fill="none"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.5" /></svg> : null}</span>
            <span><span className="execution-mode__agent-name">{agent.label}</span><small>{agent.version ? agent.version + " · " : ""}{status}</small></span>
          </button>;
        })}
      </div>
      {selectedAgent?.execution?.supported ? <div className="execution-mode__agent" aria-label={selectedAgent.label + " configuration"}>
        <h3>{selectedAgent.label} settings</h3>
        <label>Model<select aria-label="Local Agent model" value="default" disabled><option value="default">{selectedAgent.execution.models.find(model => model.id === "default")?.label || "Managed by this Agent"}</option></select></label>
        {selectedAgent.execution.reasoningManagedByAgent ? <p className="execution-mode__hint">Model and reasoning follow this Agent's own configuration.</p> : null}
        {selectedAgent.execution.workspaceRequired ? <label>Approved workspace<select aria-label="Approved workspace" value={workspace} disabled={Boolean(busy)} onChange={event => setWorkspace(event.target.value)}><option value="">Choose a workspace</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : null}
        <p className="execution-mode__hint">{workspaces.find(item => item.id === workspace)?.path}</p>
        <p className="execution-mode__hint">Workspace changes apply only after saving. Existing task snapshots stay unchanged. Each new task requires approval.</p>
        <div className="execution-mode__actions"><button type="button" disabled={Boolean(busy) || !canConnect(selectedAgent) || !workspace || (snapshot?.local?.agentId === agentId && snapshot.local.workspaceId === workspace && snapshot.active?.mode === "cli")} onClick={() => connect(selectedAgent)}>{busy === "local" ? "Saving…" : snapshot?.local?.agentId === agentId ? "Save & Use Agent" : "Connect Agent"}</button></div>
      </div> : <p className="execution-mode__hint">Agent-specific model and workspace settings appear after selection.</p>}
      <p className="execution-mode__hint">Preacherman Native keeps its existing flow. Additional CLIs require a registered execution adapter.</p>
    </div> : null}
    {error ? <p className="execution-mode__error" role="alert">{error}</p> : null}
    {notice ? <p className="execution-mode__notice" role="status">{notice}</p> : null}
    {busy && busy !== "load" ? <p role="status" className="execution-mode__hint">Working… You can leave this view at any time.</p> : null}
  </section>;
}
