import { LOGO_ANIMATION_TOTAL_MS } from "./intro/logoAnimationTimeline";

export const STARTUP_INTRO_TIMING = Object.freeze({
  whiteHoldMs: 800,
  logoDrawMs: LOGO_ANIMATION_TOTAL_MS,
  logoVisibleMs: 1000,
  logoFadeOutMs: 600,
  mainFadeInMs: 700,
});

export const STARTUP_INTRO_TOTAL_MS =
  STARTUP_INTRO_TIMING.whiteHoldMs
  + STARTUP_INTRO_TIMING.logoDrawMs
  + STARTUP_INTRO_TIMING.logoVisibleMs
  + STARTUP_INTRO_TIMING.logoFadeOutMs;

let startupIntroClaimed = false;

export function claimStartupIntro(): boolean {
  if (startupIntroClaimed) {
    return false;
  }
  startupIntroClaimed = true;
  return true;
}
