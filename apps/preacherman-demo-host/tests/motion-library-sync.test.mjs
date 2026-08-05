import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncCortanaMotionLibrary } from "../scripts/sync-cortana-motion-library.mjs";

async function createFixture(root) {
  const manifestDir = join(root, "manifest");
  const packDir = join(root, "export", "packs");
  const modelDir = join(root, "model");
  await Promise.all([
    mkdir(manifestDir, { recursive: true }),
    mkdir(packDir, { recursive: true }),
    mkdir(modelDir, { recursive: true }),
  ]);

  const packIds = Array.from({ length: 9 }, (_, index) => `pack-${index}`);
  const motions = Array.from({ length: 412 }, (_, index) => {
    const packIndex = Math.min(8, Math.floor(index / 46));
    return {
      id: `motion-${index}`,
      action: `CT_test_${index}`,
      category: "test",
      loop: false,
      pack_export: `export/packs/${packIds[packIndex]}.glb`,
    };
  });
  const packs = [];
  for (const id of packIds) {
    const content = Buffer.from(`mock-${id}`);
    await writeFile(join(packDir, `${id}.glb`), content);
    packs.push({
      id,
      file: `export/packs/${id}.glb`,
      bytes: content.length,
      animations: motions
        .filter((motion) => motion.pack_export.endsWith(`${id}.glb`))
        .map((motion) => motion.action),
    });
  }
  await Promise.all([
    writeFile(
      join(manifestDir, "motions.json"),
      JSON.stringify({ library: "Test Motion Library", motion_count: 412, motions }),
    ),
    writeFile(
      join(packDir, "index.json"),
      JSON.stringify({ total_actions: 412, packs }),
    ),
    writeFile(join(modelDir, "Cortana_Master.blend"), "mock-blender-master"),
  ]);
}

test("motion sync copies all 9 packs and writes a relative source lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "preacherman-motion-sync-"));
  const source = join(root, "source");
  const target = join(root, "public", "motion-library");
  try {
    await createFixture(source);
    const result = await syncCortanaMotionLibrary({ libraryRoot: source, targetDir: target });
    const lock = JSON.parse(await readFile(join(target, "source-lock.json"), "utf8"));

    assert.equal(result.motionCount, 412);
    assert.equal(result.packCount, 9);
    assert.equal(result.files.length, 11);
    assert.equal(lock.files.filter((file) => file.role === "animation_pack").length, 9);
    assert.equal(lock.source_master.path, "model/Cortana_Master.blend");
    assert.doesNotMatch(JSON.stringify(lock), /[A-Z]:\\/i);
    assert.equal(await readFile(join(target, "packs", "pack-8.glb"), "utf8"), "mock-pack-8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
