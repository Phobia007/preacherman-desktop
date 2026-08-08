import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAiriComputerVisionRuntime } from "../server/airiComputerVisionRuntime.mjs";
import { createAiriConnectionRuntime } from "../server/airiConnectionRuntime.mjs";
import {
  AIRI_ECOSYSTEM_KIT_DEFINITIONS,
  createAiriEcosystemBindingFacade,
} from "../server/airiEcosystemBindingFacade.mjs";
import { createAiriGameletRuntime } from "../server/airiGameletRuntime.mjs";
import { createAiriKitsRuntime } from "../server/airiKitsRuntime.mjs";
import { createAiriMemoryPersonaRuntime } from "../server/airiMemoryPersonaRuntime.mjs";
import { createAiriProviderRuntime } from "../server/airiProviderRuntime.mjs";
import { AIRI_WIDGET_KIND, createAiriWidgetRuntime } from "../server/airiWidgetRuntime.mjs";

function rootError(error) {
  let current = error;
  while (current?.cause instanceof Error) current = current.cause;
  return current;
}

function assertRootError(code, statusCode) {
  return (error) => {
    assert.equal(error?.statusCode, statusCode);
    const root = rootError(error);
    assert.equal(root?.code, code);
    assert.equal(root?.statusCode, statusCode);
    return true;
  };
}

async function fixture({ memoryScopes = ["persona:read"] } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-ecosystem-bindings-"));
  const kitRuntime = createAiriKitsRuntime();
  const widgetRuntime = createAiriWidgetRuntime({ file: join(directory, "widgets.json") });
  const gameletRuntime = createAiriGameletRuntime({ includeBuiltin: false });
  const providerRuntime = createAiriProviderRuntime({ definitions: [] });
  const connectionRuntime = createAiriConnectionRuntime({
    catalog: [{ id: "fixture", name: "Fixture", description: "Protocol fixture", fields: [] }],
  });
  const computerVisionRuntime = createAiriComputerVisionRuntime({ approvalVerifier: async () => true });
  const memories = new Map();
  const released = [];
  function getMemoryRuntime(pluginId) {
    if (!memories.has(pluginId)) {
      memories.set(pluginId, createAiriMemoryPersonaRuntime({
        file: join(directory, `${pluginId}-memory.json`),
        principal: pluginId,
        scopes: memoryScopes,
      }));
    }
    return memories.get(pluginId);
  }
  async function releaseMemoryRuntime(pluginId) {
    const runtime = memories.get(pluginId);
    if (runtime) await runtime.close();
    memories.delete(pluginId);
    released.push(pluginId);
    return { released: Boolean(runtime) };
  }
  const facade = createAiriEcosystemBindingFacade({
    kits: kitRuntime.kits,
    bindings: kitRuntime.bindings,
    widgetRuntime,
    gameletRuntime,
    providerRuntime,
    connectionRuntime,
    computerVisionRuntime,
    getMemoryRuntime,
    releaseMemoryRuntime,
  });
  return {
    facade,
    kitRuntime,
    widgetRuntime,
    gameletRuntime,
    providerRuntime,
    connectionRuntime,
    computerVisionRuntime,
    getMemoryRuntime,
    released,
  };
}

function requireKits(kitRuntime, pluginId, names = AIRI_ECOSYSTEM_KIT_DEFINITIONS.map(({ name }) => name)) {
  for (const name of names) kitRuntime.kits.attachConsumer(pluginId, name, "^1.0.0");
}

function providerRegistration(id = "fixture-provider") {
  return {
    provider: {
      id,
      label: "Fixture provider",
      capabilities: ["chat"],
      requirements: [],
      models: [{ id: "fixture-model", label: "Fixture", capability: "chat" }],
    },
    capabilities: ["chat"],
    async test() { return { ok: true }; },
    async invoke({ input }) { return { content: input?.prompt ?? "ready" }; },
  };
}

function widgetRegistration() {
  return {
    manifest: {
      apiVersion: "v1",
      kind: AIRI_WIDGET_KIND,
      id: "fixture-widget",
      version: "1.0.0",
      title: "Fixture widget",
      placement: "work",
    },
    schema: { type: "text", text: "Ready" },
  };
}

function gameletRegistration() {
  return {
    definition: {
      id: "fixture-gamelet",
      version: "1.0.0",
      title: "Fixture Gamelet",
      description: "A lifecycle fixture.",
      actions: [{ type: "advance", description: "Advance", input: {} }],
    },
    adapter: {
      create() { return { state: { count: 0 } }; },
      send({ state }) { return { state: { count: state.count + 1 } }; },
    },
  };
}

function connectionAdapter() {
  return {
    async test() { return { ok: true }; },
    async connect() { return { connected: true, session: "fixture" }; },
    async disconnect() { return { disconnected: true }; },
  };
}

