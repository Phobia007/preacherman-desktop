import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GalleryDetailOverlay, type GalleryDetailBridge, type GalleryDetailState } from "./GalleryDetailOverlay";
import { useExecutionFrameBridge } from "../../execution/useExecutionFrameBridge";

import "./active-theory-gallery-surface.css";

const gallerySource = "/active-theory-gallery/gallery/work.html";

export function ActiveTheoryGallerySurface({ active = true, onDetailChange }: {
  readonly active?: boolean;
  readonly onDetailChange?: (open: boolean) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useExecutionFrameBridge(frameRef);
  const [loaded, setLoaded] = useState(false);
  const [bridge, setBridge] = useState<GalleryDetailBridge>();
  const [detail, setDetail] = useState<GalleryDetailState>({ phase: "closed", project: "", title: "", smallWindow: true });
  const [portal, setPortal] = useState<Element | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const frame = frameRef.current?.contentWindow as (Window & { PreachermanGalleryDetail?: GalleryDetailBridge }) | null;
    const api = frame?.PreachermanGalleryDetail;
    if (!api) return;
    setBridge(api);
    setPortal(frameRef.current?.closest(".demo-app-shell") ?? null);
    return api.subscribe(setDetail);
  }, [loaded]);
  useLayoutEffect(() => {
    // Restore rail compositing before the first exit frame, not after its tween.
    // The overlay may keep fading while the companion is already back in the rail.
    onDetailChange?.(active && detail.phase === "open");
  }, [active, detail.phase, onDetailChange]);
  const back = useCallback(() => { bridge?.back(); frameRef.current?.focus({ preventScroll: true }); }, [bridge]);

  return (
    <section
      aria-busy={!loaded}
      aria-label="Gallery"
      className="active-theory-gallery-surface"
      data-loaded={loaded ? "true" : "false"}
    >
      {portal && bridge && active && detail.phase !== "closed" ? <GalleryDetailOverlay bridge={bridge} detail={detail} portal={portal} onBack={back} /> : null}
      <iframe
        ref={frameRef}
        className="active-theory-gallery-surface__frame"
        onLoad={() => setLoaded(true)}
        src={gallerySource}
        title="Preacherman Gallery"
      />
      {!loaded ? (
        <p aria-live="polite" className="active-theory-gallery-surface__status" role="status">
          Loading gallery
        </p>
      ) : null}
    </section>
  );
}
