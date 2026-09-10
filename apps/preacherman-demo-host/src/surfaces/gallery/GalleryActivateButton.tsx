import { avatarModelName } from "@preacherman/avatar-renderer";
import { useEffect, useState, type CSSProperties } from "react";
import type { ModelId } from "../../preferences";

const ACTIVATION_FEEDBACK_MS = 1600;

export function GalleryActivateButton({ modelId, activated, enabled, onActivate }: {
  modelId: ModelId;
  activated: boolean;
  enabled: boolean;
  onActivate: (modelId: ModelId) => void;
}) {
  const [feedbackId, setFeedbackId] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const modelName = avatarModelName(modelId);

  // Feedback follows the click; the preference changes immediately.
  useEffect(() => {
    if (!feedbackId) return;
    const timer = window.setTimeout(() => setShowFeedback(false), ACTIVATION_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [feedbackId]);

  return <>
    <button
      aria-describedby="gallery-activate-hint"
      aria-label={activated ? `Deactivate ${modelName}` : `Activate ${modelName}`}
      aria-pressed={activated}
      disabled={!enabled}
      className="gallery-detail__activate"
      data-activated={activated}
      data-charging={showFeedback}
      onClick={() => {
        onActivate(modelId);
        setShowFeedback(true);
        setFeedbackId((current) => current + 1);
      }}
      style={{ "--activation-duration": `${ACTIVATION_FEEDBACK_MS}ms` } as CSSProperties}
      type="button"
    >
      <span className="gallery-detail__activate-label" key={`label-${feedbackId}`}>{activated ? "Activated" : "Activate"}</span>
      <svg aria-hidden="true" className="gallery-detail__charge" viewBox="0 0 204 62" fill="none" key={feedbackId}>
        {[
          "M102 1H173A30 30 0 0 1 173 61H102",
          "M102 1H31A30 30 0 0 0 31 61H102",
        ].map((path) => <path className="gallery-detail__charge-pulse" d={path} key={path} pathLength="100" />)}
      </svg>
    </button>
    <span className="gallery-detail__assistive" id="gallery-activate-hint">
      {activated ? "Click to hide the companion outside Gallery. This preview stays visible." : "Click to show this companion on Home and other pages. Gallery previews stay independent."}
    </span>
    <span aria-live="polite" className="gallery-detail__assistive">
      {activated ? `${modelName} is shown outside Gallery.` : `${modelName} is not applied outside Gallery.`}
    </span>
  </>;
}
