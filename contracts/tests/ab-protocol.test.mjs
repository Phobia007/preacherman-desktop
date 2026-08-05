import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildManifest,
  createProtocolValidator,
  fixtureSpecs,
  protocolRoot,
  readJson,
  serializeManifest,
  validateFixture,
  validateTaskEventStream
} from "../scripts/ab-protocol-lib.mjs";

test("A/B protocol manifest locks every schema and fixture", async () => {
  const actual = await readFile(path.join(protocolRoot, "manifest.json"), "utf8");
  assert.equal(actual, serializeManifest(await buildManifest()));
});

test("A/B protocol accepts every valid fixture and rejects every invalid fixture", async () => {
  const validator = await createProtocolValidator();

  for (const spec of fixtureSpecs) {
    const result = await validateFixture(spec, validator);
    assert.equal(
      result.valid,
      spec.valid,
      `${spec.path}: ${result.errors.join("; ")}`
    );
  }
});

test("task event semantics reject events after a terminal event", async () => {
  const validator = await createProtocolValidator();
  const events = await readJson("fixtures/valid/task-event-stream.json");
  const extraEvent = {
    ...events[2],
    event_id: "event:after-terminal",
    sequence: 8
  };

  const result = validateTaskEventStream(
    [...events, extraEvent],
    (event) => validator.validate("task-event", event)
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /not allowed while task is completed/);
});

test("task envelope keeps the user's wording and links PRSP without embedding it", async () => {
  const envelope = await readJson("fixtures/valid/task-envelope.json");

  assert.equal(envelope.raw_user_input.text, "帮我先整理合同草稿，发出去之前必须让我确认。");
  assert.equal(envelope.prsp_contract_ref.kind, "prsp_contract");
  assert.equal(Object.hasOwn(envelope, "persona"), false);
  assert.equal(Object.hasOwn(envelope, "provider_payload"), false);
});
