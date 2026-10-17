import type { Group } from 'three';
import type {
  AvatarAnimationPort, AvatarActionDescriptor, AvatarAnimationDebugSnapshot,
  AvatarAnimationError, AvatarAnimationErrorCode, AvatarMotionState, PlayActionOptions,
} from '../../types/avatarAnimation';
import type { IdleSuiteSnapshot } from './idle-suite-controller.mjs';

export interface YuffieAnimationAdapterOptions {
  readonly modelUrl: string;
  /** Optional existing APP byte cache; never return a shared parsed scene. */
  readonly loadModelFile?: (url: string, options: { readonly signal: AbortSignal }) => Promise<ArrayBuffer>;
  readonly onError?: (error: AvatarAnimationError) => void;
  readonly random?: () => number;
  /** 1.2 through 1.8 seconds; default 1.5. */
  readonly transitionSeconds?: number;
  /** Timeout covers both the byte request and GLTF parsing; default 45000. */
  readonly loadTimeoutMs?: number;
}

/** Same code/name/details structure as AvatarAnimationError; no instanceof guarantee. */
export class YuffieAnimationError extends Error {
  readonly code: AvatarAnimationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: AvatarAnimationErrorCode, message: string, details?: Readonly<Record<string, unknown>>);
}

export class YuffieAnimationAdapter implements AvatarAnimationPort {
  constructor(options: YuffieAnimationAdapterOptions);
  load(): Promise<void>;
  listActions(): AvatarActionDescriptor[];
  hasAction(id: string): boolean;
  /** timeScale: .5/.75/1 (suite clock); symmetric fadeIn/fadeOut: 1.2–1.8 s. */
  play(id: string, options?: PlayActionOptions): Promise<void>;
  crossFadeTo(id: string, duration?: number): Promise<void>;
  /** Freezes the current pose. play() or setState() resumes it. */
  stop(id?: string): void;
  setState(state: AvatarMotionState): Promise<void>;
  /** Must be false when the APP surface is hidden or rendering is suspended. */
  setRenderActive(active: boolean): void;
  update(deltaSeconds: number): void;
  getRoot(): Group | null;
  getPlaybackSnapshot(): IdleSuiteSnapshot | null;
  getDebugSnapshot(): AvatarAnimationDebugSnapshot;
  subscribeDebug(listener: (snapshot: AvatarAnimationDebugSnapshot) => void): () => void;
  dispose(): void;
}
