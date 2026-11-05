import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const shell = read('src/styles.css');
const chat = read('public/active-theory-gallery/gallery/conversation-bridge.css');

test('the shared companion backdrop is plain while Gallery detail retains its authored room', () => {
  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /HomeBackdrop|home-backdrop/);
  assert.doesNotMatch(shell, /--demo-theme-home-statement|--demo-theme-home-mark|--demo-theme-daylight/);
  assert.match(shell, /\.demo-app-shell__scene\s*\{[^}]*background: var\(--demo-theme-home-canvas\);/);
  assert.match(shell, /\.demo-app-shell__scene::before,\s*\.demo-app-shell__scene::after \{ display: none; \}/);
  assert.match(shell, /\[data-active-surface="market"\]\[data-gallery-detail="true"\] \.demo-app-shell__scene\s*\{[^}]*background: transparent;/);
});

for (const appearance of ['light', 'dark']) {
  test(`the companion backdrop uses the solid ${appearance} palette`, () => {
    const palette = appearance === 'light'
      ? shell.match(/\.demo-app-shell\s*\{([^}]+)\}/)[1]
      : shell.match(/\.demo-app-shell\[data-appearance="dark"\]\s*\{([^}]+)\}/)[1];
    assert.match(palette, new RegExp(`--demo-theme-home-canvas:\\s*${appearance === 'light' ? '#edf0f2' : '#010409'};`));
    for (const [, selector, body] of shell.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selector.includes('.demo-app-shell__scene')) assert.doesNotMatch(body, /(?:linear|radial)-gradient\(/);
    }
  });
  test(`Gallery detail preserves authored copy and readable controls in ${appearance}`, () => {
    const tokens = appearance === 'light'
      ? shell.match(/\[data-appearance="light"\]\[data-active-surface="market"\]\[data-gallery-detail="true"\]\s*\{([^}]+)\}/)[1]
      : shell.match(/\.demo-app-shell\[data-appearance="dark"\]\s*\{([^}]+)\}/)[1];
    assert.match(tokens, /--demo-theme-gallery-detail-control-text:\s*#e5eff3/);
    assert.match(tokens, /--demo-theme-window-control-icon-filter:\s*brightness\(0\) invert\(1\)/);
    assert.match(chat, /html\[data-appearance="light"\]:not\(\[data-gallery-detail="open"\]\) \[data-preacherman-chat\] \[role="log"\]/);
    assert.match(chat, /html\[data-gallery-detail="open"\] \[data-preacherman-chat\]\s*\{[^}]*--demo-theme-settings-text: #e5eff3;/);
  });
}
