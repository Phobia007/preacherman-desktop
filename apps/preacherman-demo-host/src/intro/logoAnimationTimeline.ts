export interface LogoStrokeTiming {
  readonly stroke: number;
  readonly duration: number;
  readonly gap: number;
  readonly direction: 1 | -1;
}

export const LOGO_STROKE_SEQUENCE: ReadonlyArray<LogoStrokeTiming> = Object.freeze([
  { stroke: 7, duration: 177.3, gap: 45, direction: -1 },
  { stroke: 6, duration: 80.8, gap: 35, direction: 1 },
  { stroke: 5, duration: 80.8, gap: 55, direction: 1 },
  { stroke: 4, duration: 125.8, gap: 40, direction: -1 },
  { stroke: 3, duration: 67.7, gap: 30, direction: 1 },
  { stroke: 2, duration: 67.6, gap: 70, direction: 1 },
  { stroke: 1, duration: 830, gap: 0, direction: -1 },
]);

export const LOGO_STROKE_INITIAL_DELAY_MS = 150;
export const LOGO_WORDMARK_DELAY_MS = 50;
export const LOGO_WORDMARK_DURATION_MS = 620;
export const LOGO_ANIMATION_TOTAL_MS = 2525;

const loopEasing = Object.freeze({
  turnTime: 0.6,
  turnProgress: 0.44,
  startVelocity: 0.75,
  turnVelocity: 0.7,
  endVelocity: 0.85,
});

function quinticHermite(
  time: number,
  timeStart: number,
  progressStart: number,
  timeEnd: number,
  progressEnd: number,
  velocityStart: number,
  velocityEnd: number,
  accelerationStart = 0,
  accelerationEnd = 0,
) {
  const span = timeEnd - timeStart;
  const u = Math.min(1, Math.max(0, (time - timeStart) / span));
  const d0 = velocityStart * span;
  const d1 = velocityEnd * span;
  const s0 = accelerationStart * span * span;
  const s1 = accelerationEnd * span * span;
  const c0 = progressStart;
  const c1 = d0;
  const c2 = s0 / 2;
  const a = progressEnd - c0 - c1 - c2;
  const b = d1 - c1 - 2 * c2;
  const c = s1 - 2 * c2;
  const c3 = 10 * a - 4 * b + c / 2;
  const c4 = -15 * a + 7 * b - c;
  const c5 = 6 * a - 3 * b + c / 2;
  return c0 + c1 * u + c2 * u ** 2 + c3 * u ** 3 + c4 * u ** 4 + c5 * u ** 5;
}

function smoothLoopEase(rawProgress: number) {
  const progress = Math.min(1, Math.max(0, rawProgress));
  const {
    turnTime,
    turnProgress,
    startVelocity,
    turnVelocity,
    endVelocity,
  } = loopEasing;

  const value = progress <= turnTime
    ? quinticHermite(
        progress,
        0,
        0,
        turnTime,
        turnProgress,
        startVelocity,
        turnVelocity,
      )
    : quinticHermite(
        progress,
        turnTime,
        turnProgress,
        1,
        1,
        turnVelocity,
        endVelocity,
      );

  return Math.min(1, Math.max(0, value));
}

export function createLargeLoopKeyframes(length: number, direction: 1 | -1): Keyframe[] {
  const sampleCount = 120;
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const timeProgress = index / sampleCount;
    const drawProgress = smoothLoopEase(timeProgress);
    return {
      strokeDashoffset: String(length * direction * (1 - drawProgress)),
      opacity: "1",
      offset: timeProgress,
    };
  });
}
