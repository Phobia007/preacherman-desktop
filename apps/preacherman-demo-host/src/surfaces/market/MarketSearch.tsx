import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { galleryModelBindings } from "../gallery/galleryModelBindings";
import { cleanSearchQuery, MARKET_SEARCH_HISTORY_KEY, readSearchHistory, rememberSearch, removeSearch, searchMarketModels, type MarketSearchItem } from "./marketSearchData";
import "./market-search.css";

const galleryModels = new Set<string>(Object.values(galleryModelBindings));
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" /></svg>; }

export function MarketSearch({ panelRef, models: catalog, active, ready, interactive, onOpenModel }: {
  panelRef: RefObject<HTMLElement>; models: readonly MarketSearchItem[]; active: boolean; ready: boolean; interactive: boolean; onOpenModel: (id: string) => void;
}) {
  const models = useMemo(() => catalog.filter(model => galleryModels.has(model.id)), [catalog]);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLUListElement>(null);
  const historyFocusPending = useRef(false);
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [pendingQuery, setPendingQuery] = useState("");
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [updating, setUpdating] = useState(false);
  const [history, setHistory] = useState(() => { try { return readSearchHistory(localStorage); } catch { return []; } });
  const [showHistory, setShowHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const matches = useMemo(() => searchMarketModels(models, resolvedQuery), [models, resolvedQuery]);
  const suggestions = history.filter(item => item.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useLayoutEffect(() => {
    if (showHistory && historyFocusPending.current) {
      historyRef.current?.querySelector<HTMLButtonElement>("[data-history-query]")?.focus();
      historyFocusPending.current = false;
    }
  }, [showHistory, suggestions.length]);

  useEffect(() => {
    if (composing) return;
    const timer = window.setTimeout(() => setPendingQuery(cleanSearchQuery(query)), 180);
    return () => window.clearTimeout(timer);
  }, [query, composing]);
  useEffect(() => {
    if (pendingQuery === resolvedQuery) { setUpdating(false); return; }
    setUpdating(Boolean(resolvedQuery));
    const timer = window.setTimeout(() => { setResolvedQuery(pendingQuery); setUpdating(false); }, resolvedQuery && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 140 : 0);
    return () => window.clearTimeout(timer);
  }, [pendingQuery, resolvedQuery]);
  useLayoutEffect(() => { panelRef.current?.toggleAttribute("inert", !active || !interactive); }, [active, interactive, panelRef]);
  useEffect(() => { if (!interactive) setShowHistory(false); }, [interactive]);

  const saveHistory = (next: string[]) => {
    setHistory(next);
    try { localStorage.setItem(MARKET_SEARCH_HISTORY_KEY, JSON.stringify(next)); setHistoryError(""); }
    catch { setHistoryError("Search history could not be saved on this device."); }
  };
  const submit = (value: string) => {
    const next = cleanSearchQuery(value);
    setQuery(next); setPendingQuery(next); setShowHistory(false);
    if (next) saveHistory(rememberSearch(history, next));
  };
  const open = (id: string, target: HTMLButtonElement) => {
    panelRef.current?.querySelectorAll("[data-market-return-focus]").forEach(el => el.removeAttribute("data-market-return-focus"));
    target.setAttribute("data-market-return-focus", "");
    if (resolvedQuery) saveHistory(rememberSearch(history, resolvedQuery));
    setShowHistory(false); onOpenModel(id);
  };
  return <section ref={panelRef} id="market-search-page" className="market-search" aria-label="Search models" hidden={!active}
    data-ready={ready} data-has-query={Boolean(resolvedQuery)}>
    <div className="market-search__head" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowHistory(false); }}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); inputRef.current?.focus(); setShowHistory(false); } }}>
      <form className="market-search__form" role="search" onSubmit={event => { event.preventDefault(); if (!composing) submit(query); }}>
        <span className="market-search__icon"><SearchIcon /></span>
        <input ref={inputRef} type="search" aria-label="Search model names" placeholder="Search models" value={query} maxLength={120}
          autoComplete="off" spellCheck={false} onChange={event => setQuery(event.target.value)} onFocus={() => setShowHistory(true)} onClick={() => setShowHistory(true)}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
          onKeyDown={event => { if (event.key === "ArrowDown" && suggestions.length) {
            event.preventDefault();
            const first = historyRef.current?.querySelector<HTMLButtonElement>("[data-history-query]");
            if (first) first.focus(); else { historyFocusPending.current = true; setShowHistory(true); }
          } }} />
        {query && <button className="market-search__clear" type="button" aria-label="Clear search" onClick={() => { setQuery(""); setPendingQuery(""); inputRef.current?.focus(); }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M7 17l10-10" /></svg>
        </button>}
        <button className="market-search__submit" type="submit" aria-label="Search models" disabled={!query.trim()}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" /></svg>
        </button>
      </form>
      {showHistory && suggestions.length > 0 && <div className="market-search__history" role="region" aria-label="Search history">
        <ul ref={historyRef} onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-history-query]")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = index + (event.key === "ArrowDown" ? 1 : -1);
          if (next < 0) inputRef.current?.focus(); else buttons[Math.min(next, buttons.length - 1)]?.focus();
        }}>
          {suggestions.map(item => <li key={item}>
            <button type="button" data-history-query onClick={() => { submit(item); inputRef.current?.focus(); setShowHistory(false); }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg><span>{item}</span>
            </button>
            <button type="button" className="market-search__delete" aria-label={`Delete ${item} from search history`} onClick={() => {
              saveHistory(removeSearch(history, item)); inputRef.current?.focus(); setShowHistory(true);
            }}><TrashIcon /></button>
          </li>)}
        </ul>
      </div>}
      {historyError && <p className="market-search__error" role="status">{historyError}</p>}
    </div>
    <p className="market-search__announcement" role="status" aria-live="polite">{resolvedQuery ? `${matches.length} ${matches.length === 1 ? "model" : "models"} found` : ""}</p>
    {resolvedQuery && <div className="market-search__results" data-updating={updating} aria-busy={updating}>
      {matches.length ? <div key={resolvedQuery}>
        {matches.map((model, index) => <article className="market-search__result" data-model-id={model.id} key={model.id} style={{ "--result-delay": `${Math.min(index, 3) * 60}ms` } as CSSProperties}>
          <button type="button" className="market-search__image" aria-label={`Open ${model.name} details`} onClick={event => open(model.id, event.currentTarget)}>
            <img src={`/market-love/${model.image}`} alt={model.name} width={4096} height={4096} loading={index < 2 ? "eager" : "lazy"} decoding="async"
              onLoad={event => { event.currentTarget.dataset.loaded = "true"; }} onError={event => { event.currentTarget.parentElement!.dataset.error = "true"; }} />
            <span className="market-search__image-error">Image unavailable — open {model.name}</span>
          </button>
          <div className="market-search__copy"><h2>{model.name}</h2><p>{model.summary}</p>
            <button type="button" aria-label={`${model.name}, Details`} onClick={event => open(model.id, event.currentTarget)}>Details</button>
          </div>
        </article>)}
      </div> : <p className="market-search__empty" key={resolvedQuery}>No models found for “{resolvedQuery}”.<br />Try another name.</p>}
    </div>}
  </section>;
}
