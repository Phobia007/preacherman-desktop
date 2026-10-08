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
    for (const asset of new Set(html.match(/assets\/[\w./%+@=-]+/g))) assert.ok(existsSync(new URL('../' + prefix + asset, import.meta.url)), asset);
  }
  assert.equal((read(prefix + manifest.defaultPage).match(/data-agent-card=""/g) || []).length, 16);
  assert.match(read(prefix + 'claude-marketplace.html'), /data-od-id="sort"/);
});
for (const mode of ['light', 'dark']) test(`Extension preserves the shared room and follows ${mode} appearance`, () => {
  const css = read(prefix + 'preacherman-embed.css');
  assert.match(css, new RegExp(`html\\[data-appearance="${mode}"\\] \\{ color-scheme: ${mode}`));
  assert.match(css, /html, body \{ background: transparent !important/);
  for (const token of ['text', 'muted', 'border', 'focus', 'surface-elevated', 'extension-card']) assert.ok(css.includes(`var(--demo-theme-${token})`));
  const bridge = read(prefix + 'preacherman-embed.js');
  assert.match(bridge, /MutationObserver\(sync\)/);
  assert.match(bridge, /observer.disconnect\(\)/);
  assert.match(read('src/surfaces/FrostedSurface.tsx'), /<ExtensionMarketplace \/>/);
});
