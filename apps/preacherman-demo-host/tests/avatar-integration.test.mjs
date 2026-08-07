import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Demo Host owns compatible concrete avatar dependencies without changing React 18", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.dependencies.react, "18.3.1");
  assert.equal(manifest.dependencies["react-dom"], "18.3.1");
  assert.equal(
    manifest.dependencies["@preacherman/avatar-renderer"],
    "file:../../packages/preacherman-avatar-renderer",
  );
  assert.equal(manifest.dependencies["@react-three/fiber"], "8.18.0");
  assert.equal(manifest.dependencies["@react-three/drei"], "9.115.0");
  assert.equal(manifest.dependencies.three, "0.185.1");
  assert.equal(manifest.overrides?.["stats-gl"], "2.2.7");
});

test("Vite deduplicates React, Three, and React Three Fiber", async () => {
  const vite = await readFile(join(packageRoot, "vite.config.ts"), "utf8");

  for (const dependency of [
    "react",
    "react-dom",
    "three",
    "@react-three/fiber",
  ]) {
    assert.match(vite, new RegExp(`["']${dependency.replace("/", "\\/")}["']`));
  }
});

test("Demo avatar slot uses BASE_URL local assets and records renderer diagnostics", async () => {
  const assets = await readFile(
    join(packageRoot, "src", "avatar", "avatarAssets.ts"),
    "utf8",
  );
  const slot = await readFile(
    join(packageRoot, "src", "avatar", "DemoAvatarSlot.tsx"),
    "utf8",
  );

  assert.match(assets, /import\.meta\.env\.BASE_URL/);
  assert.match(assets, /assets\/avatars\/cortana\//);
  assert.doesNotMatch(`${assets}\n${slot}`, /E:\\\\|E:\//);
  assert.match(slot, /AvatarViewport/);
  assert.match(slot, /__PREACHERMAN_AVATAR_DIAGNOSTICS__/);
  assert.match(slot, /drawCalls/);
  assert.match(slot, /triangles/);
  assert.match(slot, /onContextLost/);
});

test("Demo Host injects AvatarSlot at adapter creation rather than into manifest or projection", async () => {
  const app = await readFile(join(packageRoot, "src", "App.tsx"), "utf8");

  assert.match(app, /avatarSlot:\s*DemoAvatarSlot/);
  assert.doesNotMatch(app, /manifest:\s*\{[\s\S]*avatar/i);
  assert.doesNotMatch(app, /projection:\s*\{[\s\S]*avatar/i);
});

test("Tauri CSP permits only the local Agent and voice service boundary", async () => {
  const config = JSON.parse(
    await readFile(join(packageRoot, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  const capability = JSON.parse(
    await readFile(
      join(packageRoot, "src-tauri", "capabilities", "main.json"),
      "utf8",
    ),
  );
  const { csp, devCsp } = config.app.security;

  assert.equal(typeof csp, "string");
  assert.equal(typeof devCsp, "string");
  assert.notEqual(csp.trim(), "");
  assert.notEqual(devCsp.trim(), "");
  assert.match(csp, /connect-src[^;]*ipc:/);
  assert.match(csp, /connect-src[^;]*blob:/);
  assert.match(csp, /img-src[^;]*data:[^;]*blob:/);
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(csp, /font-src[^;]*data:/);
  assert.match(csp, /http:\/\/127\.0\.0\.1:\*/);
  assert.match(csp, /ws:\/\/127\.0\.0\.1:\*/);
  assert.doesNotMatch(
    csp
      .replaceAll("http://ipc.localhost", "")
      .replaceAll("http://127.0.0.1:*", "")
      .replaceAll("ws://127.0.0.1:*", ""),
    /https?:\/\//,
  );
  assert.match(devCsp, /http:\/\/127\.0\.0\.1:1420/);
  assert.match(devCsp, /ws:\/\/127\.0\.0\.1:1420/);
  assert.doesNotMatch(
    devCsp
      .replaceAll("http://ipc.localhost", "")
      .replaceAll("http://127.0.0.1:1420", "")
      .replaceAll("ws://127.0.0.1:1420", "")
      .replaceAll("http://127.0.0.1:*", "")
      .replaceAll("ws://127.0.0.1:*", ""),
    /https?:\/\//,
  );
  assert.equal(
    capability.permissions.some((permission) => /fs|filesystem/i.test(permission)),
    false,
  );
});
