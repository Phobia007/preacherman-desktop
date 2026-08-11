import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("fixed HomeRail workflow pins the official pattern and publishes required reviewable artifacts", async () => {
  const workflow = await readFile(join(packageRoot, "config", "homerail", "preacherman-complex-task-v1.workflow.yaml"), "utf8");
  assert.match(workflow, /id: preacherman-complex-task-v1/);
  assert.match(workflow, /id: orchestrator-workers\s+version: 1\.2\.0/);
  assert.match(workflow, /name: plan\.json[\s\S]*?contract: Plan[\s\S]*?required: true/);
  assert.match(workflow, /name: verification\.json[\s\S]*?contract: VerificationResult[\s\S]*?required: true[\s\S]*?publish: success/);
  assert.match(workflow, /evidence:[\s\S]*?type: array[\s\S]*?minItems: 1/);
});

test("runtime profile template references only an encrypted HomeRail model alias", async () => {
  const profile = await readFile(join(packageRoot, "config", "homerail", "preacherman-complex-task-v1.profile.yaml.template"), "utf8");
  assert.match(profile, /workflow_id: preacherman-complex-task-v1/);
  assert.match(profile, /model_alias:/);
  assert.doesNotMatch(profile, /api[_-]?key\s*:/i);
});

test("real acceptance script verifies one Task, one Attempt, one Run, and artifact digests", async () => {
  const script = await readFile(join(packageRoot, "scripts", "verify-homerail-fusion.mjs"), "utf8");
  assert.match(script, /repeated\.run\.attempts\?\.length !== 1/);
  assert.match(script, /externalRunId/);
  assert.match(script, /createHash\("sha256"\)/);
  assert.match(script, /index\.artifacts\.length < 2/);
});
