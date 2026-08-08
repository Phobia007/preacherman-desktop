import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_KIT_DEFINITIONS,
  createAiriKitsRuntime,
  createKitRegistry,
  isVersionCompatible,
} from "../server/airiKitsRuntime.mjs";

test("core registry exposes only Tools, Task, and Ledger kits with lifecycle and associations", () => {
  const runtime = createAiriKitsRuntime({ now: () => "2026-08-08T00:00:00.000Z" });
  const kits = runtime.kits.discover();

  assert.deepEqual(kits.map((kit) => kit.name), ["ledger", "task", "tools"]);
  assert.deepEqual(CORE_KIT_DEFINITIONS.map((kit) => kit.name), ["tools", "task", "ledger"]);
  assert.equal(kits.every((kit) => kit.version === "1.0.0" && kit.phase === "ready"), true);
  assert.equal(kits.every((kit) => kit.providers.some(({ pluginId }) => pluginId === "preacherman-host")), true);
  assert.equal(kits.some((kit) => kit.name === "widget" || kit.name === "gamelet"), false);

  runtime.kits.attachConsumer("calendar-plugin", "task", "^1.0.0");
  runtime.kits.attachProvider("tool-plugin", "tools", "1.0.0");
  assert.deepEqual(runtime.kits.discover({ pluginId: "calendar-plugin" }).map((kit) => kit.name), ["task"]);
  assert.equal(runtime.kits.get("tools").providers.some(({ pluginId }) => pluginId === "tool-plugin"), true);

  runtime.kits.setPhase("ledger", "stopped");
  const ledger = runtime.kits.setPhase("ledger", "ready");
  assert.deepEqual(ledger.lifecycle.map(({ phase }) => phase), ["registered", "ready", "stopped", "ready"]);
});

test("kit registry registers, discovers, and unregisters an actual custom capability", () => {
  let tick = 0;
  const kits = createKitRegistry({ now: () => `tick-${tick += 1}` });
  kits.register({
    name: "custom-data",
    version: "2.3.4",
    description: "Read a local data fixture.",
    capabilities: ["read", "read"],
  }, { providerId: "data-plugin", phase: "registered" });

  assert.deepEqual(kits.discover({ capability: "read" })[0].capabilities, ["read"]);
  assert.equal(kits.get("custom-data").providers[0].version, "2.3.4");
  assert.equal(kits.setPhase("custom-data", "ready").phase, "ready");
  assert.equal(kits.unregister("custom-data").phase, "stopped");
  assert.throws(() => kits.get("custom-data"), { code: "KIT_NOT_FOUND", statusCode: 404 });
});

test("semantic compatibility rejects incompatible consumers and bindings", () => {
  assert.equal(isVersionCompatible("1.4.2", "^1.2.0"), true);
  assert.equal(isVersionCompatible("2.0.0", "^1.2.0"), false);
  assert.equal(isVersionCompatible("0.2.5", "^0.2.1"), true);
  assert.equal(isVersionCompatible("1.4.2", "~1.4.0"), true);
  assert.equal(isVersionCompatible("1.5.0", "~1.4.0"), false);

  const runtime = createAiriKitsRuntime();
  assert.throws(
    () => runtime.kits.attachConsumer("future-plugin", "task", "^2.0.0"),
    { code: "KIT_VERSION_INCOMPATIBLE", statusCode: 409 },
  );
  assert.throws(
    () => runtime.bindings.bind({ pluginId: "future-plugin", kit: "task", operation: "create", versionRange: "^2.0.0", handler() {} }),
    { code: "KIT_VERSION_INCOMPATIBLE", statusCode: 409 },
  );
});

test("binding registry uniquely maps kit operations to real async handlers", async () => {
  const runtime = createAiriKitsRuntime();
  const tasks = new Map();
  runtime.bindings.bind({
    pluginId: "task-adapter",
    kit: "task",
    operation: "create",
    versionRange: "^1.0.0",
    async handler(input, context) {
      const task = { id: `task-${tasks.size + 1}`, title: input.title, source: context.pluginId };
      tasks.set(task.id, task);
      return task;
    },
  });

  const created = await runtime.bindings.invoke({
    kit: "task",
    operation: "create",
    versionRange: "~1.0.0",
    input: { title: "Ship the demo" },
  });
  assert.deepEqual(created, { id: "task-1", title: "Ship the demo", source: "task-adapter" });
  assert.deepEqual([...tasks.values()], [created]);
  assert.deepEqual(runtime.bindings.list(), [{ pluginId: "task-adapter", kit: "task", operation: "create", versionRange: "^1.0.0" }]);

  assert.throws(
    () => runtime.bindings.bind({ pluginId: "other-adapter", kit: "task", operation: "create", handler() {} }),
    { code: "BINDING_ALREADY_REGISTERED", statusCode: 409 },
  );
  await assert.rejects(
    runtime.bindings.invoke({ kit: "task", operation: "list", input: {} }),
    { code: "BINDING_NOT_FOUND", statusCode: 404 },
  );
});

test("binding failures stay explicit and plugin cleanup removes all owned state", async () => {
  const runtime = createAiriKitsRuntime();
  runtime.kits.attachConsumer("broken-plugin", "ledger", "^1.0.0");
  runtime.bindings.bind({
    pluginId: "broken-plugin",
    kit: "ledger",
    operation: "append",
    handler() {
      throw new Error("disk unavailable");
    },
  });

  await assert.rejects(
    runtime.bindings.invoke({ kit: "ledger", operation: "append", input: { event: "started" } }),
    (error) => error.code === "BINDING_EXECUTION_FAILED" && error.statusCode === 500 && error.cause?.message === "disk unavailable",
  );

  assert.deepEqual(runtime.removePlugin("broken-plugin"), { bindings: 1, associations: 1 });
  assert.deepEqual(runtime.bindings.list({ pluginId: "broken-plugin" }), []);
  assert.deepEqual(runtime.kits.discover({ pluginId: "broken-plugin" }), []);
  await assert.rejects(
    runtime.bindings.invoke({ kit: "ledger", operation: "append", input: {} }),
    { code: "BINDING_NOT_FOUND", statusCode: 404 },
  );
});
