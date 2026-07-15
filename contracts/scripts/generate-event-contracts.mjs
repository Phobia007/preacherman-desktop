import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_DEFINITIONS } from "./lib/event-definitions.mjs";
import { contractsRoot, invariant, readCsv, splitMultiValue } from "./lib/registry.mjs";

const schemaBase = "https://schemas.preacherman.ai/events";
const registryPath = join(contractsRoot, "registry/event-types.csv");

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value));
}

function envelopeSchema(eventTypes) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${schemaBase}/event-envelope.schema.json`,
    title: "Preacherman Event Envelope",
    type: "object",
    required: [
      "event_id",
      "stream_id",
      "sequence",
      "event_type",
      "schema_version",
      "resource_type",
      "resource_id",
      "payload",
      "occurred_at",
    ],
    properties: {
      event_id: { type: "string", minLength: 1 },
      stream_id: { type: "string", minLength: 1 },
      sequence: { type: "integer", minimum: 1 },
      event_type: { enum: eventTypes },
      schema_version: { const: 1 },
      resource_type: { type: "string", minLength: 1 },
      resource_id: { type: "string", minLength: 1 },
      operation_id: { type: ["string", "null"] },
      correlation_id: { type: ["string", "null"] },
      operation_status: { enum: ["queued", "running", "succeeded", "failed", "cancelled", "timed_out", null] },
      domain_status: { type: ["string", "null"] },
      stage: { type: ["string", "null"] },
      progress: {
        anyOf: [
          { type: "number", minimum: 0, maximum: 1 },
          { type: "null" },
        ],
      },
      payload: { type: "object" },
      occurred_at: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  };
}

function variantSchema(row, definition) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${schemaBase}/${row.payload_schema.replace(/^events\//, "")}`,
    title: row.event_type,
    allOf: [
      { $ref: `${schemaBase}/event-envelope.schema.json` },
      {
        type: "object",
        properties: {
          event_type: { const: row.event_type },
          schema_version: { const: Number(row.schema_version) },
          resource_type: { enum: splitMultiValue(row.resource_types) },
          payload: definition.payloadSchema,
        },
        required: ["event_type", "schema_version", "resource_type", "payload"],
      },
    ],
  };
}

function operationDefaults(row, definition) {
  const isContinuous = row.family === "monitor" || row.family === "runtime";
  const firstResourceType = splitMultiValue(row.resource_types)[0];
  const resourceId = `${firstResourceType}_01`;
  return {
    event_id: `evt_${row.event_type.replaceAll(".", "_")}_01`,
    stream_id: `${firstResourceType}:${resourceId}`,
    sequence: 1,
    event_type: row.event_type,
    schema_version: Number(row.schema_version),
    resource_type: firstResourceType,
    resource_id: resourceId,
    operation_id: isContinuous ? null : (firstResourceType === "conversation" ? "response_run_01" : resourceId),
    correlation_id: "correlation_01",
    operation_status: isContinuous ? null : "running",
    domain_status: isContinuous ? "live" : "running",
    stage: isContinuous ? null : row.family,
    progress: isContinuous ? null : 0.5,
    payload: definition.sample,
    occurred_at: "2026-07-15T10:21:32Z",
    ...definition.envelope,
  };
}

function invalidFixture(validFixture, definition) {
  const copy = structuredClone(validFixture);
  const required = definition.payloadSchema.required ?? [];
  if (required.length > 0) {
    delete copy.payload[required[0]];
  } else {
    copy.payload.unexpected = true;
  }
  return copy;
}

export async function generateEventContracts() {
  const { rows } = await readCsv(registryPath);
  const registryTypes = rows.map((row) => row.event_type);
  invariant(Object.keys(EVENT_DEFINITIONS).length === rows.length, "event definition count must match registry");
  invariant(registryTypes.every((eventType) => EVENT_DEFINITIONS[eventType]), "every registry event needs a definition");

  await writeJson(join(contractsRoot, "events/event-envelope.schema.json"), envelopeSchema(registryTypes));
  await writeJson(join(contractsRoot, "events/event.schema.json"), {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${schemaBase}/event.schema.json`,
    title: "Preacherman Event",
    oneOf: rows.map((row) => ({ $ref: `${schemaBase}/${row.payload_schema.replace(/^events\//, "")}` })),
  });

  const firstByFamily = new Map();
  for (const row of rows) {
    const definition = EVENT_DEFINITIONS[row.event_type];
    const schema = variantSchema(row, definition);
    const fixture = operationDefaults(row, definition);
    const fixtureName = `${row.event_type.replaceAll(".", "-")}.json`;
    await writeJson(join(contractsRoot, row.payload_schema), schema);
    await writeJson(join(contractsRoot, "examples/events", row.family, fixtureName), fixture);
    if (!firstByFamily.has(row.family)) {
      firstByFamily.set(row.family, { row, definition, fixture });
    }
  }

  for (const [family, { definition, fixture }] of firstByFamily) {
    await writeJson(join(contractsRoot, "examples/events/invalid", `${family}-invalid.json`), invalidFixture(fixture, definition));
  }

  return { schemaCount: rows.length, fixtureCount: rows.length, invalidFixtureCount: firstByFamily.size };
}

async function main() {
  const result = await generateEventContracts();
  console.log(`Generated event contracts schemas=${result.schemaCount} fixtures=${result.fixtureCount} invalid=${result.invalidFixtureCount}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
