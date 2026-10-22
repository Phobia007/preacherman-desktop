import { AIProvidersSettings } from "../../settings/AIProvidersSettings";
import { readPreferences } from "../../preferences";

export function AssetSettings({ name }: { name: string }) {
  return <div className="asset-settings settings-v3__detail-content">
    <p className="asset-section__eyebrow">{name} / Settings</p>
    <p className="asset-settings__scope">Shared API connections for your characters.</p>
    <AIProvidersSettings locale={readPreferences().locale} />
  </div>;
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