function visionAdapter() {
  return {
    async test() { return { ok: true }; },
    async invoke() { return { labels: [{ label: "fixture", confidence: 1 }] }; },
  };
}

function computerAdapter() {
  return {
    async test() { return { ok: true }; },
    async observe({ callerPluginId }) { return { summary: `Observed for ${callerPluginId}` }; },
    async inspectDom({ callerPluginId }) {
      return { nodes: [{ role: "main", name: callerPluginId, depth: 0 }], truncated: false };
    },
    async perform() { return { performed: true }; },
  };
}

test("publishes host-owned ecosystem Kits but invokeAs still requires an explicit compatible consumer", async () => {
  const { facade, kitRuntime } = await fixture();
  assert.deepEqual(
    AIRI_ECOSYSTEM_KIT_DEFINITIONS.map(({ name }) => name),
    ["widget", "gamelet", "provider", "connection", "computer-vision", "memory"],
  );
  assert.equal(facade.registeredBindings().length, 58);
  assert.equal(AIRI_ECOSYSTEM_KIT_DEFINITIONS.every(({ name }) =>
    kitRuntime.kits.get(name).providers.some(({ pluginId }) => pluginId === "preacherman-host")), true);

  await assert.rejects(
    kitRuntime.bindings.invokeAs("fixture-plugin", "provider", "catalog", {}),
    { code: "KIT_CONSUMER_REQUIRED", statusCode: 403 },
  );
  kitRuntime.kits.attachConsumer("fixture-plugin", "provider", "^1.0.0");
  assert.deepEqual(await kitRuntime.bindings.invokeAs("fixture-plugin", "provider", "catalog", {}), []);
});

test("adapter ownership comes only from Binding context and cross-owner removal is forbidden", async () => {
  const { kitRuntime, providerRuntime, connectionRuntime, computerVisionRuntime } = await fixture();
  requireKits(kitRuntime, "alpha-plugin", ["provider", "connection", "computer-vision"]);
  requireKits(kitRuntime, "beta-plugin", ["provider", "connection", "computer-vision"]);

  await assert.rejects(
    kitRuntime.bindings.invokeAs("alpha-plugin", "provider", "register-adapter", {
      pluginId: "beta-plugin",
      ...providerRegistration("spoofed-provider"),
    }),
    assertRootError("CALLER_ID_IN_BODY_FORBIDDEN", 403),
  );
  const registered = await kitRuntime.bindings.invokeAs(
    "alpha-plugin",
    "provider",
    "register-adapter",
    providerRegistration(),
  );
  assert.equal(registered.pluginId, "alpha-plugin");
  assert.deepEqual((await providerRuntime.get("fixture-provider")).adapter, {
    pluginId: "alpha-plugin",
    capabilities: ["chat"],
  });

  await assert.rejects(
    kitRuntime.bindings.invokeAs("beta-plugin", "provider", "unregister-adapter", { providerId: "fixture-provider" }),
    assertRootError("PROVIDER_ADAPTER_OWNER_MISMATCH", 403),
  );
  assert.equal((await providerRuntime.get("fixture-provider")).adapter.pluginId, "alpha-plugin");

  await kitRuntime.bindings.invokeAs("alpha-plugin", "connection", "register-adapter", {
    service: "fixture",
    adapter: connectionAdapter(),
  });
  assert.equal(connectionRuntime.status("fixture").adapter.pluginId, "alpha-plugin");
  await assert.rejects(
    kitRuntime.bindings.invokeAs("beta-plugin", "connection", "unregister-adapter", { service: "fixture" }),
    assertRootError("CONNECTION_ADAPTER_OWNER_MISMATCH", 403),
  );

  await kitRuntime.bindings.invokeAs("alpha-plugin", "computer-vision", "register-adapter", {
    capability: "vision-analysis",
    adapter: visionAdapter(),
  });
  assert.equal(computerVisionRuntime.status("vision-analysis").adapter.pluginId, "alpha-plugin");
  await assert.rejects(
    kitRuntime.bindings.invokeAs("beta-plugin", "computer-vision", "unregister-adapter", { capability: "vision-analysis" }),
    assertRootError("COMPUTER_VISION_ADAPTER_OWNER_MISMATCH", 403),
  );

  await kitRuntime.bindings.invokeAs("alpha-plugin", "computer-vision", "register-computer-adapter", {
    targets: [{ kind: "desktop", id: "primary" }],
    adapter: computerAdapter(),
  });
  assert.equal(computerVisionRuntime.computerUseStatus().adapter.pluginId, "alpha-plugin");
  await assert.rejects(
    kitRuntime.bindings.invokeAs("beta-plugin", "computer-vision", "unregister-computer-adapter", {}),
    assertRootError("COMPUTER_USE_ADAPTER_OWNER_MISMATCH", 403),
  );
});

