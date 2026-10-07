import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const shell = read('src/styles.css');
const chat = read('public/active-theory-gallery/gallery/conversation-bridge.css');

test('daylight background and glass exclude the raised Gallery detail scene', () => {
  for (const block of shell.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!block[1].includes('.demo-app-shell__scene')) continue;
    if (block[2].includes('var(--demo-theme-daylight-room)') || block[2].includes('var(--demo-theme-glass-fill)')) {
      for (const selector of block[1].split(',')) assert.ok(selector.includes(':not([data-gallery-detail="true"])'));
    }
  }
  assert.match(shell, /\[data-active-surface="market"\]\[data-gallery-detail="true"\] \.demo-app-shell__scene\s*\{[^}]*background: transparent;/);
});

for (const appearance of ['light', 'dark']) {
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
