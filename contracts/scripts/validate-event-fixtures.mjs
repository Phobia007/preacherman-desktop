import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { contractsRoot, readCsv } from "./lib/registry.mjs";

const schemaBase = "https://schemas.preacherman.ai/events";
const { rows: registryRows } = await readCsv(join(contractsRoot, "registry/event-types.csv"));
const terminalTypes = new Set(registryRows.filter((row) => row.terminal === "true").map((row) => row.event_type));

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const envelope = await loadJson(join(contractsRoot, "events/event-envelope.schema.json"));
  ajv.addSchema(envelope);
  for (const row of registryRows) {
    ajv.addSchema(await loadJson(join(contractsRoot, row.payload_schema)));
  }
  const union = await loadJson(join(contractsRoot, "events/event.schema.json"));
  ajv.addSchema(union);
  return ajv.getSchema(`${schemaBase}/event.schema.json`);
}

let validatorPromise;
async function getValidator() {
  validatorPromise ??= createValidator();
  return validatorPromise;
}

function formatErrors(errors = []) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`);
}

export async function validateEvent(value) {
  const validate = await getValidator();
  const valid = validate(value);
  return { valid, errors: valid ? [] : formatErrors(validate.errors) };
}

export async function validateEventStream(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { valid: false, errors: ["event stream must contain at least one event"] };
  }

  const errors = [];
  let previousSequence = 0;
  let previousProgress = null;
  let terminalCount = 0;
  const streamId = events[0]?.stream_id;

  for (const [index, event] of events.entries()) {
    const result = await validateEvent(event);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => `event[${index}] ${error}`));
      continue;
    }
    if (event.stream_id !== streamId) {
      errors.push(`event[${index}] stream_id must remain ${streamId}`);
    }
    if (event.sequence <= previousSequence) {
      errors.push(`event[${index}] sequence must be strictly increasing`);
    }
    previousSequence = event.sequence;
    if (typeof event.progress === "number" && previousProgress !== null && event.progress < previousProgress) {
      errors.push(`event[${index}] progress must not decrease`);
    }
    if (typeof event.progress === "number") {
      previousProgress = event.progress;
    }
    if (terminalTypes.has(event.event_type)) {
      terminalCount += 1;
      if (terminalCount > 1) {
        errors.push("event stream must contain at most one terminal event");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function validateFixtureFile(path) {
  const value = await loadJson(path);
  return Array.isArray(value) ? validateEventStream(value) : validateEvent(value);
}

async function main() {
  let validCount = 0;
  let rejectedInvalidCount = 0;
  for (const row of registryRows) {
    const fixtureName = `${row.event_type.replaceAll(".", "-")}.json`;
    const path = join(contractsRoot, "examples/events", row.family, fixtureName);
    const result = await validateFixtureFile(path);
    if (!result.valid) {
      throw new Error(`${row.event_type} fixture invalid: ${result.errors.join("; ")}`);
    }
    validCount += 1;
  }

  for (const family of new Set(registryRows.map((row) => row.family))) {
    const result = await validateFixtureFile(join(contractsRoot, "examples/events/invalid", `${family}-invalid.json`));
    if (result.valid) {
      throw new Error(`${family} invalid fixture was accepted`);
    }
    rejectedInvalidCount += 1;
  }

  console.log(`Event fixtures OK valid=${validCount} rejected_invalid=${rejectedInvalidCount}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
