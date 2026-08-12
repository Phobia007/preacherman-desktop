import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPreachermanPluginRuntime } from "../server/preachermanPluginRuntime.mjs";
import { createPreachermanKitsRuntime } from "../server/preachermanKitsRuntime.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "preacherman-plugin");
const taskStore = { async list() { return []; } };

async function createRuntime(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-plugin-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "preacherman-plugins.v1.json");
  const widgets = options.widgets ?? {
    async register(input) {
      assert.equal(typeof input.pluginId, "string");
      assert.equal(typeof input.manifest, "object");
      assert.ok("schema" in input);
      assert.equal("definition" in input, false);
    },
    async removePlugin() {},
  };
  return { file, runtime: createPreachermanPluginRuntime({ file, taskStore, widgets, ...options }) };
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
  assert.equal(installed.toolCount, 3);
  assert.equal(installed.widgetCount, 1);
  assert.equal(installed.sourceDirectory, join(fixtures, "success"));
  assert.deepEqual(installed.permissions, ["tasks:read", "ledger:write", "conversations:recent:read"]);
  assert.deepEqual(installed.kits, ["tools"]);
  assert.deepEqual(installed.bindings, []);
  assert.deepEqual((await runtime.listTools()).map((tool) => ({ name: tool.name, requiresApproval: tool.requiresApproval })), [
    { name: "fixture-plugin::binding_task", requiresApproval: true },
    { name: "fixture-plugin::echo", requiresApproval: true },
    { name: "fixture-plugin::recent_conversations", requiresApproval: true },
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
  const restored = createPreachermanPluginRuntime({
    file,
    taskStore,
    widgets: { async register() {}, async removePlugin() {} },
  });
  t.after(() => restored.close());
  assert.equal((await restored.listPlugins()).find((plugin) => plugin.id === "fixture-plugin")?.phase, "ready");
  assert.equal((await restored.callTool("fixture-plugin::echo", { label: "restored" }, { approved: true })).structuredContent.label, "restored");
});

test("external plugins provide Kits and register executable owned Bindings through the controlled facade", async (t) => {
  const kitRuntime = createPreachermanKitsRuntime();
  kitRuntime.bindings.bind({
    pluginId: "host-task-adapter",
    kit: "task",
    operation: "list",
    handler() { return []; },
  });
  const { runtime } = await createRuntime(t, { kits: kitRuntime.kits, bindings: kitRuntime.bindings, timeoutMs: 100 });
  t.after(() => runtime.close());

  const installed = await runtime.install(join(fixtures, "kit-provider"));
  assert.deepEqual(installed.usedKits, ["task"]);
  assert.deepEqual(installed.providedKits, ["fixture-calendar"]);
  assert.deepEqual(installed.kits, ["fixture-calendar", "task"]);
  assert.deepEqual(installed.bindings, ["fixture-calendar.list"]);

  const listed = await kitRuntime.bindings.invokeTrusted(
    "preacherman-host",
    "fixture-calendar",
    "list",
    { owner: "alice" },
    { versionRange: "^1.0.0" },
  );
  assert.deepEqual(listed, {
    calendars: ["alice"],
    callerPluginId: "preacherman-host",
    providerPluginId: "kit-provider",
  });
  await assert.rejects(
    kitRuntime.bindings.invokeTrusted("preacherman-host", "fixture-calendar", "list", { hang: true }),
    (error) => error?.code === "BINDING_EXECUTION_FAILED"
      && error?.statusCode === 504
      && error?.cause?.code === "PLUGIN_TIMEOUT",
  );

  const reloaded = await runtime.reload("kit-provider");
  assert.deepEqual(reloaded.bindings, ["fixture-calendar.list"]);
  assert.equal(kitRuntime.bindings.list({ pluginId: "kit-provider" }).length, 1);
  await runtime.setEnabled("kit-provider", false);
  assert.deepEqual(kitRuntime.bindings.list({ pluginId: "kit-provider" }), []);
  assert.throws(() => kitRuntime.kits.get("fixture-calendar"), { code: "KIT_NOT_FOUND", statusCode: 404 });
  assert.deepEqual((await runtime.setEnabled("kit-provider", true)).bindings, ["fixture-calendar.list"]);

  kitRuntime.bindings.bind({
    pluginId: "host-calendar-adapter",
    kit: "fixture-calendar",
    operation: "create",
    handler() { return ["host-demo"]; },
  });
  const refreshed = (await runtime.listPlugins()).find((plugin) => plugin.id === "kit-provider");
  assert.deepEqual(refreshed.bindings, ["fixture-calendar.list"], "host bindings must not be attributed to the Kit provider");

  await runtime.uninstall("kit-provider");
  assert.throws(() => kitRuntime.kits.get("fixture-calendar"), { code: "KIT_NOT_FOUND", statusCode: 404 });
  assert.deepEqual(kitRuntime.bindings.list({ pluginId: "kit-provider" }), []);
  assert.deepEqual(kitRuntime.bindings.list({ pluginId: "host-calendar-adapter" }), []);
});

