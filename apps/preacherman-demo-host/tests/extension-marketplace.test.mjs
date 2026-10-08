import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const prefix = 'public/extension-marketplace/';
test('Extension packages the three reference pages without the global Claude header', () => {
  const manifest = JSON.parse(read(prefix + 'source-manifest.json'));
  assert.equal(manifest.sourcePages.length, 3);
  assert.equal(manifest.defaultPage, 'marketplace-agents.html');
  for (const page of manifest.sourcePages) {
    const html = read(prefix + page);
    assert.doesNotMatch(html, /<div class="container NavBar[^>]*__inner/);
    assert.match(html, /SubNav-module/);
    assert.match(html, /preacherman-embed.js/);
    assert.match(html, /preacherman-embed.css/);
    assert.doesNotMatch(html, /<footer\b/);
    assert.doesNotMatch(html, /<p[^>]*SubNav[^>]*__label[^>]*>Claude Marketplace/);
    for (const asset of new Set(html.match(/assets\/[\w./%+@=-]+/g))) assert.ok(existsSync(new URL('../' + prefix + asset, import.meta.url)), asset);
  }
  assert.equal((read(prefix + manifest.defaultPage).match(/data-agent-card=""/g) || []).length, 16);
  assert.match(read(prefix + 'claude-marketplace.html'), /data-od-id="sort"/);
});
test('Extension presents the requested Home and Vessels copy without the agents sales header', () => {
  const home = read(prefix + 'marketplace-home.html');
  assert.match(home, /<h1[^>]*>Where your avatar gets connected with the world<\/h1>/);
  assert.doesNotMatch(home, /data-od-id="home-h1-86"/);
  assert.match(read(prefix + 'claude-marketplace.html'), /Bring the tools you already use into Vessels\./);
  const agents = read(prefix + 'marketplace-agents.html');
  assert.doesNotMatch(agents, /Put your Anthropic commitment toward/);
  assert.doesNotMatch(agents, /<article[^>]*MarginaliaCard/);
});
for (const mode of ['light', 'dark']) test(`Extension preserves the shared room and follows ${mode} appearance`, () => {
  const css = read(prefix + 'preacherman-embed.css');
  assert.match(css, new RegExp(`html\\[data-appearance="${mode}"\\] \\{ color-scheme: ${mode}`));
  assert.match(css, /html, body \{ background: transparent !important/);
  assert.match(css, /font-family: var\(--demo-font-primary\) !important/);
  assert.ok(existsSync(new URL('../public/market-love/assets/fonts/ClashDisplay-Light.ttf', import.meta.url)));
  for (const token of ['text', 'muted', 'border', 'focus', 'surface-elevated', 'extension-card']) assert.ok(css.includes(`var(--demo-theme-${token})`));
  const bridge = read(prefix + 'preacherman-embed.js');
  assert.match(bridge, /MutationObserver\(sync\)/);
  assert.match(bridge, /key === '--demo-font-primary'/);
  assert.match(bridge, /observer.disconnect\(\)/);
  assert.match(read('src/surfaces/FrostedSurface.tsx'), /<ExtensionMarketplace \/>/);
  const navigationCss = read('src/surfaces/extension/extension-marketplace.css');
  for (const token of ['text', 'muted', 'border', 'focus', 'loading', 'market-header-glass']) assert.ok(navigationCss.includes(`var(--demo-theme-${token})`));
});
