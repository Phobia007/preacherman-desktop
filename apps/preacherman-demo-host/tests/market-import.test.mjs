import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
const root = join(import.meta.dirname, "..");
const imported = join(root, "public/market-love");
const text = path => readFile(path, "utf8");

test("embedded document synchronizes the actual host color scheme before painting", async () => {
  const root = {dataset:{},style:{setProperty(){}}};
  const shell = {dataset:{appearance:"dark"}};
  const parentRoot = {scheme:"dark"};
  let synchronize;
  const script = await text(join(imported, "market-embed.js"));
  runInNewContext(script, {
    parent:{postMessage(){},document:{documentElement:parentRoot,querySelector:()=>shell},getComputedStyle:node=>node===parentRoot?{colorScheme:node.scheme}:{getPropertyValue:()=>"#fff"}},
    location:{pathname:"/market-love/cartier-love.html",origin:"http://local.test"},
    document:{documentElement:root,addEventListener(){}},
    window:{addEventListener(){}},
    MutationObserver:class {constructor(callback){synchronize=callback;}observe(){}disconnect(){}},
  });
  assert.equal(root.style.colorScheme,"dark");
  parentRoot.scheme="light";shell.dataset.appearance="light";synchronize();
  assert.equal(root.style.colorScheme,"light");
  assert.equal(root.dataset.appearance,"light");
});

test("Market mounts only at its route without replacing the shared scene", async () => {
  const app = await text(join(root, "src/App.tsx"));
  const surface = await text(join(root, "src/surfaces/market/MarketSurface.tsx"));
  assert.match(app, /activeSurfaceType === "ledger" \? <MarketSurface \/> : null/);
  assert.match(app, /<CortanaModelStage[\s\S]*renderActive/);
  assert.doesNotMatch(surface, /https?:\/\/|8788|8174/);
  assert.match(surface, /src="\/market-love\/cartier-love.html"/);
  assert.match(surface, /event.source !== frameRef.current\?\.contentWindow/);
  assert.match(surface, /clearTimeout\(deadline\)/);
  assert.match(surface, /removeEventListener\("message", onMessage\)/);
});

test("the long page, fonts and all character Details destinations remain", async () => {
  const html = await text(join(imported, "cartier-love.html"));
  for (const section of ["style", "material", "diamonds", "finish", "closure"]) {
    assert.match(html, new RegExp(`data-od-id="love-${section}"`));
  }
  assert.doesNotMatch(html, /site-header|search-dialog/);
  assert.equal((html.match(/href="love-configurator.html\?character=[^"]+"/g) || []).length, JSON.parse(await text(join(imported, "characters.json"))).length);
  assert.match(html, /assets\/fonts\/fonts.css/);
  for (const font of ["BrilliantCutPro-Regular.woff2", "BrilliantCutPro-Medium.woff2", "FancyCutPro-Regular.woff2"]) assert.ok((await stat(join(imported, "assets/fonts", font))).size > 0);
});

test("the requested footer is removed from the document, not merely hidden", async () => {
  const html = await text(join(imported, "cartier-love.html"));
  assert.doesNotMatch(html, /<footer\b|site-footer|footer-logo|Customer Care|Our Company|Explore LOVE<|United States · English|© Cartier 2026/);
  assert.match(html, /<\/main>\s*<\/body>/);
});

test("the opening film, poster, playback controls and reserved media block are removed", async () => {
  const html = await text(join(imported, "cartier-love.html"));
  assert.doesNotMatch(html, /<video\b|love-film|film-toggle|hero__aspect-ratio|hero__media|hero-video|video-toggle|assets\/media\/Cartier_|assets\/images\/(?:Mobile-)?Hero\.png/);
  assert.doesNotMatch(html, /love-hero|hero-heading|hero-start|Design your love bracelet|Select every detail of the LOVE bracelet/);
});

test("the unused category/search row and its controller are removed from the document", async () => {
  const html = await text(join(imported, "cartier-love.html"));
  assert.doesNotMatch(html, /brand-nav|primary-navigation|search-toggle|search-dialog|assets\/love-intro\.js/);
  for (const label of ["High Jewelry", "Jewelry", "Watches", "Bags and accessories", "Fragrances", "Home &amp; Stationery", "News", "La Maison"]) assert.ok(!html.includes(`>${label}</a>`));
});

test("Market uses Task's exact profile copy and packaged signature font without legacy social links", async () => {
  const profile = await text(join(root, "src/surfaces/market/MarketProfile.tsx"));
  const task = await text(join(root, "src/surfaces/gallery/GallerySurface.tsx"));
  const css = await text(join(root, "src/surfaces/market/market-profile.css"));
  for (const match of profile.matchAll(/<span>(.*?)<\/span>|href="([^"]+)"/g)) assert.ok(task.includes(match[1] || match[2]), match[0]);
  assert.equal([...profile.matchAll(/<span>/g)].length, 4);
  assert.equal([...profile.matchAll(/href=/g)].length, 0);
  assert.match(css, /BrotherSignature-7BWnK.otf/);
  assert.match(css, /top: 48px/);
  assert.match(css, /left: 50%/);
  assert.match(profile, /aria-expanded=\{open\}/);
  assert.match(profile, /event.key === "Escape"/);
  assert.match(profile, /removeEventListener\("keydown"/);
  assert.match(css, /prefers-reduced-motion/);
});

test("the full-height page scrolls behind a fixed translucent signature header", async () => {
  const css = await text(join(root, "src/surfaces/market/market-surface.css"));
  const embed = await text(join(imported, "market-embed.css"));
  assert.match(css, /--market-content-top: 100px/);
  assert.match(css, /\.market-surface__frame[^}]+top: 0[^}]+height: 100%/);
  assert.match(css, /data-page="intro"[^}]+height: var\(--market-content-top\)[^}]+backdrop-filter: blur\(12px\)[^}]+border-bottom: 1px solid var\(--demo-theme-market-border\)/);
  assert.match(embed, /#main \{ padding-top: 100px; \}/);
  assert.match(embed, /scrollbar-width: none/);
  assert.match(embed, /scroll-padding-top: 100px/);
  assert.doesNotMatch(embed, /overflow(?:-y)?:\s*hidden/);
  const capture = await text(join(root, "src/surfaces/market/captureMarketFrame.ts"));
  assert.match(capture, /!doc.getElementById\("main"\)/);
  assert.doesNotMatch(capture, /love-header|brand-nav|search-toggle/);
});