test("dynamic Tools Kit registration preserves schema, approval, timeout, ownership, and lifecycle cleanup", async (t) => {
  const { runtime } = await createRuntime(t, { timeoutMs: 100 });
  t.after(() => runtime.close());

  const installed = await runtime.install(join(fixtures, "dynamic-tools"));
  assert.equal(installed.toolCount, 2);
  assert.deepEqual((await runtime.listToolsForPlugin("dynamic-tools")).map((tool) => tool.name), [
    "dynamic-tools::dynamic_echo",
    "dynamic-tools::tool_control",
  ]);
  assert.equal(
    (await runtime.listToolsForPlugin("dynamic-tools")).every((tool) => tool.requiresApproval === true),
    true,
    "write-capable plugin permissions must force approval even when the manifest opts out",
  );
  assert.equal("execute" in (await runtime.listToolsForPlugin("dynamic-tools"))[0], false);

  await assert.rejects(
    runtime.callTool("dynamic-tools::dynamic_echo", { label: "blocked" }),
    (error) => error?.code === "PLUGIN_APPROVAL_REQUIRED" && error?.statusCode === 403,
  );
  await assert.rejects(
    runtime.callTool("dynamic-tools::dynamic_echo", {}, { approved: true }),
    /arguments\.label is required/,
  );
  assert.equal(
    (await runtime.callTool("dynamic-tools::dynamic_echo", { label: "safe" }, { approved: true })).structuredContent.label,
    "safe",
  );
  await assert.rejects(
    runtime.callTool("dynamic-tools::dynamic_echo", { label: "timeout" }, { approved: true }),
    (error) => error?.code === "PLUGIN_TIMEOUT" && error?.statusCode === 504,
  );

  await assert.rejects(
    runtime.unregisterTool("other-plugin", "dynamic_echo"),
    (error) => error?.code === "PLUGIN_RESOURCE_OWNER_MISMATCH" && error?.statusCode === 403,
  );
  await assert.rejects(
    runtime.registerTool("dynamic-tools", {
      pluginId: "other-plugin",
      name: "dynamic_echo",
      execute() { return {}; },
    }),
    (error) => error?.code === "PLUGIN_RESOURCE_OWNER_MISMATCH" && error?.statusCode === 403,
  );
  await runtime.callTool("dynamic-tools::tool_control", { action: "unregister" }, { approved: true });
  assert.deepEqual((await runtime.listToolsForPlugin("dynamic-tools")).map((tool) => tool.toolName), ["tool_control"]);
  await assert.rejects(runtime.callTool("dynamic-tools::dynamic_echo", { label: "gone" }, { approved: true }), /Unknown PREACHERMAN plugin tool/);
  await runtime.callTool("dynamic-tools::tool_control", { action: "register" }, { approved: true });
  assert.equal((await runtime.listToolsForPlugin("dynamic-tools")).length, 2);

  const staleFacade = globalThis.__preachermanDynamicToolsFacade;
  await runtime.setEnabled("dynamic-tools", false);
  assert.deepEqual(await runtime.listToolsForPlugin("dynamic-tools"), []);
  assert.throws(() => staleFacade.register({ name: "dynamic_echo", execute() {} }), /no longer active/);
  assert.equal((await runtime.setEnabled("dynamic-tools", true)).toolCount, 2);
  assert.equal((await runtime.reload("dynamic-tools")).toolCount, 2);
  await runtime.uninstall("dynamic-tools");
  assert.deepEqual(await runtime.listToolsForPlugin("dynamic-tools"), []);
});

