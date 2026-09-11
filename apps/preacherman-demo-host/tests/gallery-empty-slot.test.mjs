import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const host = join(import.meta.dirname, "..");
async function load(relative) {
  const source = await readFile(join(host, relative), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const renderer = pathToFileURL(join(host, "../../packages/preacherman-avatar-renderer/dist/index.js")).href;
  return import("data:text/javascript;base64," + Buffer.from(outputText.replaceAll("@preacherman/avatar-renderer", renderer)).toString("base64"));
}

const withdrawn = ["sanhua-wuthering-waves", "magik-soul-surfer", "black-cat-coastal-cat", "black-widow-aquatic-assassin"];

test("withdrawn models stay unavailable when their former slots receive new characters", async () => {
  const bindings=await load("src/surfaces/gallery/galleryModelBindings.ts");
  assert.equal(bindings.galleryModelForProject("bon-iver-viisualiizer"),"kitana-mk11-in-mk9-suit");
  assert.equal(bindings.galleryModelForProject("mastered-from-chaos"),"nier-print-2b");
  assert.equal(bindings.galleryModelForProject("emmit-fenn"),"nier-print-9s");
  assert.equal(bindings.galleryModelForProject("i-will-what-i-want"),"nier-automata-2b");
  assert.equal(bindings.galleryModelForProject("adventure-time-distant-lands"),null);
  for(const model of withdrawn) assert.equal(bindings.adjacentGalleryModel(model),undefined);
});

test("every withdrawn model is cleared on startup while other saved choices and both appearances survive", async () => {
  const preferences = await load("src/preferences.ts");
  const originalWindow = globalThis.window;
  let stored;
  globalThis.window = { localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } } };
  try {
    for (const appearance of ["dark", "light"]) {
      for (const activeModelId of ["sanhua-wuthering-waves", "cortana", "zima", "jubilee-midnight-mutant", "halo-mk-v-model", "magik-soul-surfer", "punk-magik", "black-cat-coastal-cat", "clove-t-pose", "black-widow-aquatic-assassin", "kitana-mk11-in-mk9-suit", "nier-print-2b", "nier-print-9s", "nier-automata-2b", "iron-man-mark-1", "stellar-blade-lily-stargazer-coat", "miles-variant-1", "miles-variant-2", "iron-man-mark-85", "the-twins-atomic-heart", "modural-robot-mecha-chimera-dyan-high-poly-mesh", "dark-knight", "spartan-armour-mkv-halo-reach", "scifi-girl-v01", "proxima", "halloween-the-game-michael-myers-samhain", null]) {
        stored = JSON.stringify({ activeModelId, appearance, locale: "en" });
        const expected = { activeModelId: withdrawn.includes(activeModelId) ? null : activeModelId, appearance, locale: "en" };
        assert.deepEqual(preferences.readPreferences(), expected);
        preferences.savePreferences(preferences.readPreferences());
        assert.deepEqual(preferences.readPreferences(), expected, "migration remains stable after saving and reopening");
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
