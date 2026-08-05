import type {
  AvatarActionDescriptor,
  AvatarMotionState,
} from "../types/avatarAnimation";

export const CORTANA_AVATAR_ID = "cortana";
export const CORTANA_RIG_ID = "cortanaskele_skeleton";
export const CORTANA_DEFAULT_ACTION_ID = "idle.catwalk";

export const cortanaAnimationManifest = [
  {
    id: CORTANA_DEFAULT_ACTION_ID,
    clipName: "cortana.idle.catwalk.v1",
    category: "idle",
    loop: "repeat",
    fadeIn: 0.35,
    fadeOut: 0.35,
    timeScale: 1,
    priority: 10,
    interruptible: true,
  },
] as const satisfies readonly AvatarActionDescriptor[];

export const cortanaMotionStateMap: Readonly<
  Partial<Record<AvatarMotionState, string>>
> = {
  idle: CORTANA_DEFAULT_ACTION_ID,
};
