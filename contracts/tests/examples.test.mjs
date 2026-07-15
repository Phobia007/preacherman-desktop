import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";
import { createComponentSchemaDocument } from "../scripts/lib/openapi-examples.mjs";

const contractsRoot = new URL("../", import.meta.url);

async function readYaml(relativePath) {
  return YAML.parse(await readFile(new URL(relativePath, contractsRoot), "utf8"));
}

test("shared HTTP schemas expose the required contract shapes", async () => {
  const common = await readYaml("openapi/components/common.yaml");

  for (const schemaName of [
    "RequestMeta",
    "ListMeta",
    "FieldError",
    "ErrorResponse",
    "OperationAccepted",
  ]) {
    assert.ok(common[schemaName], `Missing ${schemaName}`);
  }

  assert.deepEqual(common.RequestMeta.required, ["request_id"]);
  assert.deepEqual(common.ListMeta.required, ["request_id", "next_cursor", "has_more"]);
  assert.deepEqual(common.FieldError.required, ["field", "code", "message"]);
  assert.deepEqual(common.ErrorResponse.required, ["error", "meta"]);
  assert.deepEqual(
    common.OperationAccepted.required,
    ["operation_type", "operation_id", "status", "status_url", "events_url"],
  );
});

test("all stable error codes have a schema-valid fixture", async () => {
  const [common, errorRegistry] = await Promise.all([
    readYaml("openapi/components/common.yaml"),
    readYaml("registry/error-codes.yaml"),
  ]);
  const examplesDirectory = new URL("examples/errors/", contractsRoot);
  const files = (await readdir(examplesDirectory)).filter((file) => file.endsWith(".json")).sort();
  assert.equal(files.length, 31);

  const schemaDocument = createComponentSchemaDocument(common, "ErrorResponse");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schemaDocument);
  const observedCodes = new Set();

  for (const file of files) {
    const fixture = JSON.parse(await readFile(new URL(file, examplesDirectory), "utf8"));
    assert.equal(
      validate(fixture),
      true,
      `${file}: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
    );
    assert.ok(errorRegistry[fixture.error.code], `${file} uses an unknown error code`);
    assert.equal(observedCodes.has(fixture.error.code), false, `${fixture.error.code} has duplicate fixtures`);
    observedCodes.add(fixture.error.code);
  }

  assert.deepEqual([...observedCodes].sort(), Object.keys(errorRegistry).sort());
});

test("API-001 through API-038 have sanitized success examples", async () => {
  const examplesDirectory = new URL("examples/http/api-001-038/", contractsRoot);
  const files = (await readdir(examplesDirectory)).filter((file) => file.endsWith(".json")).sort();
  const expectedFiles = Array.from(
    { length: 38 },
    (_, index) => `api-${String(index + 1).padStart(3, "0")}-success.json`,
  );
  assert.deepEqual(files, expectedFiles);

  const examples = new Map();
  for (const file of files) {
    const example = JSON.parse(await readFile(new URL(file, examplesDirectory), "utf8"));
    assert.equal(typeof example.summary, "string", `${file} is missing summary`);
    assert.equal(Object.hasOwn(example, "value"), true, `${file} is missing value`);
    examples.set(file, example);
  }

  const loginExample = JSON.stringify(examples.get("api-002-success.json"));
  assert.doesNotMatch(loginExample, /access_token|refresh_token|password/i);

  const shareExample = JSON.stringify(examples.get("api-034-success.json"));
  assert.doesNotMatch(shareExample, /token|token_hash|share_url/i);
});

test("API-039 through API-069 have complete success examples", async () => {
  const examplesDirectory = new URL("examples/http/api-039-069/", contractsRoot);
  const files = (await readdir(examplesDirectory)).filter((file) => file.endsWith(".json")).sort();
  const expectedFiles = Array.from(
    { length: 31 },
    (_, index) => `api-${String(index + 39).padStart(3, "0")}-success.json`,
  );
  assert.deepEqual(files, expectedFiles);

  for (const file of files) {
    const example = JSON.parse(await readFile(new URL(file, examplesDirectory), "utf8"));
    assert.equal(typeof example.summary, "string", `${file} is missing summary`);
    assert.equal(Object.hasOwn(example, "value"), true, `${file} is missing value`);
  }
});

test("Task runs, retries, downloads, and Save & Re-test preserve workflow boundaries", async () => {
  const examplesDirectory = new URL("examples/http/api-039-069/", contractsRoot);
  const readExample = async (apiNumber) => JSON.parse(
    await readFile(
      new URL(`api-${String(apiNumber).padStart(3, "0")}-success.json`, examplesDirectory),
      "utf8",
    ),
  );

  const taskRun = await readExample(48);
  assert.equal(taskRun.value.data.operation.operation_type, "task_run");
  assert.equal(taskRun.value.data.operation.status, "queued");
  assert.equal(typeof taskRun.value.data.task_run_id, "string");

  const retry = await readExample(51);
  assert.equal(typeof retry.value.data.previous_task_run_id, "string");
  assert.equal(typeof retry.value.data.task_run_id, "string");
  assert.notEqual(retry.value.data.task_run_id, retry.value.data.previous_task_run_id);

  const download = await readExample(55);
  const downloadUrl = new URL(download.value.data.download_url);
  assert.equal(downloadUrl.hostname.endsWith(".invalid"), true);
  assert.equal(downloadUrl.search, "");

  const saveAndRetest = await readExample(67);
  assert.equal(typeof saveAndRetest.value.data.state_draft_id, "string");
  assert.equal(typeof saveAndRetest.value.data.draft_revision, "number");
  assert.equal(typeof saveAndRetest.value.data.test_run_id, "string");
  assert.equal(saveAndRetest.value.data.test_run_status, "queued");
  assert.doesNotMatch(
    JSON.stringify(saveAndRetest.value),
    /publish|activate|state_version_id|installation/i,
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

test("State Skill mount writes exclude server-managed mount fields", async () => {
  const states = await readYaml("openapi/components/states.yaml");
  const mountWrite = states.StateSkillMountWrite;

  assert.ok(mountWrite);
  assert.deepEqual(mountWrite.required, ["skill_version_id", "position", "configuration", "is_enabled"]);
  assert.equal(Object.hasOwn(mountWrite.properties, "state_skill_mount_id"), false);
  assert.equal(Object.hasOwn(mountWrite.properties, "mounted_at"), false);
  assert.equal(
    states.SaveAndRetestRequest.properties.changes.properties.skill_mounts.items.$ref,
    "#/StateSkillMountWrite",
  );
});

test("cursor and download expiry responses use matching stable error examples", async () => {
  const tasks = await readYaml("openapi/paths/tasks-artifacts.yaml");

  assert.equal(
    tasks["/task-runs/{task_run_id}/events"].get.responses["409"].$ref,
    "../components/responses.yaml#/EventCursorExpired",
  );
  assert.equal(
    tasks["/artifacts/{artifact_id}/download-url"].get.responses["410"].$ref,
    "../components/responses.yaml#/DownloadUrlExpired",
  );
});