test("Market categories stay with the host header and yield to details and the profile lens", async () => {
  const surface = await text(join(root, "src/surfaces/market/MarketSurface.tsx"));
  const css = await text(join(root, "src/surfaces/market/market-surface.css"));
  const row = surface.match(/<ul className="market-surface__categories"[\s\S]*?<\/ul>/)?.[0];
  assert.ok(row);
  const { marketCategories } = await import("../src/surfaces/market/marketEntrance.ts");
  assert.match(surface, /highlightedCategory = category.next \?\? category.active/);
  assert.match(css, /transition: transform 380ms/);
  assert.deepEqual(marketCategories, ["Discover", "Browse", "Sell", "Inventory", "Search"]);
  assert.match(row, /marketCategories\.map/);
  assert.match(row, /<button type="button" aria-pressed=\{highlightedCategory === label\}/);
  assert.match(row, /hidden=\{page !== "intro" \|\| entrance === "logo" \|\| lensActive\}/);
  assert.match(css, /\.market-surface__categories \{[^}]*position: absolute;[^}]*top: var\(--market-content-top\)/);
  assert.match(css, /\.market-surface__categories\[hidden\] \{ display: none; \}/);
  assert.match(css, /font: 400 16px\/1\.4 "Market Brilliant Cut"/);
  assert.match(css, /BrilliantCutPro-Regular\.woff2/);
  assert.match(css, /button:focus-visible[^}]+--demo-theme-market-focus/);
  const fonts = await text(join(root, "src/surfaces/market/market-details.css"));
  assert.match(fonts, /font-family: "Market Brilliant Cut"/);
  assert.match(fonts, /BrilliantCutPro-Medium\.woff2/);
});

for (const appearance of ["light", "dark"]) {
  test(`Market fixed categories use the ${appearance} text, divider and contrast tokens`, async () => {
    const styles = await text(join(root, "src/styles.css"));
    const css = await text(join(root, "src/surfaces/market/market-surface.css"));
    const selector = appearance === "dark" ? '.demo-app-shell[data-appearance="dark"]' : '.demo-app-shell';
    const tokens = styles.slice(styles.indexOf(`${selector} {`)).split("}")[0];
    for (const token of ["text", "border", "ink-shadow"]) {
      assert.match(tokens, new RegExp(`--demo-theme-market-${token}:`));
      assert.match(css, new RegExp(`var\\(--demo-theme-market-${token}\\)`));
    }
  });
}

