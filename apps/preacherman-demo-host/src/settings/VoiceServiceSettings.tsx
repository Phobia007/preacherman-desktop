import { useEffect, useRef, useState } from "react";
import { characterVoiceRequest, type CharacterVoiceSettings, type VoiceServiceDraft } from "../audio/characterVoice";
import "./execution-mode.css";
import "./voice-service.css";

const empty: VoiceServiceDraft = { provider: "", model: "", region: "", workspaceId: "" };

export function VoiceServiceSettings({ characterId, onOpenVoice }: { characterId: string; onOpenVoice?: () => void }) {
  const [draft, setDraft] = useState(empty);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [breezeOnline, setBreezeOnline] = useState(false);
  const life = useRef(new AbortController());
  const load = async () => {
    const signal = life.current.signal;
    setBusy(true); setError("");
    try {
      const state = await characterVoiceRequest<CharacterVoiceSettings>(characterId, "", undefined, signal);
      if (signal.aborted) return;
      setDraft(state.service); setSaved(JSON.stringify(state.service)); setBreezeOnline(state.breezeStatus === "connected");
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load voice settings."); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  useEffect(() => { life.current = new AbortController(); void load(); return () => life.current.abort(); }, [characterId]);
  const update = (field: keyof VoiceServiceDraft, value: string) => { setDraft(old => ({ ...old, [field]: value })); setNotice(""); };
  return <section className="execution-mode voice-service" aria-label="Voice Service configuration" aria-busy={busy} lang="en">
    <div className="voice-service__heading"><h3>Voice service</h3><span className="voice-service__status">{draft.provider === "breeze" ? breezeOnline ? "Breeze connected" : "Breeze offline" : "Not connected"}</span></div>
    <p className="execution-mode__intro">Breeze speaks your character’s replies using a saved local voice. Its execution agent still creates the replies.</p>
    {saved === null ? <>{busy ? <p role="status">Reading voice settings…</p> : <button type="button" onClick={() => void load()}>Try again</button>}</> :
      <form onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError(""); setNotice("");
        try {
          const state = await characterVoiceRequest<CharacterVoiceSettings>(characterId, "/service", draft, life.current.signal);
          if (!life.current.signal.aborted) { setDraft(state.service); setSaved(JSON.stringify(state.service)); setBreezeOnline(state.breezeStatus === "connected"); setNotice(state.service.provider === "breeze" ? "Breeze selected. Choose a saved voice in Appearance → Voice and hold Apply." : "Service details saved for this character. API connection is pending."); }
        } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not save voice settings."); }
        finally { if (!life.current.signal.aborted) setBusy(false); }
      }}>
        <fieldset disabled={busy} className="execution-mode__fields">
          <label>Provider<select aria-label="Provider" value={draft.provider} onChange={event => { const provider = event.target.value; if (provider === "breeze") { setDraft({ provider, model: "Breeze-TTS-2", region: "local", workspaceId: "" }); setNotice(""); } else update("provider", provider); }}>
            <option value="">Choose later</option><option value="breeze">Breeze TTS 2 · Local</option><option value="dashscope">Alibaba Cloud</option><option value="volcengine">Volcengine</option><option value="openai">OpenAI</option><option value="other">Other provider</option>
          </select></label>
          <label>Model<input value={draft.model} readOnly={draft.provider === "breeze"} maxLength={160} placeholder="Model ID, when selected" onChange={event => update("model", event.target.value)} spellCheck={false} autoComplete="off" /></label>
          {draft.provider !== "breeze" && <div className="voice-service__pair"><label>Region<input value={draft.region} maxLength={80} placeholder="Optional" onChange={event => update("region", event.target.value)} /></label>
            <label>Workspace ID<input value={draft.workspaceId} maxLength={160} placeholder="Optional" onChange={event => update("workspaceId", event.target.value)} autoComplete="off" spellCheck={false} /></label></div>}
          <p className="execution-mode__hint">{draft.provider === "breeze" ? "Runs on this computer at 127.0.0.1:18760. Use Refresh Breeze voices in Appearance → Voice to start or reconnect it. No API key required." : "Other providers remain configuration drafts. Their credentials and realtime connections are not integrated yet."}</p>
          <div className="execution-mode__actions"><button type="submit" disabled={busy || saved === JSON.stringify(draft)}>{busy ? "Saving…" : "Save details"}</button></div>
        </fieldset>
      </form>}
    {notice && <p role="status" className="execution-mode__result">{notice}</p>}
    {error && <p role="alert" className="execution-mode__error">{error}</p>}
    <div className="voice-service__next"><div><h3>Character voice</h3><p className="execution-mode__hint">Choose and preview voices in Appearance.</p></div><button type="button" onClick={onOpenVoice}>Open Voice</button></div>
  </section>;
}
