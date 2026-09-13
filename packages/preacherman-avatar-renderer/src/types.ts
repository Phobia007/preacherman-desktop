import type { ReactNode } from "react";
import type { ImportedAvatarModelId } from "./avatarCatalog";
import type { AvatarActionDescriptor } from "./avatar/types/avatarAnimation";
import type { AvatarMotionRigBinding, AvatarMotionStreamSource } from "./avatar/contracts/AvatarMotionStream";

export type AvatarLoadState =
  | "loading"
  | "ready"
  | "error"
  | "context-lost";

export type AvatarQuality = "low" | "balanced" | "high";
export type AvatarPose = "rest" | "standby";
export type AvatarSceneEnvironment = "transparent" | "cinematic";
export type AvatarCameraFraming = "full-body" | "portrait";
export type AvatarModelId = "cortana" | "zima" | ImportedAvatarModelId;

export type AvatarErrorCode =
  | "WEBGL_UNAVAILABLE"
  | "ASSET_LOAD_FAILED"
  | "MODEL_PARSE_FAILED"
  | "MATERIAL_CREATE_FAILED"
  | "RENDER_FAILED"
  | "CONTEXT_LOST"
  | "UNKNOWN";

export interface AvatarPerformanceSnapshot {
  readonly drawCalls: number;
  readonly triangles: number;
}
export interface AvatarReadyDetail extends AvatarPerformanceSnapshot {
  readonly state: "ready";
}

export interface AvatarViewportProps {
  readonly assetBaseUrl: string;
  readonly className?: string;
  readonly debug?: boolean;
  readonly onReady?: (detail: AvatarReadyDetail) => void;
  readonly onError?: (error: AvatarError) => void;
  readonly onContextLost?: (error: AvatarError) => void;
  readonly onPerformance?: (snapshot: AvatarPerformanceSnapshot) => void;
  readonly quality?: AvatarQuality;
  readonly reducedMotion?: boolean;
}

export interface InteractiveAvatarViewportProps extends AvatarViewportProps {
  /** Additional meshes share the companion camera and depth buffer. */
  readonly sceneContent?: ReactNode;
  readonly companionVisible?: boolean;
  readonly modelId?: AvatarModelId;
  readonly cameraFraming?: AvatarCameraFraming;
  /** Adds a scene-local yaw correction without changing the avatar profile. */
  readonly rotationOffsetY?: number;
  readonly actionId?: string;
  readonly actionRequestKey?: number;
  readonly onActionsReady?: (actions: readonly AvatarActionDescriptor[]) => void;
  readonly pose?: AvatarPose;
  readonly resetKey?: number;
  /** Procedural mouth opening driven by actual output audio (0 through 1). */
  readonly jawOpen?: number;
  readonly environment?: AvatarSceneEnvironment;
  /** Keep cinematic lighting and the platform, but composite the companion over another scene. */
  readonly isolateCompanion?: boolean;
  /** Holds the cinematic platform ring at its active light level. */
  readonly awakened?: boolean;
  readonly motionSource?: AvatarMotionStreamSource;
  readonly motionRigBinding?: AvatarMotionRigBinding;
  /** Keeps the prepared WebGL scene mounted while pausing continuous rendering. */
  readonly renderActive?: boolean;
}

export class AvatarError extends Error {
  readonly code: AvatarErrorCode;
  override readonly cause: unknown;

  constructor(code: AvatarErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AvatarError";
    this.code = code;
    this.cause = cause;
  }
}

export function normalizeAvatarError(
  error: unknown,
  code: AvatarErrorCode = "UNKNOWN",
): AvatarError {
  if (error instanceof AvatarError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AvatarError(code, message, error);
}
