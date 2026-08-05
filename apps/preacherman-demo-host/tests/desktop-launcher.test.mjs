import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("desktop launcher opens the complete Edge path when only one candidate exists", async () => {
  const launcher = await readFile(
    join(packageRoot, "scripts", "launch-desktop-demo.ps1"),
    "utf8",
  );

  assert.match(launcher, /Select-Object -First 1/);
  assert.match(launcher, /Start-Process -FilePath \$edgePath/);
  assert.doesNotMatch(launcher, /\$edgeCandidates\[0\]/);
});
