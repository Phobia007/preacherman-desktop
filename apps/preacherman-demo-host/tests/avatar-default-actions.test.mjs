import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { auditAvatarResources } from "../scripts/audit-avatar-resources.mjs";

const hostRoot = join(import.meta.dirname, "..");
test("the packaged avatars contain their defaults and no imported animation packs", async () => {
  const audit = await auditAvatarResources();
  assert.deepEqual(audit.motionLibrary, { count: 0, bytes: 0 });
  assert.equal(audit.models.length, 10);
  for (const modelId of ["cortana", "zima"]) {
    const root = join(hostRoot, "public/assets/avatars", modelId);
    const bytes = await readFile(join(root, modelId + "-runtime.glb"));
    const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
    assert.deepEqual(gltf.animations.map(clip => clip.name), [modelId === "zima" ? "zima.idle.v1" : "cortana.idle.catwalk.v1"]);
    await assert.rejects(access(join(root, "motion-library")), { code: "ENOENT" });
  }
  const pkg = JSON.parse(await readFile(join(hostRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts["sync:motions"], undefined);
});
test("default-only stages retain loading, error and focus chrome for both appearances", async () => {
  const stage = await readFile(join(hostRoot, "src/gallery/CortanaModelStage.tsx"), "utf8");
  const css = await readFile(join(hostRoot, "src/gallery/cortana-gallery.css"), "utf8");
  const styles = await readFile(join(hostRoot, "src/styles.css"), "utf8");
  assert.doesNotMatch(stage, /cortana-motion-picker|motion\.select|conversation_loop|showControls/);
  assert.match(stage, /actionId=\{defaultActionId\}/);
  assert.match(stage, /onError=\{handleError\}/);
  assert.match(stage, /onReady=\{handleReady\}/);
  assert.match(css, /--demo-theme-/);
  assert.match(styles, /data-appearance="dark"/);
  assert.match(styles, /--demo-theme-focus/);
});
