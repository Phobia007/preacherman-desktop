import { SettingsMenu } from "../../settings/SettingsScreen";
import { readPreferences } from "../../preferences";
import "./asset-settings.css";

export const assetSettingsItems = [
  "Execution Mode", "Voice Service", "Motion Service", "Instructions / Rules", "Memory", "External MCP", "Connectors", "MCP Servers",
] as const;

export function AssetSettings({ onFocusChange, characterId, requestedItem, onOpenVoice, onOpenAction }: { onFocusChange: (focused: boolean) => void; characterId: string; requestedItem?: string | null; onOpenVoice?: () => void; onOpenAction?: () => void }) {
  return <SettingsMenu characterId={characterId} locale={readPreferences().locale} layout="asset" items={assetSettingsItems} onFocusChange={onFocusChange} requestedItem={requestedItem} onOpenVoice={onOpenVoice} onOpenAction={onOpenAction} />;
}
