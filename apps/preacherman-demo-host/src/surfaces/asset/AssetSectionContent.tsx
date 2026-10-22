import { SettingsMenu } from "../../settings/SettingsScreen";
import { readPreferences } from "../../preferences";
import "./asset-settings.css";

export const assetSettingsItems = [
  "Execution Mode", "Instructions / Rules", "Memory", "External MCP", "Connectors", "MCP Servers",
] as const;

export function AssetSettings({ onFocusChange }: { onFocusChange: (focused: boolean) => void }) {
  return <SettingsMenu locale={readPreferences().locale} layout="asset" items={assetSettingsItems} onFocusChange={onFocusChange} />;
}
