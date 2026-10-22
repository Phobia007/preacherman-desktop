import { SettingsMenu } from "../../settings/SettingsScreen";
import { readPreferences } from "../../preferences";
import "./asset-settings.css";

export const assetSettingsItems = [
  "Execution Mode", "Instructions / Rules", "Memory", "External MCP", "Connectors", "MCP Servers",
] as const;

export function AssetSettings({ onFocusChange }: { onFocusChange: (focused: boolean) => void }) {
  return <SettingsMenu locale={readPreferences().locale} layout="asset" items={assetSettingsItems} onFocusChange={onFocusChange} />;
}

export function AssetInfoSection({ section, name }: { section: "Skills" | "Info Map"; name: string }) {
  const skills = section === "Skills";
  return <div className="asset-section-info">
    <p className="asset-section__eyebrow">{name} / {section}</p>
    <h2>{skills ? "Skills & plugins" : "Memory & ownership"}</h2>
    <p className="asset-section-info__intro">{skills ? "The capabilities behind your companion." : "Your companion’s context, connections and history."}</p>
    <div className="asset-section-info__rows">
      {(skills ? ["Skills", "Plugins"] : ["Memory", "Ownership history"]).map(label => <section key={label}>
        <h3>{label}</h3><p>{skills ? "Character-specific configuration is not available yet." : "Character history is not connected yet."}</p>
      </section>)}
    </div>
  </div>;
}
