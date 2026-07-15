import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";
import { contractsRoot, invariant, runMain } from "./lib/registry.mjs";
import { createComponentSchemaDocument } from "./lib/openapi-examples.mjs";

async function main() {
  const common = YAML.parse(
    await readFile(join(contractsRoot, "openapi/components/common.yaml"), "utf8"),
  );
  const registry = YAML.parse(
    await readFile(join(contractsRoot, "registry/error-codes.yaml"), "utf8"),
  );
  const directory = join(contractsRoot, "examples/errors");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  invariant(files.length === 31, `Expected 31 error fixtures; found ${files.length}`);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(
    createComponentSchemaDocument(common, "ErrorResponse"),
  );
  const observedCodes = new Set();

  for (const file of files) {
    const fixture = JSON.parse(await readFile(join(directory, file), "utf8"));
    invariant(validate(fixture), `${file}: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    invariant(registry[fixture.error.code], `${file} uses unknown code ${fixture.error.code}`);
    invariant(!observedCodes.has(fixture.error.code), `Duplicate fixture for ${fixture.error.code}`);
    observedCodes.add(fixture.error.code);
  }

  invariant(observedCodes.size === Object.keys(registry).length, "Error fixture coverage is incomplete");

  const httpRanges = [
    { directory: "api-001-038", from: 1, through: 38 },
    { directory: "api-039-069", from: 39, through: 69 },
    { directory: "api-070-096", from: 70, through: 96 },
    { directory: "api-097-128", from: 97, through: 128 },
  ];
  let httpCount = 0;
  for (const range of httpRanges) {
    const httpDirectory = join(contractsRoot, "examples/http", range.directory);
    const httpFiles = (await readdir(httpDirectory)).filter((file) => file.endsWith(".json")).sort();
    const expectedHttpFiles = Array.from(
      { length: range.through - range.from + 1 },
      (_, index) => `api-${String(index + range.from).padStart(3, "0")}-success.json`,
    );
    invariant(
      JSON.stringify(httpFiles) === JSON.stringify(expectedHttpFiles),
      `API-${String(range.from).padStart(3, "0")} through API-${String(range.through).padStart(3, "0")} example files are incomplete`,
    );
    for (const file of httpFiles) {
      const example = JSON.parse(await readFile(join(httpDirectory, file), "utf8"));
      invariant(typeof example.summary === "string", `${file} is missing summary`);
      invariant(Object.hasOwn(example, "value"), `${file} is missing value`);
    }
    httpCount += httpFiles.length;
  }

  console.log(`OpenAPI examples OK errors=${files.length} http=${httpCount}`);
}

runMain(main);
