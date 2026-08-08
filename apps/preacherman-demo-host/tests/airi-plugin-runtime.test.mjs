import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createAiriPluginRuntime } from "../server/airiPluginRuntime.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "airi-plugin");
const taskStore = { async list() { return []; } };

async function createRuntime(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-plugin-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "airi-plugins.v1.json");
  return { file, runtime: createAiriPluginRuntime({ file, taskStore, ...options }) };
}

test("installs, imports, persists, and calls a real external Preacherman bridge plugin", async (t) => {
  const kits = {
    discover: ({ pluginId }) => pluginId === "fixture-plugin" ? [{ name: "tools" }] : [],
    attachConsumer(_pluginId, name) {
      return { name, version: "1.0.0", description: `${name} kit`, capabilities: ["call"], phase: "ready" };
    },
  };
  const bindings = { list: () => [{ kit: "tools", operation: "call" }] };
  const { file, runtime } = await createRuntime(t, { hostBridge: { name: "test-host" }, kits, bindings });
  t.after(() => runtime.close());

  const installed = await runtime.install(join(fixtures, "success"));
  assert.equal(installed.id, "fixture-plugin");
  assert.equal(installed.phase, "ready");
  assert.equal(installed.version, "1.2.3");
  assert.equal(installed.toolCount, 1);
  assert.equal(installed.sourceDirectory, join(fixtures, "success"));
  assert.deepEqual(installed.permissions, ["tasks:read", "ledger:write"]);
  assert.deepEqual(installed.kits, ["tools"]);
  assert.deepEqual(installed.bindings, ["tools.call"]);
  assert.deepEqual((await runtime.listTools()).map((tool) => ({ name: tool.name, requiresApproval: tool.requiresApproval })), [
    { name: "fixture-plugin::echo", requiresApproval: true },
    { name: "preacherman-runtime::task_summary", requiresApproval: false },
  ]);

  const result = await runtime.callTool("fixture-plugin::echo", { label: "external" }, { approved: true, token: "host-test-token" });
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, {
    pluginId: "fixture-plugin",
    label: "external",
    hostBridge: "test-host",
    hasKits: true,
    hasBindings: true,
  });

  const persisted = JSON.parse(await readFile(file, "utf8"));
  assert.equal(persisted.version, 2);
  assert.equal(persisted.sources[0].id, "fixture-plugin");
  assert.equal(persisted.sources[0].enabled, true);

  await runtime.close();
  const restored = createAiriPluginRuntime({ file, taskStore });
  t.after(() => restored.close());
  assert.equal((await restored.listPlugins()).find((plugin) => plugin.id === "fixture-plugin")?.phase, "ready");
  assert.equal((await restored.callTool("fixture-plugin::echo", { label: "restored" }, { approved: true })).structuredContent.label, "restored");
});

test("rejects an entrypoint whose resolved path escapes the plugin directory", async (t) => {
  const { file, runtime } = await createRuntime(t);
  t.after(() => runtime.close());

  await assert.rejects(
    runtime.install(join(fixtures, "path-escape")),
    /entrypoint escapes the plugin directory/,
  );
  assert.deepEqual((await runtime.listPlugins()).map((plugin) => plugin.id), ["preacherman-runtime"]);
  const persisted = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(persisted.sources, []);
});

test("reports an unsupported AIRI ABI instead of treating it as loaded", async (t) => {
  const { file, runtime } = await createRuntime(t);
  t.after(() => runtime.close());

  await assert.rejects(
    runtime.install(join(fixtures, "wrong-abi")),
    /unsupported ABI; expected preacherman\.plugin\.v1/,
  );
  assert.deepEqual((await runtime.listPlugins()).map((plugin) => plugin.id), ["preacherman-runtime"]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).sources, []);
});

test("rejects invalid permission and approval declarations in plugin manifests", async (t) => {
  const { file, runtime } = await createRuntime(t);
  t.after(() => runtime.close());

  await assert.rejects(runtime.install(join(fixtures, "invalid-permissions")), /permissions must be an array/);
  await assert.rejects(runtime.install(join(fixtures, "invalid-approval")), /requiresApproval must be a boolean/);
  assert.deepEqual((await runtime.listPlugins()).map((plugin) => plugin.id), ["preacherman-runtime"]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).sources, []);
});

