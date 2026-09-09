import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ModelId } from "../../preferences";
import { GalleryActivateButton } from "./GalleryActivateButton";

export interface GalleryDetailState {
  phase: "closed" | "open" | "closing";
  project: string;
  title: string;
  poster?: string;
  smallWindow: boolean;
  navigationEntry?: boolean;
  hasPrevious?: boolean;
  hasNext?: boolean;
}
export interface GalleryDetailBridge {
  video: HTMLVideoElement | null;
  setActive(active: boolean, windowVisible?: boolean): void;
  subscribe(listener: (state: GalleryDetailState) => void): () => void;
  closeWindow(): void;
  navigate(direction: -1 | 1): boolean;
  back(): void;
  geometry(): { left: number; top: number; width: number; height: number; backBottom: number; backHeight: number } | null;
}

export function GalleryDetailOverlay({ bridge, detail, portal, onBack, modelId, activeModelId, onActivate, onNavigate, switching, navigationError }: {
  bridge: GalleryDetailBridge;
  detail: GalleryDetailState;
  portal: Element;
  onBack: () => void;
  modelId: ModelId | null;
  activeModelId: ModelId | null;
  onActivate: (modelId: ModelId) => void;
  onNavigate: (direction: -1 | 1) => void;
  switching: boolean;
  navigationError: string;
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mediaState, setMediaState] = useState("loading");

  useEffect(() => {
    let frame = 0;
    const position = () => {
      const geometry = bridge.geometry();
      if (geometry && windowRef.current) Object.assign(windowRef.current.style, {
        left: `${geometry.left}px`, top: `${geometry.top}px`,
        width: `${geometry.width}px`, height: `${geometry.height}px`,
      });
      if (geometry && actionsRef.current) Object.assign(actionsRef.current.style, {
        bottom: `${geometry.backBottom}px`,
        "--back-height": `${Math.max(44, geometry.backHeight)}px`,
      });
      frame = requestAnimationFrame(position);
    };
    position();
    return () => cancelAnimationFrame(frame);
  }, [bridge]);

  useEffect(() => {
    if (!detail.smallWindow) return;
    const video = bridge.video, canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!video || !canvas || !context) return;
    let stopped = false, callback = 0, fallback = 0;
    setMediaState("loading");
    const drawSource = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number) => {
      const ratio = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
      const width = canvas.width / ratio, height = canvas.height / ratio;
      context.drawImage(source, (sourceWidth - width) / 2, (sourceHeight - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
    };
    const poster = new Image();
    poster.onload = () => {
      if (stopped || video.readyState >= 2 || video.error) return;
      drawSource(poster, poster.naturalWidth, poster.naturalHeight);
      setMediaState("poster");
    };
    if (detail.poster) poster.src = detail.poster;
    const draw = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        drawSource(video, video.videoWidth, video.videoHeight);
        canvas.dataset.videoTime = String(video.currentTime);
        setMediaState("ready");
      }
      if (typeof video.requestVideoFrameCallback === "function") callback = video.requestVideoFrameCallback(draw);
      else fallback = window.setTimeout(draw, 1000 / 30);
    };
    const failed = () => setMediaState("error");
    video.addEventListener("error", failed);
    if (video.error) failed();
    draw();
    return () => {
      stopped = true;
      poster.onload = null;
      if (callback) video.cancelVideoFrameCallback(callback);
      window.clearTimeout(fallback);
      video.removeEventListener("error", failed);
      // The room owns playback. Closing the mirror never pauses its shared source.
    };
  }, [bridge, detail]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('.demo-app-shell__brand-navigation[data-open="true"]')) onBack();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onBack]);

  return createPortal(
    <div className="gallery-detail" data-phase={detail.phase} data-project={detail.project} data-switching={switching} data-navigation-entry={detail.navigationEntry}>
      <div className="gallery-detail__content">
        {detail.smallWindow ? <div className="gallery-detail__window" ref={windowRef} key={detail.project}>
          <canvas aria-label={`${detail.title} video preview`} className="gallery-detail__video" data-media-state={mediaState} height={576} ref={canvasRef} role="img" width={960} />
          {mediaState === "loading" || mediaState === "error" ? <span className="gallery-detail__status" role="status">{mediaState === "error" ? "Video unavailable" : "Loading video"}</span> : null}
          <button aria-label="Close video window" className="gallery-detail__control gallery-detail__close" disabled={detail.phase !== "open" || switching} onClick={() => { bridge.closeWindow(); backRef.current?.focus(); }} type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div> : null}
        <div className="gallery-detail__actions" ref={actionsRef}>
          {modelId ? <GalleryActivateButton
            key={detail.project}
            modelId={modelId}
            activated={activeModelId === modelId}
            enabled={detail.phase === "open" && !switching}
            onActivate={onActivate}
          /> : null}
          <button aria-label="Back to Gallery cards" className="gallery-detail__control gallery-detail__back" disabled={detail.phase !== "open" || switching} onClick={onBack} ref={backRef} type="button">
            <svg viewBox="0 0 48 24" aria-hidden="true"><path d="M43 12H5m8-8-8 8 8 8" /></svg>
          </button>
        </div>
      </div>
      <button aria-label="Previous character" className="gallery-detail__step gallery-detail__step--previous" disabled={detail.phase !== "open" || switching || !detail.hasPrevious} onClick={() => onNavigate(-1)} type="button">
        <svg viewBox="0 0 32 64" aria-hidden="true"><path d="M24 8 12 32 24 56" /></svg>
      </button>
      <button aria-label="Next character" className="gallery-detail__step gallery-detail__step--next" disabled={detail.phase !== "open" || switching || !detail.hasNext} onClick={() => onNavigate(1)} type="button">
        <svg viewBox="0 0 32 64" aria-hidden="true"><path d="m8 8 12 24-12 24" /></svg>
      </button>
      {navigationError ? <span className="gallery-detail__status" role="alert">{navigationError}</span> : null}
    </div>, portal,
  );
}