test("activation failure cannot leak tools and undeclared dynamic tools are approval-safe", async (t) => {
  const { runtime } = await createRuntime(t);
  t.after(() => runtime.close());
  await assert.rejects(runtime.install(join(fixtures, "dynamic-tools-failure")), /dynamic tool activation failed/);
  assert.deepEqual((await runtime.listTools()).map((tool) => tool.name), ["preacherman-runtime::task_summary"]);
  assert.throws(
    () => globalThis.__preachermanFailedDynamicToolsFacade.register({ name: "orphan", execute() {} }),
    /no longer active/,
  );

  const source = await mkdtemp(join(tmpdir(), "preacherman-undeclared-tool-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  await cp(join(fixtures, "dynamic-tools"), source, { recursive: true });
  const manifestPath = join(source, "plugin.preacherman.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.permissions = [];
  manifest.tools = manifest.tools.filter((tool) => tool.name !== "dynamic_echo");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
  assert.equal((await runtime.install(source)).phase, "ready");
  const dynamic = (await runtime.listToolsForPlugin("dynamic-tools"))
    .find((tool) => tool.toolName === "dynamic_echo");
  assert.equal(dynamic.requiresApproval, true, "undeclared dynamic tools must default to explicit approval");
});

test("failed activation cleans plugin-owned Kits before returning the error", async (t) => {
  const kitRuntime = createPreachermanKitsRuntime();
  const { runtime } = await createRuntime(t, { kits: kitRuntime.kits, bindings: kitRuntime.bindings });
  t.after(() => runtime.close());

  await assert.rejects(
    runtime.install(join(fixtures, "kit-provider-failure")),
    /fixture activation failed after Kit and Binding registration/,
  );
  assert.throws(() => kitRuntime.kits.get("fixture-orphan"), { code: "KIT_NOT_FOUND", statusCode: 404 });
  assert.deepEqual(kitRuntime.bindings.list({ pluginId: "kit-provider-failure" }), []);
  assert.throws(() => globalThis.__preachermanFailedBindingFacade.list(), /no longer active/);
  assert.throws(() => globalThis.__preachermanFailedKitFacade.discover(), /no longer active/);
  assert.deepEqual((await runtime.listPlugins()).map((plugin) => plugin.id), ["preacherman-runtime"]);
});

test("external plugins cannot bind host-owned Kit operations", async (t) => {
  const kitRuntime = createPreachermanKitsRuntime();
  const { runtime } = await createRuntime(t, { kits: kitRuntime.kits, bindings: kitRuntime.bindings });
  t.after(() => runtime.close());

  await assert.rejects(
    runtime.install(join(fixtures, "binding-owner-violation")),
    (error) => error?.code === "PLUGIN_RESOURCE_OWNER_MISMATCH"
      && error?.statusCode === 403
      && /can only bind operations for a Kit it provides/.test(error.message),
  );
  assert.deepEqual(kitRuntime.bindings.list({ pluginId: "binding-owner-violation" }), []);
  assert.deepEqual(kitRuntime.kits.discover({ pluginId: "binding-owner-violation" }), []);
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

test("reports an unsupported PREACHERMAN ABI instead of treating it as loaded", async (t) => {
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

test("a failed hot reload recovers after the trusted module is repaired", async (t) => {
  const source = await mkdtemp(join(tmpdir(), "preacherman-plugin-recovery-"));
  t.after(() => rm(source, { recursive: true, force: true }));
  await cp(join(fixtures, "success"), source, { recursive: true });
  const entry = join(source, "index.mjs");
  const validModule = await readFile(entry, "utf8");
  const { runtime } = await createRuntime(t);
  t.after(() => runtime.close());

  await runtime.install(source);
  await writeFile(entry, "throw new Error('fixture reload is temporarily broken');\n", "utf8");
  await assert.rejects(runtime.reload("fixture-plugin"), /temporarily broken/);
  assert.equal((await runtime.listPlugins()).find((plugin) => plugin.id === "fixture-plugin")?.phase, "failed");

  await writeFile(entry, validModule, "utf8");
  const recovered = await runtime.reload("fixture-plugin");
  assert.equal(recovered.phase, "ready");
  assert.equal((await runtime.callTool("fixture-plugin::echo", { label: "recovered" }, { approved: true })).structuredContent.label, "recovered");
});
