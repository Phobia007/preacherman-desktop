import { SUITE_CLIPS } from './idle-suite-controller.mjs';

export const AERITH_AVATAR_ID = 'aerith-ff7re';
export const AERITH_RIG_ID = 'aerith-ff7re-game-runtime-v1';
export const AERITH_DEFAULT_ACTION_ID = 'idle.default';
export const AERITH_MODEL_FILE = 'aerith-ff7re-runtime.glb';

export const aerithActionKeys = Object.freeze({
  'idle.default': 'idle',
  'gesture.awaiting': 'awaiting',
  'gesture.thought': 'thought',
});

export const aerithAnimationManifest = Object.freeze(
  Object.entries(aerithActionKeys).map(([id, key]) => Object.freeze({
    id,
    clipName: SUITE_CLIPS[key],
    category: key === 'idle' ? 'idle' : 'gesture',
    loop: key === 'idle' ? 'repeat' : 'once',
    fadeIn: 1.5,
    fadeOut: 1.5,
    timeScale: 1,
    priority: key === 'idle' ? 10 : 20,
    interruptible: true,
    ...(key === 'idle' ? {} : { fallback: AERITH_DEFAULT_ACTION_ID }),
  })),
);

// These are explicit fallbacks, not additional authored animations.
export const aerithMotionStateMap = Object.freeze({
  idle: AERITH_DEFAULT_ACTION_ID,
  listening: AERITH_DEFAULT_ACTION_ID,
  thinking: 'gesture.thought',
  speaking: AERITH_DEFAULT_ACTION_ID,
  success: AERITH_DEFAULT_ACTION_ID,
  error: AERITH_DEFAULT_ACTION_ID,
  sleeping: AERITH_DEFAULT_ACTION_ID,
  wakeup: AERITH_DEFAULT_ACTION_ID,
});

export const aerithAvatarProfile = Object.freeze({
  avatarId: AERITH_AVATAR_ID,
  defaultActionId: AERITH_DEFAULT_ACTION_ID,
  actions: aerithAnimationManifest,
  jawBone: null,
  modelFile: AERITH_MODEL_FILE,
  rigId: AERITH_RIG_ID,
  stateMap: aerithMotionStateMap,
  transform: Object.freeze({ rotationY: 0, scale: 1, verticalOffset: 0 }),
});
