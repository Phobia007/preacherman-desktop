import { useEffect, useRef, useState } from "react";
import { MarketProfile } from "./MarketProfile";
import { animateMarketPanels, MARKET_LOGO_MS } from "./marketEntrance";
import "./market-surface.css";

/** The imported document owns its layout; the host only supplies the stage. */
export function MarketSurface() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const entranceStarted = useRef(false);
  const [logoReady, setLogoReady] = useState(false);
  const [entrance, setEntrance] = useState<"logo" | "panels" | "complete">("logo");
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<"intro" | "configurator">("intro");
  const [profileOpen, setProfileOpen] = useState(false);
  const [lensActive, setLensActive] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    frameRef.current?.toggleAttribute("inert", profileOpen || lensActive || entrance !== "complete");
  }, [profileOpen, lensActive, attempt, entrance]);

  useEffect(() => {
    let disposed = false;
    let animation: Animation | undefined;
    const logo = surfaceRef.current?.querySelector<HTMLElement>(".market-profile__toggle");
    if (!logo) return;
    void document.fonts.load('38px "Market Task Signature"').then(async () => {
      if (disposed) return;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        animation = logo.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: MARKET_LOGO_MS, easing: "ease-out", fill: "both",
        });
        await animation.finished;
      }
      if (!disposed) setLogoReady(true);
    }).catch(() => { if (!disposed) setLogoReady(true); });
    return () => { disposed = true; animation?.cancel(); };
  }, []);

  useEffect(() => {
    if (!logoReady || status !== "ready" || entranceStarted.current) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let disposed = false;
    let motion: ReturnType<typeof animateMarketPanels> | undefined;
    const portrait = doc.querySelector<HTMLImageElement>(".descriptive-card img");
    void Promise.all([portrait?.decode().catch(() => {}), doc.fonts.ready]).then(async () => {
      if (disposed) return;
      entranceStarted.current = true;
      motion = animateMarketPanels(doc, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setEntrance("panels");
      await motion.finished;
      if (!disposed) { setEntrance("complete"); motion.cancel(); }
    }).catch(() => { if (!disposed) setEntrance("complete"); });
    return () => { disposed = true; motion?.cancel(); };
  }, [logoReady, status, attempt]);

  useEffect(() => {
    setStatus("loading");
    const deadline = window.setTimeout(() => setStatus("error"), 30000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "preacherman.market.page") {
        setPage(event.data.page === "configurator" ? "configurator" : "intro");
        setProfileOpen(false);
        setLensActive(false);
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
  }, [attempt]);

  return (
    <section ref={surfaceRef} aria-label="Market" className="market-surface" data-entrance={entrance} data-logo-ready={logoReady} data-status={status} data-page={page} data-lens-active={lensActive}>
      {page === "intro" && <MarketProfile disabled={entrance !== "complete"} open={profileOpen} onOpenChange={setProfileOpen} frameRef={frameRef} onLensActiveChange={setLensActive} />}
      <iframe
        className="market-surface__frame"
        key={attempt}
        ref={frameRef}
        referrerPolicy="no-referrer"
        src="/market-love/cartier-love.html"
        title="Market — Cartier LOVE experience"
        onError={() => setStatus("error")}
      />
      {status !== "ready" && (
        <div className="market-surface__status" role={status === "error" ? "alert" : "status"}>
          {status === "loading" ? "Opening Market…" : (
            <>
              <p>Market could not open.</p>
              <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
