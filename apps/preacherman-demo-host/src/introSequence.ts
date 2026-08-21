export const STARTUP_INTRO_TIMING = Object.freeze({
  signalLockMs: 2000,
  totalDurationMs: 3000,
  mainFadeInMs: 700,
});

let startupIntroClaimed = false;

export function claimStartupIntro(): boolean {
  if (startupIntroClaimed) {
    return false;
  }
  startupIntroClaimed = true;
  return true;
}
