import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const entry of ["assets/js/app.1780406240914.js", "gallery/assets/js/app.1780406240914.js"]) {
test(`Gallery ${entry} initializes local fragments while optional sync is absent or still resolving`, async () => {
  const source = await readFile(new URL(`../public/active-theory-gallery/${entry}`, import.meta.url), "utf8");
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

test(`Gallery ${entry} stops initialization when the fragment is destroyed during either upload`, async () => {
  const source = await readFile(new URL(`../public/active-theory-gallery/${entry}`, import.meta.url), "utf8");
  const bodies = [...source.matchAll(/_this\.onInit=async function\(\)\{([^{}]*?initSync[^{}]*?)\}/g)].map(match => match[1]);
  assert.equal(bodies.length, 3);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const body of bodies) {
    for (const destroyedAfterUpload of [1, 2]) {
      let uploads = 0, ready = false;
      const fragment = {
        ui: {group: {}}, element: {group: {}}, bitmap: {capture: {rt: {upload() {}}}},
        async initSync() {
          uploads++;
          await Promise.resolve();
          if (uploads === destroyedAfterUpload) for (const key of Object.keys(fragment)) delete fragment[key];
        },
        set() { ready = true; },
      };
      await new AsyncFunction("_this", body)(fragment);
      assert.equal(uploads, destroyedAfterUpload);
      assert.equal(ready, false, "A destroyed fragment must not publish readiness");
    }
  }
});

}
