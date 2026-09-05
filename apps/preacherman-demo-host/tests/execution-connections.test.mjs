import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionConnections, connectionUrl, publicIpv4 } from "../server/executionConnections.mjs";
import { createPreachermanServer } from "../server/preachermanServer.mjs";
import { boundedChatContext } from "../public/gallery-v3/portfolio/task-chat-context.js";

test("long conversation context is bounded without changing the full transcript", () => {
  const transcript = Array.from({length: 35}, (_, index) => ({role: index % 2 ? "assistant" : "user", text: "x".repeat(index === 33 ? 100000 : 10000)}));
  transcript.push({role: "user", text: "Latest question"});
  const original = JSON.stringify(transcript);
  const context = boundedChatContext(transcript);
  assert.equal(context.trimmed, true);
  assert.ok(context.messages.length <= 30);
  assert.ok(context.messages.every(message => message.content.length <= 20000));
  assert.ok(context.messages.reduce((sum, message) => sum + message.content.length, 0) <= 80000);
  assert.equal(context.messages.at(-1).content, "Latest question");
  assert.equal(JSON.stringify(transcript), original);
  assert.equal(boundedChatContext([{role:"user",text:"Short"}]).trimmed, false);
});

test("conversation preserves unavailable selections and a visible keyboard focus", async () => {
  const source = await readFile(new URL("../public/gallery-v3/portfolio/task-conversation.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/gallery-v3/portfolio/task-conversation.css", import.meta.url), "utf8");
  assert.match(source, /localStorage.setItem\(modelStorageKey\(task\), selected.value\); persist\(updated\)/);
  assert.match(source, /if \(!selectionAvailable\(\)\)/);
  assert.doesNotMatch(source, /selected.value = ""/);
  assert.match(source, /task-chat__author/);
  assert.match(css, /task-chat__input:focus-visible.*--demo-theme-chat-focus/);
  assert.doesNotMatch(css, /outline: none !important/);
});

