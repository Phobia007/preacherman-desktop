import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const publicRoot = join(root, "public");
const read = path => readFile(join(root, path), "utf8");
const cleanup = JSON.parse(await read("docs/package-trim-20261104.json"));
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(dir, entry.name)) : join(dir, entry.name)))).flat();
}

test("retired donor assets cannot silently return to the packaged public directory", async () => {
  for (const file of cleanup.files) {
    assert.ok(!file.path.includes(".."));
    assert.ok(file.reason && file.sha256);
    await assert.rejects(stat(join(publicRoot, file.path)), { code: "ENOENT" });
  }
});

test("all current character portraits and dynamically named models stay packaged", async () => {
  const characters = JSON.parse(await read("src/surfaces/asset/characters.json"));
  const catalog = JSON.parse(await read("public/market-love/characters.json"));
  for (const character of characters) {
    for (const url of [character.image, character.cardImage,
      `/assets/avatars/${character.id}/${character.id}-runtime.glb`]) {
      assert.ok((await stat(join(publicRoot, url))).size > 0, url);
    }
  }
  for (const character of catalog) {
    const bytes = await readFile(join(publicRoot, "market-love", character.image));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), character.sha256);
  }
  for (const model of ["cortana", "zima"]) {
    const textures = (await files(join(publicRoot, "assets/avatars", model, "shader")));
    assert.equal(textures.filter(file => file.endsWith(".png")).length, 6);
  }
});

test("Task uses one canonical copy of the identical video", async () => {
  const payload = await read("public/gallery-v3/portfolio/_payload.json");
  assert.doesNotMatch(payload, /high-qmeptz\.mp4/);
  assert.match(payload, /high-e811c101a3\.mp4/);
  const bytes = await readFile(join(publicRoot, "gallery-v3/portfolio/assets/media/stream.mux.com/high-e811c101a3.mp4"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    cleanup.files.find(file => file.path.endsWith("high-qmeptz.mp4")).sha256);
});

test("package trim preserves fonts, speech resources and self-contained production UI", async () => {
  for (const path of ["public/gallery-v3/portfolio/assets/fonts/ClashDisplay-Light.ttf",
    "public/gallery-v3/portfolio/assets/fonts/BrotherSignature-7BWnK.otf",
    "src/surfaces/home/assets/Zodiak-Bold.otf", "public/speech/silero/silero_vad.onnx",
    "public/speech/silero/ort-wasm-simd-threaded.wasm"]) {
    assert.ok((await stat(join(root, path))).size > 0, path);
  }
  const config = JSON.parse(await read("src-tauri/tauri.conf.json"));
  assert.equal(config.build.frontendDist, "../dist");
  const total = (await Promise.all((await files(publicRoot)).map(async p => (await stat(p)).size)))
    .reduce((sum, size) => sum + size, 0);
  assert.ok(total <= cleanup.baselinePublicBytes - cleanup.removedBytes + 1024 * 1024,
    `Public assets exceeded the verified trim budget: ${total}`);
});
