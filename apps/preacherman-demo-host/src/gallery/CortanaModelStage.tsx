import {
  InteractiveAvatarViewport,
  avatarModelName,
  avatarDefaultActionId,
  createAvatarAssetUrls,
  prefetchAvatarModel,
  type AvatarCameraFraming,
  type AvatarSceneEnvironment,
} from "@preacherman/avatar-renderer";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { rotateCompanion, zoomCompanion } from "./homeCompanionControls";
import { localAvatarAssetBaseUrl } from "../avatar/avatarAssets";
import { useAvatarInteractionState } from "../live/LiveCoordinatorContext";
import {
  cortanaSpeechMotionBinding,
  zimaSpeechMotionBinding,
} from "../motion/avatarRigBindings";
import type { ModelId } from "../preferences";
import { speechMotionRuntime } from "../motion/SpeechMotionRuntime";

interface CortanaModelStageProps {
  readonly sceneContent?: ReactNode;
  readonly companionVisible?: boolean;
  readonly ariaLabel: string;
  readonly environment?: AvatarSceneEnvironment;
  readonly isolateCompanion?: boolean;
  readonly variant?: "embedded" | "persistent";
  readonly renderActive?: boolean;
  readonly modelId?: ModelId;
  readonly prefetchModelId?: ModelId;
  readonly cameraFraming?: AvatarCameraFraming;
  readonly rotationOffsetY?: number;
  readonly appearance?: "light" | "dark";
  readonly homeInteractive?: boolean;
}

export function CortanaModelStage({
  sceneContent,
  companionVisible = true,
  ariaLabel,
  environment = "transparent",
  isolateCompanion = false,
  variant = "embedded",
  renderActive = true,
  modelId = "cortana",
  prefetchModelId,
  cameraFraming = "full-body",
  rotationOffsetY = 0,
  appearance = "dark",
  homeInteractive = false,
}: CortanaModelStageProps) {
  const [yaw, setYaw] = useState(0);
  const [zoom, setZoom] = useState(0);
  const gestureRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number } | null>(null);
  useEffect(() => {
    const target = gestureRef.current;
    if (!homeInteractive || !target) { drag.current = null; return; }
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(current => zoomCompanion(current, event.deltaY, event.deltaMode));
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  }, [homeInteractive]);
  const modelName = avatarModelName(modelId);
  const interactionState = useAvatarInteractionState();
  const [readyModel, setReadyModel] = useState<ModelId | null>(null);
  const [failedModel, setFailedModel] = useState<ModelId | null>(null);
  const loadState = failedModel === modelId ? "error" : readyModel === modelId ? "ready" : "loading";
  const [jawOpen, setJawOpen] = useState(0);
  const handleError = useCallback(() => setFailedModel(modelId), [modelId]);
  const handleReady = useCallback(() => { setReadyModel(modelId); setFailedModel(null); }, [modelId]);
  const defaultActionId = avatarDefaultActionId(modelId);

  useEffect(() => {
    if (!renderActive || loadState !== "ready" || !prefetchModelId || prefetchModelId === modelId) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      const url = createAvatarAssetUrls(localAvatarAssetBaseUrl(prefetchModelId), prefetchModelId).model;
      void prefetchAvatarModel(url).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loadState, modelId, prefetchModelId, renderActive]);

  useEffect(() => {
    const applyJawOpen = (event: Event) => setJawOpen((event as CustomEvent<number>).detail || 0);
    window.addEventListener("preacherman:avatar-jaw", applyJawOpen);
    return () => window.removeEventListener("preacherman:avatar-jaw", applyJawOpen);
  }, []);

  return (
    <section
      aria-label={ariaLabel}
      className={`cortana-model-stage cortana-model-stage--${variant}`}
      data-preacherman-control="avatar.status"
      data-avatar-state={interactionState}
      data-motion-action={defaultActionId}
      data-scene-environment={environment}
      data-home-yaw={homeInteractive ? yaw : 0}
      data-home-zoom={homeInteractive ? zoom : 0}
      tabIndex={-1}
    >
      <InteractiveAvatarViewport
        sceneContent={sceneContent}
        companionVisible={companionVisible}
        actionId={defaultActionId}
        assetBaseUrl={localAvatarAssetBaseUrl(modelId)}
        onError={handleError}
        onReady={handleReady}
        pose="standby"
        quality="high"
        jawOpen={jawOpen}
        motionState={interactionState}
        environment={environment}
        isolateCompanion={isolateCompanion}
        motionSource={speechMotionRuntime}
        motionRigBinding={modelId === "cortana" ? cortanaSpeechMotionBinding : modelId === "zima" ? zimaSpeechMotionBinding : undefined}
        modelId={modelId}
        cameraFraming={cameraFraming}
        renderActive={renderActive}
        rotationOffsetY={rotationOffsetY + (homeInteractive ? yaw : 0)}
        cameraZoom={homeInteractive ? zoom : 0}
        appearance={appearance}
      />
      {homeInteractive ? <div
        ref={gestureRef}
        className="home-companion-gesture"
        aria-label="Rotate companion with left and right arrows; zoom with up and down arrows"
        role="group"
        tabIndex={0}
        onPointerDown={event => {
          if (event.button !== 0) return;
          drag.current = { id: event.pointerId, x: event.clientX };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset.dragging = "true";
        }}
        onPointerMove={event => {
          if (drag.current?.id !== event.pointerId) return;
          const dx = event.clientX - drag.current.x;
          const width = event.currentTarget.getBoundingClientRect().width;
          drag.current.x = event.clientX;
          setYaw(current => rotateCompanion(current, dx, width));
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
          event.currentTarget.dataset.dragging = "false";
        }}
        onLostPointerCapture={event => { drag.current = null; event.currentTarget.dataset.dragging = "false"; }}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "Home") { setYaw(0); setZoom(0); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowRight") setYaw(current => current + (event.key === "ArrowLeft" ? -.15 : .15));
          else setZoom(current => zoomCompanion(current, event.key === "ArrowUp" ? -70 : 70));
        }}
      /> : null}
      {companionVisible && loadState === "loading" ? (
        <div aria-label={`Loading ${modelName}`} className="cortana-model-stage__loading" role="status">
          <span />
        </div>
      ) : null}
      {companionVisible && loadState === "error" ? (
        <div className="cortana-model-stage__error" role="alert">
          The local model could not be loaded.
        </div>
      ) : null}
      <div aria-hidden="true" className="cortana-model-stage__ground" />
    </section>
  );
}
