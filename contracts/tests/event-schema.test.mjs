import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { contractsRoot, readCsv } from "../scripts/lib/registry.mjs";

const eventRoot = join(contractsRoot, "events");
const examplesRoot = join(contractsRoot, "examples/events");
const validatorPath = join(contractsRoot, "scripts/validate-event-fixtures.mjs");
const families = ["operation", "task", "test", "validation", "import", "export", "reply", "monitor", "runtime"];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadValidator() {
  assert.equal(await exists(validatorPath), true, "event fixture validator must exist");
  return import("../scripts/validate-event-fixtures.mjs");
}

test("all 56 registered event variants have schemas and valid fixtures", async () => {
  const { rows } = await readCsv(join(contractsRoot, "registry/event-types.csv"));
  const missingSchemas = [];
  const missingFixtures = [];

  for (const row of rows) {
    if (!(await exists(join(contractsRoot, row.payload_schema)))) {
      missingSchemas.push(row.event_type);
    }
    const fixtureName = `${row.event_type.replaceAll(".", "-")}.json`;
    if (!(await exists(join(examplesRoot, row.family, fixtureName)))) {
      missingFixtures.push(row.event_type);
    }
  }

  assert.equal(rows.length, 56);
  assert.deepEqual(missingSchemas, [], `missing event schemas: ${missingSchemas.join(", ")}`);
  assert.deepEqual(missingFixtures, [], `missing event fixtures: ${missingFixtures.join(", ")}`);
  assert.equal(await exists(join(eventRoot, "event-envelope.schema.json")), true);
  assert.equal(await exists(join(eventRoot, "event.schema.json")), true);
});

test("the event union accepts every valid fixture", async () => {
  const { validateFixtureFile } = await loadValidator();
  const { rows } = await readCsv(join(contractsRoot, "registry/event-types.csv"));

  for (const row of rows) {
    const fixtureName = `${row.event_type.replaceAll(".", "-")}.json`;
    const result = await validateFixtureFile(join(examplesRoot, row.family, fixtureName));
    assert.equal(result.valid, true, `${row.event_type}: ${result.errors?.join("; ")}`);
  }
});

test("invalid fixtures cover every family and are rejected", async () => {
  const { validateFixtureFile } = await loadValidator();

  for (const family of families) {
    const path = join(examplesRoot, "invalid", `${family}-invalid.json`);
    assert.equal(await exists(path), true, `${family} invalid fixture must exist`);
    const result = await validateFixtureFile(path);
    assert.equal(result.valid, false, `${family} invalid fixture must be rejected`);
  }
});

test("envelope validation rejects out-of-range progress and unknown event types", async () => {
  const { validateEvent } = await loadValidator();
  const fixture = JSON.parse(await readFile(join(examplesRoot, "operation/operation-progress.json"), "utf8"));

  assert.equal((await validateEvent({ ...fixture, progress: 1.01 })).valid, false);
  assert.equal((await validateEvent({ ...fixture, event_type: "operation.unknown" })).valid, false);
  const { event_type: _eventType, ...withoutEventType } = fixture;
  assert.equal((await validateEvent(withoutEventType)).valid, false);
});

test("stream validation rejects duplicate terminal events", async () => {
  const { validateEventStream } = await loadValidator();
  const succeeded = JSON.parse(await readFile(join(examplesRoot, "operation/operation-succeeded.json"), "utf8"));
  const duplicateTerminal = {
    ...succeeded,
    event_id: "evt_duplicate_terminal",
    sequence: succeeded.sequence + 1,
  };

  const result = await validateEventStream([succeeded, duplicateTerminal]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /terminal/i);
});
