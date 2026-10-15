import type * as THREE from 'three';
export type SuiteKey = 'idle' | 'awaiting' | 'glove_check' | 'thought';
export const SUITE_CLIPS: Readonly<Record<SuiteKey, string>>;
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
  nextRandomInSeconds: number | null;
  weights: { key: SuiteKey; weight: number }[];
}
export class IdleSuiteController {
  constructor(three: typeof THREE, root: THREE.Object3D, clips: readonly THREE.AnimationClip[], options?: {
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
