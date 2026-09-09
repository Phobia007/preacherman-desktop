import "./avatar-renderer.css";

export { AvatarViewport } from "./AvatarViewport";
export { InteractiveAvatarViewport } from "./InteractiveAvatarViewport";
export { createAvatarAssetUrls } from "./AvatarModel";
export { HOLOGRAM_LIGHTS } from "./HologramLights";
export type { AvatarAnimationPort } from "./avatar/contracts/AvatarAnimationPort";
export type {
  AvatarMotionRestJoint,
  AvatarMotionRigBinding,
  AvatarMotionStreamEvent,
  AvatarMotionStreamMetadata,
  AvatarMotionStreamSource,
} from "./avatar/contracts/AvatarMotionStream";
export { ThreeAvatarMotionStreamPlayer } from "./avatar/adapters/ThreeAvatarMotionStreamPlayer";
export { ThreeAvatarAnimationAdapter } from "./avatar/adapters/ThreeAvatarAnimationAdapter";
export { CortanaAnimationController } from "./avatar/controllers/CortanaAnimationController";
export {
  CORTANA_AVATAR_ID,
  CORTANA_DEFAULT_ACTION_ID,
  CORTANA_RIG_ID,
  cortanaAnimationManifest,
  cortanaMotionStateMap,
} from "./avatar/manifests/cortanaAnimationManifest";
export {
  ZIMA_AVATAR_ID,
  ZIMA_DEFAULT_ACTION_ID,
  ZIMA_RIG_ID,
  zimaAnimationManifest,
  zimaMotionStateMap,
} from "./avatar/manifests/zimaAnimationManifest";
export {
  AvatarAnimationError,
  type AvatarActionDescriptor,
  type AvatarMotionLibraryOptions,
  type AvatarAnimationDebugSnapshot,
  type AvatarAnimationErrorCode,
  type AvatarMotionState,
  type PlayActionOptions,
} from "./avatar/types/avatarAnimation";
export {
  createHologramMaterial,
  HOLOGRAM_REFERENCE_GRADE,
  hologramProfileFor,
  updateHologramResolution,
  type HologramProfile,
} from "./hologramMaterial";
export {
  disposeAvatarSceneResources,
  type AvatarDisposeReport,
  type AvatarResourceExtras,
} from "./resourceLifecycle";
export {
  AvatarError,
  normalizeAvatarError,
  type AvatarErrorCode,
  type AvatarCameraFraming,
  type AvatarLoadState,
  type AvatarModelId,
  type AvatarPerformanceSnapshot,
  type AvatarPose,
  type AvatarQuality,
  type AvatarReadyDetail,
  type AvatarSceneEnvironment,
  type AvatarViewportProps,
  type InteractiveAvatarViewportProps,
} from "./types";

export { prefetchAvatarModel, avatarModelCacheSnapshot } from "./avatarModelCache";
