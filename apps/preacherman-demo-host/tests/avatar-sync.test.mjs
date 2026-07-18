import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptUrl = pathToFileURL(join(packageRoot, "scripts", "sync-local-avatar.mjs"));
const shaderNames = [
  "storm_cortana_scanlines_diff.png",
  "storm_cortana_default_eye_iris_normal.png",
  "storm_cortana_default_body_control.png",
  "storm_cortana_default_head_control.png",
  "storm_cortana_default_hair_control.png",
  "storm_cortana_default_eye_control.png",
];

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "preacherman-avatar-sync-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtimeDir = join(root, "runtime");
  const viewerDir = join(root, "viewer");
  const targetDir = join(root, "public", "local-avatar");
  const model = Buffer.from("fixture-model-v1");
  await mkdir(join(runtimeDir, "model"), { recursive: true });
  await mkdir(join(runtimeDir, "textures"), { recursive: true });
  await mkdir(viewerDir, { recursive: true });
  await writeFile(join(runtimeDir, "model", "cortana-runtime-v0.glb"), model);
  const inputs = [];
  for (const [index, name] of shaderNames.entries()) {
    const content = Buffer.from(`shader-${index}-${name}`);
    await writeFile(join(runtimeDir, "textures", name), content);
    inputs.push({
      role: `fixture shader ${index}`,
      sourcePath: `runtime/textures/${name}`,
      targetPath: `public/runtime/shader/${name}`,
      sha256: hash(content),
      sizeBytes: content.length,
      copyVerified: true,
    });
  }
  const lock = {
    schemaVersion: "0.2.0",
    buildId: "fixture",
    source: {
      path: "../runtime/model/cortana-runtime-v0.glb",
      sha256: hash(model),
      sizeBytes: model.length,
      readOnly: true,
    },
    target: {
      path: "public/runtime/cortana-runtime-v0.glb",
      sha256: hash(model),
      sizeBytes: model.length,
    },
    viewerShaderInputs: inputs,
    copyVerified: true,
  };
  await writeFile(
    join(viewerDir, "asset-lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  return {
    root,
    runtimeDir,
    viewerDir,
    targetDir,
    expectedModel: { sha256: hash(model), sizeBytes: model.length },
  };
}

async function assertNoSwapArtifacts(targetDir) {
  const parent = dirname(targetDir);
  const prefix = `.${basename(targetDir)}.`;
  const names = await readdir(parent);
  assert.deepEqual(names.filter((name) => name.startsWith(prefix)), []);
}

test("sync copies one locked GLB, six shader inputs, and a sanitized local lock", async (t) => {
  const fixture = await createFixture(t);
  const { syncLocalAvatar } = await import(scriptUrl);

  const result = await syncLocalAvatar(fixture);

  assert.equal(result.files.length, 7);
  assert.equal(
    await readFile(join(fixture.targetDir, "cortana-runtime-v0.glb"), "utf8"),
    "fixture-model-v1",
  );
  for (const name of shaderNames) {
    await access(join(fixture.targetDir, "shader", name));
  }
  const localLock = JSON.parse(
    await readFile(join(fixture.targetDir, "asset-lock.json"), "utf8"),
  );
  assert.equal(localLock.files.length, 7);
  assert.equal("sourcePath" in localLock.files[0], false);
  await assertNoSwapArtifacts(fixture.targetDir);
});

test("wrong locked hash rejects before replacing the current valid target", async (t) => {
  const fixture = await createFixture(t);
  const { syncLocalAvatar } = await import(scriptUrl);
  await mkdir(fixture.targetDir, { recursive: true });
  await writeFile(join(fixture.targetDir, "sentinel.txt"), "keep-current");
  const lockPath = join(fixture.viewerDir, "asset-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.viewerShaderInputs[2].sha256 = "0".repeat(64);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  await assert.rejects(() => syncLocalAvatar(fixture), /SHA-256 mismatch/);
  assert.equal(
    await readFile(join(fixture.targetDir, "sentinel.txt"), "utf8"),
    "keep-current",
  );
  await assertNoSwapArtifacts(fixture.targetDir);
});

test("missing locked source rejects without creating a partial target", async (t) => {
  const fixture = await createFixture(t);
  const { syncLocalAvatar } = await import(scriptUrl);
  await rm(join(fixture.runtimeDir, "textures", shaderNames[4]));

  await assert.rejects(() => syncLocalAvatar(fixture), /missing/i);
  await assert.rejects(() => access(fixture.targetDir));
  const publicDir = dirname(fixture.targetDir);
  await mkdir(publicDir, { recursive: true });
  await assertNoSwapArtifacts(fixture.targetDir);
});

test("successful sync replaces an existing target as one complete directory", async (t) => {
  const fixture = await createFixture(t);
  const { syncLocalAvatar } = await import(scriptUrl);
  await mkdir(fixture.targetDir, { recursive: true });
  await writeFile(join(fixture.targetDir, "stale.txt"), "old-version");

  await syncLocalAvatar(fixture);

  await assert.rejects(() => access(join(fixture.targetDir, "stale.txt")));
  await access(join(fixture.targetDir, "cortana-runtime-v0.glb"));
  for (const name of shaderNames) {
    await access(join(fixture.targetDir, "shader", name));
  }
  await assertNoSwapArtifacts(fixture.targetDir);
});
