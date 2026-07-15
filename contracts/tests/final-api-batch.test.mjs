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
  const file = `examples/http/api-097-128/api-${String(apiNumber).padStart(3, "0")}-success.json`;
  return JSON.parse(await readFile(new URL(file, contractsRoot), "utf8"));
}

test("API-097 through API-128 have complete success examples", async () => {
  const directory = new URL("examples/http/api-097-128/", contractsRoot);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const expected = Array.from(
    { length: 32 },
    (_, index) => `api-${String(index + 97).padStart(3, "0")}-success.json`,
  );

  assert.deepEqual(files, expected);
});

test("State Test results never publish or activate a State", async () => {
  const [components, result] = await Promise.all([
    readYaml("openapi/components/tests.yaml"),
    readExample(103),
  ]);

  assert.ok(components.TestResult);
  assert.equal(typeof result.value.data.test_result.test_result_id, "string");
  const propertyNames = Object.keys(components.TestResult.properties).join("|");
  assert.doesNotMatch(
    JSON.stringify({ propertyNames, result: result.value }),
    /publish_status|published_at|activate|installation/i,
  );
});

test("a TestDraft targets exactly one State representation and can start without task text", async () => {
  const components = await readYaml("openapi/components/tests.yaml");

  assert.equal(components.TestDraft.oneOf.length, 2);
  assert.equal(components.CreateTestDraftRequest.oneOf.length, 2);
  assert.equal(components.CreateTestDraftRequest.required.includes("task"), false);
});

test("install and activate are separate operations", async () => {
  const [paths, installed, activated] = await Promise.all([
    readYaml("openapi/paths/market-installations.yaml"),
    readExample(112),
    readExample(113),
  ]);
  const install = paths["/state-installations"].post;
  const activate = paths["/state-installations/{installation_id}/activate"].post;

  assert.equal(install.operationId, "createStateInstallation");
  assert.equal(activate.operationId, "activateStateInstallation");
  assert.equal(installed.value.data.status, "installed_inactive");
  assert.equal(installed.value.data.is_current, false);
  assert.equal(installed.value.data.activated_at, null);
  assert.equal(activated.value.data.installation.status, "active");
  assert.equal(activated.value.data.installation.is_current, true);
  assert.equal(typeof activated.value.data.previous_current_installation_id, "string");
  assert.match(
    String((await readYaml("openapi/components/governance.yaml")).ActivatedStateInstallationResponse.description),
    /only Current State/i,
  );
});

test("restore creates a new Draft and leaves the Current State unchanged", async () => {
  const [governance, restored] = await Promise.all([
    readYaml("openapi/components/governance.yaml"),
    readExample(120),
  ]);
  const request = governance.RestoreStateVersionRequest;
  const data = restored.value.data;

  assert.deepEqual(
    request.required,
    ["source_state_version_id", "expected_current_state_version_id", "confirmation_token"],
  );
  assert.equal(data.state_draft.base_version_id, data.source_state_version_id);
  assert.equal(data.state_draft.status, "editing");
  assert.equal(data.current_state_version_id, "stv_example_current_018");
  assert.equal(Object.hasOwn(data, "state_version"), false);
  assert.doesNotMatch(JSON.stringify(restored.value), /activate|is_current|overwrite|replace_history/i);
});

test("Use this Result requires a destination selected by the user", async () => {
  const [components, saved] = await Promise.all([
    readYaml("openapi/components/tests.yaml"),
    readExample(106),
  ]);
  const request = components.CreateWorkspaceItemFromArtifactRequest;

  assert.deepEqual(request.required, ["destination", "name"]);
  assert.deepEqual(request.properties.destination.required, ["workspace_id", "parent_item_id"]);
  assert.equal(typeof saved.value.data.workspace_id, "string");
  assert.equal(typeof saved.value.data.parent_item_id, "string");
});

test("State versions use version-bound Skill mounts and uninstall has no undeclared revision precondition", async () => {
  const [governance, paths] = await Promise.all([
    readYaml("openapi/components/governance.yaml"),
    readYaml("openapi/paths/market-installations.yaml"),
  ]);
  const uninstall = paths["/state-installations/{installation_id}"].delete;

  assert.equal(
    governance.StateVersion.properties.skill_mounts.items.$ref,
    "#/StateVersionSkillMount",
  );
  assert.equal(
    uninstall.parameters.some((parameter) => parameter.$ref?.endsWith("#/IfMatch")),
    false,
  );
});

test("upload contracts exclude private storage keys and cover security failures", async () => {
  const [governance, paths, created] = await Promise.all([
    readYaml("openapi/components/governance.yaml"),
    readYaml("openapi/paths/uploads-sources-runtime.yaml"),
    readExample(123),
  ]);
  const upload = paths["/uploads"].post;
  const completed = paths["/uploads/{upload_id}/complete"].post;
  const requiredErrors = [
    "UPLOAD_TOO_LARGE",
    "UPLOAD_UNSUPPORTED_TYPE",
    "UPLOAD_EXPIRED",
    "UPLOAD_INCOMPLETE",
    "UPLOAD_CHECKSUM_MISMATCH",
    "MALWARE_DETECTED",
  ];

  assert.equal(Object.hasOwn(governance.UploadSession.properties, "storage_key"), false);
  for (const error of requiredErrors) {
    assert.ok(upload["x-error-codes"].includes(error));
    assert.ok(completed["x-error-codes"].includes(error));
  }
  assert.equal(new URL(created.value.data.upload_url).hostname.endsWith(".invalid"), true);
  assert.doesNotMatch(JSON.stringify(created.value), /storage_key|authorization|access_token/i);
});

test("generic operation and runtime streams support cursor recovery", async () => {
  const paths = await readYaml("openapi/paths/uploads-sources-runtime.yaml");
  const operation = paths["/operations/{operation_id}/events"].get;
  const runtime = paths["/runtime/events"].get;

  for (const stream of [operation, runtime]) {
    assert.ok(stream.parameters.some((parameter) => parameter.$ref?.endsWith("#/AfterSequence")));
    assert.equal(stream.responses["409"].$ref, "../components/responses.yaml#/EventCursorExpired");
  }
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
