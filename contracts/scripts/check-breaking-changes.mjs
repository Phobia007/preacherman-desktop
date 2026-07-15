import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const methods = ["get", "post", "put", "patch", "delete"];

function resolvePointer(document, ref) {
  if (!ref?.startsWith("#/")) {
    return null;
  }
  return ref.slice(2).split("/").reduce((value, segment) => value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}

function resolveSchema(document, schema) {
  return schema?.$ref ? resolveSchema(document, resolvePointer(document, schema.$ref)) : schema;
}

function requestSchema(document, operation) {
  const requestBody = operation?.requestBody?.$ref
    ? resolvePointer(document, operation.requestBody.$ref)
    : operation?.requestBody;
  return resolveSchema(document, requestBody?.content?.["application/json"]?.schema);
}

function successStatuses(operation) {
  return new Set(Object.keys(operation?.responses ?? {}).filter((status) => /^2\d\d$/.test(status)));
}

export function compareOpenApiDocuments(baseline, current) {
  const changes = [];
  for (const [path, baselinePath] of Object.entries(baseline.paths ?? {})) {
    const currentPath = current.paths?.[path];
    for (const method of methods) {
      const baselineOperation = baselinePath?.[method];
      if (!baselineOperation) {
        continue;
      }
      const currentOperation = currentPath?.[method];
      const label = `${method.toUpperCase()} ${path}`;
      if (!currentOperation) {
        changes.push(`Removed operation ${label}`);
        continue;
      }

      const currentSuccess = successStatuses(currentOperation);
      for (const status of successStatuses(baselineOperation)) {
        if (!currentSuccess.has(status)) {
          changes.push(`Removed success response ${status} from ${label}`);
        }
      }

      const baselineRequired = new Set(requestSchema(baseline, baselineOperation)?.required ?? []);
      const currentRequired = new Set(requestSchema(current, currentOperation)?.required ?? []);
      for (const field of currentRequired) {
        if (!baselineRequired.has(field)) {
          changes.push(`New required request field ${field} on ${label}`);
        }
      }
    }
  }
  return changes;
}

async function loadDocument(path) {
  const source = await readFile(path, "utf8");
  return extname(path) === ".json" ? JSON.parse(source) : YAML.parse(source);
}

async function main() {
  const [baselinePath, currentPath] = process.argv.slice(2);
  if (!baselinePath || !currentPath) {
    throw new Error("Usage: node scripts/check-breaking-changes.mjs <baseline.yaml> <current.yaml>");
  }
  const changes = compareOpenApiDocuments(await loadDocument(baselinePath), await loadDocument(currentPath));
  if (changes.length > 0) {
    throw new Error(`Breaking contract changes detected:\n- ${changes.join("\n- ")}`);
  }
  console.log("OpenAPI compatibility OK: no supported operation, success response, or request requirement was removed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
