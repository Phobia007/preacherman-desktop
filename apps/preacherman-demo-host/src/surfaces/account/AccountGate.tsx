import { useLayoutEffect, useRef } from "react";
import { registerSurfaceMotion } from "../../app-shell/surfaceMotion";
import type { LocalSurfaceType } from "../../demo/screenRoute";
import "./account-gate.css";

/** Empty guide shell requested for this stage; sign-in remains on Account. */
export function AccountGate({ surface, embedded = false }: { surface?: LocalSurfaceType; embedded?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const motion = ref.current.animate(
      [{ opacity: 0, transform: "translateY(-8.8px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 220, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" },
    );
    const unregister = surface ? registerSurfaceMotion(surface, () => {
      motion.pause(); motion.currentTime = Math.min(Number(motion.currentTime ?? 220), 220);
      return { animations: [motion] };
    }) : undefined;
    return () => { unregister?.(); motion.cancel(); };
  }, [surface]);
  return <section ref={ref} className="account-gate" data-embedded={embedded} data-account-required="true" aria-label="Account sign-in guide">
    <div className="account-gate__card"><span className="account-gate__fold" aria-hidden="true" /></div>
  </section>;
}
