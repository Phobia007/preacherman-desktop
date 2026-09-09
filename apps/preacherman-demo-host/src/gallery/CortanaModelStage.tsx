import {
  InteractiveAvatarViewport,
  createAvatarAssetUrls,
  prefetchAvatarModel,
  type AvatarActionDescriptor,
  type AvatarCameraFraming,
  type AvatarSceneEnvironment,
} from "@preacherman/avatar-renderer";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  readonly idleActionOnly?: boolean;
  readonly showControls?: boolean;
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
  idleActionOnly = false,
  showControls = false,
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
  const [actions, setActions] = useState<readonly AvatarActionDescriptor[]>([]);
  const [actionsModelId, setActionsModelId] = useState<ModelId>(modelId);
  const [selectedActionId, setSelectedActionId] = useState("");
  const [playingActionId, setPlayingActionId] = useState<string>();
  const [actionRequestKey, setActionRequestKey] = useState(0);
  const [jawOpen, setJawOpen] = useState(0);
  const [awakened, setAwakened] = useState(false);
  const motionActions = useMemo(
    () => actions
      .filter((action) => Boolean(action.packUrl))
      .sort((left, right) => (
        left.category.localeCompare(right.category)
        || left.id.localeCompare(right.id)
      )),
    [actions],
  );
  const receiveActions = useCallback((availableActions: readonly AvatarActionDescriptor[]) => {
    setActionsModelId(modelId);
    setActions(availableActions);
    setSelectedActionId((current) => current || (
      availableActions.find((action) => action.id === "conversation_loop")
      ?? availableActions.find((action) => action.packUrl)
      ?? availableActions[0]
    )?.id || "");
  }, [modelId]);
  const handleError = useCallback(() => setLoadState("error"), []);
  const handleReady = useCallback(() => setLoadState("ready"), []);
  const playSelectedAction = () => {
    if (!selectedActionId) return;
    setPlayingActionId(selectedActionId);
    setActionRequestKey((current) => current + 1);
  };

  useEffect(() => {
    if (actionsModelId !== modelId) return;
    const idleActionId = modelId === "zima" ? "idle.zima" : "idle.catwalk";
    const preferred = idleActionOnly || variant === "persistent"
      ? [idleActionId]
      : interactionState === "speaking"
      ? ["conversation_loop", "chatting"]
      : interactionState === "listening"
        ? ["listening", "looking_around", "conversation_loop"]
        : interactionState === "thinking"
          ? ["thinking", "pondering", "looking_around", "conversation_loop"]
          : [idleActionId];
    const action = preferred
      .map((id) => actions.find((candidate) => candidate.id === id))
      .find(Boolean)
      ?? actions.find((candidate) => candidate.packUrl)
      ?? actions[0];
    if (!action) return;
    setPlayingActionId(action.id);
    setActionRequestKey((current) => current + 1);
  }, [actions, actionsModelId, idleActionOnly, interactionState, modelId, variant]);

  useEffect(() => {
    setActions([]);
    setSelectedActionId("");
    setPlayingActionId(undefined);
    setLoadState("loading");
  }, [modelId]);

  useEffect(() => {
    if (loadState !== "ready" || !prefetchModelId || prefetchModelId === modelId) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      const url = createAvatarAssetUrls(localAvatarAssetBaseUrl(prefetchModelId), prefetchModelId).model;
      void prefetchAvatarModel(url).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loadState, modelId, prefetchModelId]);

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
      data-motion-action={playingActionId || ""}
      data-scene-environment={environment}
      tabIndex={-1}
    >
      <InteractiveAvatarViewport
        actionId={actionsModelId === modelId ? playingActionId : undefined}
        actionRequestKey={actionRequestKey}
        assetBaseUrl={localAvatarAssetBaseUrl(modelId)}
        debug={import.meta.env.DEV && showControls}
        onActionsReady={receiveActions}
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
      {showControls ? <aside className="cortana-motion-picker" aria-label="Cortana motion library">
        <span className="cortana-motion-picker__eyebrow">Motion library</span>
        <strong>{motionActions.length || "—"} actions</strong>
        <select
          aria-label="Select Cortana motion"
          data-preacherman-control="motion.select"
          disabled={motionActions.length === 0}
          onChange={(event) => setSelectedActionId(event.target.value)}
          value={selectedActionId}
        >
          {motionActions.map((action) => (
            <option key={action.id} value={action.id}>
              {action.category} · {action.id}
            </option>
          ))}
        </select>
        <button
          disabled={!selectedActionId || loadState !== "ready"}
          onClick={playSelectedAction}
          type="button"
        >
          Play motion
        </button>
      </aside> : null}
      <div aria-hidden="true" className="cortana-model-stage__ground" />
    </section>
  );
}
