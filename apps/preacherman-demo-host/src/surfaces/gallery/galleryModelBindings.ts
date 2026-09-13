import type { ModelId } from "../../preferences";

// Existing card identities, copy and media stay intact; only their model binding changes.
export const galleryModelBindings = {
  "secret-sky": "cortana",
  "watson-masters": "zima",
  "climatune": "jubilee-midnight-mutant",
  "eye-of-the-stormers": "halo-mk-v-model",
  "bon-iver-viisualiizer": "kitana-mk11-in-mk9-suit",
  "classic-stories-retold": "punk-magik",
  "mastered-from-chaos": "clove-t-pose",
  "emmit-fenn": "nier-automata-2b",
  "spacecraft-for-all": "stellar-blade-lily-stargazer-coat",
  "i-will-what-i-want": "iron-man-mark-85",
  "acoustic-garage": "the-twins-atomic-heart",
  "witness-gotham": "spartan-armour-mkv-halo-reach",
  "toonami": "halloween-the-game-michael-myers-samhain",
  "halo-5-visualizer": "apex-legend-pathfinder",
} as const satisfies Readonly<Record<string, ModelId | null>>;
export function galleryModelForProject(project: string): ModelId | null {
  return (galleryModelBindings as Readonly<Record<string, ModelId | null>>)[project] ?? null;
}
const models: ModelId[] = Object.values(galleryModelBindings).filter(modelId => modelId !== null);
export function adjacentGalleryModel(modelId: ModelId): ModelId | undefined {
  const index = models.indexOf(modelId);
  return index < 0 ? undefined : models[index + 1] ?? models[index - 1];
}
