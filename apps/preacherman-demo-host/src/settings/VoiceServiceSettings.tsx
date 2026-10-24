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
  const life = useRef(new AbortController());
  const load = async () => {
    const signal = life.current.signal;
    setBusy(true); setError("");
    try {
      const state = await characterVoiceRequest<CharacterVoiceSettings>(characterId, "", undefined, signal);
      if (signal.aborted) return;
      setDraft(state.service); setSaved(JSON.stringify(state.service));
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load voice settings."); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  useEffect(() => { life.current = new AbortController(); void load(); return () => life.current.abort(); }, [characterId]);
  const update = (field: keyof VoiceServiceDraft, value: string) => { setDraft(old => ({ ...old, [field]: value })); setNotice(""); };
  return <section className="execution-mode voice-service" aria-label="Voice Service configuration" aria-busy={busy} lang="en">
    <div className="voice-service__heading"><h3>Realtime conversation</h3><span className="voice-service__status">Not connected</span></div>
    <p className="execution-mode__intro">Your character’s voice connection. Separate from its execution agent.</p>
    {saved === null ? <>{busy ? <p role="status">Reading voice settings…</p> : <button type="button" onClick={() => void load()}>Try again</button>}</> :
      <form onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError(""); setNotice("");
        try {
          const state = await characterVoiceRequest<CharacterVoiceSettings>(characterId, "/service", draft, life.current.signal);
          if (!life.current.signal.aborted) { setDraft(state.service); setSaved(JSON.stringify(state.service)); setNotice("Service details saved for this character. API connection is pending."); }
        } catch (reason) { if (!life.current.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not save voice settings."); }
        finally { if (!life.current.signal.aborted) setBusy(false); }
      }}>
        <fieldset disabled={busy} className="execution-mode__fields">
          <label>Provider<select aria-label="Provider" value={draft.provider} onChange={event => update("provider", event.target.value)}>
            <option value="">Choose later</option><option value="dashscope">Alibaba Cloud</option><option value="volcengine">Volcengine</option><option value="openai">OpenAI</option><option value="other">Other provider</option>
          </select></label>
          <label>Model<input value={draft.model} maxLength={160} placeholder="Model ID, when selected" onChange={event => update("model", event.target.value)} spellCheck={false} autoComplete="off" /></label>
          <div className="voice-service__pair"><label>Region<input value={draft.region} maxLength={80} placeholder="Optional" onChange={event => update("region", event.target.value)} /></label>
            <label>Workspace ID<input value={draft.workspaceId} maxLength={160} placeholder="Optional" onChange={event => update("workspaceId", event.target.value)} autoComplete="off" spellCheck={false} /></label></div>
          <p className="execution-mode__hint">Save your service details now. Credentials and connection testing will be available once the provider is integrated.</p>
          <div className="execution-mode__actions"><button type="submit" disabled={busy || saved === JSON.stringify(draft)}>{busy ? "Saving…" : "Save details"}</button></div>
        </fieldset>
      </form>}
    {notice && <p role="status" className="execution-mode__result">{notice}</p>}
    {error && <p role="alert" className="execution-mode__error">{error}</p>}
    <div className="voice-service__next"><div><h3>Character voice</h3><p className="execution-mode__hint">Choose and preview voices in Appearance.</p></div><button type="button" onClick={onOpenVoice}>Open Voice</button></div>
  </section>;
}