test("built-in task summary counts persisted succeeded TaskRuns", async (t) => {
  const succeededStore = { async list() { return [{ status: "succeeded", artifact: { id: "artifact-1" } }]; } };
  const { runtime } = await createRuntime(t, { taskStore: succeededStore });
  t.after(() => runtime.close());

  const result = await runtime.callTool("preacherman-runtime::task_summary", {});
  assert.equal(result.structuredContent.completedTaskCount, 1);
  assert.equal(result.structuredContent.artifactCount, 1);
});

test("external tools require a host approval context for every invocation", async (t) => {
  const { runtime } = await createRuntime(t);
  t.after(() => runtime.close());
  await runtime.install(join(fixtures, "success"));

  await assert.rejects(
    runtime.callTool("fixture-plugin::echo", { label: "unapproved" }),
    (error) => error?.statusCode === 403 && error?.code === "PLUGIN_APPROVAL_REQUIRED" && /requires explicit approval/.test(error.message),
  );
  assert.equal(
    (await runtime.callTool("fixture-plugin::echo", { label: "approved" }, { approved: true })).structuredContent.label,
    "approved",
  );
});

test("validates required, additional, and basic JSON Schema argument types before execution", async (t) => {
  const { runtime } = await createRuntime(t);
  t.after(() => runtime.close());
  await runtime.install(join(fixtures, "success"));
  const approved = { approved: true };

  const valid = await runtime.callTool("fixture-plugin::echo", {
    label: "valid",
    count: 2.5,
    enabled: true,
    tags: ["one", "two"],
    metadata: { code: "A-1" },
  }, approved);
  assert.equal(valid.structuredContent.label, "valid");

  for (const [argumentsValue, message] of [
    [{}, /arguments\.label is required/],
    [{ label: "x", extra: true }, /arguments\.extra is not allowed/],
    [{ label: 1 }, /arguments\.label must be of type string/],
    [{ label: "x", count: "2" }, /arguments\.count must be of type number/],
    [{ label: "x", enabled: "yes" }, /arguments\.enabled must be of type boolean/],
    [{ label: "x", tags: [1] }, /arguments\.tags\[0\] must be of type string/],
    [{ label: "x", metadata: [] }, /arguments\.metadata must be of type object/],
    [{ label: "x", metadata: {} }, /arguments\.metadata\.code is required/],
  ]) {
    await assert.rejects(
      runtime.callTool("fixture-plugin::echo", argumentsValue, approved),
      (error) => error?.statusCode === 400 && message.test(error.message),
    );
  }
});

test("times out a hung external plugin tool without reporting fake success", async (t) => {
  const { runtime } = await createRuntime(t, { timeoutMs: 20 });
  t.after(() => runtime.close());
  await runtime.install(join(fixtures, "success"));
  await assert.rejects(
    runtime.callTool("fixture-plugin::echo", { label: "timeout" }, { approved: true }),
    (error) => error?.code === "PLUGIN_TIMEOUT" && error?.statusCode === 504,
  );
});

test("disable, enable, reload, and uninstall dispose external module instances", async (t) => {
  const { file, runtime } = await createRuntime(t);
  t.after(() => runtime.close());
  const startingDisposals = globalThis.__preachermanFixtureDisposals ?? 0;

  await runtime.install(join(fixtures, "success"));
  const disabled = await runtime.setEnabled("fixture-plugin", false);
  assert.equal(disabled.phase, "stopped");
  assert.equal(globalThis.__preachermanFixtureDisposals, startingDisposals + 1);
  assert.deepEqual((await runtime.listTools()).map((tool) => tool.name), ["preacherman-runtime::task_summary"]);

  const enabled = await runtime.setEnabled("fixture-plugin", true);
  assert.equal(enabled.phase, "ready");
  const reloaded = await runtime.reload("fixture-plugin");
  assert.equal(reloaded.phase, "ready");
  assert.ok(reloaded.revision > enabled.revision);
  assert.equal(globalThis.__preachermanFixtureDisposals, startingDisposals + 2);

  assert.deepEqual(await runtime.uninstall("fixture-plugin"), { id: "fixture-plugin", uninstalled: true });
  assert.equal(globalThis.__preachermanFixtureDisposals, startingDisposals + 3);
  assert.deepEqual((await runtime.listPlugins()).map((plugin) => plugin.id), ["preacherman-runtime"]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).sources, []);
});
