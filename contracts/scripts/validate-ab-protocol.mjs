import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildManifest,
  createProtocolValidator,
  fixtureSpecs,
  protocolRoot,
  serializeManifest,
  validateFixture
} from "./ab-protocol-lib.mjs";

const failures = [];
const validator = await createProtocolValidator();

for (const spec of fixtureSpecs) {
  const result = await validateFixture(spec, validator);
  if (result.valid !== spec.valid) {
    failures.push(`${spec.path}: expected valid=${spec.valid}; ${result.errors.join("; ")}`);
  }
}

const expectedManifest = serializeManifest(await buildManifest());
const manifestPath = path.join(protocolRoot, "manifest.json");
let actualManifest;
try {
  actualManifest = await readFile(manifestPath, "utf8");
} catch (error) {
  failures.push(`manifest.json is missing: ${error.message}`);
}
if (actualManifest !== undefined && actualManifest !== expectedManifest) {
  failures.push("manifest.json is stale; run npm run generate:ab-manifest");
}

if (failures.length > 0) {
  console.error("A/B protocol contract check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`A/B protocol v1 contract check passed (${fixtureSpecs.length} fixtures).`);
}
