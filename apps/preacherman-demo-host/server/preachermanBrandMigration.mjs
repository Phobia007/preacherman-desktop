import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const LEGACY_A = [97, 105, 114, 105].map((code) => String.fromCharCode(code)).join("");
const LEGACY_B = [104, 111, 109, 101, 114, 97, 105, 108].map((code) => String.fromCharCode(code)).join("");
const replacements = [
  [LEGACY_B.toUpperCase(), "PREACHERMAN_EXECUTION"],
  [`${LEGACY_B[0].toUpperCase()}${LEGACY_B.slice(1)}`, "Preacherman Execution"],
  [LEGACY_B, "preacherman-execution"],
  [LEGACY_A.toUpperCase(), "PREACHERMAN"],
  [`${LEGACY_A[0].toUpperCase()}${LEGACY_A.slice(1)}`, "Preacherman"],
  [LEGACY_A, "preacherman"],
];

function legacyName(prefix, suffix) {
  return `${prefix}${suffix}`;
}

export function rewriteLegacyBrandText(value) {
  let result = String(value);
  for (const [from, to] of replacements) result = result.replaceAll(from, to);
  result = result.replace(new RegExp(LEGACY_B, "gi"), "Preacherman Execution");
  result = result.replace(new RegExp(LEGACY_A, "gi"), "Preacherman");
  return result.replaceAll("preacherman.moeru.ai", "preacherman.local");
}

async function migrateJsonFile(source, target) {
  try {
    const text = await readFile(target, "utf8");
    const rewritten = rewriteLegacyBrandText(text);
    if (rewritten !== text) await writeFile(target, rewritten, { mode: 0o600 });
    if (source !== target) await rm(source, { force: true });
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    const text = await readFile(source, "utf8");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, rewriteLegacyBrandText(text), { mode: 0o600 });
    if (source !== target) await rm(source, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function migrateDirectory(source, target) {
  try {
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
    await rm(source, { recursive: true, force: true });
  } catch (error) {
    if (!["ENOENT", "ERR_FS_CP_EEXIST"].includes(error?.code)) throw error;
  }
}

export async function migratePreachermanBrandData(dataDirectory) {
  const files = [
    [legacyName(LEGACY_A, "-memory-persona.v1.json"), "preacherman-memory-persona.v1.json"],
    [legacyName(LEGACY_A, "-observability.v1.json"), "preacherman-observability.v1.json"],
    [legacyName(LEGACY_A, "-plugins.v1.json"), "preacherman-plugins.v1.json"],
    [legacyName(LEGACY_A, "-widgets.v1.json"), "preacherman-widgets.v1.json"],
    [legacyName(LEGACY_B, "-links.v1.json"), "preacherman-execution-links.v1.json"],
    ["task-store.v1.json", "task-store.v1.json"],
  ];
  for (const [source, target] of files) await migrateJsonFile(join(dataDirectory, source), join(dataDirectory, target));
  await migrateDirectory(join(dataDirectory, legacyName(LEGACY_B, "-artifacts")), join(dataDirectory, "preacherman-execution-artifacts"));
}
