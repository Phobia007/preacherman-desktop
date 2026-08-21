import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|css)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test("package declares the React 18 compatible renderer boundary as peer dependencies", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.name, "@preacherman/avatar-renderer");
  assert.deepEqual(manifest.peerDependencies, {
    "@react-three/drei": "9.115.0",
    "@react-three/fiber": "8.18.0",
    react: "18.3.1",
    "react-dom": "18.3.1",
    three: "0.185.1",
  });
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.overrides?.["stats-gl"], "2.2.7");
});

test("built package exposes the required public API", async () => {
  const entry = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));

  for (const name of [
    "AvatarViewport",
    "AvatarError",
    "normalizeAvatarError",
    "disposeAvatarSceneResources",
    "createAvatarAssetUrls",
  ]) {
    assert.equal(typeof entry[name], "function", `${name} must be a runtime export`);
  }
  assert.equal(entry.ZIMA_AVATAR_ID, "zima");
  assert.equal(entry.ZIMA_DEFAULT_ACTION_ID, "idle.zima");
  assert.deepEqual(entry.createAvatarAssetUrls("/assets/avatars/zima/", "zima"), {
    model: "/assets/avatars/zima/zima-runtime.glb",
    textures: [
      "/assets/avatars/zima/shader/storm_cortana_scanlines_diff.png",
      "/assets/avatars/zima/shader/storm_cortana_default_eye_iris_normal.png",
      "/assets/avatars/zima/shader/storm_cortana_default_body_control.png",
      "/assets/avatars/zima/shader/storm_cortana_default_head_control.png",
      "/assets/avatars/zima/shader/storm_cortana_default_hair_control.png",
      "/assets/avatars/zima/shader/storm_cortana_default_eye_control.png",
    ],
  });
});

test("renderer source is independent from Tauri, Surface Skin, Demo Host, backend, and network clients", async () => {
  const files = await sourceFiles(join(packageRoot, "src"));
  const source = (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");

  assert.doesNotMatch(source, /@tauri-apps|preacherman-surface-skin|demo-host|backend-handoff/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
});

test("static viewport uses one animated transparent Canvas with capped DPR and no controls", async () => {
  const viewport = await readFile(join(packageRoot, "src", "AvatarViewport.tsx"), "utf8");
  const scene = await readFile(join(packageRoot, "src", "AvatarScene.tsx"), "utf8");
  const adapter = await readFile(
    join(
      packageRoot,
      "src",
      "avatar",
      "adapters",
      "ThreeAvatarAnimationAdapter.ts",
    ),
    "utf8",
  );
  const combined = `${viewport}\n${scene}\n${adapter}`;

  assert.match(viewport, /frameloop=["']always["']/);
  assert.match(combined, /alpha:\s*true/);
  assert.match(combined, /dpr=\{dpr\}/);
  assert.match(combined, /Math\.min\(.*2\)/s);
  assert.match(combined, /pointerEvents:\s*["']none["']/);
  assert.doesNotMatch(combined, /OrbitControls|MapControls|TrackballControls|CameraControls/);
  assert.doesNotMatch(combined, /forceContextLoss|SkeletonHelper|gridHelper|autoRotate/i);
  assert.match(scene, /new AvatarError\(\s*["']CONTEXT_LOST["']/);
  assert.match(adapter, /new AnimationMixer\(/);
  assert.doesNotMatch(adapter, /requestAnimationFrame|cancelAnimationFrame/);
});
