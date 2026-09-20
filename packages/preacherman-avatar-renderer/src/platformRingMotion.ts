/** A quiet inhale, with a longer release and zero velocity at either turn. */
export const PLATFORM_BREATH_SECONDS = 7.8;
const INHALE_SECONDS = 3.1;

export function platformBreath(seconds: number): number {
  const phase = ((seconds % PLATFORM_BREATH_SECONDS) + PLATFORM_BREATH_SECONDS) % PLATFORM_BREATH_SECONDS;
  const progress = phase < INHALE_SECONDS
    ? phase / INHALE_SECONDS
    : 1 - (phase - INHALE_SECONDS) / (PLATFORM_BREATH_SECONDS - INHALE_SECONDS);
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}
