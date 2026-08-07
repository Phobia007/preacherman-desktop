import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
  assert.equal((await stat(join(dataDir, "provider-settings.json"))).mode & 0o777, 0o600);

  const conversation = await request(baseUrl, "/api/conversations/conversation%3Atest-1", {
    method: "PUT",
    body: JSON.stringify({ locale: "zh-CN", messages: [{ role: "user", text: "不要保存我的音频" }, { role: "assistant", text: "只保存文字记录" }] }),
  });
  assert.equal(conversation.response.status, 200);
  const recent = await request(baseUrl, "/api/conversations/recent");
  assert.equal(recent.body.entries[0].messages[1].text, "只保存文字记录");
  assert.equal((await stat(join(dataDir, "conversation-ledger.json"))).mode & 0o777, 0o600);

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
