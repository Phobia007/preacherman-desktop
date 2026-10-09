import { useId, useLayoutEffect, useRef } from "react";
import { registerSurfaceMotion } from "../../app-shell/surfaceMotion";
import type { LocalSurfaceType } from "../../demo/screenRoute";
import "./account-gate.css";

/** Shared guide; the existing Account surface owns the sign-in flow. */
export function AccountGate({ surface, embedded = false, onSignIn }: { surface?: LocalSurfaceType; embedded?: boolean; onSignIn: () => void }) {
  const headingId = useId();
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
  return <section ref={ref} className="account-gate" data-embedded={embedded} data-account-required="true" aria-labelledby={headingId}>
    <div className="account-gate__card">
      <span className="account-gate__fold" aria-hidden="true" />
      <h1 className="account-gate__heading" id={headingId}>Become a<br />preacherman<br />before you preach</h1>
      <span className="account-gate__logo" role="img" aria-label="Preacherman" />
      <button className="account-gate__continue" type="button" onClick={onSignIn}>
        <span className="demo-app-shell__brand-menu-label">direct toward</span>
        <svg className="account-gate__arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 12 12 4M5 4h7v7" /></svg>
        <svg className="demo-app-shell__brand-menu-charge-ring" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="demo-app-shell__brand-menu-charge-outline" d="M18 1H82A17 17 0 0 1 99 18V22A17 17 0 0 1 82 39H18A17 17 0 0 1 1 22V18A17 17 0 0 1 18 1Z" pathLength={100} vectorEffect="non-scaling-stroke" />
          <path className="demo-app-shell__brand-menu-charge-tracer" d="M18 1H82A17 17 0 0 1 99 18V22A17 17 0 0 1 82 39H18A17 17 0 0 1 1 22V18A17 17 0 0 1 18 1Z" pathLength={100} vectorEffect="non-scaling-stroke" />
        </svg>
      </button>
    </div>
  </section>;
}
