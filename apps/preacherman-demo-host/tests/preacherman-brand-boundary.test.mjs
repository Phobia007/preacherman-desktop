import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
const legacyNames = [
  [97, 105, 114, 105].map((code) => String.fromCharCode(code)).join(""),
  [104, 111, 109, 101, 114, 97, 105, 108].map((code) => String.fromCharCode(code)).join(""),
];
const textExtensions = new Set([".css", ".html", ".json", ".md", ".mjs", ".ps1", ".rs", ".toml", ".ts", ".tsx", ".yaml", ".yml"]);

async function collect(directory, entries = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".playwright-cli", ".runtime-tmp", "dist", "node_modules", "target"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    entries.push(path);
    if (entry.isDirectory()) await collect(path, entries);
  }
  return entries;
}

test("repository paths and product text contain only the Preacherman brand", async () => {
  const entries = await collect(repositoryRoot);
  const offenders = [];
  for (const path of entries) {
    const lowerPath = path.toLowerCase();
    if (legacyNames.some((name) => lowerPath.includes(name))) offenders.push(path);
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const text = (await readFile(path, "utf8")).toLowerCase();
    if (legacyNames.some((name) => new RegExp(`(?:^|[^a-z])${name}(?:$|[^a-z])`, "i").test(text))) offenders.push(path);
  }
  assert.deepEqual([...new Set(offenders)], []);
});
