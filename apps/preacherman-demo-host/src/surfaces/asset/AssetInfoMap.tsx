import { useEffect, useRef, useState } from "react";
import { eventName, stateDate, stateRequest, type InfoMap, type MemoryPage } from "../../character-state/client";
import { useCharacterState } from "../../character-state/useCharacterState";
import { TaskReference } from "../../character-state/TaskReference";
import type { ProfileCharacter } from "./AssetProfilePanels";

export function AssetInfoMap({ character }: { character: ProfileCharacter }) {
  const { state, error: stateError, refresh } = useCharacterState(character.id);
  const [map, setMap] = useState<InfoMap | null>(null), [memories, setMemories] = useState<MemoryPage | null>(null);
  const [tab, setTab] = useState("Map"), [selected, setSelected] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  const load = async (after = 0) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError("");
    try {
      const [next, notes] = await Promise.all([stateRequest<InfoMap>(character.id, `/info-map?after=${after}&limit=50`, { signal: controller.signal }), stateRequest<MemoryPage>(character.id, "/memories?limit=100&includeForgotten=true", { signal: controller.signal })]);
      if (controller.signal.aborted) return;
      setMap(previous => after && previous ? { ...next, events: { ...next.events, items: [...previous.events.items, ...next.events.items] } } : next); setMemories(notes);
    } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  useEffect(() => { void load(); return () => request.current?.abort(); }, [character.id, state]);
  const nodes = map?.nodes.filter(node => node.kind !== "character") ?? [];
  const visible = [...nodes.filter(node => ["relationship", "emotion"].includes(node.kind)), ...nodes.filter(node => node.kind === "memory").slice(-6), ...nodes.filter(node => node.kind === "skill").slice(0, 4)];
  const points = visible.map((node, index) => ({ node, x: 50 + Math.cos(index / visible.length * Math.PI * 2 - Math.PI / 2) * 35, y: 50 + Math.sin(index / visible.length * Math.PI * 2 - Math.PI / 2) * 35 }));
  const memory = memories?.items.find(item => `memory:${item.id}` === selected), node = map?.nodes.find(item => item.id === selected);
  const title = (kind: string) => kind === "emotion" ? "Mood" : kind === "relationship" ? "Rapport" : kind === "skill" ? "Skill" : "Memory";
  return <div className="asset-info-map">
    <div className="asset-info-map__identity">
      <div className="asset-info-map__portrait"><img src={character.image} alt={character.name} width={character.imageWidth} height={character.imageHeight} decoding="async" /></div>
      <div className="asset-info-map__rapport" aria-label={`Rapport, level ${state?.relationship.level ?? "loading"}`}><span>Rapport</span><span className="asset-info-map__level">{state ? `LV. ${state.relationship.level}` : "—"}</span></div>
      {state && <p className="asset-info-map__continuity">{state.relationship.turns} conversations · {state.relationship.activeDays} days together</p>}
    </div>
    <section className="asset-profile__panel" aria-label={`${character.name} info map`} aria-busy={busy}>
      <header className="character-profile__header"><h2>{character.name}</h2><button type="button" disabled={busy} onClick={() => { void refresh(); void load(); }}>Refresh</button></header>
      <div className="character-profile__tabs" role="tablist" aria-label="Info Map views" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? "Map" : event.key === "End" ? "History" : tab === "Map" ? "History" : "Map";
        setTab(next); setTaskId(null); document.getElementById(`character-info-tab-${next}`)?.focus();
      }}>{["Map", "History"].map(label => <button type="button" key={label} role="tab" tabIndex={tab === label ? 0 : -1} aria-selected={tab === label} aria-controls={`character-info-${label}`} id={`character-info-tab-${label}`} onClick={() => { setTab(label); setTaskId(null); }}>{label}</button>)}</div>
      {(error || stateError) && <p role="alert" className="character-profile__error">{error || stateError}</p>}
      {!map && !error && <p role="status">Loading character history…</p>}
      {tab === "Map" && map && <div role="tabpanel" id="character-info-Map" aria-labelledby="character-info-tab-Map">
        <div className="character-info__summary"><span>{state?.memoryCounts.active ?? 0} memories</span><span>{state?.skills.filter(skill => skill.enabled).length ?? 0} enabled skills</span><span>{state?.emotion.label ?? "Calm"}</span></div>
        <div className="character-info__graph" aria-label="Character memory connections">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{points.map(({ node, x, y }) => <line key={node.id} x1="50" y1="50" x2={x} y2={y} vectorEffect="non-scaling-stroke" />)}</svg>
          <span className="character-info__center">{character.name}</span>
          {points.map(({ node, x, y }, index) => <button type="button" key={node.id} className="character-info__node" style={{ left: `${x}%`, top: `${y}%` }} aria-pressed={selected === node.id} onClick={() => setSelected(node.id)} title={node.label ?? title(node.kind)}>{title(node.kind)}{node.kind === "memory" ? ` ${points.slice(0, index + 1).filter(p => p.node.kind === "memory").length}` : ""}</button>)}
        </div>
        <div className="character-info__detail" aria-live="polite">
          {memory ? <><h3>{memory.pinned ? "Pinned memory" : memory.tier === "long-term" ? "Long-term memory" : "Conversation memory"}</h3><p>{memory.text}</p><small>{stateDate(memory.createdAt)} · {memory.status === "forgotten" ? "Archived" : "Available for recall"}</small></> : node?.kind === "emotion" ? <><h3>{state?.emotion.label}</h3><p>A temporary conversation style that settles back toward calm.</p></> : node?.kind === "relationship" ? <><h3>Rapport · {state?.relationship.rapport.toFixed(1)} / 100</h3><p>Built through conversations together. Time apart does not reduce it.</p></> : node?.kind === "skill" ? <><h3>{node.label?.split("::").at(-1)?.replace(/[_-]/g, " ")}</h3><p>Manage this character’s enabled tools and experience in Skills.</p></> : <><h3>A history that stays with {character.name}</h3><p>Select a connection to explore it. Your conversations build this map over time.</p></>}
          <small>{visible.filter(item => item.kind === "memory").length} recent memories shown. Manage all memories in Settings → Memory.</small>
        </div>
      </div>}
      {tab === "History" && map && <div role="tabpanel" id="character-info-History" aria-labelledby="character-info-tab-History" className="character-info__history">
        {map.earliestSequence > 1 && <p>Earlier events are outside the retained history.</p>}
        {map.events.items.map(event => <article key={event.id}><div><h3>{eventName(event)}</h3><time dateTime={event.at}>{stateDate(event.at)}</time></div>{event.taskId && <button type="button" onClick={() => setTaskId(event.taskId!)}>View task</button>}{event.memoryId && memories?.items.some(item => item.id === event.memoryId) && <button type="button" onClick={() => { setSelected(`memory:${event.memoryId}`); setTab("Map"); }}>View memory</button>}</article>)}
        {map.events.items.length === 0 && <p>No events yet.</p>}
        {map.events.hasMore && <button type="button" disabled={busy} onClick={() => void load(map.events.nextCursor)}>Load more history</button>}
        {taskId && <TaskReference taskId={taskId} characterId={character.id} />}
      </div>}
    </section>
  </div>;
}