const draft = { name: "Work", protocol: "openai", baseUrl: "https://api.example.com/v1", apiKey: "test-only-secret", model: "test-model", maxTokens: "", reasoning: "" };
const fixture = async (url, options) => {
  if (url.endsWith("/models")) return { data: [{ id: "test-model" }, { id: "another-model" }] };
  if (url.endsWith("/messages")) return { content: options.body.tools ? [{ type: "tool_use", name: "connection_probe" }] : [{ type: "text", text: "Hello from fixture" }] };
  return { choices: [{ message: options.body.tools ? { tool_calls: [{ function: { name: "connection_probe" } }] } : { content: "Hello from fixture" } }] };
};
async function setup(t, request = fixture) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-execution-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "execution.json");
  return { file, directory, runtime: createExecutionConnections({ file, request }) };
}
test("settings require an exact tested draft and never expose API keys", async t => {
  const { runtime, file } = await setup(t);
  await assert.rejects(runtime.save(draft), /Test this exact/);
  assert.equal((await runtime.test(draft)).tools, true);
  await assert.rejects(runtime.save({ ...draft, model: "different" }), /Test this exact/);
  await runtime.models(draft);
  await runtime.save(draft);
  const state = await runtime.status();
  assert.equal(state.connections.length, 1);
  assert.equal(state.connections[0].models.length, 2);
  assert.equal(JSON.stringify(state).includes(draft.apiKey), false);
  const restarted = createExecutionConnections({ file, request: fixture });
  assert.deepEqual(await restarted.status(), state);
  assert.equal((await restarted.chat({ connectionId: state.active.connectionId, messages: [{ role: "user", content: "hello" }] })).text, "Hello from fixture");
});
test("blank keys preserve only the same endpoint and protocol; failed tests keep active connection", async t => {
  let fails = false;
  const { runtime } = await setup(t, (...args) => { if (fails) throw new Error("fixture offline"); return fixture(...args); });
  await runtime.test(draft); await runtime.save(draft);
  const before = await runtime.status();
  const edit = { ...draft, id: before.active.connectionId, apiKey: "" };
  await runtime.test(edit);
  await assert.rejects(runtime.test({ ...edit, baseUrl: "https://other.example.com" }), /API key/);
  fails = true;
  await assert.rejects(runtime.test(edit), /offline/);
  await assert.rejects(runtime.save(edit), /Test this exact/);
  await assert.rejects(runtime.test({ ...edit, model: "new" }), /offline/);
  assert.deepEqual(await runtime.status(), before);
});
test("Anthropic uses messages, key/version headers and required max_tokens", async t => {
  const seen = [];
  const { runtime } = await setup(t, (url, options) => { seen.push({ url, options }); return fixture(url, options); });
  const config = { ...draft, protocol: "anthropic" };
  await runtime.test(config);
  assert.ok(seen.every(call => call.url.endsWith("/messages")));
  assert.ok(seen.every(call => call.options.headers["x-api-key"] === draft.apiKey && call.options.headers["anthropic-version"] && call.options.body.max_tokens));
  assert.equal(seen[1].options.body.tools[0].name, "connection_probe");
});
test("tool failure does not imply tool readiness or break a working text model", async t => {
  const { runtime } = await setup(t, (url, options) => {
    if (options.body?.tools) throw new Error("tools unsupported");
    return fixture(url, options);
  });
  assert.equal((await runtime.test(draft)).tools, false);
  await runtime.save(draft);
  assert.equal((await runtime.status()).connections[0].tools, false);
});
test("a manually chosen model is retained beside discovered model options", async t => {
  const { runtime } = await setup(t);
  const config = { ...draft, model: "manual-model" };
  await runtime.models(config); await runtime.test(config); await runtime.save(config);
  assert.ok((await runtime.status()).connections[0].models.some(model => model.id === "manual-model"));
});
test("saving an API default retains independently configured local CLI access", async t => {
  const { runtime, file } = await setup(t);
  await runtime.activateLocal("codex-cli", "workspace-1");
  await runtime.test(draft); await runtime.save(draft);
  const state = await createExecutionConnections({file, request:fixture}).status();
  assert.equal(state.active.mode, "api");
  assert.equal(state.local.agentId, "codex-cli");
  assert.equal(state.local.workspaceId, "workspace-1");
  await runtime.disconnectLocal();
  const disconnected=await runtime.status();
  assert.equal(disconnected.local,null);
  assert.deepEqual(disconnected.active,state.active);
});
test("input and gateway validation reject unsafe URLs and private network destinations", async t => {
  const { runtime } = await setup(t);
  for (const url of ["http://api.example.com", "https://127.0.0.1", "https://localhost", "https://x.internal", "https://key@api.example.com", "https://api.example.com?q=secret"]) assert.throws(() => connectionUrl(url));
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "::1"]) assert.equal(publicIpv4(ip), false);
  assert.equal(publicIpv4("8.8.8.8"), true);
  await assert.rejects(runtime.test({ ...draft, maxTokens: -1 }), /Max tokens/);
  await assert.rejects(runtime.test({ ...draft, protocol: "unknown" }), /protocol/);
  await assert.rejects(runtime.chat({ messages: [{ role: "system", content: "no" }] }), /message limit/);
});
test("local CLI activation and task creation never bypass the approval gate", async t => {
  const { directory } = await setup(t);
  let starts = 0;
  const service = createPreachermanServer({
    env: { PREACHERMAN_DATA_DIR: directory, PREACHERMAN_LOCAL_AGENT_ROOTS: directory },
    localAgentRegistry: {
      list: async () => [{ id: "codex-cli", label: "Codex CLI", installed: true, version: "fixture", auth: { state: "ready" }, capabilities: { workspaceWrite: true } }],
      capabilities: () => ({ workspaceWrite: true }),
      start: async () => { starts++; return { runId: "fixture-run" }; },
      events: async () => ({ status: "succeeded", events: [], summary: "fixture completed" }),
      close: async () => {},
    },
  });
  try {
    const address = await service.listen(0);
    const call = async (path, body) => {
      const response = await fetch("http://127.0.0.1:" + address.port + path, { method: "POST", headers: { Origin: "http://127.0.0.1:1420", "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await call("/api/settings/execution/local", { agentId: "codex-cli", workspaceId: "wrong" })).status, 400);
    assert.equal((await call("/api/settings/execution/local", { agentId: "codex-cli", workspaceId: "workspace-1" })).status, 200);
    assert.equal(starts, 0);
    const proposed = await call("/api/execution/local-turn", { agentId: "codex-cli", workspaceId: "workspace-1", objective: "Fixture only" });
    assert.equal(proposed.status, 200);
    assert.ok(proposed.data.task.pendingApproval);
    assert.equal(starts, 0);
    const rejected = await call("/api/tasks/" + proposed.data.task.taskId + "/commands", { type: "reject", approvalId: proposed.data.task.pendingApproval.approvalId });
    assert.equal(rejected.status, 200);
    assert.equal(starts, 0);
    const disconnected=await fetch("http://127.0.0.1:"+address.port+"/api/settings/execution/local",{method:"DELETE",headers:{Origin:"http://127.0.0.1:1420"},signal:AbortSignal.timeout(10000)});
    assert.equal(disconnected.status,200);
    assert.equal((await disconnected.json()).local,null);
    assert.equal((await call("/api/execution/local-turn",{agentId:"codex-cli",workspaceId:"workspace-1",objective:"Must remain blocked"})).status,409);
  } finally { await service.close(); }
});
test("corrupt storage is not silently reset", async t => {
  const { file, runtime } = await setup(t);
  await writeFile(file, "broken-fixture");
  await assert.rejects(runtime.status(), /not overwritten/);
  assert.equal(await readFile(file, "utf8"), "broken-fixture");
});
test("real HTTP endpoints preserve state, reject foreign origins and send through the selected connection", async t => {
  const { directory } = await setup(t);
  const service = createPreachermanServer({ env: { PREACHERMAN_DATA_DIR: directory }, executionConnectionRequest: fixture });
  try {
    const address = await service.listen(0);
    const call = async (path, body, origin = "http://127.0.0.1:1420") => {
      const response = await fetch("http://127.0.0.1:" + address.port + path, { method: body ? "POST" : "GET", headers: { Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await call("/api/settings/execution", null, "https://evil.example")).status, 403);
    assert.equal((await call("/api/settings/execution/save", draft)).status, 409);
    assert.equal((await call("/api/settings/execution/test", draft)).status, 200);
    assert.equal((await call("/api/settings/execution/save", draft)).status, 200);
    const state = (await call("/api/settings/execution")).data;
    assert.equal(JSON.stringify(state).includes(draft.apiKey), false);
    const chat = await call("/api/execution/chat", { connectionId: state.active.connectionId, messages: [{ role: "user", content: "hello" }] });
    assert.equal(chat.data.text, "Hello from fixture");
  } finally { await service.close(); }
});
