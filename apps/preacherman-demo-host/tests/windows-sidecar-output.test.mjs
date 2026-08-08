import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/build-windows-sidecar.mjs", import.meta.url), "utf8");

test("sidecar verification can use an isolated output directory without overwriting packaged binaries", () => {
  assert.match(source, /PREACHERMAN_SIDECAR_OUTPUT_DIR/);
  assert.match(source, /resolve\(verificationRoot, "build"\)/);
  assert.match(source, /resolve\(verificationRoot, "preacherman-service-x86_64-pc-windows-msvc\.exe"\)/);
  assert.match(source, /verificationRoot\s*\?[^:]+:\s*resolve\(packageRoot, "src-tauri", "binaries"/s);
  assert.match(source, /node_modules", "postject", "dist", "cli\.js"/);
  assert.match(source, /run\(process\.execPath, \[postject/);
  assert.doesNotMatch(source, /postject\.cmd/);
});
