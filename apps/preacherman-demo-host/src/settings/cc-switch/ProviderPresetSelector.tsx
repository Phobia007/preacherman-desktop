// Adapted from CC Switch ProviderPresetSelector (MIT, Jason Young).
// Preserves preset selection -> inline form; limited to our supported providers.
// Source and adaptation boundary: public/licenses/cc-switch.txt.
export interface ProviderPreset {
  id: "deepseek" | "dashscope";
  name: string;
  description: string;
}

export function ProviderPresetSelector({ selectedPresetId, presetEntries, onPresetChange, disabled, label }: {
  selectedPresetId: ProviderPreset["id"];
  presetEntries: readonly ProviderPreset[];
  onPresetChange: (value: ProviderPreset["id"]) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <fieldset className="ai-provider-settings__presets" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {presetEntries.map((entry) => (
          <button key={entry.id} type="button" aria-pressed={selectedPresetId === entry.id}
            onClick={() => onPresetChange(entry.id)}>
            <strong>{entry.name}</strong>
            <span>{entry.description}</span>
            {selectedPresetId === entry.id && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
