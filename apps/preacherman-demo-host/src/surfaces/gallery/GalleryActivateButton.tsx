import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ModelId } from "../../preferences";

export const GALLERY_ACTIVATION_HOLD_MS = 1600;

export function GalleryActivateButton({ modelId, activated, enabled, onActivate }: {
  modelId: ModelId;
  activated: boolean;
  enabled: boolean;
  onActivate: (modelId: ModelId) => void;
}) {
  const [holding, setHolding] = useState(false);
  const inputRef = useRef<string | null>(null);
  const cancel = () => { inputRef.current = null; setHolding(false); };
  const start = (input: string) => {
    if (!enabled || activated || inputRef.current) return;
    inputRef.current = input;
    setHolding(true);
  };

  useEffect(() => {
    if (!holding || !enabled || activated) return;
    const timer = window.setTimeout(() => {
      inputRef.current = null;
      setHolding(false);
      onActivate(modelId);
    }, GALLERY_ACTIVATION_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [holding, enabled, activated, modelId, onActivate]);

  useEffect(() => {
    if (!enabled || activated) cancel();
  }, [enabled, activated]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  return <>
    <button
      aria-describedby="gallery-activate-hint"
      aria-label={activated ? "Cortana activated" : "Hold to activate Cortana"}
      aria-disabled={!enabled || activated}
      className="gallery-detail__activate"
      data-activated={activated}
      data-charging={holding && enabled && !activated}
      onBlur={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        start("pointer");
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onPointerLeave={cancel}
      onPointerMove={(event) => {
        if (inputRef.current !== "pointer") return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start(event.key);
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        cancel();
      }}
      style={{ "--activation-duration": `${GALLERY_ACTIVATION_HOLD_MS}ms` } as CSSProperties}
      type="button"
    >
      <span className="gallery-detail__activate-label">{activated ? "Activated" : "Activate"}</span>
      <svg aria-hidden="true" className="gallery-detail__charge" viewBox="0 0 204 62" fill="none">
        {[
          "M102 1H173A30 30 0 0 1 173 61H102",
          "M102 1H31A30 30 0 0 0 31 61H102",
        ].map((path) => <path className="gallery-detail__charge-pulse" d={path} key={path} pathLength="100" />)}
      </svg>
    </button>
    <span className="gallery-detail__assistive" id="gallery-activate-hint">
      {activated ? "This avatar is currently applied." : "Hold for 1.6 seconds to apply this avatar. Release or move away to cancel."}
    </span>
    <span aria-live="polite" className="gallery-detail__assistive">{activated ? "Cortana activated" : ""}</span>
  </>;
}
