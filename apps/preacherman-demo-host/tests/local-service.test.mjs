import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

const origin = "http://127.0.0.1:1420";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

async function waitForRun(baseUrl, runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { body } = await request(baseUrl, `/api/agent/runs/${runId}`);
    if (["succeeded", "failed", "cancelled"].includes(body.run.status)) return body.run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("PitchKit run did not reach a terminal state.");
}

test("local service persists private provider settings and completes the guarded PitchKit flow", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-service-"));
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ message: "已整理为待确认的 PitchKit 任务。", action: "propose_task" }) } }],
    }), { status: 200 }),
  });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const saved = await request(baseUrl, "/api/settings/providers", {
    method: "PUT",
    body: JSON.stringify({ deepseekApiKey: "private-deepseek-key", dashscopeWorkspaceId: "workspace-test" }),
  });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.body, { deepseekConfigured: true, dashscopeWorkspaceConfigured: true, asrConfigured: false, ttsConfigured: false });
  assert.equal(JSON.stringify(saved.body).includes("private-deepseek-key"), false);
  if (process.platform !== "win32") assert.equal((await stat(join(dataDir, "provider-settings.json"))).mode & 0o777, 0o600);

  const conversation = await request(baseUrl, "/api/conversations/conversation%3Atest-1", {
    method: "PUT",
    body: JSON.stringify({ locale: "zh-CN", messages: [{ role: "user", text: "不要保存我的音频" }, { role: "assistant", text: "只保存文字记录" }] }),
  });
  assert.equal(conversation.response.status, 200);
  const concurrentSaves = await Promise.all(["test-2", "test-3"].map((id) => request(baseUrl, `/api/conversations/conversation%3A${id}`, {
    method: "PUT",
    body: JSON.stringify({ locale: "en", messages: [{ role: "user", text: `Concurrent ${id}` }] }),
  })));
  assert.deepEqual(concurrentSaves.map(({ response }) => response.status), [200, 200]);
  const recent = await request(baseUrl, "/api/conversations/recent");
  const savedConversation = recent.body.entries.find((entry) => entry.id === "conversation:test-1");
  assert.equal(savedConversation.messages[1].text, "只保存文字记录");
  if (process.platform !== "win32") assert.equal((await stat(join(dataDir, "conversation-ledger.json"))).mode & 0o777, 0o600);

  const turn = await request(baseUrl, "/api/agent/turn", {
    method: "POST",
    body: JSON.stringify({ input: "请为我们的产品制作一个路演方案", locale: "zh-CN" }),
  });
  assert.equal(turn.response.status, 200);
  assert.equal(turn.body.action, "propose_task");
  assert.equal(turn.body.proposal.editableFields.join(","), "objective");

  const confirmed = await request(baseUrl, `/api/agent/proposals/${turn.body.proposal.proposalId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ objective: "为 Preacherman 制作 10 页路演" }),
  });
  assert.equal(confirmed.response.status, 202);
  const run = await waitForRun(baseUrl, confirmed.body.run.runId);
  assert.equal(run.status, "succeeded");
  assert.equal(run.toolCall.name, "preacherman::preacherman_runtime_status");
  assert.equal(typeof run.toolCall.structuredResult.checkedAt, "string");
  const markdown = await readFile(run.artifact.path, "utf8");
  assert.match(markdown, /# PitchKit/);
  assert.match(markdown, /## 10 页演示大纲/);
});

test("companion keeps recent context and does not discard a useful non-JSON DeepSeek reply", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-companion-"));
  let modelRequest;
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: dataDir, DEEPSEEK_API_KEY: "configured-key", DEEPSEEK_MODEL: "deepseek-test" },
    fetchImpl: async (_url, init) => {
      modelRequest = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "当然可以。我可以帮你梳理方案、优化表达，或制作路演。" } }] }), { status: 200 });
    },
  });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const turn = await request(baseUrl, "/api/agent/turn", {
    method: "POST",
    body: JSON.stringify({ locale: "zh-CN", input: "那你可以做什么？", history: [{ role: "user", text: "你好" }, { role: "assistant", text: "你好，很高兴见到你。" }] }),
  });
  assert.equal(turn.response.status, 200);
  assert.equal(turn.body.displayText, "当然可以。我可以帮你梳理方案、优化表达，或制作路演。");
  assert.equal(turn.body.diagnostics.source, "deepseek-unstructured");
  assert.equal(turn.body.diagnostics.model, "deepseek-test");
  assert.deepEqual(modelRequest.messages.slice(1, 3), [{ role: "user", content: "你好" }, { role: "assistant", content: "你好，很高兴见到你。" }]);
  assert.match(modelRequest.messages[0].content, /不要自称 A/);
});

test("AIRI capability buttons reach an honest persistent backend adapter", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "preacherman-airi-capabilities-"));
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: dataDir } });
  const address = await service.listen(0);
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });

  const local = await request(baseUrl, "/api/airi/capabilities/task.create/invoke", {
    method: "POST", body: JSON.stringify({ surface: "workspace", locale: "en" }),
  });
  assert.equal(local.response.status, 200);
  assert.equal(local.body.event.state, "available");
  assert.equal(local.body.event.adapter, "preacherman-task");

  const capabilityStatuses = await request(baseUrl, "/api/airi/capabilities/status", {
    method: "POST",
    body: JSON.stringify({ ids: ["agent.kits-api", "voice.tts", "game.minecraft"], locale: "en" }),
  });
  assert.deepEqual(capabilityStatuses.body.capabilities.map(({ capabilityId, state }) => [capabilityId, state]), [
    ["agent.kits-api", "available"],
    ["voice.tts", "configuration-required"],
    ["game.minecraft", "external-runtime-required"],
  ]);

  const fixtureServer = fileURLToPath(new URL("./fixtures/mcp-status-server.mjs", import.meta.url));
  const mcpConfig = JSON.stringify({
    mcpServers: {
      fixture: { command: process.execPath, args: [fixtureServer], enabled: true },
    },
  }, null, 2);
  const configured = await request(baseUrl, "/api/mcp/config", {
    method: "PUT", body: JSON.stringify({ text: mcpConfig }),
  });
  assert.equal(configured.response.status, 200);
  assert.deepEqual(configured.body.result.started, ["fixture"], JSON.stringify(configured.body));
  assert.equal(configured.body.status.servers.find((server) => server.name === "fixture").state, "running");

  const tools = await request(baseUrl, "/api/mcp/tools");
  assert.deepEqual(tools.body.tools.map((tool) => tool.name), [
    "fixture::fixture_status",
    "preacherman::preacherman_runtime_status",
  ]);
  const called = await request(baseUrl, "/api/mcp/tools/call", {
    method: "POST", body: JSON.stringify({ name: "fixture::fixture_status", arguments: { label: "external" } }),
  });
  assert.equal(called.body.result.isError, false);
  assert.deepEqual(called.body.result.structuredContent, { ok: true, label: "external" });

  const mcp = await request(baseUrl, "/api/airi/capabilities/agent.mcp-tools/invoke", {
    method: "POST", body: JSON.stringify({ surface: "workspace", locale: "en" }),
  });
  assert.equal(mcp.response.status, 200);
  assert.equal(mcp.body.event.state, "available");
  assert.equal(mcp.body.event.adapter, "preacherman-airi-mcp");
  assert.equal(mcp.body.event.execution.status, "succeeded");
  assert.equal(mcp.body.event.execution.protocol, "mcp");
  assert.equal(mcp.body.event.execution.tool, "preacherman::preacherman_runtime_status");
  assert.equal(mcp.body.event.execution.result.taskCount, 0);
  assert.deepEqual(mcp.body.event.execution.tools, ["fixture::fixture_status", "preacherman::preacherman_runtime_status"]);

  const plugins = await request(baseUrl, "/api/plugins");
  assert.equal(plugins.response.status, 200);
  assert.equal(plugins.body.plugins[0].manifest.apiVersion, "v1");
  assert.equal(plugins.body.plugins[0].manifest.kind, "manifest.plugin.airi.moeru.ai");
  assert.equal(plugins.body.plugins[0].phase, "ready");

  const pluginTools = await request(baseUrl, "/api/plugins/tools");
  assert.deepEqual(pluginTools.body.tools.map((tool) => tool.name), ["preacherman-runtime::task_summary"]);
  const pluginCall = await request(baseUrl, "/api/plugins/tools/call", {
    method: "POST", body: JSON.stringify({ name: "preacherman-runtime::task_summary", arguments: {} }),
  });
  assert.equal(pluginCall.body.result.isError, false);
  assert.equal(pluginCall.body.result.structuredContent.taskCount, 1);
  assert.equal(pluginCall.body.result.task.status, "completed");
  assert.equal(pluginCall.body.result.ledger.toolName, "task_summary");
  const pluginArtifact = await request(baseUrl, pluginCall.body.result.task.artifact.path);
  assert.equal(pluginArtifact.response.status, 200);
  assert.equal(pluginArtifact.body.artifact.content.taskCount, 1);

  const kits = await request(baseUrl, "/api/airi/kits");
  assert.deepEqual(kits.body.kits.map((kit) => kit.name), ["ledger", "task", "tools"]);
  assert.ok(kits.body.bindings.some((binding) => binding.kit === "tools" && binding.operation === "call"));

  const widgets = await request(baseUrl, "/api/widgets");
  assert.deepEqual(widgets.body.widgets.map((widget) => widget.id), ["ecosystem-status"]);
  const gamelets = await request(baseUrl, "/api/gamelets");
  assert.deepEqual(gamelets.body.gamelets.map((gamelet) => gamelet.id), ["tic-tac-toe"]);
  let gameSession = (await request(baseUrl, "/api/gamelets/sessions", {
    method: "POST", body: JSON.stringify({ gameletId: "tic-tac-toe" }),
  })).body.session;
  for (const cell of [0, 3, 1, 4, 2]) {
    gameSession = (await request(baseUrl, `/api/gamelets/sessions/${gameSession.id}/actions`, {
      method: "POST", body: JSON.stringify({ action: { type: "place", cell } }),
    })).body.session;
  }
  assert.equal(gameSession.status, "completed");
  assert.equal(gameSession.state.winner, "X");

  const providerCatalog = await request(baseUrl, "/api/providers/catalog");
  assert.deepEqual(providerCatalog.body.providers.map((provider) => provider.id), ["dashscope", "deepseek"]);
  assert.equal(providerCatalog.body.providers.every((provider) => Object.values(provider.capabilities)
    .every((capability) => capability.state === "configuration-required")), true);
  const personas = await request(baseUrl, "/api/personas");
  assert.equal(personas.body.selected.name, "Preacherman");
  await request(baseUrl, "/api/memory/remember", {
    method: "POST", body: JSON.stringify({ namespace: "demo", text: "Plugin ecosystem check passed" }),
  });
  const recalled = await request(baseUrl, "/api/memory/recall", {
    method: "POST", body: JSON.stringify({ namespace: "demo", query: "ecosystem" }),
  });
  assert.equal(recalled.body.memories[0].text, "Plugin ecosystem check passed");
  const connections = await request(baseUrl, "/api/connections");
  assert.equal(connections.body.connections.every((connection) => connection.status === "configuration-required"), true);
  const computerVision = await request(baseUrl, "/api/computer-vision");
  assert.deepEqual(computerVision.body.capabilities.map((capability) => capability.id), [
    "screenshot", "camera-window", "cursor-monitor", "vision-analysis",
  ]);
  assert.equal(computerVision.body.capabilities.every((capability) => capability.phase === "external-runtime-required"), true);
  const screenshotTest = await request(baseUrl, "/api/computer-vision/screenshot/test", {
    method: "POST", body: "{}",
  });
  assert.equal(screenshotTest.body.result.status, "external-runtime-required");
  const screenshotInvoke = await request(baseUrl, "/api/computer-vision/screenshot/invoke", {
    method: "POST", body: JSON.stringify({ input: {} }),
  });
  assert.equal(screenshotInvoke.body.result.status, "external-runtime-required");

  const pluginCapability = await request(baseUrl, "/api/airi/capabilities/agent.plugin-tools/invoke", {
    method: "POST", body: JSON.stringify({ surface: "workspace", locale: "en" }),
  });
  assert.equal(pluginCapability.body.event.state, "available");
  assert.equal(pluginCapability.body.event.adapter, "preacherman-airi-plugin-host");
  assert.equal(pluginCapability.body.event.execution.protocol, "airi-plugin");
  assert.deepEqual(pluginCapability.body.event.execution.tools, ["preacherman-runtime::task_summary"]);

  const disabledPlugin = await request(baseUrl, "/api/plugins/preacherman-runtime", {
    method: "PUT", body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disabledPlugin.body.plugin.phase, "stopped");
  assert.deepEqual((await request(baseUrl, "/api/plugins/tools")).body.tools, []);
  const enabledPlugin = await request(baseUrl, "/api/plugins/preacherman-runtime", {
    method: "PUT", body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabledPlugin.body.plugin.phase, "ready");
  const reloadedPlugin = await request(baseUrl, "/api/plugins/reload", {
    method: "POST", body: JSON.stringify({ name: "preacherman-runtime" }),
  });
  assert.ok(reloadedPlugin.body.plugin.revision > enabledPlugin.body.plugin.revision);

  const fixturePlugin = fileURLToPath(new URL("./fixtures/airi-plugin/success", import.meta.url));
  const installedPlugin = await request(baseUrl, "/api/plugins/install", {
    method: "POST", body: JSON.stringify({ directory: fixturePlugin }),
  });
  assert.equal(installedPlugin.response.status, 201);
  assert.deepEqual(installedPlugin.body.plugin.kits, ["ledger", "task"]);
  assert.ok(installedPlugin.body.plugin.bindings.includes("ledger.write-artifact"));
  const externalPluginCall = await request(baseUrl, "/api/plugins/tools/call", {
    method: "POST", body: JSON.stringify({ name: "fixture-plugin::echo", arguments: { label: "closed-loop" } }),
  });
  assert.equal(externalPluginCall.response.status, 200);
  assert.deepEqual(externalPluginCall.body.result.structuredContent, {
    pluginId: "fixture-plugin",
    label: "closed-loop",
    hasKits: true,
    hasBindings: true,
  });
  assert.equal(externalPluginCall.body.result.task.status, "completed");
  const persistedPluginTask = (await request(baseUrl, `/api/tasks/${externalPluginCall.body.result.task.taskId}`)).body.task;
  assert.equal(persistedPluginTask.status, "succeeded");
  assert.equal(persistedPluginTask.toolCall.name, "echo");
  assert.equal(persistedPluginTask.artifact.content.label, "closed-loop");
  const uninstalledPlugin = await request(baseUrl, "/api/plugins/uninstall", {
    method: "POST", body: JSON.stringify({ name: "fixture-plugin" }),
  });
  assert.equal(uninstalledPlugin.body.result.uninstalled, true);

  const external = await request(baseUrl, "/api/airi/capabilities/game.minecraft/invoke", {
    method: "POST", body: JSON.stringify({ surface: "workspace", locale: "zh-CN" }),
  });
  assert.equal(external.response.status, 200);
  assert.equal(external.body.event.state, "external-runtime-required");
  assert.deepEqual(external.body.event.requirements, ["game runtime or provider"]);

  const speech = await request(baseUrl, "/api/airi/capabilities/voice.tts/invoke", {
    method: "POST", body: JSON.stringify({ surface: "lab", locale: "en" }),
  });
  assert.equal(speech.body.event.state, "configuration-required");

  const history = await request(baseUrl, "/api/airi/events?limit=10");
  assert.equal(history.response.status, 200);
  assert.deepEqual(history.body.events.map((event) => event.capabilityId), ["voice.tts", "game.minecraft", "agent.plugin-tools", "agent.mcp-tools", "task.create"]);
  assert.equal(JSON.parse(await readFile(join(dataDir, "airi-capability-events.v1.json"), "utf8")).events.length, 5);
  assert.equal(JSON.parse(await readFile(join(dataDir, "airi-plugins.v1.json"), "utf8")).enabled, true);
});
