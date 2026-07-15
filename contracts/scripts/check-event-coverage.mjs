import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  contractsRoot,
  invariant,
  parseArgs,
  readCsv,
  runMain,
  splitMultiValue,
} from "./lib/registry.mjs";

const columns = [
  "event_type",
  "schema_version",
  "family",
  "payload_schema",
  "resource_types",
  "terminal",
  "sensitivity",
  "source_document",
];
const families = new Set(["operation", "task", "test", "validation", "import", "export", "reply", "monitor", "runtime"]);
const sensitivities = new Set(["public", "internal", "sensitive"]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  invariant(!options.from && !options.through && !options.reportMissing, "Event registry only accepts --family and --registry-only");

  const { headers, rows } = await readCsv(join(contractsRoot, "registry/event-types.csv"));
  invariant(JSON.stringify(headers) === JSON.stringify(columns), "Event registry headers do not match the fixed contract");
  invariant(rows.length === 56, `Event registry must contain 56 rows; found ${rows.length}`);
  const names = new Set();

  for (const row of rows) {
    invariant(/^[a-z]+\.[a-z][a-z0-9_]*$/.test(row.event_type), `Invalid event type: ${row.event_type}`);
    invariant(!names.has(row.event_type), `Duplicate event type: ${row.event_type}`);
    names.add(row.event_type);
    invariant(row.schema_version === "1", `${row.event_type} must use schema_version 1`);
    invariant(families.has(row.family), `${row.event_type} has invalid family ${row.family}`);
    invariant(
      row.event_type.startsWith(`${row.family}.`) ||
        (row.event_type === "artifact.created" && row.family === "operation"),
      `${row.event_type} does not match family ${row.family}`,
    );
    invariant(row.payload_schema.startsWith("events/") && row.payload_schema.endsWith(".schema.json"), `${row.event_type} has invalid payload_schema`);
    invariant(splitMultiValue(row.resource_types).length > 0, `${row.event_type} needs resource_types`);
    invariant(["true", "false"].includes(row.terminal), `${row.event_type} has invalid terminal flag`);
    invariant(sensitivities.has(row.sensitivity), `${row.event_type} has invalid sensitivity`);
    invariant(row.source_document === "07-realtime-and-async-events.md", `${row.event_type} has an unexpected source document`);
  }

  const selected = options.family ? rows.filter((row) => row.family === options.family) : rows;
  if (options.family) {
    invariant(families.has(options.family), `Unknown event family: ${options.family}`);
    invariant(selected.length > 0, `No events found for family ${options.family}`);
  }

  if (!options.registryOnly) {
    for (const row of selected) {
      try {
        await access(join(contractsRoot, row.payload_schema));
      } catch {
        throw new Error(`${row.event_type} references missing ${row.payload_schema}`);
      }
    }
  }

  console.log(`Event registry OK count=${rows.length} selected=${selected.length}`);
}

runMain(main);
