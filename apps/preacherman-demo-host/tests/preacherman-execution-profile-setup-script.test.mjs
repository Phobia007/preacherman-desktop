import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1");

test("Preacherman Execution profile setup keeps credentials on stdin and pins the fixed workflow", async () => {
  const [script, packageJson] = await Promise.all([
    readFile(join(packageRoot, "scripts", "configure-preacherman-execution-profile.ps1"), "utf8"),
    readFile(join(packageRoot, "package.json"), "utf8"),
  ]);

  assert.match(packageJson, /"configure:preacherman-execution"/);
  assert.match(script, /Read-Host 'Provider API key' -AsSecureString/);
  assert.match(script, /'--api-key-stdin'/);
  assert.match(script, /SecureStringToBSTR/);
  assert.match(script, /ZeroFreeBSTR/);
  assert.doesNotMatch(script, /profileYaml[\s\S]{0,500}api_key:/);
  assert.match(script, /llm_setting_id: \$settingId/);
  assert.match(script, /PREACHERMAN_EXECUTION_PROFILE = \$ProfileId/);
  assert.match(script, /PREACHERMAN_EXECUTION_WORKFLOW_REVISION = \$workflowRevision/);
  assert.match(script, /PREACHERMAN_EXECUTION_CANONICAL_HASH = \$canonicalHash/);
  assert.match(script, /profile', 'list', '--workflow', \$workflowId/);
  assert.match(script, /api\/llm\/models\/detect-runtime/);
  assert.match(script, /\$response\.data\.available -ne \$true/);
  assert.match(script, /\$responses\.available -ne \$true/);
  assert.match(script, /\$responses\.status -eq 401/);
  assert.match(script, /llm-settings', 'delete', \$settingId/);
  assert.ok(script.indexOf("Test-PreachermanExecutionModelRuntime") < script.indexOf("profile', 'sync'"));
});

test("Preacherman Execution profile setup supports a keyless local Responses endpoint without opening remote no-auth access", async () => {
  const script = await readFile(join(packageRoot, "scripts", "configure-preacherman-execution-profile.ps1"), "utf8");

  assert.match(script, /\[switch\] \$LocalNoAuth/);
  assert.match(script, /Resolve-GatewayModelName -BaseUrl \$ResponsesBaseUrl -ApiKey \$plainKey/);
  assert.match(script, /'\/v1\/models'/);
  assert.match(script, /Authorization = "Bearer \$ApiKey"/);
  assert.match(script, /'provider', 'upsert'/);
  assert.match(script, /'--responses-base-url', \$ResponsesBaseUrl/);
  assert.match(script, /'local-no-auth'/);
  assert.match(script, /'127\.0\.0\.1', 'localhost', 'host\.docker\.internal'/);
  assert.match(script, /\$AgentType = 'codex_appserver'/);
  assert.match(script, /Custom Responses endpoints cannot use a catalog EndpointId/);
  assert.match(script, /Custom Responses endpoints require a custom -Provider ID/);
  assert.doesNotMatch(script, /'--api-key', \$plainKey/);
  assert.match(script, /-LocalNoAuth is restricted to an HTTP loopback or host\.docker\.internal endpoint/);
});
