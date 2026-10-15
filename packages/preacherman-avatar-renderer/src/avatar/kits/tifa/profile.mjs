import { SUITE_CLIPS } from './idle-suite-controller.mjs';

export const TIFA_AVATAR_ID = 'tifa-ff7re';
export const TIFA_RIG_ID = 'tifa-ff7re-def-runtime-v1';
export const TIFA_DEFAULT_ACTION_ID = 'idle.default';
export const TIFA_MODEL_FILE = 'tifa-ff7re-runtime.glb';

export const tifaActionKeys = Object.freeze({
  'idle.default': 'idle',
  'gesture.awaiting': 'awaiting',
  'gesture.glove_check': 'glove_check',
  'gesture.thought': 'thought',
});

export const tifaAnimationManifest = Object.freeze(
  Object.entries(tifaActionKeys).map(([id, key]) => Object.freeze({
    id,
    clipName: SUITE_CLIPS[key],
    category: key === 'idle' ? 'idle' : 'gesture',
    loop: key === 'idle' ? 'repeat' : 'once',
    fadeIn: 1.5,
    fadeOut: 1.5,
    timeScale: 1,
    priority: key === 'idle' ? 10 : 20,
    interruptible: true,
    ...(key === 'idle' ? {} : { fallback: TIFA_DEFAULT_ACTION_ID }),
  })),
);

// These are explicit fallbacks, not additional authored animations.
export const tifaMotionStateMap = Object.freeze({
  idle: TIFA_DEFAULT_ACTION_ID,
  listening: TIFA_DEFAULT_ACTION_ID,
  thinking: 'gesture.thought',
  speaking: TIFA_DEFAULT_ACTION_ID,
  success: TIFA_DEFAULT_ACTION_ID,
  error: TIFA_DEFAULT_ACTION_ID,
  sleeping: TIFA_DEFAULT_ACTION_ID,
  wakeup: TIFA_DEFAULT_ACTION_ID,
});

export const tifaAvatarProfile = Object.freeze({
  avatarId: TIFA_AVATAR_ID,
  defaultActionId: TIFA_DEFAULT_ACTION_ID,
  actions: tifaAnimationManifest,
  jawBone: null,
  modelFile: TIFA_MODEL_FILE,
  rigId: TIFA_RIG_ID,
  stateMap: tifaMotionStateMap,
  transform: Object.freeze({ rotationY: 0, scale: 1, verticalOffset: 0 }),
});
