import type { CSSProperties } from "react";
import preachermanMark from "./assets/preacherman-mark.png";
import { STARTUP_INTRO_TIMING } from "./introSequence";

const introStyle = {
  "--demo-intro-white-hold": `${STARTUP_INTRO_TIMING.whiteHoldMs}ms`,
  "--demo-intro-logo-in": `${STARTUP_INTRO_TIMING.logoFadeInMs}ms`,
  "--demo-intro-logo-visible": `${STARTUP_INTRO_TIMING.logoVisibleMs}ms`,
  "--demo-intro-logo-out": `${STARTUP_INTRO_TIMING.logoFadeOutMs}ms`,
} as CSSProperties;

export function StartupIntro() {
  return (
    <section aria-label="Starting Preacherman" className="demo-startup" style={introStyle}>
      <div className="demo-startup__logo">
        <img alt="Preacherman" draggable="false" src={preachermanMark} />
      </div>
    </section>
  );
}
