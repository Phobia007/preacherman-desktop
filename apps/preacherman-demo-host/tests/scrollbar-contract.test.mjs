import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? htmlFiles(join(directory, entry.name))
    : entry.name.endsWith(".html") ? [join(directory, entry.name)] : []));
  return nested.flat();
}

test("host and every packaged frame load the same scrollbar policy", async () => {
  for (const path of [join(root, "index.html"), ...await htmlFiles(join(root, "public"))]) {
    assert.match(await readFile(path, "utf8"), /<link rel="stylesheet" href="\/ui-scrollbars\.css"\s*\/>/, path);
  }
});

for (const appearance of ["light", "dark"]) {
  test(`${appearance}: hidden scrollbar chrome preserves scrolling and component themes`, async () => {
    const css = await readFile(join(root, "public/ui-scrollbars.css"), "utf8");
    assert.match(css, /scrollbar-width:\s*none\s*!important/);
    assert.match(css, /\*::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/);
    assert.doesNotMatch(css, /(?:overflow|touch-action|pointer-events|color|background)\s*:/);
    assert.doesNotMatch(css, /data-appearance/);
  });
}
