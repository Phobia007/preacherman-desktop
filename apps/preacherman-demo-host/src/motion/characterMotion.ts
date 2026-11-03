import rigs from "./characterMotionRigs.json";
import { preachermanServiceRequest } from "../preacherman/capabilityClient";

export type MotionStyle = "subtle" | "natural" | "expressive";
export interface CharacterMotionSettings { characterId: string; supported: boolean; enabled: boolean; style: MotionStyle }
export const motionStrength: Record<MotionStyle, number> = { subtle: 0.3, natural: 0.55, expressive: 0.8 };
export function defaultCharacterMotion(id: string): CharacterMotionSettings {
  const rig = (rigs as Record<string, { defaultStyle: string }>)[id];
  return { characterId: id, supported: Boolean(rig), enabled: Boolean(rig), style: (rig?.defaultStyle ?? "subtle") as MotionStyle };
}
export function characterMotionRequest(id: string, signal: AbortSignal, config?: { enabled: boolean; style: MotionStyle }) {
  return preachermanServiceRequest<CharacterMotionSettings>(`/api/characters/${encodeURIComponent(id)}/motion`, {
    method: config ? "POST" : "GET", body: config ? JSON.stringify(config) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
}
