import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ModelId } from "../../preferences";
import { GalleryActivateButton } from "./GalleryActivateButton";

export interface GalleryRailCard { id: string; title: string; client: string; thumbnail: string; video?: string; logo?: string; color?: string; }
export type GalleryRailInput = { type: "focus"; id: string } | { type: "wheel"; delta: number } | { type: "key"; key: string } | { type: "move" | "down" | "up" | "click"; x: number; y: number };

export interface GalleryDetailState {
  contact?: boolean;
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
  subscribeRail(listener: (cards: GalleryRailCard[]) => void): () => void;
  subscribeInput(listener: (input: GalleryRailInput) => void): () => void;
  setRailCursor(cursor: string): void;
  openProject(id: string): void;
  focusProject(id: string): void;
  previewProject(id: string): void;
  showWork(): void;
  toggleContact(): void;
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
  const backRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const position = () => {
      const geometry = bridge.geometry();
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
    const escape = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape" && !document.querySelector('.demo-app-shell__brand-navigation[data-open="true"]')) onBack();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onBack]);

  return createPortal(
    <div className="gallery-detail" data-phase={detail.phase} data-project={detail.project} data-switching={switching} data-navigation-entry={detail.navigationEntry}>
      <div className="gallery-detail__content">
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
