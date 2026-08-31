import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  const { HOLOGRAM_REFERENCE_GRADE, hologramProfileFor } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );

  assert.deepEqual(HOLOGRAM_REFERENCE_GRADE, {
    contrastExponent: 1,
    outputGain: 1,
    saturation: 1,
  });

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
  const bodyProfile = hologramProfileFor("rt_body");
  const faceProfile = hologramProfileFor("rt_face");
  assert.deepEqual(
    {
      ...faceProfile,
      sourceMaterial: bodyProfile.sourceMaterial,
      family: bodyProfile.family,
    },
    bodyProfile,
  );
  assert.equal(hologramProfileFor("rt_hair").surfaceMode, "dithered");
  assert.deepEqual(
    hologramProfileFor("rt_eyes").controlChannels,
    ["red", "blue"],
  );
});
test("hologram material clones the source and preserves Viewer V0 surface modes", async () => {
  const { createHologramMaterial, hologramProfileFor } = await import(
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
  const eyes = createHologramMaterial(
    new MeshStandardMaterial({ name: "rt_eyes" }),
    new Texture(),
    new Texture(),
    new Texture(),
  );
  const eyelashes = createHologramMaterial(
    new MeshStandardMaterial({ name: "rt_eyelashes" }),
    new Texture(),
    undefined,
    new Texture(),
  );

  assert.notEqual(body, sourceBody);
  assert.equal(sourceBody.roughness, 0.42);
  assert.equal(body.transparent, true);
  assert.equal(body.depthWrite, true);
  assert.equal(body.toneMapped, true);
  assert.equal(hair.alphaToCoverage, true);
  assert.equal(hair.alphaTest, 0.05);
  assert.equal(hair.transparent, false);
  assert.equal(hair.side, DoubleSide);
  assert.equal(face.side, FrontSide);
  assert.equal(eyes.side, FrontSide);
  assert.equal(eyelashes.side, FrontSide);
  assert.equal(eyelashes.depthWrite, false);
  assert.equal(eyes.depthWrite, true);
  assert.deepEqual(face.color.toArray(), [1, 1, 1]);
  assert.equal(hair.toneMapped, true);
  assert.equal(face.toneMapped, true);
  assert.equal(hologramProfileFor("rt_eyes").lightingFloor, 0.16);
});

test("interactive lighting reproduces the four source Blender area lights at runtime scale", async () => {
  const { HOLOGRAM_LIGHTS } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );

  assert.deepEqual(HOLOGRAM_LIGHTS, {
    ambient: 0,
    areaRight: {
      position: [-0.606, 1.385, 0.523],
      target: [0.119, 1.397, -0.166],
      intensity: 9.2,
      width: 0.375,
      height: 0.375,
    },
    areaBackLeft: {
      position: [0.332, 1.461, -0.419],
      target: [-0.488, 1.443, 0.153],
      intensity: 4.92,
      width: 0.385,
      height: 0.385,
    },
    areaFront: {
      position: [-0.072, 1.388, 0.651],
      target: [-0.061, 1.414, -0.349],
      intensity: 2.98,
      width: 0.385,
      height: 0.385,
    },
    areaUnder: {
      position: [0.008, -0.18, -0.023],
      target: [0.008, 0.82, -0.005],
      intensity: 0.84,
      width: 2.931,
      height: 2.931,
    },
  });
});

