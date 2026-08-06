import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AvatarErrorBoundary } from "./AvatarErrorBoundary";
import { AvatarAnimationDebugPanel } from "./AvatarAnimationDebugPanel";
import { configureHologramRenderer } from "./HologramLights";
import { InteractiveAvatarScene } from "./InteractiveAvatarScene";
import type {
  AvatarAnimationDebugSnapshot,
  AvatarAnimationError,
} from "./avatar/types/avatarAnimation";
import {
  AvatarError,
  normalizeAvatarError,
  type AvatarLoadState,
  type AvatarPerformanceSnapshot,
  type InteractiveAvatarViewportProps,
} from "./types";

function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.WebGLRenderingContext !== "undefined"
    || typeof window.WebGL2RenderingContext !== "undefined"
  );
}

export function InteractiveAvatarViewport({
  actionId,
  actionRequestKey,
  assetBaseUrl,
  className,
  debug = false,
  onReady,
  onError,
  onContextLost,
  onPerformance,
  onActionsReady,
  pose = "standby",
  quality = "balanced",
  resetKey = 0,
  jawOpen = 0,
}: InteractiveAvatarViewportProps) {
  const [loadState, setLoadState] = useState<AvatarLoadState>("loading");
  const [animationDebug, setAnimationDebug] =
    useState<AvatarAnimationDebugSnapshot | null>(null);
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

  const reportAnimationError = useCallback((error: AvatarAnimationError) => {
    reportError(
      new AvatarError("ASSET_LOAD_FAILED", error.message, error),
    );
  }, [reportError]);

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
      aria-label="Interactive Cortana model"
      className={["preacherman-avatar-viewport", "preacherman-avatar-viewport--interactive", className]
        .filter(Boolean)
        .join(" ")}
      data-avatar-load-state={loadState}
    >
      <AvatarErrorBoundary onError={reportError}>
        <Canvas
          camera={{ fov: 30, near: 0.01, far: 100, position: [0, 0.86, 3.35] }}
          dpr={dpr}
          frameloop="always"
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.info.autoReset = true;
            configureHologramRenderer(gl);
            gl.setClearColor(0x000000, 0);
          }}
          shadows={false}
        >
          <Suspense fallback={null}>
            <InteractiveAvatarScene
              actionId={actionId}
              actionRequestKey={actionRequestKey}
              assetBaseUrl={assetBaseUrl}
              onActionsReady={onActionsReady}
              onAnimationDebug={debug ? setAnimationDebug : undefined}
              onAnimationError={reportAnimationError}
              onContextLost={reportContextLost}
              onFirstFrame={reportFirstFrame}
              pose={pose}
              resetKey={resetKey}
              jawOpen={jawOpen}
            />
          </Suspense>
        </Canvas>
      </AvatarErrorBoundary>
      {debug ? (
        <AvatarAnimationDebugPanel snapshot={animationDebug} />
      ) : null}
    </div>
  );
}
