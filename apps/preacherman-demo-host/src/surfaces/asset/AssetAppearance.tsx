import type { ModelId } from "../../preferences";
import { AssetActivateButton } from "./AssetActivateButton";
import characters from "./characters.json";

export const appearanceCategories = ["Costume", "Action", "Voice", "Accessories", "Backgrounds"] as const;
export type AppearanceCategory = typeof appearanceCategories[number];
type Character = typeof characters[number];
const emptyCopy = {
  Voice: "No voice packs have been added for this character.",
  Accessories: "No accessories have been added for this character.",
  Backgrounds: "No character backgrounds have been added yet.",
};

export function AssetAppearance({ character, category, activeModelId, onApply, enabled }: {
  character: Character; category: AppearanceCategory; activeModelId: ModelId | null;
  onApply: (modelId: ModelId) => void; enabled: boolean;
}) {
  // Only advertise the shipped costume and its authored default action. New packs can
  // extend this catalogue later without pretending a recolor is a different costume.
  const available = category === "Costume" || category === "Action";
  const title = category === "Action" ? "Signature idle" : character.designation || "Original";
  const applied = activeModelId === character.id;
  return <div className="asset-appearance" data-category={category}>
    <div className="asset-appearance__collection">
      <p className="asset-appearance__count" aria-label={`${available ? 1 : 0} available ${category.toLowerCase()} options`}>{available ? "1 / 1" : "0 / 0"}</p>
      {available ? <>
        <div className="asset-appearance__tiles" aria-label={`${character.label} ${category.toLowerCase()}`}>
          <button type="button" className="asset-appearance__tile" aria-label={title} aria-pressed="true">
            <span className="asset-appearance__art"><img src={character.cardImage} alt="" /></span>
            <span className="asset-appearance__selected" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7" /></svg></span>
            <span className="asset-appearance__tile-label">{category === "Action" ? "Idle" : "Original"}</span>
          </button>
          {Array.from({ length: 5 }, (_, index) => <span key={index} className="asset-appearance__slot" aria-hidden="true" />)}
        </div>
        <p className="asset-appearance__note">{category === "Costume" ? "Original costume" : "Authored idle motion"}</p>
      </> : <div className="asset-appearance__empty"><h2>{category}</h2><p>{emptyCopy[category]}</p></div>}
    </div>
    {available && <aside className="asset-appearance__selection" aria-label="Selected appearance">
      <div className="asset-appearance__caption"><h2>{character.name}</h2><p>{category} · {title}</p><div className="asset-detail__rule" aria-hidden="true" /></div>
      <div className="asset-appearance__apply"><AssetActivateButton key={`${character.id}-${category}`} modelId={character.id as ModelId} variant="apply"
        activated={applied} enabled={enabled} onActivate={onApply} /></div>
    </aside>}
  </div>;
}
