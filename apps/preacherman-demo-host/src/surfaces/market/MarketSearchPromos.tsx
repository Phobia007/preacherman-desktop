import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MarketSearchItem } from "./marketSearchData";
import "./market-search-promos.css";

/** Existing model images reserve the future campaign slots; no popularity ranking is implied. */
export function MarketSearchPromos({ models, visible, enabled, onChoose }: {
  models: readonly MarketSearchItem[]; visible: boolean; enabled: boolean; onChoose: (name: string) => void;
}) {
  const previews = useMemo(() => models.slice(0, 3), [models]);
  const root = useRef<HTMLElement>(null), track = useRef<HTMLDivElement>(null);
  const motion = useRef<Animation | null>(null);
  const [first, setFirst] = useState(0);
  const [paused, setPaused] = useState(false), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [onScreen, setOnScreen] = useState(true), [documentVisible, setDocumentVisible] = useState(!document.hidden);
  const canRun = enabled && visible && onScreen && documentVisible && !reduced && !paused && !hovered && !focused;
  const running = useRef(canRun);
  const ordered = previews.map((_, i) => previews[(first + i) % previews.length]);
  const cards = ordered.length ? [...ordered, ordered[0]] : [];

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const appearance = () => setReduced(media.matches), visibility = () => setDocumentVisible(!document.hidden);
    media.addEventListener("change", appearance); document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => setOnScreen(entries[0].isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => { media.removeEventListener("change", appearance); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, []);
  useLayoutEffect(() => { root.current?.toggleAttribute("inert", !visible || !enabled); }, [visible, enabled]);
  useLayoutEffect(() => {
    running.current = canRun;
    if (motion.current) { if (canRun) motion.current.play(); else motion.current.pause(); }
  }, [canRun]);
  // Keep the four DOM slots fixed; swap decoded images after transport to avoid stale compositor clips.
  useLayoutEffect(() => { motion.current?.cancel(); motion.current = null; }, [first]);
  useEffect(() => {
    if (!enabled || !visible || previews.length < 2 || reduced) return;
    const timer = window.setInterval(() => {
      const rail = track.current;
      if (!running.current || !rail || motion.current) return;
      const step = rail.firstElementChild!.getBoundingClientRect().width / (rail.getBoundingClientRect().width / rail.clientWidth) + parseFloat(getComputedStyle(rail).columnGap);
      const animation = rail.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-step}px,0,0)` }], {
        duration: 1100, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards",
      });
      motion.current = animation;
      void animation.finished.then(() => { if (motion.current === animation) setFirst(value => (value + 1) % previews.length); }).catch(() => {});
    }, 4800);
    return () => { window.clearInterval(timer); motion.current?.cancel(); motion.current = null; };
  }, [enabled, visible, reduced, previews.length]);

  return <section ref={root} className="market-search-promos" aria-label="Featured model previews" aria-roledescription="carousel"
    data-visible={visible} data-running={canRun} data-first={first} aria-hidden={!visible}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div className="market-search-promos__viewport">
      <div ref={track} className="market-search-promos__track" aria-live="off">
        {cards.map((model, index) => <button key={index} type="button"
          className="market-search-promos__card" aria-label={`Search ${model.name}`} aria-hidden={index === previews.length || undefined}
          tabIndex={index === previews.length ? -1 : 0} onClick={() => onChoose(model.name)}>
          <img src={`/market-love/${model.image}`} alt="" decoding="async" width={4096} height={4096}
            onLoad={event => { event.currentTarget.dataset.loaded = "true"; }} onError={event => { event.currentTarget.parentElement!.dataset.error = "true"; }} />
          <span className="market-search-promos__fallback">Preview unavailable</span>
          <span className="market-search-promos__caption"><span>{model.name}</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" /></svg></span>
        </button>)}
      </div>
    </div>
    <button type="button" className="market-search-promos__pause" aria-label={paused ? "Resume model previews" : "Pause model previews"}
      aria-pressed={paused} hidden={reduced} onClick={() => setPaused(value => !value)}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{paused ? <path d="m9 5 10 7-10 7Z" /> : <path d="M9 5v14M15 5v14" />}</svg>
    </button>
  </section>;
}
