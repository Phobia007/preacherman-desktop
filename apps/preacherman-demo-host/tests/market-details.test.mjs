import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { patchMarketDetailsFooter, unpatchMarketDetailsFooter } from "../scripts/market-details-footer.mjs";
const read = name => readFile(new URL("../" + name, import.meta.url), "utf8");
const characters = JSON.parse(await read("public/market-love/characters.json"));

test("every product opens its own Details instead of navigating to a shared bracelet page", async () => {
  const script = await read("public/market-love/market-embed.js");
  for (const appearance of ["light", "dark"]) {
    const listeners = new Map(), messages = [], shell = { dataset: { appearance } };
    const parent = { document: { documentElement: {}, querySelector: () => shell },
      getComputedStyle: () => ({ colorScheme: appearance, getPropertyValue: () => "#fff" }),
      postMessage: (message, origin) => messages.push({ ...message, origin }) };
    const document = { documentElement: { dataset: {}, style: { setProperty() {} } },
      querySelector: () => null, addEventListener: (name, fn) => listeners.set(name, fn) };
    runInNewContext(script, { parent, document, location: { pathname: "/market-love/cartier-love.html", origin: "http://local.test" },
      window: { addEventListener() {} }, MutationObserver: class { observe() {} disconnect() {} } });
    for (const character of [...characters].reverse()) {
      let prevented = false, marked = false;
      const link = { closest: () => ({ dataset: { characterId: character.id } }), setAttribute: () => { marked = true; } };
      const event = { target: { closest: () => link }, button: 0, preventDefault: () => { prevented = true; } };
      listeners.get("pointerover")(event); listeners.get("focusin")(event);
      assert.equal(messages.filter(m => m.type === "preacherman.market.prefetch" && m.modelId === character.id).length, 1);
      listeners.get("click")(event);
      assert.equal(prevented, true); assert.equal(marked, true);
      assert.deepEqual(messages.at(-1), { type: "preacherman.market.details", modelId: character.id, origin: "http://local.test" });
      prevented = false; const count = messages.length;
      listeners.get("click")({ ...event, ctrlKey: true });
      assert.equal(prevented, false); assert.equal(messages.length, count);
    }
    assert.equal(document.documentElement.style.colorScheme, appearance);
  }
});

test("the retained options mount without any bracelet renderer or intro dependency", async () => {
  const bundle = await read("public/market-love/assets/configurator/app.js");
  const original = unpatchMarketDetailsFooter(bundle);
  assert.notEqual(bundle, original);
  assert.equal(patchMarketDetailsFooter(original), bundle);
  assert.equal(patchMarketDetailsFooter(bundle), bundle);
  assert.throws(() => patchMarketDetailsFooter("unexpected vendor entry"));
  const component = bundle.match(/function PreachermanMarketFooter\(\)\{[\s\S]*?\}function hie/)[0];
  assert.doesNotMatch(component, /hie\(|loadModels|Canvas|shownIntro|preloadStep\("/);
  assert.match(component, /G.jsx\(Dee,\{preloader\}\)/);
});

test("Details keeps the active companion preference isolated and supplies the existing profile lens", async () => {
  const detail = await read("src/surfaces/market/MarketDetails.tsx");
  const surface = await read("src/surfaces/market/MarketSurface.tsx");
  const css = await read("src/surfaces/market/market-details.css");
  const tokens = await read("src/styles.css");
  assert.doesNotMatch(detail, /localStorage|activeModelId|onActivate|setPreferences/);
  assert.match(surface, /isAvatarModelId\(modelId\).*marketModelIds.includes/);
  assert.match(surface, /modelId=\{selectedModel\}/);
  assert.match(surface, /captureSource=\{selectedModel \? captureDetails : undefined\}/);
  for (const token of ["glass", "solid"]) assert.equal((tokens.match(new RegExp(`--demo-theme-market-details-${token}:`, "g")) || []).length, 2);
  assert.match(css, /backdrop-filter: blur\(42px\)/);
  assert.match(css, /BrilliantCutPro-Medium.woff2/);
  assert.match(detail, /cancelAnimationFrame\(frame\)/);
  assert.match(detail, /removeEventListener\(CAPTURE_EVENT/);
});
