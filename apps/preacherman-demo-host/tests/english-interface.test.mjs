import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const app = new URL("../", import.meta.url);
test("legacy language preferences keep character and theme while displaying English", () => {
  const source = readFileSync(new URL("src/preferences.ts", app), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const appearance of ["light", "dark"]) {
    let stored = JSON.stringify({ appearance, locale: "zh-CN", activeModelId: null });
    const root = { dataset: {}, style: {} };
    const context = { exports: {}, require: () => ({ isAvatarModelId: id => id === "cortana" }),
      window: { localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } } },
      document: { documentElement: root } };
    vm.runInNewContext(compiled, context);
    const preferences = context.exports.readPreferences();
    assert.equal(preferences.locale, "en");
    assert.equal(preferences.appearance, appearance);
    assert.equal(preferences.activeModelId, null);
    context.exports.applyPreferences(preferences);
    context.exports.savePreferences(preferences);
    assert.equal(root.lang, "en");
    assert.equal(root.dataset.appearance, appearance);
    assert.equal(root.style.colorScheme, appearance);
    assert.equal(JSON.parse(stored).locale, "en");
  }
});

test("packaged Task dialogs and extension catalogs contain English interface copy", () => {
  for (const directory of ["public/gallery-v3/portfolio", "public/extension-marketplace"]) {
    const scan = dir => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { if (!entry.name.startsWith("assets")) scan(path); continue; }
        if (!/\.(html|js|json)$/.test(entry.name)) continue;
        assert.doesNotMatch(readFileSync(path, "utf8"), /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, path);
      }
    };
    scan(fileURLToPath(new URL(directory, app)));
  }
});
