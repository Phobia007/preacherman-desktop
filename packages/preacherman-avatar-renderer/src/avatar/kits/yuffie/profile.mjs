import { playbackConfig } from './playback-config.mjs';

export const YUFFIE_AVATAR_ID = 'yuffie-ff7re';
export const YUFFIE_RIG_ID = 'yuffie-ff7re-game-runtime-v1';
export const YUFFIE_DEFAULT_ACTION_ID = 'idle.default';
export const YUFFIE_MODEL_FILE = 'yuffie-ff7re-runtime.glb';

export const yuffieActionKeys = Object.freeze(Object.fromEntries(
  Object.keys(playbackConfig.clips).map(key => [key === 'idle' ? 'idle.default' : `gesture.${key}`, key])
));

export const yuffieAnimationManifest = Object.freeze(
  Object.entries(yuffieActionKeys).map(([id, key]) => Object.freeze({
    id,
    clipName: playbackConfig.clips[key],
    category: key === 'idle' ? 'idle' : 'gesture',
    loop: key === 'idle' ? 'repeat' : 'once',
    fadeIn: 1.5,
    fadeOut: 1.5,
    timeScale: 1,
    priority: key === 'idle' ? 10 : 20,
    interruptible: true,
    ...(key === 'idle' ? {} : { fallback: YUFFIE_DEFAULT_ACTION_ID }),
  })),
);

// These are explicit fallbacks, not additional authored animations.
export const yuffieMotionStateMap = Object.freeze({
  idle: YUFFIE_DEFAULT_ACTION_ID,
  listening: YUFFIE_DEFAULT_ACTION_ID,
  thinking: YUFFIE_DEFAULT_ACTION_ID,
  speaking: YUFFIE_DEFAULT_ACTION_ID,
  success: YUFFIE_DEFAULT_ACTION_ID,
  error: YUFFIE_DEFAULT_ACTION_ID,
  sleeping: YUFFIE_DEFAULT_ACTION_ID,
  wakeup: YUFFIE_DEFAULT_ACTION_ID,
});

export const yuffieAvatarProfile = Object.freeze({
  avatarId: YUFFIE_AVATAR_ID,
  defaultActionId: YUFFIE_DEFAULT_ACTION_ID,
  actions: yuffieAnimationManifest,
  jawBone: null,
  modelFile: YUFFIE_MODEL_FILE,
  rigId: YUFFIE_RIG_ID,
  stateMap: yuffieMotionStateMap,
  transform: Object.freeze({ rotationY: 0, scale: 1, verticalOffset: 0 }),
});
