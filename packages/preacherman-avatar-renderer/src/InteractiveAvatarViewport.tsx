import { avatarModelName } from "./avatarCatalog";
import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  sceneContent,
  companionVisible = true,
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
  motionState,
  environment = "transparent",
  isolateCompanion = false,
  platformStyle = "solid",
  motionSource,
  motionRigBinding,
  renderActive = true,
  modelId = "cortana",
  cameraFraming = "full-body",
  rotationOffsetY = 0,
  appearance = "dark",
  cameraZoom = 0,
}: InteractiveAvatarViewportProps) {
  const [failure, setFailure] = useState<{ modelKey: string; state: AvatarLoadState } | null>(null);
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [loadedModel, setLoadedModel] = useState("");
  const modelKey = modelId + ":" + assetBaseUrl;
  const currentModel = useRef(modelKey);
  currentModel.current = modelKey;
  // Canvas commits can skip a transient A → B → A selection. Keep the ready
  // identity until another model actually renders; resetting on props loses it.
  const loadState = failure?.modelKey === modelKey ? failure.state : loadedModel === modelKey ? "ready" : "loading";
  const rendering = renderActive && documentVisible;
  useEffect(() => {
    const sync = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const [animationDebug, setAnimationDebug] =
    useState<AvatarAnimationDebugSnapshot | null>(null);
  const dpr = useMemo<[number, number]>(() => {
    const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
    const cap = quality === "low" ? 1 : quality === "balanced" ? 1.5 : 2;
    return [1, Math.min(deviceDpr, cap, 2)];
  }, [quality]);

  const reportError = useCallback((error: AvatarError) => {
    if (currentModel.current !== modelKey) return;
    setFailure({ modelKey, state: "error" });
    onError?.(error);
  }, [modelKey, onError]);

  const reportContextLost = useCallback((error: AvatarError) => {
    const contextError = normalizeAvatarError(error, "CONTEXT_LOST");
    if (currentModel.current !== modelKey) return;
    setFailure({ modelKey, state: "context-lost" });
    onContextLost?.(contextError);
    onError?.(contextError);
  }, [modelKey, onContextLost, onError]);

  const reportAnimationError = useCallback((error: AvatarAnimationError) => {
    reportError(
      new AvatarError("ASSET_LOAD_FAILED", error.message, error),
    );
  }, [reportError]);

  const reportFirstFrame = useCallback((snapshot: AvatarPerformanceSnapshot) => {
    if (currentModel.current !== modelKey) return;
    setFailure(null);
    setLoadedModel(modelKey);
    onPerformance?.(snapshot);
    onReady?.({ state: "ready", ...snapshot });
  }, [modelKey, onPerformance, onReady]);

  useEffect(() => {
    if (supportsWebGL()) return;
    reportError(new AvatarError("WEBGL_UNAVAILABLE", "WebGL is unavailable."));
  }, [reportError]);

  if (!supportsWebGL()) return null;

  return (
    <div
      aria-label={`Interactive ${avatarModelName(modelId)} model`}
      className={["preacherman-avatar-viewport", "preacherman-avatar-viewport--interactive", className]
        .filter(Boolean)
        .join(" ")}
      data-avatar-load-state={companionVisible ? loadState : "ready"}
      data-avatar-render-active={rendering}
      data-avatar-environment={environment}
    >
      <AvatarErrorBoundary onError={reportError} resetKey={modelKey}>
        <Canvas
          camera={{ fov: 30, near: 0.01, far: 100, position: [0, 0.86, 3.35] }}
          dpr={dpr}
          frameloop={rendering ? "always" : "never"}
          gl={{
            // Allocate alpha once so Gallery can change composition without remounting the model.
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.info.autoReset = true;
            if (environment === "cinematic") configureHologramRenderer(gl, environment);
            else configureHologramRenderer(gl);
            gl.setClearColor(0x010409, environment === "cinematic" && !isolateCompanion && appearance === "dark" ? 1 : 0);
          }}
          shadows={environment === "cinematic"}
        >
          <Suspense fallback={null}>
            <InteractiveAvatarScene
              companionVisible={companionVisible}
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
              motionState={motionState}
              environment={environment}
              isolateCompanion={isolateCompanion}
              platformStyle={platformStyle}
              motionSource={motionSource}
              motionRigBinding={motionRigBinding}
              modelId={modelId}
              cameraFraming={cameraFraming}
              rotationOffsetY={rotationOffsetY}
              appearance={appearance}
              cameraZoom={cameraZoom}
            />
          </Suspense>
          <Suspense fallback={null}>{sceneContent}</Suspense>
        </Canvas>
      </AvatarErrorBoundary>
      {debug ? (
        <AvatarAnimationDebugPanel snapshot={animationDebug} />
      ) : null}
    </div>
  );
}
