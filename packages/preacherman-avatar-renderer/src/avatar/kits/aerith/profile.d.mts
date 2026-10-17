import type { AvatarActionDescriptor, AvatarMotionState } from '../../types/avatarAnimation';
import type { SuiteKey } from './idle-suite-controller.mjs';

export type AerithActionId = 'idle.default' | 'gesture.awaiting' | 'gesture.thought';
export const AERITH_AVATAR_ID: 'aerith-ff7re';
export const AERITH_RIG_ID: 'aerith-ff7re-game-runtime-v1';
export const AERITH_DEFAULT_ACTION_ID: 'idle.default';
export const AERITH_MODEL_FILE: 'aerith-ff7re-runtime.glb';
export const aerithActionKeys: Readonly<Record<AerithActionId, SuiteKey>>;
export const aerithAnimationManifest: readonly Readonly<AvatarActionDescriptor>[];
export const aerithMotionStateMap: Readonly<Record<AvatarMotionState, AerithActionId>>;
export const aerithAvatarProfile: Readonly<{
  avatarId: typeof AERITH_AVATAR_ID;
  defaultActionId: typeof AERITH_DEFAULT_ACTION_ID;
  actions: typeof aerithAnimationManifest;
  jawBone: null;
  modelFile: typeof AERITH_MODEL_FILE;
  rigId: typeof AERITH_RIG_ID;
  stateMap: typeof aerithMotionStateMap;
  transform: Readonly<{ rotationY: 0; scale: 1; verticalOffset: 0 }>;
}>;
