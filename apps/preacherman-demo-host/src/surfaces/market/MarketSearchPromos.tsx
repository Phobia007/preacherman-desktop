import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TaskFeaturedCards } from "./TaskFeaturedCards";
import type { MarketSearchItem } from "./marketSearchData";
import "./market-search-promos.css";

type Props = { models: readonly MarketSearchItem[]; visible: boolean; enabled: boolean; onChoose: (name: string) => void };

export function MarketSearchPromos({ models, visible, enabled, onChoose }: Props) {
  const previews = useMemo(() => models.slice(0, 3), [models]);
  const root = useRef<HTMLElement>(null), viewport = useRef<HTMLDivElement>(null), controller = useRef<TaskFeaturedCards | null>(null);
  const [started, setStarted] = useState(false), [status, setStatus] = useState("loading");
  const [paused, setPaused] = useState(false), [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [onScreen, setOnScreen] = useState(true), [documentVisible, setDocumentVisible] = useState(!document.hidden);
  const active = enabled && visible && onScreen && documentVisible;
  const running = active && !reduced && !paused && !focused;
  const state = useRef({ active, running, reduced }); state.current = { active, running, reduced };
  useEffect(() => { if (enabled && visible) setStarted(true); }, [enabled, visible]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"), motion = () => setReduced(media.matches), visibility = () => setDocumentVisible(!document.hidden);
    media.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => setOnScreen(entries[0]?.isIntersecting ?? false));
    if (root.current) observer.observe(root.current);
    return () => { media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const host = viewport.current;
    if (!started || !host || !previews.length) return;
    const abort = new AbortController(); let instance: TaskFeaturedCards | null = null;
    setStatus("loading");
    TaskFeaturedCards.create(host, [...host.querySelectorAll<HTMLButtonElement>(".market-search-promos__card")], previews, abort.signal).then(renderer => {
      if (abort.signal.aborted) { renderer.dispose(); return; }
      instance = renderer; controller.current = renderer; setStatus("ready");
      renderer.setState(state.current.active, state.current.running, state.current.reduced);
    }).catch(() => { if (!abort.signal.aborted) setStatus("error"); });
    return () => { abort.abort(); instance?.dispose(); if (controller.current === instance) controller.current = null; };
  }, [previews, started]);
  useLayoutEffect(() => { if (root.current) root.current.inert = !visible || !enabled; }, [visible, enabled]);
  useEffect(() => { controller.current?.setState(active, running, reduced); }, [active, running, reduced]);
  return <section ref={root} className="market-search-promos" aria-label="Featured model previews" aria-roledescription="carousel"
    aria-hidden={!visible} data-visible={visible} data-running={running} data-status={status}
    onFocusCapture={event => { if ((event.target as HTMLElement).closest(".market-search-promos__card")) setFocused(true); }}
    onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget) || !(event.relatedTarget as HTMLElement).closest(".market-search-promos__card")) setFocused(false); }}>
    <div ref={viewport} className="market-search-promos__viewport" aria-live="off">
      {[...previews, ...previews].map((model, index) => <button key={`${model.id}-${index}`} type="button" className="market-search-promos__card"
        aria-label={`Search ${model.name}`} tabIndex={-1} onClick={() => onChoose(model.name)}>
        <span className="market-search-promos__fallback-name">{model.name}</span>
      </button>)}
    </div>
    {status !== "ready" && <p className="market-search-promos__status" role="status">{status === "error" ? "Model previews could not load. Search is still available below." : "Opening previews…"}</p>}
    <button className="market-search-promos__pause" type="button" hidden={reduced || status !== "ready"} aria-label={paused ? "Resume model previews" : "Pause model previews"}
      aria-pressed={paused} onClick={() => setPaused(value => !value)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{paused ? <path d="m9 5 11 7-11 7Z" /> : <path d="M8 5v14M16 5v14" />}</svg>
    </button>
  </section>;
}
