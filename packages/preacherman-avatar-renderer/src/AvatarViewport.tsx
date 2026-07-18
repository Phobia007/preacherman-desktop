import { Canvas } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AvatarErrorBoundary } from "./AvatarErrorBoundary";
import { AvatarScene } from "./AvatarScene";
import {
  AvatarError,
  normalizeAvatarError,
  type AvatarLoadState,
  type AvatarPerformanceSnapshot,
  type AvatarViewportProps,
} from "./types";

function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.WebGLRenderingContext !== "undefined"
    || typeof window.WebGL2RenderingContext !== "undefined"
  );
}
export function AvatarViewport({
  assetBaseUrl,
  className,
  onReady,
  onError,
  onContextLost,
  onPerformance,
  quality = "balanced",
  reducedMotion = false,
}: AvatarViewportProps) {
  const [loadState, setLoadState] = useState<AvatarLoadState>("loading");
  const dpr = useMemo<[number, number]>(() => {
    const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
    const cap = quality === "low" ? 1 : quality === "balanced" ? 1.5 : 2;
    return [1, Math.min(deviceDpr, cap, 2)];
  }, [quality]);

  const reportError = useCallback((error: AvatarError) => {
    setLoadState("error");
    onError?.(error);
  }, [onError]);

  const reportContextLost = useCallback((error: AvatarError) => {
    const contextError = normalizeAvatarError(error, "CONTEXT_LOST");
    setLoadState("context-lost");
    onContextLost?.(contextError);
    onError?.(contextError);
  }, [onContextLost, onError]);

  const reportFirstFrame = useCallback((snapshot: AvatarPerformanceSnapshot) => {
    setLoadState("ready");
    onPerformance?.(snapshot);
    onReady?.({ state: "ready", ...snapshot });
  }, [onPerformance, onReady]);

  useEffect(() => {
    if (supportsWebGL()) return;
    reportError(new AvatarError("WEBGL_UNAVAILABLE", "WebGL is unavailable."));
  }, [reportError]);

  if (!supportsWebGL()) return null;

  return (
    <div
      aria-hidden="true"
      className={["preacherman-avatar-viewport", className].filter(Boolean).join(" ")}
      data-avatar-load-state={loadState}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={{ pointerEvents: "none" }}
    >
      <AvatarErrorBoundary onError={reportError}>
        <Canvas
          camera={{ fov: 30, near: 0.01, far: 100, position: [0, 0.85, 3.4] }}
          dpr={dpr}
          frameloop="demand"
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.info.autoReset = true;
            gl.setClearColor(0x000000, 0);
          }}
          shadows={false}
        >
          <Suspense fallback={null}>
            <AvatarScene
              assetBaseUrl={assetBaseUrl}
              onContextLost={reportContextLost}
              onFirstFrame={reportFirstFrame}
            />
          </Suspense>
        </Canvas>
      </AvatarErrorBoundary>
    </div>
  );
}
