import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const contractsRoot = new URL("../", import.meta.url);

function runScript(script, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: contractsRoot,
    encoding: "utf8",
  });
}

const checks = [
  ["API registry", "scripts/check-api-coverage.mjs", "128"],
  ["error registry", "scripts/check-error-coverage.mjs", "31"],
  ["event registry", "scripts/check-event-coverage.mjs", "56"],
];

for (const [label, script, expectedCount] of checks) {
  test(`${label} is internally complete`, () => {
    const result = runScript(script, "--registry-only");

    assert.equal(
      result.status,
      0,
      `${result.stderr || result.stdout || `${script} did not run`}`,
    );
    assert.match(result.stdout, new RegExp(`count=${expectedCount}\\b`));
  });
}
