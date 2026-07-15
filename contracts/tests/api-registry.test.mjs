import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openApiUrl = new URL("../openapi/openapi.yaml", import.meta.url);

test("OpenAPI root declares the fixed contract boundary", async () => {
  const source = await readFile(openApiUrl, "utf8");

  assert.match(source, /^openapi: 3\.1\.0$/m);
  assert.match(source, /^  version: 1\.0\.0$/m);
  assert.match(source, /^  - url: \/api\/v1$/m);
  assert.match(source, /^security:$/m);
  assert.match(source, /^  - bearerAuth: \[\]$/m);
  assert.match(source, /^tags:$/m);
});

test("OpenAPI covers API-001 through API-038", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-api-coverage.mjs", "--from", "API-001", "--through", "API-038"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /expected=38 present=38 missing=0/);
});

test("OpenAPI covers API-001 through API-069", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-api-coverage.mjs", "--from", "API-001", "--through", "API-069"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /expected=69 present=69 missing=0/);
});

test("OpenAPI covers API-001 through API-096", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-api-coverage.mjs", "--from", "API-001", "--through", "API-096"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /expected=96 present=96 missing=0/);
});

test("OpenAPI covers API-001 through API-128", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-api-coverage.mjs", "--from", "API-001", "--through", "API-128"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /expected=128 present=128 missing=0/);
});
