import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const contractsRoot = fileURLToPath(new URL("../../", import.meta.url));
export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function parseArgs(argv) {
  const options = {
    registryOnly: false,
    reportMissing: false,
    from: undefined,
    through: undefined,
    family: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--registry-only") {
      options.registryOnly = true;
    } else if (argument === "--report-missing") {
      options.reportMissing = true;
    } else if (["--from", "--through", "--family"].includes(argument)) {
      const value = argv[index + 1];
      invariant(value && !value.startsWith("--"), `${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export function splitMultiValue(value) {
  return value ? value.split("|").filter(Boolean) : [];
}

export function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }

  invariant(!quoted, "CSV ended inside a quoted field");
  const nonEmptyRecords = records.filter((record) => record.some((value) => value !== ""));
  invariant(nonEmptyRecords.length > 0, "CSV is empty");

  const [headers, ...dataRows] = nonEmptyRecords;
  invariant(new Set(headers).size === headers.length, "CSV has duplicate headers");

  return {
    headers,
    rows: dataRows.map((values, index) => {
      invariant(
        values.length === headers.length,
        `CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}`,
      );
      return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    }),
  };
}

export async function readCsv(path) {
  return parseCsv(await readFile(path, "utf8"));
}

export async function readYaml(path) {
  return YAML.parse(await readFile(path, "utf8"));
}

export function runMain(main) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
