import {
  InteractiveAvatarViewport,
  createAvatarAssetUrls,
  prefetchAvatarModel,
  type AvatarCameraFraming,
  type AvatarSceneEnvironment,
} from "@preacherman/avatar-renderer";
import { useCallback, useEffect, useState } from "react";
import { localAvatarAssetBaseUrl } from "../avatar/avatarAssets";
import { useAvatarInteractionState } from "../live/LiveCoordinatorContext";
import {
  cortanaSpeechMotionBinding,
  zimaSpeechMotionBinding,
} from "../motion/avatarRigBindings";
import type { ModelId } from "../preferences";
import { speechMotionRuntime } from "../motion/SpeechMotionRuntime";

interface CortanaModelStageProps {
  readonly ariaLabel: string;
  readonly environment?: AvatarSceneEnvironment;
  readonly isolateCompanion?: boolean;
  readonly variant?: "embedded" | "persistent";
  readonly wakeEnabled?: boolean;
  readonly renderActive?: boolean;
  readonly modelId?: ModelId;
  readonly prefetchModelId?: ModelId;
  readonly cameraFraming?: AvatarCameraFraming;
  readonly rotationOffsetY?: number;
}

export function CortanaModelStage({
  ariaLabel,
  environment = "transparent",
  isolateCompanion = false,
  variant = "embedded",
  wakeEnabled = false,
  renderActive = true,
  modelId = "cortana",
  prefetchModelId,
  cameraFraming = "full-body",
  rotationOffsetY = 0,
}: CortanaModelStageProps) {
  const modelName = modelId === "cortana" ? "Cortana" : "Zima";
  const interactionState = useAvatarInteractionState();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [jawOpen, setJawOpen] = useState(0);
  const [awakened, setAwakened] = useState(false);
  const handleError = useCallback(() => setLoadState("error"), []);
  const handleReady = useCallback(() => setLoadState("ready"), []);
  const defaultActionId = modelId === "zima" ? "idle.zima" : "idle.catwalk";

  useEffect(() => {
    setLoadState("loading");
  }, [modelId]);

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

  useEffect(() => {
    if (!wakeEnabled) setAwakened(false);
  }, [wakeEnabled]);

  useEffect(() => {
    const syncWakeState = (event: Event) => {
      setAwakened(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    };
    window.addEventListener("preacherman:voice-wake-state", syncWakeState);
    return () => window.removeEventListener("preacherman:voice-wake-state", syncWakeState);
  }, []);

  const toggleWake = () => {
    const active = !awakened;
    setAwakened(active);
    window.dispatchEvent(new CustomEvent("preacherman:voice-wake-request", {
      detail: { active },
    }));
  };

  return (
    <section
      aria-label={ariaLabel}
      className={`cortana-model-stage cortana-model-stage--${variant}`}
      data-preacherman-control="avatar.status"
      data-avatar-state={interactionState}
      data-awake={awakened ? "true" : "false"}
      data-motion-action={defaultActionId}
      data-scene-environment={environment}
      tabIndex={-1}
    >
      <InteractiveAvatarViewport
        actionId={defaultActionId}
        assetBaseUrl={localAvatarAssetBaseUrl(modelId)}
        onError={handleError}
        onReady={handleReady}
        pose="standby"
        quality="high"
        jawOpen={jawOpen}
        environment={environment}
        isolateCompanion={isolateCompanion}
        awakened={awakened}
        motionSource={speechMotionRuntime}
        motionRigBinding={modelId === "cortana" ? cortanaSpeechMotionBinding : zimaSpeechMotionBinding}
        modelId={modelId}
        cameraFraming={cameraFraming}
        renderActive={renderActive}
        rotationOffsetY={rotationOffsetY}
      />
      {wakeEnabled ? (
        <button
          aria-label={awakened ? `Stop talking with ${modelName}` : `Talk with ${modelName}`}
          aria-pressed={awakened}
          className="cortana-model-stage__wake-button"
          data-preacherman-control="voice.wake"
          onClick={toggleWake}
          type="button"
        />
      ) : null}
      {loadState === "loading" ? (
        <div aria-label={`Loading ${modelName}`} className="cortana-model-stage__loading" role="status">
          <span />
        </div>
      ) : null}
      {loadState === "error" ? (
        <div className="cortana-model-stage__error" role="alert">
          The local model could not be loaded.
        </div>
      ) : null}
      <div aria-hidden="true" className="cortana-model-stage__ground" />
    </section>
  );
}
