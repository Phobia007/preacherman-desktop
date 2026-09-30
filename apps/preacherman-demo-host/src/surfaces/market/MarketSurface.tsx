import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { MarketProfile } from "./MarketProfile";
import { animateMarketPage, animateMarketFrost, marketCategories, marketCategoryReducer, initialMarketCategory, MARKET_LOGO_MS, type MarketDetailsPhase } from "./marketEntrance";
import "./market-surface.css";
import { isAvatarModelId, createAvatarAssetUrls, prefetchAvatarModel } from "@preacherman/avatar-renderer";
import type { ModelId } from "../../preferences";
import { localAvatarAssetBaseUrl } from "../../avatar/avatarAssets";
import { galleryModelBindings } from "../gallery/galleryModelBindings";
const marketModelIds: readonly ModelId[] = Object.values(galleryModelBindings);
import { MarketDetails, captureMarketDetails } from "./MarketDetails";

/** The imported document owns its layout; the host only supplies the stage. */
export function MarketSurface() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const frostRef = useRef<HTMLDivElement>(null);
  const [category, dispatchCategory] = useReducer(marketCategoryReducer, initialMarketCategory);
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const entranceStarted = useRef(false);
  const [logoReady, setLogoReady] = useState(false);
  const [entrance, setEntrance] = useState<"logo" | "panels" | "complete">("logo");
  const [attempt, setAttempt] = useState(0);
  const [selectedModel, setSelectedModel] = useState<ModelId | null>(null);
  const openingModel = useRef<ModelId | null>(null);
  const [detailsPhase, setDetailsPhase] = useState<MarketDetailsPhase>("idle");
  const detailsRef = useRef<HTMLElement>(null);
  const detailsPhaseRef = useRef(detailsPhase);
  detailsPhaseRef.current = detailsPhase;
  const page = selectedModel && detailsPhase !== "exiting" && detailsPhase !== "returning" ? "details" : "intro";
  const [profileOpen, setProfileOpen] = useState(false);
  const [lensActive, setLensActive] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const finishDetailsClose = useCallback(() => {
    openingModel.current = null;
    setDetailsPhase("idle");
    setSelectedModel(null); setProfileOpen(false); setLensActive(false);
    requestAnimationFrame(() => frameRef.current?.contentDocument?.querySelector<HTMLElement>("[data-market-return-focus]")?.focus({ preventScroll: true }));
  }, []);
  const closeDetails = useCallback(() => {
    const phase = detailsPhaseRef.current;
    if (["hide-content", "hide-model", "unfrost", "returning"].includes(phase)) return;
    if (phase === "complete") setDetailsPhase("hide-content");
    else finishDetailsClose(); // Escape can still cancel an unfinished entrance.
  }, [finishDetailsClose]);
  const advanceDetailsReveal = useCallback(() => setDetailsPhase(current => {
    if (current === "model") return "content";
    if (current === "content") return "complete";
    if (current === "hide-content") return "hide-model";
    if (current === "hide-model") return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "returning" : "unfrost";
    return current;
  }), []);
  const captureDetails = useCallback((signal: AbortSignal) => {
    if (!detailsRef.current) return Promise.reject(new Error("Details are not ready."));
    return captureMarketDetails(detailsRef.current, signal);
  }, []);
  const captureEmptyCategory = useCallback(async (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException("Capture cancelled", "AbortError");
    const canvas = document.createElement("canvas");
    canvas.width = surfaceRef.current!.clientWidth;
    canvas.height = surfaceRef.current!.clientHeight;
    return canvas;
  }, []);

  useLayoutEffect(() => {
    if (category.phase === "idle" || !frostRef.current || !frameRef.current?.contentDocument) return;
    let disposed = false;
    const direction = category.phase === "exiting" ? "out" : "in";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = category.active === "Discover"
      ? animateMarketPage(frameRef.current.contentDocument, frostRef.current, reduced, direction)
      : animateMarketFrost(frostRef.current, reduced, direction);
    void motion.finished.then(() => {
      if (!disposed) dispatchCategory({ type: category.phase === "exiting" ? "exited" : "entered" });
    }).catch(() => { /* Leaving Market cancels the pending category transition. */ });
    return () => { disposed = true; motion.cancel(); };
  }, [category]);

  useEffect(() => {
    frameRef.current?.toggleAttribute("inert", Boolean(selectedModel) || profileOpen || lensActive || category.active !== "Discover" || category.phase !== "idle");
  }, [selectedModel, profileOpen, lensActive, attempt, category]);

  useEffect(() => {
    if (!selectedModel) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = animateMarketPage(doc, frostRef.current!, reduced, "out");
    void motion.finished.then(() => {
      if (disposed) return;
      setDetailsPhase(reduced ? "model" : "frost");
    }).catch(() => { /* Closing or leaving Market cancels the complete sequence. */ });
    return () => { disposed = true; motion.cancel(); };
  }, [selectedModel]);

  useEffect(() => {
    if (detailsPhase !== "returning") return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let disposed = false;
    // The exit animation still holds the columns offscreen until this return finishes.
    const motion = animateMarketPage(doc, frostRef.current!, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    void motion.finished.then(() => { if (!disposed) finishDetailsClose(); })
      .catch(() => { /* Route changes cancel the return without restoring stale focus. */ });
    return () => { disposed = true; motion.cancel(); };
  }, [detailsPhase, finishDetailsClose]);

  useEffect(() => {
    let disposed = false;
    let animation: Animation | undefined;
    let fontDeadline: ReturnType<typeof setTimeout>;
    const logo = surfaceRef.current?.querySelector<HTMLElement>(".market-profile__toggle");
    if (!logo) return;
    // Font readiness may lag on a cold launch; it must never hold the page inert.
    void Promise.race([
      document.fonts.load('38px "Market Task Signature"'),
      new Promise<void>(resolve => { fontDeadline = setTimeout(resolve, 250); }),
    ]).then(async () => {
      clearTimeout(fontDeadline);
      if (disposed) return;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        animation = logo.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: MARKET_LOGO_MS, easing: "ease-out", fill: "both",
        });
        await animation.finished;
      }
      if (!disposed) setLogoReady(true);
    }).catch(() => { clearTimeout(fontDeadline); if (!disposed) setLogoReady(true); });
    return () => { disposed = true; clearTimeout(fontDeadline); animation?.cancel(); };
  }, []);

  useEffect(() => {
    if (!logoReady || status !== "ready" || entranceStarted.current) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let disposed = false;
    let motion: ReturnType<typeof animateMarketPage> | undefined;
    // Layout is ready at the embed handshake. Images and fonts load independently
    // while native scrolling remains available throughout the panel animation.
    entranceStarted.current = true;
    motion = animateMarketPage(doc, frostRef.current!, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setEntrance("panels");
    void motion.finished.then(() => {
      if (!disposed) { setEntrance("complete"); motion?.cancel(); }
    }).catch(() => { if (!disposed) setEntrance("complete"); });
    return () => { disposed = true; motion?.cancel(); };
  }, [logoReady, status, attempt]);

  useEffect(() => {
    setStatus("loading");
    const deadline = window.setTimeout(() => setStatus("error"), 30000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "preacherman.market.page") {
        if (event.data.page === "intro") closeDetails();
        setProfileOpen(false);
        setLensActive(false);
      }
      if (event.data?.type === "preacherman.market.details" || event.data?.type === "preacherman.market.prefetch") {
        if (categoryRef.current.active !== "Discover" || categoryRef.current.phase !== "idle") return;
        const modelId = event.data.modelId;
        if (!isAvatarModelId(modelId) || !marketModelIds.includes(modelId)) return;
        if (event.data.type === "preacherman.market.prefetch") {
          void prefetchAvatarModel(createAvatarAssetUrls(localAvatarAssetBaseUrl(modelId), modelId).model).catch(() => undefined);
        } else {
          if (openingModel.current) return;
          openingModel.current = modelId;
          void prefetchAvatarModel(createAvatarAssetUrls(localAvatarAssetBaseUrl(modelId), modelId).model).catch(() => undefined);
          setDetailsPhase("exiting");
          setSelectedModel(modelId); setProfileOpen(false); setLensActive(false);
        }
      }
      if (event.data?.type === "preacherman.market.ready") {
        window.clearTimeout(deadline);
        setStatus("ready");
      }
      if (event.data?.type === "preacherman.market.error") {
        window.clearTimeout(deadline);
        setStatus("error");
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(deadline);
      window.removeEventListener("message", onMessage);
    };
  }, [attempt, closeDetails]);

  return (
    <section ref={surfaceRef} aria-label="Market" className="market-surface" data-entrance={entrance} data-logo-ready={logoReady} data-status={status} data-page={page} data-details-phase={detailsPhase} data-lens-active={lensActive} data-category={category.active} data-category-phase={category.phase}
      onAnimationEnd={event => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName === "market-details-frost-in") setDetailsPhase(current => current === "frost" ? "model" : current);
        if (event.animationName === "market-details-frost-out") setDetailsPhase(current => current === "unfrost" ? "returning" : current);
      }}>
      <div className="market-surface__frost" ref={frostRef} aria-hidden="true">
        <div className="market-surface__frost-pane" />
        <div className="market-surface__frost-pane" />
      </div>
      <MarketProfile key={`profile-${selectedModel ?? category.active}`} disabled={entrance !== "complete" || category.phase !== "idle" || Boolean(selectedModel && detailsPhase !== "complete")} open={profileOpen} onOpenChange={setProfileOpen}
        frameRef={frameRef} captureSource={selectedModel ? captureDetails : category.active !== "Discover" ? captureEmptyCategory : undefined} onLensActiveChange={setLensActive} />
      <ul className="market-surface__categories" aria-label="Market categories" role="list"
        hidden={page !== "intro" || entrance === "logo" || lensActive}>
        {marketCategories.map(label => <li key={label} className={label === "Inventory" ? "market-surface__inventory" : undefined}>
          <button type="button" aria-pressed={category.active === label} aria-controls={label === "Discover" ? "market-discover-page" : "market-category-page"}
            disabled={entrance !== "complete" || category.phase !== "idle" || Boolean(selectedModel) || profileOpen}
            onClick={() => dispatchCategory({ type: "select", category: label })}>{label}</button>
        </li>)}
      </ul>
      <section id="market-category-page" aria-label={category.active} aria-busy={category.phase !== "idle"} className="market-surface__category-page" hidden={category.active === "Discover"} />
      {selectedModel && <MarketDetails key={selectedModel} modelId={selectedModel} panelRef={detailsRef} lensActive={lensActive} onClose={closeDetails}
        phase={detailsPhase} onRevealComplete={advanceDetailsReveal} />}
      <iframe
        id="market-discover-page"
        className="market-surface__frame"
        hidden={category.active !== "Discover"}
        key={attempt}
        ref={frameRef}
        referrerPolicy="no-referrer"
        src="/market-love/cartier-love.html"
        title="Market — Preacherman avatars"
        onError={() => setStatus("error")}
      />
      {status !== "ready" && (
        <div className="market-surface__status" role={status === "error" ? "alert" : "status"}>
          {status === "loading" ? "Opening Market…" : (
            <>
              <p>Market could not open.</p>
              <button type="button" onClick={() => { entranceStarted.current = false; setEntrance("logo"); setStatus("loading"); setAttempt(value => value + 1); }}>Try again</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
