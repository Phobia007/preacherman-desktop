import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import vm from "node:vm";
const code = transformSync(readFileSync(new URL("../src/app-shell/useWindowActivity.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const wait = () => new Promise(resolve => setTimeout(resolve, 120));

test("native minimize/resume is independent of document.hidden and cleans up listeners", async () => {
  let cleanup, resized, focused, minimized = false, stopped = 0;
  const values = [], listeners = new Map();
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const nativeWindow = { isMinimized: async () => minimized, onResized: async fn => { resized = fn; return () => stopped++; }, onFocusChanged: async fn => { focused = fn; return () => stopped++; } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document, setTimeout, clearTimeout, console,
    require: name => name === "react" ? { useState: fn => [fn(), value => values.push(value)], useEffect: fn => { cleanup = fn(); } } : name.endsWith("/core") ? { isTauri: () => true } : { getCurrentWindow: () => nativeWindow } });
  module.exports.useWindowActivity(); await wait(); assert.equal(values.at(-1), true);
  minimized = true; resized(); focused(); await wait(); assert.equal(values.at(-1), false); assert.equal(document.hidden, false);
  minimized = false; focused(); await wait(); assert.equal(values.at(-1), true);
  document.hidden = true; listeners.get("visibilitychange")(); await wait(); assert.equal(values.at(-1), false);
  cleanup(); assert.equal(stopped, 2); assert.equal(listeners.size, 0);
});

test("a native subscription that resolves after unmount is still released", async () => {
  let cleanup, resolveResize, stopped = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, setTimeout, clearTimeout, console,
    require: name => name === "react" ? { useState: fn => [fn(), () => {}], useEffect: fn => { cleanup = fn(); } } : name.endsWith("/core") ? { isTauri: () => true } : { getCurrentWindow: () => ({ isMinimized: async () => false, onResized: () => new Promise(resolve => { resolveResize = resolve; }), onFocusChanged: async () => () => stopped++ }) } });
  module.exports.useWindowActivity(); cleanup(); resolveResize(() => stopped++); await wait(); assert.equal(stopped, 2);
});

test("browser preview uses document visibility without calling native APIs", async () => {
  let cleanup, listener;
  const values = [], document = { hidden: false, addEventListener: (_name, fn) => { listener = fn; }, removeEventListener() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document, setTimeout, clearTimeout, console,
    require: name => name === "react" ? { useState: fn => [fn(), value => values.push(value)], useEffect: fn => { cleanup = fn(); } } : name.endsWith("/core") ? { isTauri: () => false } : { getCurrentWindow: () => { throw new Error("native API used in browser"); } } });
  module.exports.useWindowActivity(); await wait(); assert.equal(values.at(-1), true);
  document.hidden = true; listener(); await wait(); assert.equal(values.at(-1), false);
  cleanup();
});
