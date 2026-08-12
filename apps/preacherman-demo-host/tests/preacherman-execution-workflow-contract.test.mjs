import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("fixed Preacherman Execution workflow pins the official pattern and publishes required reviewable artifacts", async () => {
  const workflow = await readFile(join(packageRoot, "config", "preacherman-execution", "preacherman-complex-task-v1.workflow.yaml"), "utf8");
  assert.match(workflow, /id: preacherman-complex-task-v1/);
  assert.match(workflow, /id: orchestrator-workers\s+version: 1\.2\.0/);
  assert.match(workflow, /name: plan\.json[\s\S]*?contract: Plan[\s\S]*?required: true/);
  assert.match(workflow, /name: verification\.json[\s\S]*?contract: VerificationResult[\s\S]*?required: true[\s\S]*?publish: success/);
  assert.match(workflow, /evidence:[\s\S]*?type: array[\s\S]*?minItems: 1/);
});

test("runtime profile template references only an encrypted Preacherman Execution model alias", async () => {
  const profile = await readFile(join(packageRoot, "config", "preacherman-execution", "preacherman-complex-task-v1.profile.yaml.template"), "utf8");
  assert.match(profile, /workflow_id: preacherman-complex-task-v1/);
  assert.match(profile, /model_alias:/);
  assert.doesNotMatch(profile, /api[_-]?key\s*:/i);
});

test("real acceptance script verifies one Task, one Attempt, one Run, and artifact digests", async () => {
  const script = await readFile(join(packageRoot, "scripts", "verify-preacherman-execution-fusion.mjs"), "utf8");
  assert.match(script, /FACT A: Track A is a closed 10-user pilot/);
  assert.match(script, /FACT B: Track B is a 50-user invite-only beta/);
  assert.match(script, /FACT C: Track C is a 1-week public showcase/);
  assert.match(script, /explicitly mark unknown cost instead of inventing a number/);
  assert.match(script, /in parallel and independently verify one recommendation/);
  assert.match(script, /repeated\.run\?\.taskId !== first\.run\.taskId/);
  assert.match(script, /confirmed\?\.attempts\?\.length !== 1/);
  assert.match(script, /PREACHERMAN_FUSION_TASK_ID/);
  assert.match(script, /externalRunId/);
  assert.match(script, /createHash\("sha256"\)/);
  assert.match(script, /filter\(\(artifact\) => artifact\.required === true\)/);
});
