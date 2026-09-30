import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("desktop development launcher uses the canonical workspace with isolated hot-reload ports", async () => {
  const [launcher, runtime, config, manifest, rust] = await Promise.all([
    readFile(join(packageRoot, "scripts", "start-preacherman-desktop-dev.ps1"), "utf8"),
    readFile(join(packageRoot, "scripts", "desktop-dev.mjs"), "utf8"),
    readFile(join(packageRoot, "src-tauri", "tauri.desktop-dev.conf.json"), "utf8"),
    readFile(join(packageRoot, "package.json"), "utf8"),
    readFile(join(packageRoot, "src-tauri", "src", "main.rs"), "utf8"),
  ]);

  assert.match(launcher, /tauri\.desktop-dev\.conf\.json/);
  assert.match(runtime, /const servicePort = "8790"/);
  assert.match(runtime, /const uiPort = "1430"/);
  assert.match(runtime, /VITE_PREACHERMAN_SERVICE_PORT: servicePort/);
  assert.equal(JSON.parse(config).build.devUrl, "http://127.0.0.1:1430");
  assert.equal(JSON.parse(manifest).scripts["dev:desktop"], "node scripts/desktop-dev.mjs");
  assert.match(rust, /cfg\(all\(any\(target_os = "windows", target_os = "macos"\), not\(debug_assertions\)\)\)/);
});
