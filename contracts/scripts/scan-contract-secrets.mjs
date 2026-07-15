import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { contractsRoot, invariant, runMain } from "./lib/registry.mjs";

const forbiddenPatterns = [
  [/authorization["']?\s*:\s*["']?bearer\s+(?!<|example)/i, "Bearer credential"],
  [/["'](?:access_token|refresh_token|password|password_hash|api_key|storage_key|share_token)["']\s*:/i, "secret-bearing field"],
  [/(?:x-amz-signature|x-goog-signature|sig=)[^&\s"']+/i, "signed URL"],
  [/[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}/i, "non-example email"],
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (/\.(json|ya?ml|csv)$/i.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  const files = await listFiles(join(contractsRoot, "examples"));
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const [pattern, label] of forbiddenPatterns) {
      invariant(!pattern.test(contents), `${file} contains a possible ${label}`);
    }
  }
  console.log(`Contract example secret scan OK files=${files.length}`);
}

runMain(main);
