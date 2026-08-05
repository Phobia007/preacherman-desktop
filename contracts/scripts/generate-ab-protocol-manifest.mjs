import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildManifest,
  protocolRoot,
  serializeManifest
} from "./ab-protocol-lib.mjs";

if (!process.argv.includes("--write")) {
  throw new Error("Refusing to update the manifest without --write");
}

const manifestPath = path.join(protocolRoot, "manifest.json");
await writeFile(manifestPath, serializeManifest(await buildManifest()), "utf8");
console.log(`Wrote ${manifestPath}`);
