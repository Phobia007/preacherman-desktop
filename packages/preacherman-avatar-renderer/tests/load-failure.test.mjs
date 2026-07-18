import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("loader failures become stable AvatarError values without leaking raw values", async () => {
  const { AvatarError, normalizeAvatarError } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );

  const networkError = normalizeAvatarError(
    new Error("404 while loading model"),
    "ASSET_LOAD_FAILED",
  );
  assert.ok(networkError instanceof AvatarError);
  assert.equal(networkError.name, "AvatarError");
  assert.equal(networkError.code, "ASSET_LOAD_FAILED");
  assert.equal(networkError.message, "404 while loading model");

  const unknownError = normalizeAvatarError("shader exploded", "MATERIAL_CREATE_FAILED");
  assert.ok(unknownError instanceof AvatarError);
  assert.equal(unknownError.code, "MATERIAL_CREATE_FAILED");
  assert.equal(unknownError.message, "shader exploded");
});
