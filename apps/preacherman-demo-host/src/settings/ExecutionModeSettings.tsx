import { useEffect, useRef, useState } from "react";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";
import "./execution-mode.css";

type Mode = "api" | "cli";
interface Connection {
  id: string; name: string; protocol: string; baseUrl: string; model: string;
  maxTokens: number | null; reasoning: string; keySaved?: boolean; tested?: boolean;
}
interface Draft extends Omit<Connection, "maxTokens"> { apiKey: string; maxTokens: string }
interface Agent { id: string; label: string; installed: boolean; version: string | null; auth: { state: string } }
interface Snapshot {
  connections: Connection[];
  active: { mode: Mode; connectionId?: string; agentId?: string; workspaceId?: string; model: string } | null;
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
      setWorkspace(state.active?.workspaceId || "");
      const selected = state.connections.find(item => item.id === state.active?.connectionId) || state.connections[0];
      setDraft(selected ? toDraft(selected) : { ...blank, name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
    }
  });
  useEffect(() => {
    mounted.current = true;
    void load(true);
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const update = (value: Partial<Draft>) => { setDraft(current => ({ ...current, ...value })); setVerification(null); setNotice(""); setError(""); };
  const select = (connection: Connection) => { setDraft(toDraft(connection)); setVerification(null); setModels([]); setShowKey(false); setNotice(""); setError(""); };
  const scan = () => run("scan", async () => {
    const [local, roots] = await Promise.all([
      request<{ agents: Agent[] }>("/api/execution/local-agents"),
      request<{ workspaces: { id: string; label: string; path: string }[] }>("/api/execution/workspaces"),
    ]);
    if (!mounted.current) return;
    setAgents(local.agents); setWorkspaces(roots.workspaces);
    setWorkspace(current => roots.workspaces.some(item => item.id === current) ? current : roots.workspaces[0]?.id || "");
  });
  const changeMode = (next: Mode) => {
    if (busy) return;
    setMode(next); setNotice(""); setError("");
    if (next === "cli" && !agents.length) void scan();
  };
  const post = <T,>(action: string) => request<T>("/api/settings/execution/" + action, { method: "POST", body: JSON.stringify(draft) });
  const complete = Boolean(draft.name.trim() && draft.baseUrl.trim() && draft.model.trim() && (draft.apiKey.trim() || draft.keySaved));
  const codex = agents.find(agent => agent.id === "codex-cli");
  const cliReady = codex?.installed && codex.auth.state === "ready";
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
      <div className="execution-mode__agent">
        <h3>Codex CLI</h3><p>{codex ? codex.installed ? codex.version || "Version unavailable" : "Not installed" : "Rescan to check installation"}</p>
        <p>{cliReady ? "Signed in · Ready" : codex?.installed ? "Complete login in the official CLI, then rescan." : "Install and sign in using the official CLI. No account password is collected here."}</p>
        <label>Model<input value="Default · CLI configuration" readOnly /></label>
        <label>Approved workspace<select aria-label="Approved workspace" value={workspace} disabled={Boolean(busy)} onChange={event => setWorkspace(event.target.value)}><option value="">Choose a workspace</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <p className="execution-mode__hint">{workspaces.find(item => item.id === workspace)?.path}</p>
        <p className="execution-mode__hint">Each task asks for approval before starting. CLI model and reasoning settings remain owned by the CLI.</p>
        <div className="execution-mode__actions"><button type="button" disabled={Boolean(busy) || !cliReady || !workspace} onClick={() => void run("local", async () => {
          const state = await request<Snapshot>("/api/settings/execution/local", { method: "POST", body: JSON.stringify({ agentId: "codex-cli", workspaceId: workspace }) });
          if (mounted.current) { setSnapshot(state); setNotice("Codex CLI selected. New tasks will request approval before execution."); window.dispatchEvent(new Event("preacherman-execution-changed")); }
        })}>{busy === "local" ? "Saving…" : "Use Codex CLI"}</button></div>
      </div>
      <p className="execution-mode__hint">Preacherman Native remains available through its existing execution flow. Other CLIs are not yet connected.</p>
    </div> : null}
    {error ? <p className="execution-mode__error" role="alert">{error}</p> : null}
    {notice ? <p className="execution-mode__notice" role="status">{notice}</p> : null}
    {busy && busy !== "load" ? <p role="status" className="execution-mode__hint">Working… You can leave this view at any time.</p> : null}
  </section>;
}
