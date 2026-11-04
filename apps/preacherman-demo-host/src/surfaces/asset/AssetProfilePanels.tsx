import { useEffect, useRef, useState } from "react";
import { stateChanged, stateDate, stateRequest, stateWrite, skillName, type AvailableTool, type Skill } from "../../character-state/client";
import { TaskReference } from "../../character-state/TaskReference";
import "./asset-profile-panels.css";
export { AssetInfoMap } from "./AssetInfoMap";

export type ProfileCharacter = { id: string; name: string; designation: string; cardImage: string; image: string; imageWidth: number; imageHeight: number };
export function AssetSkills({ character }: { character: ProfileCharacter }) {
  const [catalog, setCatalog] = useState<{ skills: Skill[]; available: AvailableTool[] } | null>(null);
  const [selected, setSelected] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [showTask, setShowTask] = useState(false);
  const life = useRef(new AbortController());
  const load = async () => {
    setError(""); setBusy(true);
    try { const next = await stateRequest<NonNullable<typeof catalog>>(character.id, "/skills", { signal: life.current.signal }); if (!life.current.signal.aborted) { setCatalog(next); setSelected(current => next.available.some(item => item.name === current) ? current : next.available[0]?.name ?? ""); } }
    catch (e) { if (!life.current.signal.aborted) setError((e as Error).message); }
    finally { if (!life.current.signal.aborted) setBusy(false); }
  };
  useEffect(() => { life.current = new AbortController(); void load(); return () => life.current.abort(); }, [character.id]);
  const current = catalog?.available.find(tool => tool.name === selected), record = catalog?.skills.find(skill => skill.id === selected);
  const toggle = async () => {
    if (!current) return; setBusy(true); setError("");
    try { await stateWrite(character.id, "/skills", { skillId: current.name, enabled: !record?.enabled }, life.current.signal); if (!life.current.signal.aborted) { await load(); stateChanged(character.id); } }
    catch (e) { if (!life.current.signal.aborted) setError((e as Error).message); }
    finally { if (!life.current.signal.aborted) setBusy(false); }
  };
  return <div className="asset-skills" aria-busy={busy}>
    <div className="asset-skills__sidebar">
      <header className="asset-skills__character"><img src={character.cardImage} alt="" width="104" height="104" /><div><h2>{character.name}</h2><p>{character.designation}</p></div></header>
      <div className="asset-skills__list" role="group" aria-label="Character skills">
        {catalog?.available.map(tool => <button key={tool.name} type="button" className="asset-skills__option" aria-pressed={selected === tool.name} aria-controls="asset-skill-demonstration" onClick={() => { setSelected(tool.name); setShowTask(false); }}><span className="asset-skills__name">{skillName(tool.name)}</span><span className="asset-skills__enabled">{catalog.skills.find(skill => skill.id === tool.name)?.enabled ? "Enabled" : "Off"}</span></button>)}
        {catalog?.available.length === 0 && <p>No registered skills yet. Connect a plugin in Extension to make its tools available.</p>}
      </div>
    </div>
    <section id="asset-skill-demonstration" className="asset-profile__panel" aria-label="Skill details">
      <header className="character-profile__header"><h2>{current ? skillName(current.name) : "Skills"}</h2><button type="button" disabled={busy} onClick={() => void load()}>Refresh</button></header>
      {error && <p role="alert" className="character-profile__error">{error}</p>}
      {!catalog && !error && <p role="status">Loading registered skills…</p>}
      {current && <><p className="character-profile__description">{current.description}</p><p className="character-profile__muted">{current.pluginId}</p>
        <button type="button" role="switch" aria-checked={Boolean(record?.enabled)} disabled={busy} onClick={() => void toggle()}>{record?.enabled ? "Enabled for this character" : "Enable for this character"}</button>
        <p className="character-profile__muted">Enabling a skill makes it available. Execution still requires your approval.</p>
        <dl className="character-skill__experience"><div><dt>Proficiency</dt><dd>{Math.round((record?.proficiency ?? 0) * 100)}%</dd></div><div><dt>Completed</dt><dd>{record?.successes ?? 0}</dd></div><div><dt>Failed</dt><dd>{record?.failures ?? 0}</dd></div><div><dt>Next review</dt><dd>{stateDate(record?.nextReviewAt)}</dd></div></dl>
        <div className="character-skill__demonstration" aria-label="Skill demonstration preview" />
        {record?.lastTaskId ? <><button type="button" onClick={() => setShowTask(!showTask)} aria-expanded={showTask}>Last execution</button>{showTask && <TaskReference taskId={record.lastTaskId} characterId={character.id} />}</> : <p className="character-profile__muted">No approved executions yet. Experience appears after this character completes a skill task.</p>}
      </>}
    </section>
  </div>;
}
