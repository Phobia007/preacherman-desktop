import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

const contractsRoot = new URL("../", import.meta.url);

async function readYaml(relativePath) {
  return YAML.parse(await readFile(new URL(relativePath, contractsRoot), "utf8"));
}

async function readExample(apiNumber) {
  const file = `examples/http/api-070-096/api-${String(apiNumber).padStart(3, "0")}-success.json`;
  return JSON.parse(await readFile(new URL(file, contractsRoot), "utf8"));
}

test("API-070 through API-096 have complete success examples", async () => {
  const directory = new URL("examples/http/api-070-096/", contractsRoot);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const expected = Array.from(
    { length: 27 },
    (_, index) => `api-${String(index + 70).padStart(3, "0")}-success.json`,
  );

  assert.deepEqual(files, expected);
  for (const file of files) {
    const example = JSON.parse(await readFile(new URL(file, directory), "utf8"));
    assert.equal(typeof example.summary, "string", `${file} is missing summary`);
    assert.equal(Object.hasOwn(example, "value"), true, `${file} is missing value`);
  }
});

test("Skill Draft uses the confirmed five-step flow without exposing secret values", async () => {
  const skills = await readYaml("openapi/components/skills.yaml");

  assert.equal(skills.SkillDraft.properties.current_step.minimum, 1);
  assert.equal(skills.SkillDraft.properties.current_step.maximum, 5);
  assert.deepEqual(skills.SkillDraft.properties.creation_mode.enum, ["blank", "template", "import"]);
  assert.ok(skills.SkillPermissionDeclaration);
  assert.equal(Object.hasOwn(skills.SkillPermissionDeclaration.properties, "secret_value"), false);
  assert.equal(Object.hasOwn(skills.SkillPermissionDeclaration.properties, "api_key"), false);
});

test("Import and validation examples create the correct asynchronous operation types", async () => {
  const importJob = await readExample(80);
  assert.equal(importJob.value.data.operation.operation_type, "import_job");
  assert.equal(importJob.value.data.import_job.status, "queued");
  assert.equal(new URL(importJob.value.data.import_job.repository_url).hostname.endsWith(".invalid"), true);
  assert.doesNotMatch(JSON.stringify(importJob.value), /access_token|api_key|authorization|credential/i);

  const validation = await readExample(85);
  assert.equal(validation.value.data.operation.operation_type, "validation_run");
  assert.equal(validation.value.data.validation_run.status, "queued");
});

test("validation review is a system result and never an approval workflow", async () => {
  const skills = await readYaml("openapi/components/skills.yaml");
  const validation = await readExample(86);
  const serialized = JSON.stringify({ skills, validation });

  assert.equal(typeof validation.value.data.review_count, "number");
  assert.doesNotMatch(
    serialized,
    /approval_status|approved_by|assigned_reviewer|pending_approval|human_review/i,
  );
});

test("publishing atomically returns an immutable SkillVersion and a StateDraft mount", async () => {
  const [skills, paths, published] = await Promise.all([
    readYaml("openapi/components/skills.yaml"),
    readYaml("openapi/paths/skills.yaml"),
    readExample(93),
  ]);
  const publish = paths["/skill-drafts/{skill_draft_id}/publish"].post;

  assert.deepEqual(publish["x-permissions"], ["skill.publish", "state.skill_mount.manage"]);
  assert.deepEqual(publish["x-audit-actions"], ["skill.published", "skill.mounted"]);
  assert.equal(skills.SkillVersion.properties.skill_version_id.readOnly, true);
  assert.equal(typeof published.value.data.skill_version.skill_version_id, "string");
  assert.equal(typeof published.value.data.mount.state_skill_mount_id, "string");
  assert.equal(typeof published.value.data.state_draft_revision, "number");
  assert.doesNotMatch(JSON.stringify(published.value), /installation|activate/i);
});

test("publish request requires both Skill and destination State revisions", async () => {
  const skills = await readYaml("openapi/components/skills.yaml");
  const request = skills.PublishSkillDraftRequest;

  assert.ok(request.required.includes("draft_revision"));
  assert.ok(request.required.includes("validation_run_id"));
  assert.ok(request.required.includes("destination"));
  assert.deepEqual(
    request.properties.destination.required,
    ["state_draft_id", "state_draft_revision"],
  );
});

test("the OpenAPI example validator scans API-001 through API-128", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/validate-openapi-examples.mjs"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /http=128/);
});
