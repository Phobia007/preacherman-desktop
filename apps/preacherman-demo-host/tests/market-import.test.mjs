import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
const root = join(import.meta.dirname, "..");
const imported = join(root, "public/market-love");
const text = path => readFile(path, "utf8");

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

test("the complete long page, fonts, header, footer and Start Designing links remain", async () => {
  const html = await text(join(imported, "cartier-love.html"));
  for (const section of ["hero", "style", "material", "diamonds", "finish", "closure"]) {
    assert.match(html, new RegExp(`data-od-id="love-${section}"`));
  }
  for (const id of ["site-header", "site-footer", "search-dialog", "saved-dialog", "bag-dialog"]) assert.ok(html.includes(`data-od-id="${id}"`));
  assert.equal((html.match(/href="love-configurator.html"/g) || []).length, 8);
  assert.match(html, /assets\/fonts\/fonts.css/);
  for (const font of ["BrilliantCutPro-Regular.woff2", "BrilliantCutPro-Medium.woff2", "FancyCutPro-Regular.woff2"]) assert.ok((await stat(join(imported, "assets/fonts", font))).size > 0);
});

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
  let bundle = await text(join(imported, "assets/configurator/app.js"));
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
  assert.match(css, /color: var\(--demo-theme-market-text/);
  assert.doesNotMatch(css, /font-family|font-size|display:\s*none|transform:|object-fit|\.hero.*filter/);
  const adapter = await text(join(imported, "market-embed.js"));
  assert.match(adapter, /attributeFilter: \["data-appearance"\]/);
  assert.match(adapter, /loveconfiguratorready/);
  assert.match(adapter, /pagehide/);
  assert.match(adapter, /themeObserver.disconnect/);
});
