import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { contractsRoot } from "../scripts/lib/registry.mjs";

const compatibilityScript = join(contractsRoot, "scripts/check-breaking-changes.mjs");
const defaultBundle = join(contractsRoot, "dist/openapi.bundle.yaml");
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function runNpmCompatibility(args = [], baselineOpenApi) {
  const env = { ...process.env };
  if (baselineOpenApi === undefined) {
    delete env.BASELINE_OPENAPI;
  } else {
    env.BASELINE_OPENAPI = baselineOpenApi;
  }
  return spawnSync(
    process.execPath,
    [npmCli, "run", "contracts:compatibility", ...(args.length > 0 ? ["--", ...args] : [])],
    { cwd: contractsRoot, env, encoding: "utf8" },
  );
}

async function breakingBaseline() {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-compatibility-"));
  const path = join(directory, "baseline.yaml");
  await writeFile(path, `openapi: 3.0.3
paths:
  /compatibility-test-only:
    get:
      responses:
        "200":
          description: test
`);
  return path;
}

test("compatibility package script delegates defaults to Node", async () => {
  const packageJson = JSON.parse(await readFile(join(contractsRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["contracts:compatibility"], "node scripts/check-breaking-changes.mjs");
  assert.doesNotMatch(packageJson.scripts["contracts:compatibility"], /\$\{BASELINE_OPENAPI:-/);
});

test("compatibility script defaults paths relative to the contracts package", () => {
  const result = spawnSync(process.execPath, [compatibilityScript], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(result.status, 0, output(result));
  assert.match(output(result), /OpenAPI compatibility OK/);
});

test("default npm compatibility command runs in the native npm shell", () => {
  const result = runNpmCompatibility();
  assert.equal(result.status, 0, output(result));
  assert.match(output(result), /OpenAPI compatibility OK/);
});

test("BASELINE_OPENAPI supplies the baseline path", async () => {
  const baselinePath = await breakingBaseline();
  const result = runNpmCompatibility([], baselinePath);
  assert.equal(result.status, 1, output(result));
  assert.match(output(result), /Removed operation GET \/compatibility-test-only/);
});

test("an explicit CLI baseline path takes priority over BASELINE_OPENAPI", async () => {
  const environmentBaseline = await breakingBaseline();
  const result = runNpmCompatibility([defaultBundle], environmentBaseline);
  assert.equal(result.status, 0, output(result));
  assert.match(output(result), /OpenAPI compatibility OK/);
});
