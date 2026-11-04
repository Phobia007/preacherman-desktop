import { characterKitProfiles } from "./avatar/kits/characterKits";
import type { AvatarModelId } from "./types";
import type { AvatarActionDescriptor } from "./avatar/types/avatarAnimation";

export const importedAvatarModels = [
  { id: "yuffie-ff7re", name: "Yuffie" },
  { id: "aerith-ff7re", name: "Aerith" },
  { id: "tifa-ff7re", name: "Tifa" },
  { id: "apex-legend-pathfinder", name: "Pathfinder" },
  { id: "jubilee-midnight-mutant", name: "Jubilee" },
  { id: "halo-mk-v-model", name: "Halo MK V" },
  { id: "punk-magik", name: "Punk Magik" },
  { id: "clove-t-pose", name: "Clove" },
  { id: "kitana-mk11-in-mk9-suit", name: "Kitana" },
  { id: "nier-automata-2b", name: "2B" },
  { id: "stellar-blade-lily-stargazer-coat", name: "Lily" },
  { id: "iron-man-mark-85", name: "Iron Man Mark 85" },
  { id: "the-twins-atomic-heart", name: "Atomic Heart · Twin" },
  { id: "spartan-armour-mkv-halo-reach", name: "Spartan MK V · Reach" },
  { id: "halloween-the-game-michael-myers-samhain", name: "Michael Myers · Samhain" },
  { id: "ai-moe-deepseek", name: "DeepSeek" },
  { id: "ai-moe-claude", name: "Claude" },
  { id: "ai-moe-gpt", name: "GPT" },
  { id: "ai-moe-gemini", name: "Gemini" },
  { id: "ai-moe-glm", name: "GLM" },
  { id: "ai-moe-grok", name: "Grok" },
  { id: "ai-moe-qwen", name: "Qwen" },
  { id: "ai-moe-kimi", name: "Kimi" },
  { id: "ai-moe-minimax", name: "MiniMax" },
  { id: "ai-moe-doubao", name: "Doubao" },
] as const;
export type ImportedAvatarModelId = typeof importedAvatarModels[number]["id"];

const names: Readonly<Record<AvatarModelId, string>> = {
  cortana: "Cortana", zima: "Zima",
  ...Object.fromEntries(importedAvatarModels.map(model => [model.id, model.name])),
} as Record<AvatarModelId, string>;
export const avatarModelName = (id: AvatarModelId): string => names[id];
export function isAvatarModelId(value: unknown): value is AvatarModelId {
  return typeof value === "string" && Object.hasOwn(names, value);
}
export const avatarUsesHologram = (id: AvatarModelId): boolean => id === "cortana" || id === "zima";
export const avatarDefaultActionId = (id: AvatarModelId): string => id === "cortana" ? "idle.catwalk" : id === "zima" ? "idle.zima" : "idle.default";

const importedIdleMotions: Readonly<Record<ImportedAvatarModelId, string>> = {
  "ai-moe-deepseek": "breathing",
  "ai-moe-claude": "female",
  "ai-moe-gpt": "breathing",
  "ai-moe-gemini": "female",
  "ai-moe-glm": "weight_shift",
  "ai-moe-grok": "breathing",
  "ai-moe-qwen": "weight_shift",
  "ai-moe-kimi": "female",
  "ai-moe-minimax": "weight_shift",
  "ai-moe-doubao": "female",
  "yuffie-ff7re": "feri.standing",
  "aerith-ff7re": "feri.cbnm_id0",
  "tifa-ff7re": "feri.cbnm_id0",
  "apex-legend-pathfinder": "happy",
  "clove-t-pose": "neutral",
  "halo-mk-v-model": "male",
  "jubilee-midnight-mutant": "female",
  "punk-magik": "standard",
  "kitana-mk11-in-mk9-suit": "actorcore_talk",
  "nier-automata-2b": "catwalk_twist",
  "stellar-blade-lily-stargazer-coat": "actorcore_talk",
  "iron-man-mark-85": "breathing",
  "the-twins-atomic-heart": "actorcore_talk",
  "spartan-armour-mkv-halo-reach": "male",
  "halloween-the-game-michael-myers-samhain": "zombie"
};

const importedIdleVersions: Partial<Record<ImportedAvatarModelId, number>> = {
  "halloween-the-game-michael-myers-samhain": 3,
  "nier-automata-2b": 3,
  "kitana-mk11-in-mk9-suit": 3,
  "stellar-blade-lily-stargazer-coat": 3,
  "the-twins-atomic-heart": 3,
};

interface ImportedAvatarProfile {
  readonly avatarId: string;
  readonly defaultActionId: string;
  readonly actions: readonly AvatarActionDescriptor[];
  readonly jawBone: string | null;
  readonly modelFile: string;
  readonly rigId: string;
  readonly stateMap: { readonly idle: string };
  readonly transform: { readonly rotationY: number; readonly scale: number; readonly verticalOffset: number };
}
export const importedAvatarProfiles = importedAvatarModels.reduce((profiles, { id }) => {
  profiles[id] = characterKitProfiles[id as keyof typeof characterKitProfiles] ?? {
  avatarId: id,
  defaultActionId: "idle.default",
  actions: [{ id: "idle.default", clipName: `${id}.idle.${importedIdleMotions[id]}.v${importedIdleVersions[id] ?? 2}`, category: "idle", loop: "repeat", fadeIn: 0.35, fadeOut: 0.35, timeScale: 1, priority: 10, interruptible: true }],
  jawBone: null,
  modelFile: `${id}-runtime.glb`,
  rigId: id,
  stateMap: { idle: "idle.default" },
  transform: { rotationY: 0, scale: 1, verticalOffset: 0 },
  };
  return profiles;
}, {} as Record<ImportedAvatarModelId, ImportedAvatarProfile>);
