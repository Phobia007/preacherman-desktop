import { useEffect, useRef, useState } from "react";
import { stateChanged, stateDate, stateRequest, stateWrite, type Persona, type CharacterState } from "./client";
import { useCharacterState } from "./useCharacterState";
import "../settings/execution-mode.css";
import "./character-state.css";

export function CharacterRulesSettings({ characterId }: { characterId: string }) {
  const { state, error: loadError, loading, refresh } = useCharacterState(characterId);
  const [draft, setDraft] = useState<{ revision: number; text: string } | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const life = useRef(new AbortController());
  useEffect(() => { life.current = new AbortController(); return () => life.current.abort(); }, [characterId]);
  useEffect(() => { if (state && !draft) setDraft({ revision: state.persona.revision, text: state.persona.rules.join("\n") }); }, [state, draft]);
  const save = async () => {
    if (!draft) return; setBusy(true); setError(""); setNotice("");
    const rules = draft.text.split("\n").map(line => line.trim()).filter(Boolean);
    if (rules.length > 30 || rules.some(rule => rule.length > 1000)) { setError("Use up to 30 rules, with at most 1,000 characters per rule."); setBusy(false); return; }
    try {
      const result = await stateWrite<{ persona: Persona }>(characterId, "/persona", { revision: draft.revision, rules }, life.current.signal);
      if (life.current.signal.aborted) return;
      setDraft({ revision: result.persona.revision, text: result.persona.rules.join("\n") }); setNotice("Rules saved. They will apply to the next reply."); stateChanged(characterId);
    } catch (e) { if (!life.current.signal.aborted) setError((e as Error).message); }
    finally { if (!life.current.signal.aborted) setBusy(false); }
  };
  const reload = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await stateRequest<CharacterState>(characterId, "", { signal: life.current.signal });
      if (!life.current.signal.aborted) setDraft({ revision: saved.persona.revision, text: saved.persona.rules.join("\n") });
    } catch (e) { if (!life.current.signal.aborted) setError((e as Error).message); }
    finally { if (!life.current.signal.aborted) setBusy(false); }
  };
  return <section className="execution-mode character-state-settings" aria-label="Character rules" aria-busy={busy || loading}>
    <header className="character-state__heading"><h3>{state?.persona.name ?? "Character"}</h3><span>Revision {draft?.revision ?? "—"}</span></header>
    <p className="execution-mode__intro">The same identity, across every conversation and execution mode.</p>
    {state && <p className="execution-mode__hint">{state.persona.designation} · Updated {stateDate(state.persona.updatedAt)}</p>}
    {(error || loadError) && <p role="alert" className="execution-mode__error">{error || loadError}</p>}
    {notice && <p role="status">{notice}</p>}
    {draft ? <form className="character-state__form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label>Persistent rules<textarea rows={9} maxLength={30030} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} placeholder="One instruction per line." /></label>
      <p className="execution-mode__hint">Rules stay with this character. Memories and automatic forgetting never rewrite them.</p>
      <div className="character-state__actions"><button type="submit" disabled={busy}>Save rules</button><button type="button" disabled={busy} onClick={() => void reload()}>Reload saved rules</button></div>
    </form> : <><p role="status">{loading ? "Loading rules…" : "Rules are unavailable."}</p><button type="button" onClick={() => void refresh()}>Retry</button></>}
  </section>;
}
