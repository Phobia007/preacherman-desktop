import { dirname, join, resolve } from "node:path";
import {
  contractsRoot,
  invariant,
  parseArgs,
  readCsv,
  readYaml,
  repositoryRoot,
  runMain,
  splitMultiValue,
} from "./lib/registry.mjs";

const columns = [
  "api_id",
  "method",
  "path",
  "operation_id",
  "tag",
  "interaction_ids",
  "permissions",
  "execution_mode",
  "idempotency",
  "audit_actions",
  "error_codes",
  "event_schema",
  "priority",
  "source_document",
];
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const httpMethods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

function apiNumber(apiId) {
  const match = /^API-(\d{3})$/.exec(apiId);
  invariant(match, `Invalid API ID: ${apiId}`);
  return Number(match[1]);
}

function chooseRows(rows, options) {
  const from = options.from ? apiNumber(options.from) : 1;
  const through = options.through ? apiNumber(options.through) : 128;
  invariant(from <= through, "--from must not be after --through");
  return rows.filter((row) => {
    const number = apiNumber(row.api_id);
    return number >= from && number <= through;
  });
}

async function validateRegistry() {
  const { headers, rows } = await readCsv(join(contractsRoot, "registry/api-operations.csv"));
  invariant(JSON.stringify(headers) === JSON.stringify(columns), "API registry headers do not match the fixed contract");
  invariant(rows.length === 128, `API registry must contain 128 rows; found ${rows.length}`);

  const interactionMatrix = await readCsv(
    join(repositoryRoot, "docs/backend-handoff/04-interaction-matrix.csv"),
  );
  const interactionIdColumn = interactionMatrix.headers[0];
  const knownInteractions = new Set(
    interactionMatrix.rows.map((row) => row[interactionIdColumn]),
  );
  const errorRegistry = await readYaml(join(contractsRoot, "registry/error-codes.yaml"));
  const knownErrors = new Set(Object.keys(errorRegistry));
  const routeKeys = new Set();
  const operationIds = new Set();

  rows.forEach((row, index) => {
    const expectedId = `API-${String(index + 1).padStart(3, "0")}`;
    invariant(row.api_id === expectedId, `Expected ${expectedId}; found ${row.api_id}`);
    invariant(methods.has(row.method), `${row.api_id} has invalid method ${row.method}`);
    invariant(row.path.startsWith("/") && !row.path.startsWith("/api/v1"), `${row.api_id} has invalid path ${row.path}`);
    invariant(/^[a-z][A-Za-z0-9]*$/.test(row.operation_id), `${row.api_id} has invalid operation_id`);
    invariant(row.tag, `${row.api_id} is missing tag`);
    invariant(row.permissions, `${row.api_id} is missing permissions`);
    invariant(["sync", "async", "sse"].includes(row.execution_mode), `${row.api_id} has invalid execution_mode`);
    invariant(["required", "supported", "none"].includes(row.idempotency), `${row.api_id} has invalid idempotency`);
    invariant(["P0", "P1", "P2"].includes(row.priority), `${row.api_id} has invalid priority`);
    invariant(row.source_document === "06-api-requirements.md", `${row.api_id} has an unexpected source document`);

    const routeKey = `${row.method} ${row.path}`;
    invariant(!routeKeys.has(routeKey), `Duplicate route: ${routeKey}`);
    routeKeys.add(routeKey);
    invariant(!operationIds.has(row.operation_id), `Duplicate operation_id: ${row.operation_id}`);
    operationIds.add(row.operation_id);

    const interactions = splitMultiValue(row.interaction_ids);
    invariant(interactions.length > 0, `${row.api_id} has no interaction IDs`);
    interactions.forEach((interactionId) => {
      invariant(/^INT-\d{3}$/.test(interactionId), `${row.api_id} has invalid interaction ${interactionId}`);
      invariant(knownInteractions.has(interactionId), `${row.api_id} references unknown ${interactionId}`);
    });

    splitMultiValue(row.error_codes).forEach((errorCode) => {
      invariant(knownErrors.has(errorCode), `${row.api_id} references unknown error ${errorCode}`);
    });
  });

  return rows;
}

function resolvePointer(document, fragment) {
  if (!fragment) {
    return document;
  }
  invariant(fragment.startsWith("/"), `Unsupported JSON pointer: #${fragment}`);
  return fragment
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, segment) => {
      invariant(value && Object.hasOwn(value, segment), `JSON pointer segment not found: ${segment}`);
      return value[segment];
    }, document);
}

async function resolveRef(reference, sourcePath) {
  const [relativePath, fragment = ""] = reference.split("#", 2);
  const targetPath = relativePath ? resolve(dirname(sourcePath), relativePath) : sourcePath;
  const targetDocument = await readYaml(targetPath);
  return resolvePointer(targetDocument, fragment);
}

