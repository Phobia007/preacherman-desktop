import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function loadModules() {
  const compatibilityPath = join(contractsRoot, "scripts/check-breaking-changes.mjs");
  const providerPath = join(contractsRoot, "scripts/validate-provider-fixtures.mjs");
  assert.equal(await exists(compatibilityPath), true, "compatibility checker must exist");
  assert.equal(await exists(providerPath), true, "provider fixture validator must exist");
  return Promise.all([
    import("../scripts/check-breaking-changes.mjs"),
    import("../scripts/validate-provider-fixtures.mjs"),
  ]);
}

function operation(required = []) {
  return {
    operationId: "createThing",
    responses: { "201": { description: "created" } },
    requestBody: {
      content: {
        "application/json": {
          schema: { type: "object", required, properties: { name: { type: "string" }, destination: { type: "string" } } },
        },
      },
    },
  };
}

test("compatibility checker detects removed operations and success statuses", async () => {
  const [{ compareOpenApiDocuments }] = await loadModules();
  const baseline = { paths: { "/things": { post: operation() } } };
  const removedOperation = { paths: {} };
  const removedStatus = { paths: { "/things": { post: { ...operation(), responses: { "202": { description: "accepted" } } } } } };

  assert.match(compareOpenApiDocuments(baseline, removedOperation).join(" "), /removed operation/i);
  assert.match(compareOpenApiDocuments(baseline, removedStatus).join(" "), /removed success response 201/i);
});

test("compatibility checker detects newly required request fields", async () => {
  const [{ compareOpenApiDocuments }] = await loadModules();
  const baseline = { paths: { "/things": { post: operation(["name"]) } } };
  const current = { paths: { "/things": { post: operation(["name", "destination"]) } } };
  assert.match(compareOpenApiDocuments(baseline, current).join(" "), /new required request field destination/i);
});

test("provider validator accepts contract examples and rejects malformed HTTP and event fixtures", async () => {
  const [, { validateProviderFixture }] = await loadModules();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "preacherman-provider-"));
  const loginExample = JSON.parse(await readFile(join(contractsRoot, "examples/http/api-001-038/api-002-success.json"), "utf8"));
  const loginBody = loginExample.value;
  const event = JSON.parse(await readFile(join(contractsRoot, "examples/events/operation/operation-progress.json"), "utf8"));

  const fixtures = {
    "valid-http.json": { kind: "http", api_id: "API-002", status: 200, body: loginBody },
    "invalid-http.json": { kind: "http", api_id: "API-002", status: 200, body: {} },
    "valid-event.json": { kind: "event", event },
    "invalid-event.json": { kind: "event", event: { ...event, progress: 2 } },
  };

  for (const [file, value] of Object.entries(fixtures)) {
    await writeFile(join(temporaryRoot, file), `${JSON.stringify(value, null, 2)}\n`);
  }

  const validHttp = await validateProviderFixture(join(temporaryRoot, "valid-http.json"));
  assert.equal(validHttp.valid, true, validHttp.errors.join("; "));
  assert.equal((await validateProviderFixture(join(temporaryRoot, "invalid-http.json"))).valid, false);
  assert.equal((await validateProviderFixture(join(temporaryRoot, "valid-event.json"))).valid, true);
  assert.equal((await validateProviderFixture(join(temporaryRoot, "invalid-event.json"))).valid, false);
});
