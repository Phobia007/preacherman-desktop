import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./extension-marketplace.css";

const pages = ["marketplace-agents.html", "claude-marketplace.html", "marketplace-home.html"] as const;
type MarketplacePage = typeof pages[number];

export function ExtensionMarketplace() {
  const frames = useRef<Partial<Record<MarketplacePage, HTMLIFrameElement>>>({});
  const [active, setActive] = useState<MarketplacePage>(pages[0]);
  const [requested, setRequested] = useState<MarketplacePage>(pages[0]);
  const [mounted, setMounted] = useState<MarketplacePage[]>([pages[0]]);
  const [loaded, setLoaded] = useState<Partial<Record<MarketplacePage, boolean>>>({});
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const ready = Boolean(loaded[active]);
  const destinationReady = Boolean(loaded[requested]);

  // Prewarm one local document at a time, after the current document is usable.
  useEffect(() => {
    if (!ready || mounted.some(page => !loaded[page])) return;
    const next = pages.find(page => !mounted.includes(page));
    if (!next) return;
    const timer = window.setTimeout(() => setMounted(current => current.includes(next) ? current : [...current, next]), 250);
    return () => window.clearTimeout(timer);
  }, [ready, loaded, mounted]);

  useEffect(() => {
    if (requested === active) { setPhase("idle"); return; }
    setMounted(current => current.includes(requested) ? current : [...current, requested]);
    if (!destinationReady) return;
    let cancelled = false;
    const frame = frames.current[active];
    setPhase("leaving");
    const animation = frame?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 140,
      easing: "ease-out", fill: "forwards",
    });
    void (animation?.finished ?? Promise.resolve()).then(() => {
      if (!cancelled) { setActive(requested); setError(""); }
    }).catch(() => {});
    return () => { cancelled = true; animation?.cancel(); };
  }, [active, requested, destinationReady]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frames.current[active]?.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type === "preacherman-extension-route" && pages.includes(event.data.page)) {
        setRequested(event.data.page); return;
      }
      if (event.data?.type !== "preacherman-extension-external") return;
      const href = event.data.href;
      if (typeof href !== "string" || !/^(https?:|mailto:)/i.test(href)) return;
      void openUrl(href).catch(() => setError("Could not open the link. Please try again."));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [active]);
  return <section className="extension-marketplace" aria-label="Extension marketplace" aria-busy={!ready} data-page={active} data-phase={phase}>
    {mounted.map(page => <iframe key={page} ref={element => {
      if (element) { frames.current[page] = element; element.toggleAttribute("inert", page !== active); }
      else delete frames.current[page];
    }} className="extension-marketplace__frame" title={`Extension marketplace: ${page}`} src={`/extension-marketplace/${page}`}
      data-active={page === active} aria-hidden={page !== active} tabIndex={page === active ? 0 : -1}
      onLoad={() => setLoaded(current => ({ ...current, [page]: true }))}
      onError={() => { if (page === active || page === requested) setError("The marketplace could not load."); }} />)}
    {!ready && !error && <p className="extension-marketplace__status" role="status">Loading extensions…</p>}
    {error && <p className="extension-marketplace__status" role="alert">{error}</p>}
  </section>;
}
