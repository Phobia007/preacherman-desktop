import { SettingsMenu } from "../../settings/SettingsScreen";
import { readPreferences } from "../../preferences";
import "./asset-settings.css";

export const assetSettingsItems = [
  "Execution Mode", "Instructions / Rules", "Memory", "External MCP", "Connectors", "MCP Servers",
] as const;

export function AssetSettings({ onFocusChange, characterId }: { onFocusChange: (focused: boolean) => void; characterId: string }) {
  return <SettingsMenu characterId={characterId} locale={readPreferences().locale} layout="asset" items={assetSettingsItems} onFocusChange={onFocusChange} />;
}