test("Computer Use caller identity and Memory scope are captured per invoking plugin", async () => {
  const { kitRuntime, computerVisionRuntime, getMemoryRuntime } = await fixture();
  requireKits(kitRuntime, "alpha-plugin", ["computer-vision", "memory"]);
  requireKits(kitRuntime, "beta-plugin", ["computer-vision", "memory"]);
  const target = { kind: "web", id: "https://fixture.example.test/work" };
  await kitRuntime.bindings.invokeAs("alpha-plugin", "computer-vision", "register-computer-adapter", {
    targets: [target],
    adapter: computerAdapter(),
  });

  const observed = await kitRuntime.bindings.invokeAs("beta-plugin", "computer-vision", "observe", { target });
  assert.equal(observed.result.summary, "Observed for beta-plugin");
  assert.deepEqual(computerVisionRuntime.logs({ callerPluginId: "beta-plugin" }).map(({ callerPluginId }) => callerPluginId), ["beta-plugin"]);
  await assert.rejects(
    kitRuntime.bindings.invokeAs("beta-plugin", "computer-vision", "observe", {
      callerPluginId: "alpha-plugin",
      target,
    }),
    assertRootError("CALLER_ID_IN_BODY_FORBIDDEN", 403),
  );

  assert.deepEqual(
    await kitRuntime.bindings.invokeAs("beta-plugin", "memory", "access-policy", {}),
    {
      principal: "beta-plugin",
      scopes: ["persona:read"],
      boundaries: ["persona", "session", "long-term"],
      sensitiveData: "private-by-default",
    },
  );
  await assert.rejects(
    kitRuntime.bindings.invokeAs("beta-plugin", "memory", "create-persona", {
      name: "Not allowed",
      description: "",
      instructions: "",
    }),
    assertRootError("MEMORY_SCOPE_DENIED", 403),
  );
  assert.equal(getMemoryRuntime("alpha-plugin").getAccessPolicy().principal, "alpha-plugin");
});

test("plugin cleanup removes every owned ecosystem resource and its Kit requirements", async () => {
  const {
    facade,
    kitRuntime,
    widgetRuntime,
    gameletRuntime,
    providerRuntime,
    connectionRuntime,
    computerVisionRuntime,
    released,
  } = await fixture();
  const pluginId = "alpha-plugin";
  requireKits(kitRuntime, pluginId);

  assert.equal((await kitRuntime.bindings.invokeAs(pluginId, "widget", "register", widgetRegistration())).pluginId, pluginId);
  assert.equal((await kitRuntime.bindings.invokeAs(pluginId, "gamelet", "register", gameletRegistration())).pluginId, pluginId);
  const session = await kitRuntime.bindings.invokeAs(pluginId, "gamelet", "start", { gameletId: "fixture-gamelet" });
  assert.equal(session.ownerPluginId, pluginId);
  await kitRuntime.bindings.invokeAs(pluginId, "provider", "register-adapter", providerRegistration());
  await kitRuntime.bindings.invokeAs(pluginId, "connection", "register-adapter", {
    service: "fixture",
    adapter: connectionAdapter(),
  });
  assert.equal(connectionRuntime.status("fixture").adapter.pluginId, pluginId);
  await kitRuntime.bindings.invokeAs(pluginId, "computer-vision", "register-adapter", {
    capability: "vision-analysis",
    adapter: visionAdapter(),
  });
  assert.equal(computerVisionRuntime.status("vision-analysis").adapter.pluginId, pluginId);
  await kitRuntime.bindings.invokeAs(pluginId, "computer-vision", "register-computer-adapter", {
    targets: [{ kind: "desktop", id: "primary" }],
    adapter: computerAdapter(),
  });
  assert.equal(computerVisionRuntime.computerUseStatus().adapter.pluginId, pluginId);
  await kitRuntime.bindings.invokeAs(pluginId, "memory", "access-policy", {});

  const removed = await facade.removePlugin(pluginId);
  assert.equal(Object.values(removed.resources).every(({ status }) => status === "removed"), true);
  assert.deepEqual(await widgetRuntime.list(), []);
  assert.deepEqual(gameletRuntime.discover(), []);
  assert.throws(() => gameletRuntime.getSession({ pluginId, sessionId: session.id }), { code: "GAMELET_SESSION_NOT_FOUND" });
  assert.deepEqual(await providerRuntime.catalog(), []);
  assert.equal(connectionRuntime.status("fixture").adapter, null);
  assert.equal(computerVisionRuntime.status("vision-analysis").adapter, null);
  assert.equal(computerVisionRuntime.computerUseStatus().adapter, null);
  assert.deepEqual(released, [pluginId]);
  assert.deepEqual(kitRuntime.kits.discover({ pluginId }), []);
  await assert.rejects(
    kitRuntime.bindings.invokeAs(pluginId, "widget", "list", {}),
    { code: "KIT_CONSUMER_REQUIRED", statusCode: 403 },
  );
});
