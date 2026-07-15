import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { contractsRoot } from "./lib/registry.mjs";
import { validateEvent } from "./validate-event-fixtures.mjs";

let openApiPromise;
async function getOpenApi() {
  openApiPromise ??= readFile(join(contractsRoot, "dist/openapi.bundle.yaml"), "utf8").then(YAML.parse);
  return openApiPromise;
}

function resolvePointer(document, ref) {
  if (!ref?.startsWith("#/")) {
    return null;
  }
  return ref.slice(2).split("/").reduce((value, segment) => value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}

function dereference(document, value) {
  return value?.$ref ? resolvePointer(document, value.$ref) : value;
}

function rewriteRefs(value) {
  if (Array.isArray(value)) {
    return value.map(rewriteRefs);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && child.startsWith("#/components/schemas/")) {
      output[key] = child.replace("#/components/schemas/", "#/$defs/");
    } else {
      output[key] = rewriteRefs(child);
    }
  }
  return output;
}

function findOperation(document, apiId) {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (operation?.["x-api-id"] === apiId) {
        return operation;
      }
    }
  }
  return null;
}

function formatErrors(errors = []) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`);
}

async function validateHttpFixture(fixture) {
  const document = await getOpenApi();
  const operation = findOperation(document, fixture.api_id);
  if (!operation) {
    return { valid: false, errors: [`unknown api_id ${fixture.api_id}`] };
  }
  const response = dereference(document, operation.responses?.[String(fixture.status)]);
  if (!response) {
    return { valid: false, errors: [`${fixture.api_id} does not declare response ${fixture.status}`] };
  }
  if (fixture.status === 204) {
    return { valid: fixture.body === null || fixture.body === undefined, errors: ["204 response body must be empty"] };
  }
  const schema = response.content?.["application/json"]?.schema;
  if (!schema) {
    return { valid: false, errors: [`${fixture.api_id} response ${fixture.status} has no JSON schema`] };
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    allOf: [rewriteRefs(schema)],
    $defs: rewriteRefs(document.components?.schemas ?? {}),
  });
  const valid = validate(fixture.body);
  return { valid, errors: valid ? [] : formatErrors(validate.errors) };
}

export async function validateProviderFixture(path) {
  const fixture = JSON.parse(await readFile(path, "utf8"));
  if (fixture.kind === "http") {
    return validateHttpFixture(fixture);
  }
  if (fixture.kind === "event") {
    return validateEvent(fixture.event);
  }
  return { valid: false, errors: ["provider fixture kind must be http or event"] };
}

async function listJsonFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(path));
    } else if (entry.name.endsWith(".json")) {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error("Usage: node scripts/validate-provider-fixtures.mjs <fixture-directory>");
  }
  const files = await listJsonFiles(directory);
  if (files.length === 0) {
    throw new Error(`No provider fixtures found in ${directory}`);
  }
  for (const file of files) {
    const result = await validateProviderFixture(file);
    if (!result.valid) {
      throw new Error(`${file} failed provider validation: ${result.errors.join("; ")}`);
    }
  }
  console.log(`Provider fixtures OK files=${files.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
