export type AvatarMotionState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "success"
  | "error"
  | "sleeping"
  | "wakeup";

export interface AvatarActionDescriptor {
  readonly id: string;
  readonly clipName: string;
  readonly category: string;
  readonly loop: "repeat" | "once";
  readonly fadeIn: number;
  readonly fadeOut: number;
  readonly timeScale: number;
  readonly priority: number;
  readonly interruptible: boolean;
  readonly fallback?: string;
}

export interface PlayActionOptions {
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  readonly restart?: boolean;
  readonly timeScale?: number;
}

export type AvatarAnimationErrorCode =
  | "MODEL_LOAD_FAILED"
  | "CLIP_MISSING"
  | "ACTION_UNKNOWN"
  | "STATE_UNMAPPED"
  | "NOT_LOADED";

export class AvatarAnimationError extends Error {
  readonly code: AvatarAnimationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: AvatarAnimationErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "AvatarAnimationError";
    this.code = code;
    this.details = details;
  }
}

export interface AvatarAnimationDebugSnapshot {
  readonly avatarId: string;
  readonly rigId: string;
  readonly loadedClips: readonly string[];
  readonly currentAction: string | null;
  readonly currentDuration: number | null;
  readonly mixerState: "idle" | "playing" | "disposed" | "error";
  readonly boneCount: number;
  readonly missingClipErrors: readonly string[];
  readonly registeredActions: number;
}
