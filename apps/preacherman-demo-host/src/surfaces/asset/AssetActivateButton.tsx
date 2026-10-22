import { avatarModelName } from "@preacherman/avatar-renderer";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ModelId } from "../../preferences";
import "./asset-activation.css";

const HOLD_MS = 1600;
type HoldInput = { kind: "pointer"; id: number } | { kind: "key"; key: string };

export function AssetActivateButton({ modelId, activated, enabled, onActivate }: {
  modelId: ModelId; activated: boolean; enabled: boolean; onActivate: (modelId: ModelId) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HoldInput | null>(null);
  const frame = useRef(0);
  const [holding, setHolding] = useState(false);
  const hintId = useId();
  const name = avatarModelName(modelId);
  const label = activated ? "Activated" : "Activate";

  const cancel = useCallback(() => {
    const previous = input.current;
    input.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setHolding(false);
    button.current?.style.setProperty("--asset-charge", "0");
    if (previous?.kind === "pointer" && button.current?.hasPointerCapture(previous.id)) button.current.releasePointerCapture(previous.id);
  }, []);

  const start = (source: HoldInput) => {
    if (!enabled || input.current) return;
    input.current = source;
    setHolding(true);
    const started = performance.now();
    const tick = (now: number) => {
      if (!input.current) return;
      const progress = Math.min((now - started) / HOLD_MS, 1);
      // Gentle resistance at first; the fill then accelerates equally to both edges.
      button.current?.style.setProperty("--asset-charge", String(progress ** 2.4));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else { cancel(); onActivate(modelId); }
    };
    frame.current = requestAnimationFrame(tick);
  };

  useLayoutEffect(() => { cancel(); }, [enabled, activated, modelId, cancel]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frame.current);
      input.current = null;
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [cancel]);

  return <>
    <button ref={button} type="button" className="asset-activate" disabled={!enabled}
      aria-label={activated ? `Hold to deactivate ${name}` : `Hold to activate ${name}`} aria-pressed={activated} aria-describedby={hintId}
      data-activated={activated} data-charging={holding} onBlur={cancel} onContextMenu={event => event.preventDefault()}
      onClick={event => event.preventDefault()}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || input.current) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        start({ kind: "pointer", id: event.pointerId });
      }}
      onPointerUp={event => { if (input.current?.kind === "pointer" && input.current.id === event.pointerId) cancel(); }}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={cancel}
      onPointerMove={event => {
        if (input.current?.kind !== "pointer") return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
      }}
      onKeyDown={event => {
        if (event.key === "Escape") { cancel(); return; }
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start({ kind: "key", key: event.key });
      }}
      onKeyUp={event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (input.current?.kind === "key" && input.current.key === event.key) cancel();
      }}>
      <span className="asset-activate__label">{label}</span>
      <span className="asset-activate__charge" aria-hidden="true">{label}</span>
    </button>
    <span id={hintId} className="asset-activate__assistive">Hold for 1.6 seconds to {activated ? "hide this desktop companion" : "apply this desktop companion"}. Release or move away to cancel.</span>
    <span className="asset-activate__assistive" aria-live="polite">{activated ? `${name} activated.` : ""}</span>
  </>;
}
