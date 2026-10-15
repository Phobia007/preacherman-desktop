import type { AvatarActionDescriptor, AvatarMotionState } from '../../types/avatarAnimation';
import type { SuiteKey } from './idle-suite-controller.mjs';

export type TifaActionId = 'idle.default' | 'gesture.awaiting' | 'gesture.glove_check' | 'gesture.thought';
export const TIFA_AVATAR_ID: 'tifa-ff7re';
export const TIFA_RIG_ID: 'tifa-ff7re-def-runtime-v1';
export const TIFA_DEFAULT_ACTION_ID: 'idle.default';
export const TIFA_MODEL_FILE: 'tifa-ff7re-runtime.glb';
export const tifaActionKeys: Readonly<Record<TifaActionId, SuiteKey>>;
export const tifaAnimationManifest: readonly Readonly<AvatarActionDescriptor>[];
export const tifaMotionStateMap: Readonly<Record<AvatarMotionState, TifaActionId>>;
export const tifaAvatarProfile: Readonly<{
  avatarId: typeof TIFA_AVATAR_ID;
  defaultActionId: typeof TIFA_DEFAULT_ACTION_ID;
  actions: typeof tifaAnimationManifest;
  jawBone: null;
  modelFile: typeof TIFA_MODEL_FILE;
  rigId: typeof TIFA_RIG_ID;
  stateMap: typeof tifaMotionStateMap;
  transform: Readonly<{ rotationY: 0; scale: 1; verticalOffset: 0 }>;
}>;
