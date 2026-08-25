import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createStaticUiServer } from "../server/staticUiServer.mjs";

const hostRoot = resolve(import.meta.dirname, "..");

test("Tauri embeds only the lightweight shell and deploys unchanged UI media as resources", async () => {
  const config = JSON.parse(await readFile(join(hostRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(hostRoot, "package.json"), "utf8"));
  const prepareScript = await readFile(join(hostRoot, "scripts", "prepare-tauri-frontend.mjs"), "utf8");
  const runtimeAssets = await readFile(join(hostRoot, "src", "runtimeAssets.ts"), "utf8");
  const taskSurface = await readFile(join(hostRoot, "src", "task", "TaskSurface.tsx"), "utf8");
  const gallerySurface = await readFile(join(hostRoot, "src", "surfaces", "gallery", "GallerySurface.tsx"), "utf8");
  const settingsScreen = await readFile(join(hostRoot, "src", "settings", "SettingsScreen.tsx"), "utf8");
  const avatarAssets = await readFile(join(hostRoot, "src", "avatar", "avatarAssets.ts"), "utf8");
  const rustHost = await readFile(join(hostRoot, "src-tauri", "src", "main.rs"), "utf8");

  assert.equal(config.build.frontendDist, "../tauri-dist");
  assert.equal(config.bundle.resources["../dist/"], "preacherman-ui/");
  assert.match(packageJson.scripts["build:tauri-frontend"], /prepare-tauri-frontend\.mjs/);
  assert.match(config.build.beforeBuildCommand, /build:tauri-frontend/);
  for (const directory of ["assets/avatars", "gallery-v3", "settings-v3-local", "task-lookback-v3"]) {
    assert.match(prepareScript, new RegExp(directory.replace("/", "[/\\\\]")));
  }
  assert.match(runtimeAssets, /127\.0\.0\.1:8788/);
  assert.match(taskSurface, /runtimeAssetUrl/);
  assert.match(gallerySurface, /runtimeAssetUrl/);
  assert.match(settingsScreen, /runtimeAssetUrl/);
  assert.match(avatarAssets, /runtimeAssetUrl/);
  assert.match(rustHost, /PREACHERMAN_UI_ROOT/);
  assert.match(rustHost, /resource_dir/);
});

test("static UI sidecar serves exact bytes with local-origin CORS and blocks traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "preacherman-ui-"));
  const expected = "<main>unchanged gallery bytes</main>";
  await writeFile(join(root, "index.html"), expected);
  const uiServer = createStaticUiServer({ root });

  try {
    const address = await uiServer.listen(0);
    const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/ui/index.html`, {
      headers: { Origin: "https://tauri.localhost" },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), expected);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://tauri.localhost");
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);

    const traversal = await fetch(`http://127.0.0.1:${port}/ui/%2e%2e/package.json`);
    assert.equal(traversal.status, 404);
  } finally {
    await uiServer.close();
    await rm(root, { recursive: true, force: true });
  }
});
