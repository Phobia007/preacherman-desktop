import { join } from "node:path";
import {
  contractsRoot,
  invariant,
  parseArgs,
  readYaml,
  runMain,
} from "./lib/registry.mjs";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  invariant(!options.from && !options.through && !options.family, "Error registry does not accept range or family filters");

  const registry = await readYaml(join(contractsRoot, "registry/error-codes.yaml"));
  invariant(registry && typeof registry === "object" && !Array.isArray(registry), "Error registry must be an object");
  const entries = Object.entries(registry);
  invariant(entries.length === 31, `Error registry must contain 31 codes; found ${entries.length}`);

  for (const [code, definition] of entries) {
    invariant(/^[A-Z][A-Z0-9_]+$/.test(code), `Invalid error code: ${code}`);
    invariant(Array.isArray(definition.http_status) && definition.http_status.length > 0, `${code} needs http_status`);
    definition.http_status.forEach((status) => invariant(Number.isInteger(status) && status >= 400 && status <= 599, `${code} has invalid HTTP status`));
    invariant(typeof definition.retryable_default === "boolean", `${code} needs retryable_default`);
    invariant(definition.details_schema === null || typeof definition.details_schema === "string", `${code} has invalid details_schema`);
    invariant(/^[a-z][a-z0-9_]*$/.test(definition.frontend_action), `${code} has invalid frontend_action`);
    invariant(typeof definition.sensitive_details === "boolean", `${code} needs sensitive_details`);
  }

  console.log(`Error registry OK count=${entries.length}`);
  if (!options.registryOnly) {
    console.log("OpenAPI error usage will be enforced as operations are added.");
  }
}

runMain(main);
