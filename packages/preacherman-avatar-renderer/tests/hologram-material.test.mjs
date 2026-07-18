import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  Texture,
} from "three";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("ported hologram profiles retain Viewer V0 material identities and numeric constants", async () => {
  const { hologramProfileFor } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );

  assert.deepEqual(
    {
      ...hologramProfileFor("rt_body"),
      ramp: hologramProfileFor("rt_body").ramp,
    },
    {
      sourceMaterial: "cortana_body",
      family: "body",
      scanlineScale: 200,
      scanlineBrightness: -0.1,
      scanlineContrast: 0,
      diffuseGamma: 0.5,
      controlAlphaAdd: 0.35,
      controlGreenTint: [0.1065388023853302, 0.17199930548667908, 0.3185468018054962],
      usesControlMap: true,
      controlSemanticStatus: "unresolved",
      controlChannels: ["green", "alpha"],
      surfaceMode: "blended",
      backfaceCulling: true,
      lightingFloor: 0,
      lightingExponent: 1,
      scanlineFloor: 0.38,
      outputGain: 1.35,
      neckBlendStart: 0,
      neckBlendEnd: 0,
      ramp: [
        [0.09999999403953552, 0.006937533151358366, 0.020557476207613945, 0.05968404561281204],
        [0.4818185269832611, 0.11759507656097412, 0.407758891582489, 1],
        [1, 0.7747818231582642, 0.9115685820579529, 1],
      ],
    },
  );
  assert.equal(hologramProfileFor("rt_face").neckBlendStart, 1.46);
  assert.equal(hologramProfileFor("rt_face").neckBlendEnd, 1.54);
  assert.equal(hologramProfileFor("rt_hair").surfaceMode, "dithered");
});
test("hologram material clones the source and preserves Viewer V0 surface modes", async () => {
  const { createHologramMaterial } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );
  const sourceBody = new MeshStandardMaterial({ name: "rt_body", roughness: 0.42 });
  const body = createHologramMaterial(sourceBody, new Texture(), undefined, new Texture());
  const hair = createHologramMaterial(
    new MeshStandardMaterial({ name: "rt_hair" }),
    new Texture(),
    undefined,
    new Texture(),
  );
  const face = createHologramMaterial(
    new MeshStandardMaterial({ name: "rt_face" }),
    new Texture(),
    undefined,
    new Texture(),
  );

  assert.notEqual(body, sourceBody);
  assert.equal(sourceBody.roughness, 0.42);
  assert.equal(body.transparent, true);
  assert.equal(body.depthWrite, true);
  assert.equal(body.toneMapped, false);
  assert.equal(hair.alphaToCoverage, true);
  assert.equal(hair.alphaTest, 0.05);
  assert.equal(hair.transparent, false);
  assert.equal(hair.side, DoubleSide);
  assert.equal(face.side, FrontSide);
});
