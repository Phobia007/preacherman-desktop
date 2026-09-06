import { useEffect, useRef, useState } from "react";
import { MarketProfile } from "./MarketProfile";
import "./market-surface.css";

/** The imported document owns its layout; the host only supplies the stage. */
export function MarketSurface() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<"intro" | "configurator">("intro");
  const [profileOpen, setProfileOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    frameRef.current?.toggleAttribute("inert", profileOpen);
  }, [profileOpen, attempt]);

  useEffect(() => {
    setStatus("loading");
    const deadline = window.setTimeout(() => setStatus("error"), 30000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "preacherman.market.page") {
        setPage(event.data.page === "configurator" ? "configurator" : "intro");
        setProfileOpen(false);
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
    <section aria-label="Market" className="market-surface" data-status={status} data-page={page}>
      {page === "intro" && <MarketProfile open={profileOpen} onOpenChange={setProfileOpen} />}
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
