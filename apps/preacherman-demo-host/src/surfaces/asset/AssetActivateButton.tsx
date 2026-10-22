import { avatarModelName } from "@preacherman/avatar-renderer";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ModelId } from "../../preferences";
import "./asset-activation.css";

const HOLD_MS = 1600;
const CONFIRM_MS = 720;
type HoldInput = { kind: "pointer"; id: number } | { kind: "key"; key: string };
type Phase = "idle" | "charging" | "releasing" | "confirmed";

export function AssetActivateButton({ modelId, activated, enabled, onActivate }: {
  modelId: ModelId; activated: boolean; enabled: boolean; onActivate: (modelId: ModelId) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HoldInput | null>(null);
  const frame = useRef(0);
  const elapsed = useRef(0);
  const confirming = useRef(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout>>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [displayedActivated, setDisplayedActivated] = useState(activated);
  const hintId = useId();
  const name = avatarModelName(modelId);
  const label = displayedActivated ? "Activated" : "Activate";

  const releasePointer = useCallback((previous: HoldInput | null) => {
    if (previous?.kind === "pointer" && button.current?.hasPointerCapture(previous.id)) button.current.releasePointerCapture(previous.id);
  }, []);

  const cancel = useCallback(() => {
    const previous = input.current;
    if (!previous) return;
    input.current = null;
    cancelAnimationFrame(frame.current);
    releasePointer(previous);
    const from = elapsed.current;
    const started = performance.now();
    setPhase("releasing");
    const rewind = (now: number) => {
      // Retrace exactly the same charge curve and elapsed time, without a jump.
      elapsed.current = Math.max(0, from - (now - started));
      button.current?.style.setProperty("--asset-charge", String((elapsed.current / HOLD_MS) ** 2.4));
      if (elapsed.current > 0) frame.current = requestAnimationFrame(rewind);
      else { frame.current = 0; setPhase("idle"); }
    };
    frame.current = requestAnimationFrame(rewind);
  }, [releasePointer]);

  const start = (source: HoldInput) => {
    if (!enabled || input.current || confirming.current) return false;
    cancelAnimationFrame(frame.current);
    input.current = source;
    setPhase("charging");
    const from = elapsed.current;
    const started = performance.now();
    const tick = (now: number) => {
      if (!input.current) return;
      elapsed.current = Math.min(from + now - started, HOLD_MS);
      const progress = elapsed.current / HOLD_MS;
      // Gentle resistance at first; the fill then accelerates equally to both edges.
      button.current?.style.setProperty("--asset-charge", String(progress ** 2.4));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else {
        const previous = input.current;
        input.current = null;
        frame.current = 0;
        elapsed.current = 0;
        confirming.current = true;
        setPhase("confirmed");
        releasePointer(previous);
        onActivate(modelId);
        confirmationTimer.current = setTimeout(() => {
          confirming.current = false;
          button.current?.style.setProperty("--asset-charge", "0");
          setDisplayedActivated(!activated);
          setPhase("idle");
        }, CONFIRM_MS);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return true;
  };

  useLayoutEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);
  useLayoutEffect(() => { if (!confirming.current) setDisplayedActivated(activated); }, [activated]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(confirmationTimer.current);
      input.current = null;
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [cancel]);

  return <>
    <button ref={button} type="button" className="asset-activate" disabled={!enabled}
      aria-label={activated ? `Hold to deactivate ${name}` : `Hold to activate ${name}`} aria-pressed={activated} aria-describedby={hintId}
      data-activated={activated} data-phase={phase} aria-busy={phase === "confirmed"} onBlur={cancel} onContextMenu={event => event.preventDefault()}
      onClick={event => event.preventDefault()}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || input.current) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        if (start({ kind: "pointer", id: event.pointerId })) event.currentTarget.setPointerCapture(event.pointerId);
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
      <svg className="asset-activate__ring" viewBox="0 0 160 54" aria-hidden="true">
        <path pathLength="100" d="M27 1h106a26 26 0 0 1 0 52H27a26 26 0 0 1 0-52Z" />
      </svg>
      <svg className="asset-activate__check" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="m5 12 4.5 4.5L19 7" /></svg>
    </button>
    <span id={hintId} className="asset-activate__assistive">Hold for 1.6 seconds to {activated ? "hide this desktop companion" : "apply this desktop companion"}. Release or move away to cancel.</span>
    <span className="asset-activate__assistive" aria-live="polite">{activated ? `${name} activated.` : ""}</span>
  </>;
}
