import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Gallery initializes local fragments while optional sync is absent or still resolving", async () => {
  const source = await readFile(new URL("../public/active-theory-gallery/gallery/assets/js/app.1780406240914.js", import.meta.url), "utf8");
  const bodies = [...source.matchAll(/_this\.onInit=async function\(\)\{([^{}]*?initSync[^{}]*?)\}/g)].map(match => match[1]);
  assert.equal(bodies.length, 3);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const body of bodies) {
    for (const helper of [undefined, false, true, {}, Promise.resolve(() => {})]) {
      let ready = false;
      const fragment = { initSync: helper, ui: {group: {}}, element: {group: {}}, bitmap: {capture: {rt: {upload() {}}}}, set(key, value) { if (key === "ready") ready = value; } };
      await new AsyncFunction("_this", body)(fragment);
      assert.equal(ready, true);
    }
    const calls = [];
    const fragment = {initSync: async target => calls.push(target), ui: {group: {}}, element: {group: {}}, bitmap: {capture: {rt: {upload() {}}}}, set() {}};
    await new AsyncFunction("_this", body)(fragment);
    const expected = body.includes("_this.ui") ? fragment.ui : fragment.element;
    assert.deepEqual(calls, [expected.group, expected]);
  }
});
