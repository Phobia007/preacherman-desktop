import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1");

test("HomeRail profile setup keeps credentials on stdin and pins the fixed workflow", async () => {
  const [script, packageJson] = await Promise.all([
    readFile(join(packageRoot, "scripts", "configure-homerail-profile.ps1"), "utf8"),
    readFile(join(packageRoot, "package.json"), "utf8"),
  ]);

  assert.match(packageJson, /"configure:homerail"/);
  assert.match(script, /Read-Host 'Provider API key' -AsSecureString/);
  assert.match(script, /'--api-key-stdin'/);
  assert.match(script, /SecureStringToBSTR/);
  assert.match(script, /ZeroFreeBSTR/);
  assert.doesNotMatch(script, /profileYaml[\s\S]{0,500}api_key:/);
  assert.match(script, /llm_setting_id: \$settingId/);
  assert.match(script, /PREACHERMAN_HOMERAIL_PROFILE = \$ProfileId/);
  assert.match(script, /PREACHERMAN_HOMERAIL_WORKFLOW_REVISION = \$workflowRevision/);
  assert.match(script, /PREACHERMAN_HOMERAIL_CANONICAL_HASH = \$canonicalHash/);
  assert.match(script, /profile', 'list', '--workflow', \$workflowId/);
});

test("HomeRail profile setup supports a keyless local Responses endpoint without opening remote no-auth access", async () => {
  const script = await readFile(join(packageRoot, "scripts", "configure-homerail-profile.ps1"), "utf8");

  assert.match(script, /\[switch\] \$LocalNoAuth/);
  assert.match(script, /'--responses-endpoint', \$ResponsesBaseUrl/);
  assert.match(script, /'local-no-auth'/);
  assert.match(script, /'127\.0\.0\.1', 'localhost', 'host\.docker\.internal'/);
  assert.match(script, /\$AgentType = 'codex_appserver'/);
  assert.match(script, /Custom Responses endpoints require -ModelName/);
  assert.match(script, /-LocalNoAuth is restricted to an HTTP loopback or host\.docker\.internal endpoint/);
});
