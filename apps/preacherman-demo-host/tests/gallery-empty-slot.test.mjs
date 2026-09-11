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

test("withdrawn Sanhua leaves card seven empty without moving its neighbours or prefetching it", async () => {
  const bindings = await load("src/surfaces/gallery/galleryModelBindings.ts");
  assert.equal(bindings.galleryModelForProject("mastered-from-chaos"), null);
  assert.equal(bindings.galleryModelForProject("classic-stories-retold"), "punk-magik");
  assert.equal(bindings.galleryModelForProject("emmit-fenn"), "black-cat-coastal-cat");
  assert.equal(bindings.adjacentGalleryModel("punk-magik"), "black-cat-coastal-cat");
  assert.equal(bindings.adjacentGalleryModel("sanhua-wuthering-waves"), undefined);
});

test("withdrawn Sanhua is cleared on startup while other saved choices and both appearances survive", async () => {
  const preferences = await load("src/preferences.ts");
  const originalWindow = globalThis.window;
  let stored;
  globalThis.window = { localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } } };
  try {
    for (const appearance of ["dark", "light"]) {
      for (const activeModelId of ["sanhua-wuthering-waves", "cortana", "zima", "jubilee-midnight-mutant", "halo-mk-v-model", "magik-soul-surfer", "punk-magik", "black-cat-coastal-cat", "clove-t-pose", "black-widow-aquatic-assassin", null]) {
        stored = JSON.stringify({ activeModelId, appearance, locale: "en" });
        const expected = { activeModelId: activeModelId === "sanhua-wuthering-waves" ? null : activeModelId, appearance, locale: "en" };
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
