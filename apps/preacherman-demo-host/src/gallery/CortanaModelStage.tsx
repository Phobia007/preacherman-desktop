import {
  InteractiveAvatarViewport,
  type AvatarActionDescriptor,
} from "@preacherman/avatar-renderer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { localAvatarAssetBaseUrl } from "../avatar/avatarAssets";

interface CortanaModelStageProps {
  readonly ariaLabel: string;
}

export function CortanaModelStage({ ariaLabel }: CortanaModelStageProps) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [actions, setActions] = useState<readonly AvatarActionDescriptor[]>([]);
  const [selectedActionId, setSelectedActionId] = useState("");
  const [playingActionId, setPlayingActionId] = useState<string>();
  const [actionRequestKey, setActionRequestKey] = useState(0);
  const [jawOpen, setJawOpen] = useState(0);
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
    setActions(availableActions);
    setSelectedActionId((current) => current || (
      availableActions.find((action) => action.id === "conversation_loop")
      ?? availableActions.find((action) => action.packUrl)
    )?.id || "");
  }, []);
  const handleError = useCallback(() => setLoadState("error"), []);
  const handleReady = useCallback(() => setLoadState("ready"), []);
  const playSelectedAction = () => {
    if (!selectedActionId) return;
    setPlayingActionId(selectedActionId);
    setActionRequestKey((current) => current + 1);
  };

  useEffect(() => {
    const applyPerformanceState = (event: Event) => {
      const state = (event as CustomEvent<string>).detail;
      const preferred = state === "speaking"
        ? ["conversation_loop", "chatting"]
        : state === "listening"
          ? ["listening", "looking_around", "conversation_loop"]
          : ["conversation_loop"];
      const action = preferred
        .map((id) => actions.find((candidate) => candidate.id === id))
        .find(Boolean)
        ?? actions.find((candidate) => candidate.packUrl);
      if (!action) return;
      setPlayingActionId(action.id);
      setActionRequestKey((current) => current + 1);
    };
    window.addEventListener("preacherman:avatar-state", applyPerformanceState);
    return () => window.removeEventListener("preacherman:avatar-state", applyPerformanceState);
  }, [actions]);

  useEffect(() => {
    const applyJawOpen = (event: Event) => setJawOpen((event as CustomEvent<number>).detail || 0);
    window.addEventListener("preacherman:avatar-jaw", applyJawOpen);
    return () => window.removeEventListener("preacherman:avatar-jaw", applyJawOpen);
  }, []);

  return (
    <section aria-label={ariaLabel} className="cortana-model-stage">
      <InteractiveAvatarViewport
        actionId={playingActionId}
        actionRequestKey={actionRequestKey}
        assetBaseUrl={localAvatarAssetBaseUrl()}
        debug={import.meta.env.DEV}
        onActionsReady={receiveActions}
        onError={handleError}
        onReady={handleReady}
        pose="standby"
        quality="high"
        jawOpen={jawOpen}
      />
      {loadState === "loading" ? (
        <div aria-label="Loading Cortana" className="cortana-model-stage__loading" role="status">
          <span />
        </div>
      ) : null}
      {loadState === "error" ? (
        <div className="cortana-model-stage__error" role="alert">
          The local model could not be loaded.
        </div>
      ) : null}
      <aside className="cortana-motion-picker" aria-label="Cortana motion library">
        <span className="cortana-motion-picker__eyebrow">Motion library</span>
        <strong>{motionActions.length || "—"} actions</strong>
        <select
          aria-label="Select Cortana motion"
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
      </aside>
      <div aria-hidden="true" className="cortana-model-stage__ground" />
    </section>
  );
}