test("source light reconstruction uses oriented rectangular area lights", async () => {
  const source = await readFile(
    join(packageRoot, "src", "HologramLights.tsx"),
    "utf8",
  );

  assert.match(source, /RectAreaLightUniformsLib\.init\(\)/);
  assert.match(source, /<rectAreaLight/);
  assert.match(source, /light\.current\?\.lookAt\(/);
  assert.doesNotMatch(source, /<pointLight|<directionalLight/);
});

test("both avatar canvases apply the source Standard-view renderer configuration", async () => {
  const [lights, staticViewport, interactiveViewport] = await Promise.all([
    readFile(join(packageRoot, "src", "HologramLights.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "AvatarViewport.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "InteractiveAvatarViewport.tsx"), "utf8"),
  ]);

  assert.match(lights, /renderer\.toneMapping = NoToneMapping/);
  assert.match(lights, /renderer\.toneMappingExposure = HOLOGRAM_TONE_MAPPING_EXPOSURE/);
  assert.match(staticViewport, /configureHologramRenderer\(gl\)/);
  assert.match(interactiveViewport, /configureHologramRenderer\(gl\)/);
});

test("body and face control textures follow their source sRGB properties", async () => {
  const model = await readFile(
    join(packageRoot, "src", "AvatarModel.tsx"),
    "utf8",
  );

  assert.match(
    model,
    /bodyControlMap\.colorSpace = SRGBColorSpace/,
  );
  assert.match(
    model,
    /faceControlMap\.colorSpace = SRGBColorSpace/,
  );
  assert.match(
    model,
    /hairControlMap,[\s\S]*?eyeControlMap,[\s\S]*?controlMap\.colorSpace = NoColorSpace/,
  );
});

test("eye shader reads the authored iris and pupil channels", async () => {
  const source = await readFile(
    join(packageRoot, "src", "hologramMaterial.ts"),
    "utf8",
  );

  assert.match(source, /float irisDisk = smoothstep\([\s\S]*?holoControl\.b/);
  assert.match(source, /float pupilDepth = irisDisk[\s\S]*?controlRed/);
  assert.match(source, /mix\(eyeBase \+ eyeOuterEmission, eyeEmission, irisDisk\)/);
});

test("body shader preserves the source diffuse and control-map material chain", async () => {
  const source = await readFile(
    join(packageRoot, "src", "hologramMaterial.ts"),
    "utf8",
  );

  assert.match(
    source,
    /vec3 composite = holoBase \+ vec3\(holoControl\.a \* uHoloControlAlphaAdd\)/,
  );
  assert.match(
    source,
    /mix\(ramped, ramped \* uHoloControlGreenTint, clamp\(holoControl\.g/,
  );
  assert.match(
    source,
    /\(1\.0 - sourceTransparency\) \* \(1\.0 - holoScan\)/,
  );
  assert.match(source, /holoColor \*= holoOpacity;/);
  assert.match(source, /holoOpacity = 1\.0;/);
  assert.doesNotMatch(source, /bodyZone|bodyVerticalEnergy|sourceEnergy/);
});

test("Zima receives a model-scoped visibility gain without changing Cortana", async () => {
  const material = await readFile(
    join(packageRoot, "src", "hologramMaterial.ts"),
    "utf8",
  );
  const avatar = await readFile(
    join(packageRoot, "src", "AvatarModel.tsx"),
    "utf8",
  );

  assert.match(material, /uHoloAvatarGain/);
  assert.match(material, /1\.189207115 \* uHoloAvatarGain/);
  assert.match(avatar, /modelId === "zima" \? 2\.25 : 1/);
});

test("face uses the body color pipeline with skin-energy gain and no global tint", async () => {
  const source = await readFile(
    join(packageRoot, "src", "hologramMaterial.ts"),
    "utf8",
  );

  assert.match(source, /if \(uHoloFamily == 0 \|\| uHoloFamily == 1\)/);
  assert.match(source, /uHoloIsFace = \{ value: source\.name === "rt_face" \? 1 : 0 \}/);
  assert.match(source, /if \(uHoloIsFace > 0\.5\) \{\s*holoColor \*= 1\.55/);
  assert.doesNotMatch(
    source,
    /profile\.family === "face"[\s\S]*?material\.color\.setRGB/,
  );
  assert.doesNotMatch(source, /FACE_RAMP|faceEnergy|neckBodyColor|faceBodyTint/);
});

test("interactive lighting and avatar stay in world space", async () => {
  const source = await readFile(
    join(packageRoot, "src", "InteractiveAvatarScene.tsx"),
    "utf8",
  );

  assert.match(source, /<HologramLights \/>/);
  assert.match(source, /<AvatarModel\b/);
  assert.doesNotMatch(source, /PresentationControls/);
});

test("interactive viewport keeps the model at a fixed size and front-facing", async () => {
  const source = await readFile(
    join(packageRoot, "src", "InteractiveAvatarScene.tsx"),
    "utf8",
  );

  assert.match(source, /camera\.position\.set\(0, 0\.86, 3\.35\)/);
  assert.match(source, /<OrbitControls[\s\S]*?enableZoom=\{false\}/);
  assert.doesNotMatch(source, /PresentationControls/);
});

test("runtime animation replaces component-local standby bone posing", async () => {
  const source = await readFile(
    join(packageRoot, "src", "AvatarModel.tsx"),
    "utf8",
  );

  assert.match(source, /new CortanaAnimationController\(adapter\)/);
  assert.match(source, /controller\.setState\("idle"\)/);
  assert.match(source, /useFrame\(\(_, deltaSeconds\) => \{[\s\S]*adapter\.update\(deltaSeconds\)/);
  assert.doesNotMatch(source, /aimBoneAt|pose\.bones|new Vector3/);
});

test("each avatar is framed and aligned to the front camera", async () => {
  const source = await readFile(
    join(packageRoot, "src", "AvatarModel.tsx"),
    "utf8",
  );

  assert.match(source, /rotationY: -Math\.PI \/ 2,[\s\S]*?scale: 1/);
  assert.match(source, /zima:[\s\S]*?rotationY: 0,[\s\S]*?scale: 0\.9/);
  assert.match(source, /rotationOffsetY = 0/);
  assert.match(source, /rotation=\{\[0, profile\.transform\.rotationY \+ rotationOffsetY, 0\]\}/);
  assert.match(source, /scale=\{profile\.transform\.scale\}/);
  assert.match(source, /<group[\s\S]*?<primitive object=\{root\}/);
});

test("runtime animation disposal survives the StrictMode effect replay", async () => {
  const source = await readFile(
    join(packageRoot, "src", "AvatarModel.tsx"),
    "utf8",
  );

  assert.match(source, /disposeTimer = useRef/);
  assert.match(source, /clearTimeout\(disposeTimer\.current\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.dispose\(\), 0\)/);
});
