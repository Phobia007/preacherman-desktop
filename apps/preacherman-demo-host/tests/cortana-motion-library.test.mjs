import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const workspaceRoot = join(packageRoot, "..", "..");
const runtimeRoot = join(
  packageRoot,
  "public",
  "assets",
  "avatars",
  "cortana",
  "motion-library",
);

test("synced Cortana runtime contains the complete locked 412-action library", async () => {
  const [manifest, index, lock, packNames] = await Promise.all([
    readFile(join(runtimeRoot, "motions.json"), "utf8").then(JSON.parse),
    readFile(join(runtimeRoot, "index.json"), "utf8").then(JSON.parse),
    readFile(join(runtimeRoot, "source-lock.json"), "utf8").then(JSON.parse),
    readdir(join(runtimeRoot, "packs")),
  ]);

  assert.equal(manifest.motion_count, 412);
  assert.equal(manifest.motions.length, 412);
  assert.equal(new Set(manifest.motions.map((motion) => motion.action)).size, 412);
  assert.equal(new Set(manifest.motions.map((motion) => motion.pack_export)).size, 9);
  assert.equal(index.packs.length, 9);
  assert.equal(index.packs.reduce((total, pack) => total + pack.action_count, 0), 412);
  assert.equal(packNames.filter((name) => name.endsWith(".glb")).length, 9);
  assert.equal(lock.motion_count, 412);
  assert.equal(lock.pack_count, 9);

  for (const pack of index.packs) {
    const name = pack.file.split("/").at(-1);
    assert.equal((await stat(join(runtimeRoot, "packs", name))).size, pack.bytes);
  }
});

test("renderer resolves pack_export lazily, caches animations, and discards duplicate scenes", async () => {
  const adapter = await readFile(
    join(
      workspaceRoot,
      "packages",
      "preacherman-avatar-renderer",
      "src",
      "avatar",
      "adapters",
      "ThreeAvatarAnimationAdapter.ts",
    ),
    "utf8",
  );
  const model = await readFile(
    join(workspaceRoot, "packages", "preacherman-avatar-renderer", "src", "AvatarModel.tsx"),
    "utf8",
  );

  assert.match(adapter, /motion\.pack_export/);
  assert.match(adapter, /clipName:\s*motion\.action/);
  assert.match(adapter, /animationPackCache\.get\(url\)/);
  assert.match(adapter, /disposeAvatarSceneResources\(gltf\.scene\)/);
  assert.doesNotMatch(adapter, /this\.root\.add\(gltf\.scene\)/);
  assert.match(model, /motion-library\/motions\.json/);
  assert.match(model, /motion-library\/packs\//);
});

test("motion picker uses semantic light and dark theme tokens", async () => {
  const [stage, styles] = await Promise.all([
    readFile(join(packageRoot, "src", "gallery", "CortanaModelStage.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "gallery", "cortana-gallery.css"), "utf8"),
  ]);

  assert.match(stage, /motionActions\.length/);
  assert.match(stage, /Play motion/);
  assert.match(stage, /onActionsReady=\{receiveActions\}/);
  assert.match(stage, /onError=\{handleError\}/);
  assert.match(stage, /onReady=\{handleReady\}/);
  for (const token of [
    "text",
    "muted",
    "border",
    "focus",
    "surface-elevated",
    "activate-fill",
  ]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}`));
  }
});
