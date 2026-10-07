import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const source = await readFile(new URL("../src/gallery/homeCompanionControls.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { zoomCompanion, rotateCompanion } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("wheel approaches portrait, reverses, and clamps at both authored camera frames", () => {
  assert.equal(zoomCompanion(0, -350), .5);
  assert.equal(zoomCompanion(.5, 350), 0);
  assert.equal(zoomCompanion(.5, -10000), 1);
  assert.equal(zoomCompanion(.5, 10000), 0);
  assert.equal(zoomCompanion(0, -10, 1), zoomCompanion(0, -160));
  assert.equal(zoomCompanion(0, -1, 2), zoomCompanion(0, -600));
});
test("drag only accepts horizontal displacement and scales with the viewport", () => {
  assert.equal(rotateCompanion(.3, 0, 600), .3);
  assert.equal(rotateCompanion(0, 100, 600), rotateCompanion(0, 200, 1200));
  const right = rotateCompanion(0, 100, 600);
  assert.ok(right > 0);
  assert.equal(rotateCompanion(right, -100, 600), 0);
});
