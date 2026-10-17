import type { AvatarActionDescriptor, AvatarMotionState } from '../../types/avatarAnimation';
import type { SuiteKey } from './idle-suite-controller.mjs';

export type YuffieActionId = 'idle.default' | 'gesture.in_the_balance' | 'gesture.small_swing' | 'gesture.hand_on_hip';
export const YUFFIE_AVATAR_ID: 'yuffie-ff7re';
export const YUFFIE_RIG_ID: 'yuffie-ff7re-game-runtime-v1';
export const YUFFIE_DEFAULT_ACTION_ID: 'idle.default';
export const YUFFIE_MODEL_FILE: 'yuffie-ff7re-runtime.glb';
export const yuffieActionKeys: Readonly<Record<YuffieActionId, SuiteKey>>;
export const yuffieAnimationManifest: readonly Readonly<AvatarActionDescriptor>[];
export const yuffieMotionStateMap: Readonly<Record<AvatarMotionState, YuffieActionId>>;
export const yuffieAvatarProfile: Readonly<{
  avatarId: typeof YUFFIE_AVATAR_ID;
  defaultActionId: typeof YUFFIE_DEFAULT_ACTION_ID;
  actions: typeof yuffieAnimationManifest;
  jawBone: null;
  modelFile: typeof YUFFIE_MODEL_FILE;
  rigId: typeof YUFFIE_RIG_ID;
  stateMap: typeof yuffieMotionStateMap;
  transform: Readonly<{ rotationY: 0; scale: 1; verticalOffset: 0 }>;
}>;
