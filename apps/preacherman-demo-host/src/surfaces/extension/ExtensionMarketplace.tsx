import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./extension-marketplace.css";

export function ExtensionMarketplace() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== location.origin || event.data?.type !== "preacherman-extension-external") return;
      const href = event.data.href;
      if (typeof href !== "string" || !/^(https?:|mailto:)/i.test(href)) return;
      void openUrl(href).catch(() => setError("Could not open the link. Please try again."));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  return <section className="extension-marketplace" aria-label="Extension marketplace" aria-busy={!ready}>
    <iframe ref={frameRef} className="extension-marketplace__frame" title="Extension marketplace" src="/extension-marketplace/marketplace-agents.html"
      onLoad={() => setReady(true)} onError={() => setError("The marketplace could not load.")} />
    {!ready && !error && <p className="extension-marketplace__status" role="status">Loading extensions…</p>}
    {error && <p className="extension-marketplace__status" role="alert">{error}</p>}
  </section>;
}
