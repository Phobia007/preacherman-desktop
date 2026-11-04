import { useEffect, useRef, useState } from "react";
import { stateChanged, stateDate, stateRequest, stateWrite, type MemoryPage, type MemoryPolicy } from "./client";
import { useCharacterState } from "./useCharacterState";
import "../settings/execution-mode.css";
import "./character-state.css";

export function CharacterMemorySettings({ characterId }: { characterId: string }) {
  const { state, error: loadError, loading, refresh } = useCharacterState(characterId);
  const [page, setPage] = useState<MemoryPage | null>(null), [archived, setArchived] = useState(false);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [confirm, setConfirm] = useState<string | null>(null);
  const [policy, setPolicy] = useState<MemoryPolicy | null>(null);
  const policyDirty = useRef(false);
  const editPolicy = (next: MemoryPolicy) => { policyDirty.current = true; setPolicy(next); };
  const life = useRef(new AbortController()), pageRequest = useRef<AbortController>();
  const load = async (offset = 0) => {
    pageRequest.current?.abort(); const controller = new AbortController(); pageRequest.current = controller;
    try {
      const next = await stateRequest<MemoryPage>(characterId, `/memories?limit=25&offset=${offset}&includeForgotten=${archived}`, { signal: AbortSignal.any([life.current.signal, controller.signal]) });
      if (!controller.signal.aborted && !life.current.signal.aborted) setPage(previous => offset ? { ...next, items: [...(previous?.items ?? []), ...next.items] } : next);
    } catch (e) { if (!controller.signal.aborted && !life.current.signal.aborted) setError((e as Error).message); }
  };
  useEffect(() => { life.current = new AbortController(); return () => { life.current.abort(); pageRequest.current?.abort(); }; }, [characterId]);
  useEffect(() => { setPage(null); setError(""); void load(); return () => pageRequest.current?.abort(); }, [characterId, archived]);
  useEffect(() => { if (state && !policyDirty.current) setPolicy(state.policy); }, [state?.policy]);
  const mutate = async (path: string, body: unknown, method = "PUT") => {
    setBusy(true); setError(""); setNotice("");
    try {
      await stateWrite(characterId, path, body, life.current.signal, method);
      if (life.current.signal.aborted) return;
      if (path === "/policy") policyDirty.current = false;
      if (method === "POST") setText(""); setConfirm(null); setNotice("Saved to this character.");
      await load(); stateChanged(characterId);
    } catch (e) { if (!life.current.signal.aborted) setError((e as Error).message); }
    finally { if (!life.current.signal.aborted) setBusy(false); }
  };
  return <section className="execution-mode character-state-settings" aria-label="Character memory" aria-busy={busy || loading}>
    <header className="character-state__heading"><h3>{state?.persona.name ?? "Character"}</h3><button type="button" disabled={busy} onClick={() => { void refresh(); void load(); }}>Refresh</button></header>
    <p className="execution-mode__hint">Memories belong to this character. New conversations follow the character activated in Asset.</p>
    {(error || loadError) && <p role="alert" className="execution-mode__error">{error || loadError}</p>}
    {notice && <p role="status" className="execution-mode__hint">{notice}</p>}
    {loading && !state && <p role="status">Loading memories…</p>}
    {state && <>
      <form className="character-state__form" onSubmit={e => { e.preventDefault(); void mutate("/memories", { text: text.trim() }, "POST"); }}>
        <label>Remember something<textarea value={text} onChange={e => setText(e.target.value)} maxLength={4000} rows={3} placeholder="A preference, a detail, something to remember." /></label>
        <button type="submit" disabled={busy || !text.trim()}>Add memory</button>
      </form>
      <div className="character-state__heading"><span>{state.memoryCounts.active} active · {state.memoryCounts.pinned} pinned</span><button type="button" aria-pressed={archived} disabled={busy} onClick={() => setArchived(!archived)}>Include archived</button></div>
      <div className="character-memory__list" aria-label="Memories">
        {page?.items.map(memory => <article key={memory.id} className="character-memory__item">
          <p>{memory.text}</p><small>{memory.pinned ? "Pinned" : memory.status === "forgotten" ? "Archived" : memory.tier === "long-term" ? "Long-term" : "Conversation"} · {stateDate(memory.createdAt)}</small>
          <div className="character-state__actions">
            <button type="button" disabled={busy} onClick={() => void mutate(`/memories/${memory.id}`, { pinned: !memory.pinned })}>{memory.status === "forgotten" ? "Restore & pin" : memory.pinned ? "Unpin" : "Pin"}</button>
            {confirm === memory.id ? <><span>Delete this memory?</span><button type="button" disabled={busy} onClick={() => void mutate(`/memories/${memory.id}`, {}, "DELETE")}>Delete memory</button><button type="button" disabled={busy} onClick={() => setConfirm(null)}>Keep</button></> : <button type="button" disabled={busy} onClick={() => setConfirm(memory.id)}>Delete</button>}
          </div>
        </article>)}
        {page?.items.length === 0 && <p className="execution-mode__hint">No memories yet. Add one above, or activate this character and start a conversation.</p>}
        {page?.nextOffset != null && <button type="button" disabled={busy} onClick={() => void load(page.nextOffset!)}>Load more memories</button>}
      </div>
      {policy && <details className="character-memory__policy"><summary>Automatic forgetting</summary><p className="execution-mode__hint">Older memories gently fade. Archived memories can be restored; pinned memories stay available.</p>
        <form className="character-state__form" onSubmit={e => { e.preventDefault(); void mutate("/policy", policy); }}>
          <button type="button" role="switch" aria-checked={policy.enabled} onClick={() => editPolicy({ ...policy, enabled: !policy.enabled })}>Forgetting {policy.enabled ? "on" : "off"}</button>
          <div className="character-state__fields"><label>Half-life (days)<input type="number" min={1} max={3650} required value={policy.halfLifeDays} onChange={e => editPolicy({ ...policy, halfLifeDays: Number(e.target.value) })} /></label><label>Archive after (days)<input type="number" min={1} max={3650} required value={policy.forgetAfterDays} onChange={e => editPolicy({ ...policy, forgetAfterDays: Number(e.target.value) })} /></label><label>Archive below strength<input type="number" min={0.01} max={0.5} step={0.01} required value={policy.minimumWeight} onChange={e => editPolicy({ ...policy, minimumWeight: Number(e.target.value) })} /></label></div>
          <button type="submit" disabled={busy}>Save policy</button>
        </form></details>}
    </>}
  </section>;
}
