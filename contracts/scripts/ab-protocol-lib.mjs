import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const contractsRoot = path.resolve(scriptDirectory, "..");
export const protocolRoot = path.join(contractsRoot, "ab-protocol", "v1");

const schemaIds = {
  "capability-manifest": "https://schemas.preacherman.ai/ab/v1/capability-manifest.schema.json",
  "control-command": "https://schemas.preacherman.ai/ab/v1/control-command.schema.json",
  "coordination-error": "https://schemas.preacherman.ai/ab/v1/coordination-error.schema.json",
  "task-envelope": "https://schemas.preacherman.ai/ab/v1/task-envelope.schema.json",
  "task-event": "https://schemas.preacherman.ai/ab/v1/task-event.schema.json",
  "task-result": "https://schemas.preacherman.ai/ab/v1/task-result.schema.json"
};

export const fixtureSpecs = [
  { path: "fixtures/valid/capability-manifest.json", schema: "capability-manifest", valid: true },
  { path: "fixtures/valid/control-command.json", schema: "control-command", valid: true },
  { path: "fixtures/valid/coordination-error.json", schema: "coordination-error", valid: true },
  { path: "fixtures/valid/task-envelope.json", schema: "task-envelope", valid: true },
  { path: "fixtures/valid/task-event-stream.json", schema: "task-event-stream", valid: true },
  { path: "fixtures/valid/task-result.json", schema: "task-result", valid: true },
  { path: "fixtures/invalid/capability-manifest-unknown-feature.json", schema: "capability-manifest", valid: false },
  { path: "fixtures/invalid/control-command-missing-approval-id.json", schema: "control-command", valid: false },
  { path: "fixtures/invalid/coordination-error-unknown-code.json", schema: "coordination-error", valid: false },
  { path: "fixtures/invalid/task-envelope-provider-payload.json", schema: "task-envelope", valid: false },
  { path: "fixtures/invalid/task-event-stream-progress-regression.json", schema: "task-event-stream", valid: false },
  { path: "fixtures/invalid/task-result-provider-response.json", schema: "task-result", valid: false }
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

export async function readJson(relativePath) {
  const source = await readFile(path.join(protocolRoot, relativePath), "utf8");
  return JSON.parse(source);
}

export async function createProtocolValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const schemaDirectory = path.join(protocolRoot, "schemas");
  const schemaFiles = (await listFiles(schemaDirectory)).filter((file) => file.endsWith(".json"));
  for (const schemaFile of schemaFiles) {
    ajv.addSchema(JSON.parse(await readFile(schemaFile, "utf8")));
  }

  return {
    validate(schemaName, value) {
      const validate = ajv.getSchema(schemaIds[schemaName]);
      if (!validate) {
        throw new Error(`Unknown A/B protocol schema: ${schemaName}`);
      }

      const valid = validate(value);
      return {
        valid,
        errors: valid ? [] : (validate.errors ?? []).map((error) =>
          `${error.instancePath || "/"} ${error.message}`
        )
      };
    }
  };
}

const terminalStates = new Set(["cancelled", "completed", "failed"]);
const transitions = {
  submitted: {
    accepted: "accepted"
  },
  accepted: {
    cancelled: "cancelled",
    failed: "failed",
    started: "running"
  },
  running: {
    approval_required: "waiting_for_approval",
    cancelled: "cancelled",
    completed: "completed",
    failed: "failed",
    needs_input: "waiting_for_input",
    paused: "paused",
    progress: "running"
  },
  waiting_for_approval: {
    cancelled: "cancelled",
    failed: "failed",
    resumed: "running"
  },
  waiting_for_input: {
    cancelled: "cancelled",
    failed: "failed",
    resumed: "running"
  },
  paused: {
    cancelled: "cancelled",
    failed: "failed",
    resumed: "running"
  }
};

export function validateTaskEventStream(events, validateEvent, { requireTerminal = true } = {}) {
  const errors = [];
  if (!Array.isArray(events) || events.length === 0) {
    return { valid: false, errors: ["event stream must be a non-empty array"] };
  }

  let state = "submitted";
  let taskId;
  let previousSequence = 0;
  let previousProgress = 0;
  let terminalCount = 0;
  const eventIds = new Set();

  events.forEach((event, index) => {
    const result = validateEvent(event);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => `[${index}]${error}`));
      return;
    }

    taskId ??= event.task_id;
    if (event.task_id !== taskId) {
      errors.push(`[${index}] task_id changed inside one event stream`);
    }
    if (event.sequence <= previousSequence) {
      errors.push(`[${index}] sequence must increase strictly`);
    }
    previousSequence = event.sequence;

    if (eventIds.has(event.event_id)) {
      errors.push(`[${index}] event_id must be unique`);
    }
    eventIds.add(event.event_id);

    const nextState = transitions[state]?.[event.type];
    if (!nextState) {
      errors.push(`[${index}] event ${event.type} is not allowed while task is ${state}`);
      return;
    }
    state = nextState;

    if (event.type === "progress") {
      if (event.payload.progress < previousProgress) {
        errors.push(`[${index}] progress cannot move backwards`);
      }
      previousProgress = event.payload.progress;
    }

    if (terminalStates.has(state)) {
      terminalCount += 1;
    }
  });

  if (terminalCount > 1) {
    errors.push("event stream can contain only one terminal event");
  }
  if (requireTerminal && terminalCount !== 1) {
    errors.push("event stream must end with exactly one terminal event");
  }
  if (terminalCount === 1 && !terminalStates.has(state)) {
    errors.push("no event may follow a terminal event");
  }

  return { valid: errors.length === 0, errors };
}

export async function validateFixture(spec, validator) {
  const value = await readJson(spec.path);
  if (spec.schema === "task-event-stream") {
    return validateTaskEventStream(
      value,
      (event) => validator.validate("task-event", event)
    );
  }
  return validator.validate(spec.schema, value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function manifestEntries(relativeDirectory) {
  const directory = path.join(protocolRoot, relativeDirectory);
  const files = (await listFiles(directory)).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => {
    const contents = await readFile(file);
    return {
      path: path.relative(protocolRoot, file).replaceAll("\\", "/"),
      sha256: sha256(contents)
    };
  }));
}

export async function buildManifest() {
  const fixtures = await manifestEntries("fixtures");
  return {
    contract_id: "preacherman.ab-coordination.v1",
    abi_version: 1,
    status: "draft",
    schema_draft: "2020-12",
    schemas: await manifestEntries("schemas"),
    fixtures: {
      valid: fixtures.filter((entry) => entry.path.startsWith("fixtures/valid/")),
      invalid: fixtures.filter((entry) => entry.path.startsWith("fixtures/invalid/"))
    },
    boundaries: {
      executable_authorization: false,
      provider_payloads: false,
      runtime_execution: false
    }
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
