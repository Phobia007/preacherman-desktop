import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("Preacherman Execution fusion launcher owns the isolated preview ports and validates the served app", async () => {
  const launcher = await readFile(join(packageRoot, "scripts", "start-preacherman-execution-fusion-preview.ps1"), "utf8");

  assert.match(launcher, /\$uiPort = 1422/);
  assert.match(launcher, /\$servicePort = 8789/);
  assert.match(launcher, /PREACHERMAN_PREVIEW_ORIGINS/);
  assert.match(launcher, /VITE_PREACHERMAN_SERVICE_PORT/);
  assert.match(launcher, /\/api\/execution\/providers\/status/);
  assert.match(launcher, /PreachermanExecutionFusionPanel/);
  assert.match(launcher, /__surfaces\/test/);
});
