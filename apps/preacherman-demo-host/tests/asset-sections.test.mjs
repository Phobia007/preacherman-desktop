import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/surfaces/asset/useAssetSection.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
function fixture(reduced = false) {
  let now = 0, next = 0, cursor = 0, dirty = true, value;
  const hooks = [], effects = [], timers = new Map();
  const react = {
    useState(initial) { const i = cursor++; hooks[i] ??= { value: initial }; return [hooks[i].value, v => { if (hooks[i].value !== v) { hooks[i].value = v; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, j) => v !== hooks[i].deps[j])) { hooks[i]?.cleanup?.(); hooks[i] = { deps }; effects.push(() => { hooks[i].cleanup = fn(); }); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: () => react, matchMedia: () => ({ matches: reduced }),
    setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id) });
  function flush() { while (dirty) { dirty = false; cursor = 0; value = module.exports.useAssetSection(); for (const fn of effects.splice(0)) fn(); } }
  flush();
  return { get value() { return value; }, select(tab) { value.select(tab); flush(); },
    tick(ms) { const end = now + ms; for (;;) { const timer = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; if (!timer || timer[1].at > end) break; now = timer[1].at; timers.delete(timer[0]); timer[1].fn(); flush(); } now = end; },
    cleanup() { for (const hook of hooks) hook?.cleanup?.(); assert.equal(timers.size, 0); },
    hasModel: module.exports.sectionHasModel,
  };
}
test('model sections slide out before the replacement enters; canvas is retained across all three', () => {
  const f = fixture(); try {
    for (const tab of ['Overview', 'Appearance', 'Settings']) assert.equal(f.hasModel(tab), true);
    for (const tab of ['Skills', 'Info Map']) assert.equal(f.hasModel(tab), false);
    f.select('Appearance'); assert.equal(f.value.displayed, 'Overview'); assert.equal(f.value.phase, 'leaving');
    f.tick(299); assert.equal(f.value.displayed, 'Overview'); f.tick(1); assert.equal(f.value.displayed, 'Appearance'); assert.equal(f.value.phase, 'entering');
    f.tick(560); assert.equal(f.value.phase, 'idle');
  } finally { f.cleanup(); }
});
test('a page without a model waits for the 520ms model fade before entering', () => {
  const f = fixture(); try { f.select('Skills'); f.tick(519); assert.equal(f.value.displayed, 'Overview'); f.tick(1); assert.equal(f.value.displayed, 'Skills'); f.tick(560); assert.equal(f.value.phase, 'idle'); } finally { f.cleanup(); }
});
test('rapid tab changes discard obsolete arrivals, including reversal to the visible tab', () => {
  const f = fixture(); try {
    f.select('Appearance'); f.tick(100); f.select('Skills'); f.tick(100); f.select('Settings'); f.tick(300); assert.equal(f.value.displayed, 'Settings');
    f.select('Info Map'); f.tick(100); f.select('Settings'); f.tick(2000); assert.equal(f.value.displayed, 'Settings'); assert.equal(f.value.phase, 'idle');
  } finally { f.cleanup(); }
});
test('reduced motion changes the page immediately; unmount clears unfinished transitions', () => {
  const f = fixture(true); try { f.select('Appearance'); assert.equal(f.value.displayed, 'Appearance'); assert.equal(f.value.phase, 'idle'); f.select('Info Map'); assert.equal(f.value.displayed, 'Info Map'); } finally { f.cleanup(); }
  const pending = fixture(); pending.select('Settings'); pending.cleanup(); pending.tick(1000); assert.equal(pending.value.displayed, 'Overview');
});
