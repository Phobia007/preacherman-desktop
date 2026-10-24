import { SettingsMenu } from "../../settings/SettingsScreen";
import { readPreferences } from "../../preferences";
import "./asset-settings.css";

export const assetSettingsItems = [
  "Execution Mode", "Voice Service", "Instructions / Rules", "Memory", "External MCP", "Connectors", "MCP Servers",
] as const;

export function AssetSettings({ onFocusChange, characterId, requestedItem, onOpenVoice }: { onFocusChange: (focused: boolean) => void; characterId: string; requestedItem?: string | null; onOpenVoice?: () => void }) {
  return <SettingsMenu characterId={characterId} locale={readPreferences().locale} layout="asset" items={assetSettingsItems} onFocusChange={onFocusChange} requestedItem={requestedItem} onOpenVoice={onOpenVoice} />;
}
