import { preachermanServiceRequest } from "../preacherman/capabilityClient";

export interface VoiceServiceDraft { provider: string; model: string; region: string; workspaceId: string }
export interface CharacterVoiceOption { id: string; name: string; voiceId: string; provider: string; model: string; hasPreview: boolean; source?: "breeze"; description?: string; language?: "zh" | "en" | "unknown" }
export interface CharacterVoiceSettings {
  characterId: string; service: VoiceServiceDraft; connectionStatus: "not-connected" | "connected" | "offline"; breezeStatus?: "connected" | "offline";
  selectedVoiceId: string | null; voices: CharacterVoiceOption[];
}
export function characterVoiceRequest<T>(id: string, action = "", body?: unknown, signal?: AbortSignal, method?: string) {
  return preachermanServiceRequest<T>(`/api/characters/${encodeURIComponent(id)}/voice${action}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(action === "/connect" ? 200000 : action.startsWith("/preview") ? 20000 : 15000)]),
  });
}