async function collectOperations(document, sourcePath) {
  const operations = [];
  for (const [path, unresolvedPathItem] of Object.entries(document.paths ?? {})) {
    const pathItem = unresolvedPathItem?.$ref
      ? await resolveRef(unresolvedPathItem.$ref, sourcePath)
      : unresolvedPathItem;
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (httpMethods.has(method) && operation && typeof operation === "object") {
        operations.push({ method: method.toUpperCase(), path, ...operation });
      }
    }
  }
  return operations;
}

function compareArrayMetadata(operation, field, expected, mismatches, apiId) {
  const actual = operation[field];
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    mismatches.push(
      `${apiId}: expected ${field}=${JSON.stringify(expected)}; found ${JSON.stringify(actual)}`,
    );
  }
}

function validateOperationMetadata(operation, row, mismatches) {
  compareArrayMetadata(operation, "x-interaction-ids", splitMultiValue(row.interaction_ids), mismatches, row.api_id);
  compareArrayMetadata(operation, "x-permissions", splitMultiValue(row.permissions), mismatches, row.api_id);
  compareArrayMetadata(operation, "x-audit-actions", splitMultiValue(row.audit_actions), mismatches, row.api_id);
  compareArrayMetadata(operation, "x-error-codes", splitMultiValue(row.error_codes), mismatches, row.api_id);

  if (!Array.isArray(operation.tags) || !operation.tags.includes(row.tag)) {
    mismatches.push(`${row.api_id}: expected tag ${row.tag}`);
  }
  for (const [field, expected] of [
    ["x-execution-mode", row.execution_mode],
    ["x-idempotency", row.idempotency],
    ["x-event-schema", row.event_schema || null],
    ["x-priority", row.priority],
    ["x-source-document", row.source_document],
  ]) {
    if (operation[field] !== expected) {
      mismatches.push(`${row.api_id}: expected ${field}=${expected}; found ${operation[field]}`);
    }
  }
  if (typeof operation["x-owner"] !== "string" || !operation["x-owner"]) {
    mismatches.push(`${row.api_id}: missing x-owner`);
  }

  const responseEntries = Object.entries(operation.responses ?? {});
  const successResponses = responseEntries.filter(([status]) => /^2\d\d$/.test(status));
  const errorResponses = responseEntries.filter(([status]) => /^[45]\d\d$/.test(status));
  if (successResponses.length === 0) {
    mismatches.push(`${row.api_id}: missing success response`);
  }
  if (errorResponses.length === 0) {
    mismatches.push(`${row.api_id}: missing error response`);
  }
  if (!successResponses.some(([status, response]) => {
    if (status === "204") return true;
    return Object.values(response.content ?? {}).some(
      (mediaType) => mediaType.example !== undefined || mediaType.examples !== undefined,
    );
  })) {
    mismatches.push(`${row.api_id}: missing success example`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = await validateRegistry();
  if (options.registryOnly) {
    console.log(`API registry OK count=${rows.length}`);
    return;
  }

  const expectedRows = chooseRows(rows, options);
  const sourcePath = join(contractsRoot, "openapi/openapi.yaml");
  const operations = await collectOperations(await readYaml(sourcePath), sourcePath);
  const operationsById = new Map(operations.map((operation) => [operation["x-api-id"], operation]));
  const missing = [];
  const mismatches = [];

  for (const row of expectedRows) {
    const operation = operationsById.get(row.api_id);
    if (!operation) {
      missing.push(`${row.api_id} ${row.method} ${row.path}`);
      continue;
    }
    if (operation.method !== row.method || operation.path !== row.path) {
      mismatches.push(`${row.api_id}: expected ${row.method} ${row.path}; found ${operation.method} ${operation.path}`);
    }
    if (operation.operationId !== row.operation_id) {
      mismatches.push(`${row.api_id}: expected operationId ${row.operation_id}; found ${operation.operationId}`);
    }
    validateOperationMetadata(operation, row, mismatches);
  }

  if (missing.length) {
    console.log(`Missing OpenAPI operations (${missing.length}):`);
    missing.forEach((entry) => console.log(`- ${entry}`));
  }
  if (mismatches.length) {
    console.log(`OpenAPI mismatches (${mismatches.length}):`);
    mismatches.forEach((entry) => console.log(`- ${entry}`));
  }

  if ((missing.length || mismatches.length) && !options.reportMissing) {
    throw new Error(`OpenAPI coverage failed: missing=${missing.length} mismatches=${mismatches.length}`);
  }
  console.log(`API coverage expected=${expectedRows.length} present=${expectedRows.length - missing.length} missing=${missing.length}`);
}

runMain(main);
