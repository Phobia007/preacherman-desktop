export const MARKET_LOGO_MS = 420;
export const MARKET_PANELS_MS = 760;

/** Animate only the visible columns, then release their compositor layers. */
export function animateMarketPanels(doc: Document, reducedMotion: boolean, direction: "in" | "out" = "in") {
  const viewport = doc.defaultView!;
  const panels = [...doc.querySelectorAll<HTMLElement>(".descriptive-card > .row > .col-12")]
    .filter(panel => {
      const bounds = panel.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < viewport.innerHeight;
    });
  const animations = reducedMotion ? [] : panels.map(panel => {
    const from = panel.getBoundingClientRect().left < viewport.innerWidth / 2 ? "-100%" : "100%";
    const frames = [
      { transform: `translate3d(${from}, 0, 0)` },
      { transform: "translate3d(0, 0, 0)" },
    ];
    return panel.animate(direction === "out" ? frames.reverse() : frames, {
      duration: MARKET_PANELS_MS,
      easing: direction === "out" ? "cubic-bezier(0.7, 0, 0.84, 0)" : "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "both",
    });
  });
  // One timeline timestamp keeps opposite sides exactly synchronized.
  const start = doc.timeline.currentTime;
  for (const animation of animations) animation.startTime = start;
  return {
    finished: Promise.all(animations.map(animation => animation.finished)),
    cancel: () => animations.forEach(animation => animation.cancel()),
  };
}

export type MarketDetailsPhase = "idle" | "exiting" | "frost" | "model" | "content" | "complete" | "hide-content" | "hide-model" | "unfrost" | "returning";
export const MARKET_MODEL_REVEAL_MS = 1000;
export const MARKET_DETAILS_CONTENT_MS = 340;

/** Loading finishes before this timeline starts, so every model receives the full fade. */
export function revealMarketDetails(panel: HTMLElement, part: "model" | "content", reducedMotion: boolean, direction: "in" | "out" = "in") {
  const selector = part === "model" ? ".market-details__model" : ".market-details__views, .market-details__back, .market-details__options";
  const animations = reducedMotion ? [] : [...panel.querySelectorAll<HTMLElement>(selector)].map(element =>
    element.animate(direction === "out" ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], {
      duration: part === "model" ? MARKET_MODEL_REVEAL_MS : MARKET_DETAILS_CONTENT_MS,
      easing: direction === "out" ? "cubic-bezier(0.8, 0, 0.6, 1)" : "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both",
    }));
  // A cold model can compile shaders inside the readiness callback. Start after
  // its first painted frame, rather than reusing that frame's stale timestamp.
  for (const animation of animations) { animation.pause(); animation.currentTime = 0; }
  const viewport = panel.ownerDocument.defaultView!;
  let frame = animations.length ? viewport.requestAnimationFrame(() => {
    frame = viewport.requestAnimationFrame(() => animations.forEach(animation => animation.play()));
  }) : 0;
  return {
    finished: Promise.all(animations.map(animation => animation.finished)),
    cancel: () => { viewport.cancelAnimationFrame(frame); animations.forEach(animation => animation.cancel()); },
  };
}
