import "./styles/index.css";

export { createSurfaceSkinAdapter } from "./adapter/createSurfaceSkinAdapter";
export { SurfaceFallback } from "./renderers/SurfaceFallback";
export { SurfaceRenderer } from "./renderers/SurfaceRenderer";
export { WorkspaceConversationSurface } from "./surfaces/workspace/WorkspaceConversationSurface";
export { bridgeSurfaceTokens, defaultSurfaceSkinTokens, surfaceTokenStyle } from "./tokens/bridge";
export type {
  CreateSurfaceSkinAdapterOptions,
  HostSurfaceTokens,
  SurfaceAction,
  SurfaceCommand,
  SurfaceCommandResult,
  SurfaceHostBridge,
  SurfaceManifest,
  SurfaceProjection,
  SurfaceRendererProps,
  SurfaceRendererResolution,
  SurfaceSkinAdapter,
  SurfaceSkinTokens,
  SurfaceSubscription,
  SurfaceType,
  SurfaceViewProps,
} from "./adapter/types";
