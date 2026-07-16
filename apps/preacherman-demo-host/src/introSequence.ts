export const STARTUP_INTRO_TIMING = Object.freeze({
  whiteHoldMs: 1000,
  logoFadeInMs: 600,
  logoVisibleMs: 3000,
  logoFadeOutMs: 600,
  mainFadeInMs: 700,
});

export const STARTUP_INTRO_TOTAL_MS =
  STARTUP_INTRO_TIMING.whiteHoldMs
  + STARTUP_INTRO_TIMING.logoFadeInMs
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
