import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { contractsRoot } from "../scripts/lib/registry.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("TypeScript contracts regenerate deterministically and typecheck", async () => {
  const generatorPath = join(contractsRoot, "scripts/generate-typescript.mjs");
  assert.equal(await exists(generatorPath), true, "TypeScript generator must exist");
  const { generateTypescriptContracts } = await import("../scripts/generate-typescript.mjs");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "preacherman-types-"));
  await generateTypescriptContracts(temporaryRoot);

  for (const file of ["http.ts", "events.ts", "index.ts", "tsconfig.json"]) {
    const committedPath = join(contractsRoot, "generated/typescript", file);
    const temporaryPath = join(temporaryRoot, file);
    assert.equal(await exists(committedPath), true, `${file} must be committed`);
    assert.equal(await readFile(temporaryPath, "utf8"), await readFile(committedPath, "utf8"), `${file} has generation drift`);
  }

  const http = await readFile(join(temporaryRoot, "http.ts"), "utf8");
  const events = await readFile(join(temporaryRoot, "events.ts"), "utf8");
  assert.match(http, /"API-128"/);
  assert.match(http, /export type StableErrorCode/);
  assert.match(events, /"runtime\.revision_changed"/);
  assert.match(events, /export interface EventPayloadMap/);
  assert.doesNotMatch(`${http}\n${events}`, /\bany\b/);

  const tsc = join(contractsRoot, "node_modules/.bin/tsc");
  assert.equal(await exists(tsc), true, "pinned TypeScript compiler must be installed");
  const result = spawnSync(tsc, ["--project", join(temporaryRoot, "tsconfig.json")], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
