import type * as THREE from 'three';
export type SuiteKey = 'idle' | 'awaiting' | 'thought';
export const SUITE_CLIPS: Readonly<Record<SuiteKey, string>>;
export const DEFAULT_AUTO_EVENT_KEYS: readonly Exclude<SuiteKey, 'idle'>[];
export const SUITE_LABELS: Readonly<Record<SuiteKey, string>>;
export interface IdleSuiteSnapshot {
  currentKey: SuiteKey;
  label: string;
  phase: 'idle' | 'gesture' | 'returning';
  time: number;
  duration: number;
  transitioning: boolean;
  paused: boolean;
  speed: number;
  autoRandom: boolean;
  idleLoop: boolean;
  completed: boolean;
  autoEventKeys: Exclude<SuiteKey, 'idle'>[];
  randomGapPlaybackSeconds: number;
  nextRandomInSeconds: number | null;
  weights: { key: SuiteKey; weight: number }[];
}
export class IdleSuiteController {
  constructor(three: typeof THREE, root: THREE.Object3D, clips: readonly THREE.AnimationClip[], options?: {
    clips?: Readonly<Record<SuiteKey, string>>;
    labels?: Readonly<Record<SuiteKey, string>>;
    autoEventKeys?: readonly Exclude<SuiteKey, 'idle'>[];
    randomGapPlaybackSeconds?: number;
    random?: () => number;
    transitionSeconds?: number;
    onStateChange?: (snapshot: IdleSuiteSnapshot) => void;
  });
  readonly mixer: THREE.AnimationMixer;
  transitionSeconds: number;
  request(key: SuiteKey): void;
  replay(): void;
  setPaused(value: boolean): void;
  setSpeed(value: number): void;
  setAutoRandom(value: boolean): void;
  setIdleLoop(value: boolean): void;
  seek(fraction: number): void;
  update(deltaSeconds: number): void;
  getSnapshot(): IdleSuiteSnapshot;
  dispose(): void;
}
