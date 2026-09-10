import { avatarModelName } from "@preacherman/avatar-renderer";
import { useState } from "react";
import type { Appearance, Locale, ModelId } from "../preferences";
import { JesperPortfolioExperience } from "../components/sites/127-0-0-1-8131-a5f8cf00/root-8a5edab2/JesperPortfolioExperience";
import { CortanaModelStage } from "./CortanaModelStage";
import "./cortana-gallery.css";

interface CortanaGalleryProps {
  readonly active: boolean;
  readonly activeModelId: ModelId | null;
  readonly appearance: Appearance;
  readonly locale: Locale;
  readonly onActiveModelChange: (modelId: ModelId | null) => void;
}

export function CortanaGallery({
  active,
  activeModelId,
  appearance,
  onActiveModelChange,
}: CortanaGalleryProps) {
  const [detailModelId, setDetailModelId] = useState<ModelId>(activeModelId ?? "cortana");
  const [detailModelVisible, setDetailModelVisible] = useState(false);
  const [detailModelPrepared, setDetailModelPrepared] = useState(false);
  const modelVisible = active && detailModelVisible;

  const handleDetailVisibilityChange = (modelId: ModelId, visible: boolean) => {
    setDetailModelId(modelId);
    setDetailModelVisible(visible);
    setDetailModelPrepared(true);
  };

  return (
    <main
      aria-hidden={!active}
      aria-label="Gallery"
      className="cortana-gallery"
      data-active={active ? "true" : "false"}
      data-transition="spatial"
    >
      <JesperPortfolioExperience
        active={active}
        activeModelId={activeModelId}
        appearance={appearance}
        onDetailModelVisibilityChange={handleDetailVisibilityChange}
        onActiveModelChange={onActiveModelChange}
      />
      {detailModelPrepared ? (
        <section
          aria-hidden={!modelVisible}
          aria-label={`${avatarModelName(detailModelId)} 3D model preview`}
          className="cortana-gallery__detail-model"
          data-visible={modelVisible ? "true" : "false"}
        >
          <CortanaModelStage
            ariaLabel={`${avatarModelName(detailModelId)} 3D model`}
            key={detailModelId}
            modelId={detailModelId}
            renderActive={modelVisible}
          />
        </section>
      ) : null}
    </main>
  );
}
