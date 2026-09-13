export const MARKET_LOGO_MS = 180;
export const MARKET_PANELS_MS = 280;

/** Animate only the visible columns, then release their compositor layers. */
export function animateMarketPanels(doc: Document, reducedMotion: boolean) {
  const viewport = doc.defaultView!;
  const panels = [...doc.querySelectorAll<HTMLElement>(".descriptive-card > .row > .col-12")]
    .filter(panel => {
      const bounds = panel.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < viewport.innerHeight;
    });
  const animations = reducedMotion ? [] : panels.map(panel => {
    const from = panel.getBoundingClientRect().left < viewport.innerWidth / 2 ? "-100%" : "100%";
    return panel.animate([
      { transform: `translate3d(${from}, 0, 0)` },
      { transform: "translate3d(0, 0, 0)" },
    ], { duration: MARKET_PANELS_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" });
  });
  // One timeline timestamp keeps opposite sides exactly synchronized.
  const start = doc.timeline.currentTime;
  for (const animation of animations) animation.startTime = start;
  return {
    finished: Promise.all(animations.map(animation => animation.finished)),
    cancel: () => animations.forEach(animation => animation.cancel()),
  };
}
