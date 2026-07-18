export type AvatarLoadState =
  | "loading"
  | "ready"
  | "error"
  | "context-lost";

export type AvatarQuality = "low" | "balanced" | "high";

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
  readonly onReady?: (detail: AvatarReadyDetail) => void;
  readonly onError?: (error: AvatarError) => void;
  readonly onContextLost?: (error: AvatarError) => void;
  readonly onPerformance?: (snapshot: AvatarPerformanceSnapshot) => void;
  readonly quality?: AvatarQuality;
  readonly reducedMotion?: boolean;
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
