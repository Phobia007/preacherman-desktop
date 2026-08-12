import assert from "node:assert/strict";
import test from "node:test";
import { createHomeRailCapabilityCatalogAdapter, PREACHERMAN_HOMERAIL_CANONICAL_HASH } from "../server/homerail/homeRailCapabilityCatalogAdapter.mjs";
import { createHomeRailDiagnosticsAdapter } from "../server/homerail/homeRailDiagnosticsAdapter.mjs";

test("Capability Catalog exposes only pinned workflow metadata and safe connection diagnostics", async () => {
  const adapter = createHomeRailCapabilityCatalogAdapter({
    client: {
      runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
      workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: PREACHERMAN_HOMERAIL_CANONICAL_HASH }),
      profiles: async () => ({ profiles: [{ profile_id: "production", default: { llm_setting_id: "setting-1" } }] }),
      detectModelRuntime: async () => ({ available: true, preferred_harness: "codex_appserver", endpoints: { responses: { available: true, status: 200 } } }),
      workflows: async () => ({ workflows: [{
        workflow_id: "preacherman-complex-task-v1",
        name: "Complex Task",
        description: "Safe description",
        head_revision: 3,
        canonical_hash: PREACHERMAN_HOMERAIL_CANONICAL_HASH,
        compiler_version: "6",
        source_path: "D:\\private\\workflow.yaml",
        yaml_text: "secret worker prompt",
      }] }),
    },
    profile: "production",
    managerUrl: "https://user:password@manager.example:19443/private?token=secret",
    now: () => "2026-08-12T00:00:00.000Z",
  });
  const status = await adapter.status();
  assert.equal(status.state, "ready");
  assert.equal(status.connection.managerAddress, "https://manager.example:19443");
  const catalog = await adapter.workflows();
  assert.equal(catalog.workflows[0].pinned, true);
  assert.deepEqual(Object.keys(catalog.workflows[0]).sort(), ["canonicalHash", "compilerVersion", "description", "id", "name", "pinned", "revision"]);
  assert.doesNotMatch(JSON.stringify({ status, catalog }), /password|token|secret worker|source_path|yaml_text|private\\workflow/i);
});

test("Capability Catalog rejects an invalid provider credential and caches the live probe", async () => {
  let probes = 0;
  const adapter = createHomeRailCapabilityCatalogAdapter({
    client: {
      runtimeStatus: async () => ({ phase: "M10-pre", connected_workers: 0, connected_nodes: 1 }),
      workflow: async () => ({ workflow_id: "preacherman-complex-task-v1", head_revision: 3, canonical_hash: PREACHERMAN_HOMERAIL_CANONICAL_HASH }),
      profiles: async () => ({ profiles: [{ profile_id: "production", default: { llm_setting_id: "setting-invalid" } }] }),
      detectModelRuntime: async () => {
        probes += 1;
        return {
          available: false,
          endpoints: { responses: { available: false, status: 401, error: "invalid key ending in secret-suffix" } },
        };
      },
    },
    profile: "production",
  });

  const first = await adapter.status();
  const repeated = await adapter.status();
  assert.equal(first.state, "configuration-required");
  assert.match(first.message, /credential was rejected/i);
  assert.equal(first.model.status, 401);
  assert.equal(repeated.state, "configuration-required");
  assert.equal(probes, 1);
  assert.doesNotMatch(JSON.stringify({ first, repeated }), /secret-suffix|setting-invalid/);
});

test("Diagnostics Adapter delegates status and safe catalog without owning execution", async () => {
  const calls = [];
  const diagnostics = createHomeRailDiagnosticsAdapter({ capabilityCatalog: {
    status: async () => { calls.push("status"); return { id: "homerail", state: "ready" }; },
    workflows: async () => { calls.push("workflows"); return { workflows: [] }; },
  } });
  assert.equal((await diagnostics.status()).state, "ready");
  assert.deepEqual(await diagnostics.workflows(), { workflows: [] });
  assert.deepEqual(calls, ["status", "workflows"]);
});
