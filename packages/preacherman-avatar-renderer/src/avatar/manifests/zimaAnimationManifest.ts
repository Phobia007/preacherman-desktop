import type {
  AvatarActionDescriptor,
  AvatarMotionState,
} from "../types/avatarAnimation";

export const ZIMA_AVATAR_ID = "zima";
export const ZIMA_RIG_ID = "root";
export const ZIMA_DEFAULT_ACTION_ID = "idle.zima";

export const zimaAnimationManifest = [
  {
    id: ZIMA_DEFAULT_ACTION_ID,
    clipName: "zima.idle.button.v3",
    category: "idle",
    loop: "repeat",
    fadeIn: 0.35,
    fadeOut: 0.35,
    timeScale: 1,
    priority: 10,
    interruptible: true,
  },
] as const satisfies readonly AvatarActionDescriptor[];

export const zimaMotionStateMap: Readonly<
  Partial<Record<AvatarMotionState, string>>
> = {
  idle: ZIMA_DEFAULT_ACTION_ID,
};
