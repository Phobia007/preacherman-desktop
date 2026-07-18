import "./avatar-renderer.css";

export { AvatarViewport } from "./AvatarViewport";
export { createAvatarAssetUrls } from "./AvatarModel";
export {
  createHologramMaterial,
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
  type AvatarLoadState,
  type AvatarPerformanceSnapshot,
  type AvatarQuality,
  type AvatarReadyDetail,
  type AvatarViewportProps,
} from "./types";
