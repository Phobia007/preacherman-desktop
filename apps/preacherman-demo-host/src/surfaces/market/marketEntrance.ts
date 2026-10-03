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
  return animateColumns(panels, doc, reducedMotion, direction);
}

function animateColumns(panels: HTMLElement[], doc: Document, reducedMotion: boolean, direction: "in" | "out") {
  const viewport = doc.defaultView!;
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

/** Reveal one continuous blur through two moving edges; no independently filtered seam. */
export function animateMarketFrost(layer: HTMLElement, reducedMotion: boolean, direction: "in" | "out" = "in") {
  const frames = [
    { clipPath: "polygon(0% 0%, 0% 100%, 0% 100%, 0% 0%, 100% 0%, 100% 100%, 100% 100%, 100% 0%)" },
    { clipPath: "polygon(0% 0%, 0% 100%, 50% 100%, 50% 0%, 50% 0%, 50% 100%, 100% 100%, 100% 0%)" },
  ];
  const animation = reducedMotion ? undefined : layer.animate(direction === "out" ? frames.reverse() : frames, {
    duration: MARKET_PANELS_MS,
    easing: direction === "out" ? "cubic-bezier(0.7, 0, 0.84, 0)" : "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both",
  });
  if (animation) animation.startTime = layer.ownerDocument.timeline.currentTime;
  return { finished: animation?.finished ?? Promise.resolve(), cancel: () => animation?.cancel() };
}

export function animateMarketPage(doc: Document, layer: HTMLElement, reducedMotion: boolean, direction: "in" | "out" = "in") {
  const motions = [animateMarketPanels(doc, reducedMotion, direction), animateMarketFrost(layer, reducedMotion, direction)];
  return { finished: Promise.all(motions.map(motion => motion.finished)), cancel: () => motions.forEach(motion => motion.cancel()) };
}

export const MARKET_CATEGORY_MS = 420;
const FROST_EMPTY = "polygon(0% 0%, 0% 100%, 0% 100%, 0% 0%, 100% 0%, 100% 100%, 100% 100%, 100% 0%)";
const FROST_FULL = "polygon(0% 0%, 0% 100%, 50% 100%, 50% 0%, 50% 0%, 50% 100%, 100% 100%, 100% 0%)";
export type MarketCategoryFrame = { clipPath: string; panels: Map<HTMLElement, string> };

/** Category clicks can reverse the current pose without replaying the page entrance. */
export function animateMarketCategory(doc: Document, layer: HTMLElement, reducedMotion: boolean, discover: boolean, direction: "in" | "out", from?: MarketCategoryFrame) {
  const viewport = doc.defaultView!;
  const panels = discover ? [...doc.querySelectorAll<HTMLElement>(".descriptive-card > .row > .col-12")].filter(panel => {
    const bounds = panel.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < viewport.innerHeight;
  }) : [];
  const clipPath = from?.clipPath ?? (direction === "out" ? FROST_FULL : FROST_EMPTY);
  const coverage = Math.max(0, Math.min(1, parseFloat(clipPath.split(",")[2]) / 50));
  const remaining = direction === "out" ? coverage : 1 - coverage;
  const options: KeyframeAnimationOptions = {
    duration: Math.max(100, MARKET_CATEGORY_MS * remaining),
    easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both",
  };
  const animations = reducedMotion ? [] : [layer.animate([
    { clipPath }, { clipPath: direction === "out" ? FROST_EMPTY : FROST_FULL },
  ], options), ...panels.map(panel => {
    const outside = `translate3d(${panel.getBoundingClientRect().left < viewport.innerWidth / 2 ? "-100%" : "100%"}, 0, 0)`;
    return panel.animate([
      { transform: from?.panels.get(panel) ?? (direction === "out" ? "translate3d(0, 0, 0)" : outside) },
      { transform: direction === "out" ? outside : "translate3d(0, 0, 0)" },
    ], options);
  })];
  // The iframe and host have different timeline origins after a delayed route entry.
  animations.forEach((animation, index) => { animation.startTime = (index === 0 ? layer.ownerDocument : doc).timeline.currentTime; });
  return {
    finished: Promise.all(animations.map(animation => animation.finished)),
    capture: (): MarketCategoryFrame => {
      const currentClip = layer.ownerDocument.defaultView!.getComputedStyle(layer).clipPath;
      return {
        clipPath: currentClip === "none" ? FROST_FULL : currentClip,
        panels: new Map(panels.map(panel => [panel, viewport.getComputedStyle(panel).transform])),
      };
    },
    cancel: () => animations.forEach(animation => animation.cancel()),
  };
}

export const marketCategories = ["Discover", "Browse", "Brain", "Studio", "Search"] as const;
export type MarketCategory = typeof marketCategories[number];
export const marketCategoryLabels: Record<MarketCategory, string> = {
  Discover: "Official Collection",
  Browse: "Craft Market",
  Brain: "Brain",
  Studio: "Studio",
  Search: "Search",
};
export type MarketCategoryState = { active: MarketCategory; next: MarketCategory | null; phase: "idle" | "exiting" | "entering" };
export const initialMarketCategory: MarketCategoryState = { active: "Discover", next: null, phase: "idle" };
export function marketCategoryReducer(state: MarketCategoryState, action: { type: "select"; category: MarketCategory } | { type: "exited" | "entered" }): MarketCategoryState {
  if (action.type === "select") {
    if (action.category === (state.next ?? state.active)) return state;
    if (state.phase === "exiting" && action.category === state.active) return { ...state, next: null, phase: "entering" };
    return { ...state, next: action.category, phase: "exiting" };
  }
  if (action.type === "exited" && state.phase === "exiting" && state.next) return { active: state.next, next: null, phase: "entering" };
  if (action.type === "entered" && state.phase === "entering") return { ...state, phase: "idle" };
  return state;
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
