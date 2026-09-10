import type { ModelId } from "../../preferences";

// Existing card identities, copy and media stay intact; only their model binding changes.
export const galleryModelBindings = {
  "secret-sky": "cortana",
  "watson-masters": "zima",
  "climatune": "jubilee-midnight-mutant",
  "eye-of-the-stormers": "halo-mk-v-model",
  "bon-iver-viisualiizer": "magik-soul-surfer",
  "classic-stories-retold": "punk-magik",
  "mastered-from-chaos": "sanhua-wuthering-waves",
  "emmit-fenn": "black-cat-coastal-cat",
  "spacecraft-for-all": "clove-t-pose",
  "i-will-what-i-want": "black-widow-aquatic-assassin",
} as const satisfies Readonly<Record<string, ModelId>>;
export function galleryModelForProject(project: string): ModelId | null {
  return (galleryModelBindings as Readonly<Record<string, ModelId>>)[project] ?? null;
}
const models = Object.values(galleryModelBindings);
export function adjacentGalleryModel(modelId: ModelId): ModelId | undefined {
  const index = models.indexOf(modelId);
  return index < 0 ? undefined : models[index + 1] ?? models[index - 1];
}