test("every imported asset is packaged and matches its recorded hash", async () => {
  const manifest = JSON.parse(await text(join(imported, "import-manifest.json")));
  assert.ok(manifest.files.length > 100);
  for (const file of manifest.files) {
    assert.ok(!file.path.includes(".."));
    const bytes = await readFile(join(imported, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  }
});

test("the 3D bundle changes only paper backings and transparent floor compositing", async () => {
  const manifest = JSON.parse(await text(join(imported, "import-manifest.json")));
  const { unpatchMarketDetailsFooter } = await import("../scripts/market-details-footer.mjs");
  let bundle = unpatchMarketDetailsFooter(await text(join(imported, "assets/configurator/app.js")));
  assert.equal(bundle.split("gl_FragColor = vec4(0.0);").length, 5);
  for (const fragment of [
    "gl_FragColor = vec4(color, uOpacity);",
    "gl_FragColor = vec4(color, uOpacity * (1.0 - fade));",
    "gl_FragColor = vec4(color, alpha);",
    "gl_FragColor = vec4(vec3(30.0), alpha);",
  ]) bundle = bundle.replace("gl_FragColor = vec4(0.0);", fragment);
  bundle = bundle.replace("null/* market: transparent world backing */", "G.jsx(e6,{})");
  bundle = bundle.replace("gl_FragColor = vec4(vec3(0.0), 1.0 - clamp(color.r, 0.0, 1.0));", "gl_FragColor = vec4(color, 1.0);");
  bundle = bundle.replace("depthWrite:!1,transparent:!0,blending:1/* market: shadow alpha */", "depthWrite:!1,blending:Fx");
  bundle = bundle.replace("float coverage = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0) * (1.0 - uFadeValue);\n                    gl_FragColor = vec4(color * (1.0 - uFadeValue) / max(coverage, 0.00001), coverage);", "gl_FragColor = vec4(color, 1.0 - uFadeValue);");
  bundle = bundle.replace("depthWrite:!1,transparent:!0,blending:1/* market: caustics alpha */", "depthWrite:!1,blending:Px");
  assert.equal(createHash("sha256").update(bundle).digest("hex"), manifest.originalBundleSha256);
});

test("both appearances use white ink on transparent paper without restyling donor layout", async () => {
  const styles = await text(join(root, "src/styles.css"));
  const css = await text(join(imported, "market-embed.css"));
  for (const token of ["text", "muted", "border", "control", "hover", "focus", "loading", "error", "ink-shadow"]) {
    assert.equal((styles.match(new RegExp(`--demo-theme-market-${token}:`, "g")) || []).length, 2);
  }
  assert.match(css, /background: transparent !important/);
  assert.match(css, /\.button--primary:hover[^}]+--demo-theme-market-hover/);
  assert.match(css, /color: var\(--demo-theme-market-text/);
  assert.doesNotMatch(css, /font-family|font-size|display:\s*none|transform:|object-fit|\.hero.*filter/);
  const adapter = await text(join(imported, "market-embed.js"));
  assert.match(adapter, /attributeFilter: \["data-appearance"\]/);
  assert.match(adapter, /loveconfiguratorready/);
  assert.match(adapter, /style.colorScheme = parent.getComputedStyle\(parent.document.documentElement\).colorScheme/);
  assert.match(adapter, /pagehide/);
  assert.match(adapter, /themeObserver.disconnect/);
});

test("all Gallery portraits are packaged in order with alternating sides and corresponding character copy", async () => {
  const portraits = JSON.parse(await text(join(imported, "characters.json")));
  const html = await text(join(imported, "cartier-love.html"));
  const bindings = await text(join(root, "src/surfaces/gallery/galleryModelBindings.ts"));
  const expected = [...bindings.matchAll(/^  "[^"]+": "([^"]+)",/gm)].map(match => match[1]);
  assert.deepEqual(portraits.map(p => p.id), expected);
  const rows = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(match => match[0]);
  assert.equal(rows.length, portraits.length);
  assert.equal(portraits.length, 14);
  const copy = row => row.match(/<div class="descriptive-card__content component-custom-width"[\s\S]*/)[0].replace(/data-od-id="[^"]+"/g, "");
  for (const [index, portrait] of portraits.entries()) {
    const row = rows[index];
    assert.ok(row.includes(`data-character-id="${portrait.id}"`));
    assert.ok(row.includes(`src="${portrait.image}"`));
    assert.equal(row.includes("order--small-up-1"), index % 2 === 1);
    assert.ok(row.includes(`>${portrait.name.toUpperCase()}</h2>`));
    assert.ok(row.includes(`>${portrait.summary}</div>`));
    assert.ok(row.includes(`aria-label="${portrait.name}, Details"`));
    assert.ok(row.includes('>Details</a>'));
    const neutralCopy = value => copy(value)
      .replace(/(<h2[^>]*>)[\s\S]*?(<\/h2>)/, "$1TITLE$2")
      .replace(/(<div class="descriptive-card__description[^>]*>)[\s\S]*?(<\/div>)/, "$1SUMMARY$2")
      .replace(/aria-label="[^"]*"/g, 'aria-label="LABEL"')
      .replace(/href="love-configurator.html\?character=[^"]+"/g, 'href="DETAILS"');
    assert.equal(neutralCopy(row), neutralCopy(rows[0]));
    assert.ok(row.includes('width="4096" height="4096"'));
    assert.ok(row.includes(index === 0 ? 'loading="eager"' : 'loading="lazy"'));
    const bytes = await readFile(join(imported, portrait.image));
    assert.equal(bytes.length, portrait.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), portrait.sha256);
  }
  assert.doesNotMatch(html, /assets\/images\/(Size|Color|Diamonds|Finish|Closure)\.jpg/);
  const { populateMarketCharacters } = await import("../scripts/market-character-sections.mjs");
  const normalize = value => value.replace(/>\s+</g, "><").replace(/\s+/g, " ");
  assert.equal(normalize(await populateMarketCharacters(html)), normalize(html));
});
