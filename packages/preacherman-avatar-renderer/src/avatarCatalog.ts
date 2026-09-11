import type { AvatarModelId } from "./types";
import type { AvatarActionDescriptor } from "./avatar/types/avatarAnimation";

export const importedAvatarModels = [
  { id: "jubilee-midnight-mutant", name: "Jubilee" },
  { id: "halo-mk-v-model", name: "Halo MK V" },
  { id: "magik-soul-surfer", name: "Magik Soul Surfer" },
  { id: "punk-magik", name: "Punk Magik" },
  { id: "sanhua-wuthering-waves", name: "Sanhua" },
  { id: "black-cat-coastal-cat", name: "Black Cat" },
  { id: "clove-t-pose", name: "Clove" },
  { id: "black-widow-aquatic-assassin", name: "Black Widow" },
  { id: "kitana-mk11-in-mk9-suit", name: "Kitana", studioReflections: true },
  { id: "nier-print-2b", name: "2B · Seated", studioReflections: true },
  { id: "nier-print-9s", name: "9S", studioReflections: true },
  { id: "nier-automata-2b", name: "2B", studioReflections: true },
  { id: "iron-man-mark-1", name: "Iron Man Mark I", studioReflections: true },
  { id: "stellar-blade-lily-stargazer-coat", name: "Lily", studioReflections: true },
  { id: "miles-variant-1", name: "Miles · Masked", studioReflections: true },
  { id: "miles-variant-2", name: "Miles · Unmasked", studioReflections: true },
  { id: "iron-man-mark-85", name: "Iron Man Mark 85", studioReflections: true },
  { id: "the-twins-atomic-heart", name: "Atomic Heart · Twin", studioReflections: true },
  { id: "modural-robot-mecha-chimera-dyan-high-poly-mesh", name: "Dyan", studioReflections: true },
  { id: "dark-knight", name: "Dark Knight", studioReflections: true },
  { id: "spartan-armour-mkv-halo-reach", name: "Spartan MK V · Reach", studioReflections: true },
  { id: "scifi-girl-v01", name: "Sci-fi Girl", studioReflections: true },
  { id: "proxima", name: "Proxima", studioReflections: true },
  { id: "halloween-the-game-michael-myers-samhain", name: "Michael Myers · Samhain", studioReflections: true },
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
export const avatarReflectionIntensity = (id: AvatarModelId): number => importedAvatarModels.some(model => model.id === id && "studioReflections" in model) ? 0.3 : 0;
export const avatarDefaultActionId = (id: AvatarModelId): string => id === "cortana" ? "idle.catwalk" : id === "zima" ? "idle.zima" : "idle.default";

const importedIdleMotions: Readonly<Record<ImportedAvatarModelId, string>> = {
  "black-cat-coastal-cat": "female",
  "black-widow-aquatic-assassin": "breathing",
  "clove-t-pose": "neutral",
  "halo-mk-v-model": "male",
  "jubilee-midnight-mutant": "female",
  "magik-soul-surfer": "weight_shift",
  "punk-magik": "standard",
  "sanhua-wuthering-waves": "breathing",
  "kitana-mk11-in-mk9-suit": "female",
  "nier-print-2b": "seated",
  "nier-print-9s": "breathing",
  "nier-automata-2b": "breathing",
  "iron-man-mark-1": "breathing",
  "stellar-blade-lily-stargazer-coat": "neutral",
  "miles-variant-1": "standard",
  "miles-variant-2": "standard",
  "iron-man-mark-85": "breathing",
  "the-twins-atomic-heart": "breathing",
  "modural-robot-mecha-chimera-dyan-high-poly-mesh": "breathing",
  "dark-knight": "breathing",
  "spartan-armour-mkv-halo-reach": "male",
  "scifi-girl-v01": "breathing",
  "proxima": "ready",
  "halloween-the-game-michael-myers-samhain": "male"
};

interface ImportedAvatarProfile {
  readonly avatarId: string;
  readonly defaultActionId: string;
  readonly actions: readonly AvatarActionDescriptor[];
  readonly jawBone: null;
  readonly modelFile: string;
  readonly rigId: string;
  readonly stateMap: { readonly idle: string };
  readonly transform: { readonly rotationY: number; readonly scale: number; readonly verticalOffset: number };
}
export const importedAvatarProfiles = importedAvatarModels.reduce((profiles, { id }) => {
  profiles[id] = {
  avatarId: id,
  defaultActionId: "idle.default",
  actions: [{ id: "idle.default", clipName: id === "nier-print-2b" ? "nier-print-2b.idle.seated.v3" : `${id}.idle.${importedIdleMotions[id]}.v2`, category: "idle", loop: "repeat", fadeIn: 0.35, fadeOut: 0.35, timeScale: 1, priority: 10, interruptible: true }],
  jawBone: null,
  modelFile: `${id}-runtime.glb`,
  rigId: id,
  stateMap: { idle: "idle.default" },
  transform: { rotationY: 0, scale: 1, verticalOffset: 0 },
  };
  return profiles;
}, {} as Record<ImportedAvatarModelId, ImportedAvatarProfile>);
