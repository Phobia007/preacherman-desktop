import type { ModelId } from "../../preferences";

// Existing card identities, copy and media stay intact; only their model binding changes.
export const galleryModelBindings = {
  "secret-sky": "cortana",
  "watson-masters": "zima",
  "climatune": "jubilee-midnight-mutant",
  "eye-of-the-stormers": "halo-mk-v-model",
  "bon-iver-viisualiizer": "kitana-mk11-in-mk9-suit",
  "classic-stories-retold": "punk-magik",
  "mastered-from-chaos": "nier-print-2b",
  "emmit-fenn": "nier-print-9s",
  "spacecraft-for-all": "clove-t-pose",
  "i-will-what-i-want": "nier-automata-2b",
  "acoustic-garage": "iron-man-mark-1",
  "witness-gotham": "stellar-blade-lily-stargazer-coat",
  "toonami": "miles-variant-1",
  "halo-5-visualizer": "miles-variant-2",
  "rick-and-morty": "iron-man-mark-85",
  "discover-your-patronus": "the-twins-atomic-heart",
  "airman-challenge": "modural-robot-mecha-chimera-dyan-high-poly-mesh",
  "open-source-rover": "dark-knight",
  "beat-that": "spartan-armour-mkv-halo-reach",
  "welcome-to-hogwarts": "scifi-girl-v01",
  "wonderful-weekends": "proxima",
  "million-piece-mission": "halloween-the-game-michael-myers-samhain",
} as const satisfies Readonly<Record<string, ModelId | null>>;
export function galleryModelForProject(project: string): ModelId | null {
  return (galleryModelBindings as Readonly<Record<string, ModelId | null>>)[project] ?? null;
}
const models: ModelId[] = Object.values(galleryModelBindings).filter(modelId => modelId !== null);
export function adjacentGalleryModel(modelId: ModelId): ModelId | undefined {
  const index = models.indexOf(modelId);
  return index < 0 ? undefined : models[index + 1] ?? models[index - 1];
}
