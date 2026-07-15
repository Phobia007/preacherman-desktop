import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
    } else if (/\.(?:ts|tsx|css)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

test("package exposes the required React Vite library boundary", async () => {
  const packagePath = join(packageRoot, "package.json");
  assert.equal(await exists(packagePath), true, "surface package.json must exist");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));

  assert.equal(manifest.type, "module");
  assert.equal(manifest.peerDependencies?.react !== undefined, true);
  assert.equal(manifest.peerDependencies?.["react-dom"] !== undefined, true);
  assert.match(manifest.scripts?.build ?? "", /vite build/);
  assert.match(manifest.exports?.["."]?.import ?? "", /dist/);
  assert.match(manifest.exports?.["."]?.types ?? "", /\.d\.ts$/);
});

test("source package never imports Tauri or runtime modules directly", async () => {
  const sourceRoot = join(packageRoot, "src");
  assert.equal(await exists(sourceRoot), true, "surface source directory must exist");
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:@tauri-apps|tauriClient|\/runtime(?:\/|["']))/i, file);
    assert.doesNotMatch(source, /\b(?:invoke|listen)\s*\(/, file);
  }
});

test("skin styles are scoped and do not rewrite host page CSS", async () => {
  const cssPath = join(packageRoot, "src/styles/index.css");
  assert.equal(await exists(cssPath), true, "scoped package stylesheet must exist");
  const css = await readFile(cssPath, "utf8");
  assert.doesNotMatch(css, /(^|})\s*(?:html|body|:root)(?:\s|,|\{)/m);
  assert.match(css, /\.pm-surface-skin/);
  assert.match(css, /--pm-skin-/);
});

test("built adapter supports known manifests and falls back for unknown versions", async () => {
  const entry = join(packageRoot, "dist/index.js");
  assert.equal(await exists(entry), true, "run vite build before architecture tests");
  const { createSurfaceSkinAdapter } = await import(pathToFileURL(entry));
  const host = { execute: async () => ({ ok: true }) };
  const adapter = createSurfaceSkinAdapter({ host, tokens: {} });

  assert.equal(adapter.supports({ surfaceType: "workspace", schemaVersion: 1 }), true);
  assert.equal(adapter.supports({ surfaceType: "workspace", schemaVersion: 99 }), false);
  assert.equal(adapter.resolve({ surfaceType: "workspace", schemaVersion: 99 }).kind, "fallback");
});

test("built output keeps React external", async () => {
  const entry = join(packageRoot, "dist/index.js");
  assert.equal(await exists(entry), true, "built ESM entry must exist");
  const source = await readFile(entry, "utf8");
  assert.match(source, /from\s+["']react(?:\/jsx-runtime)?["']/);
  assert.doesNotMatch(source, /react\.production\.min|__SECRET_INTERNALS_DO_NOT_USE/);
});
