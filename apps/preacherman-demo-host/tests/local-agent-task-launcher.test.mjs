import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "ab", "LocalAgentTaskLauncher.tsx");
const stylesPath = join(packageRoot, "src", "ab", "local-agent-task-launcher.css");

async function loadLauncher(t) {
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-local-agent-launcher-"));
  const outputPath = join(temporaryDirectory, "launcher.mjs");
  const source = (await readFile(componentPath, "utf8")).replace(/^import "\.\/local-agent-task-launcher\.css";\r?\n/m, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await writeFile(outputPath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(outputPath).href}?${Date.now()}`);
}

const codex = {
  id: "codex-cli",
  label: "Codex CLI",
  kind: "coding-agent",
  installed: true,
  version: "0.145.0",
  auth: { state: "ready" },
  capabilities: { progress: true, cancel: true, workspaceWrite: true },
};
const workspace = { id: "workspace-demo", label: "Demo", path: "D:\\preacherman" };

test("loads the live Agent catalog and server-approved workspace list", async (t) => {
  const { loadLocalAgentLauncherOptions } = await loadLauncher(t);
  const calls = [];
  const options = await loadLocalAgentLauncherOptions(async (path) => {
    calls.push(path);
    return path.endsWith("local-agents") ? { agents: [codex] } : { workspaces: [workspace] };
  });
  assert.deepEqual(calls, ["/api/execution/local-agents", "/api/execution/workspaces"]);
  assert.equal(options.agents[0].auth.state, "ready");
  assert.equal(options.workspaces[0].id, workspace.id);
  await assert.rejects(loadLocalAgentLauncherOptions(async (path) => path.endsWith("local-agents") ? { agents: null } : { workspaces: [] }), /invalid Agent list/);
});

test("creates and starts a local Agent task with the minimal safe contract", async (t) => {
  const { createLauncherTask } = await loadLauncher(t);
  const calls = [];
  const result = await createLauncherTask(async (path, init) => {
    calls.push({ path, init });
    return path === "/api/tasks"
      ? { task: { taskId: "task-1", status: "queued" } }
      : { task: { taskId: "task-1", status: "running" } };
  }, { objective: "  Ship the demo  ", mode: "local-agent", agentId: codex.id, workspaceId: workspace.id });

  assert.equal(result.status, "running");
  assert.deepEqual(calls.map(({ path }) => path), ["/api/tasks", "/api/tasks/task-1/local-agent/start"]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { objective: "Ship the demo", source: "local-agent-runner" });
  assert.deepEqual(JSON.parse(calls[1].init.body), { agentId: codex.id, workspaceId: workspace.id, policy: "workspace-write" });
  for (const { init } of calls) {
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "content-type": "application/json" });
  }
});

test("Preacherman Local creates once and malformed success payloads are rejected", async (t) => {
  const { createLauncherTask } = await loadLauncher(t);
  const calls = [];
  const task = await createLauncherTask(async (path, init) => {
    calls.push([path, init]);
    return { task: { taskId: "task-local", status: "queued" } };
  }, { objective: "Local task", mode: "preacherman-local" });
  assert.equal(task.taskId, "task-local");
  assert.equal(calls.length, 1);
  await assert.rejects(createLauncherTask(async () => ({ ok: true }), { objective: "No fake success", mode: "preacherman-local" }), /Task service task returned an invalid response/);
});

test("markup is bilingual, accessible, and never collects unsafe process fields", async (t) => {
  const { LocalAgentTaskLauncher } = await loadLauncher(t);
  const serviceRequest = async () => ({ agents: [], workspaces: [] });
  const english = renderToStaticMarkup(createElement(LocalAgentTaskLauncher, { locale: "en", serviceRequest }));
  const chinese = renderToStaticMarkup(createElement(LocalAgentTaskLauncher, { locale: "zh-CN", serviceRequest }));
  assert.match(english, /aria-labelledby=/);
  assert.match(english, /Execution agent/);
  assert.match(english, /Checking local Agents and approved workspaces/);
  assert.match(chinese, /执行 Agent/);
  assert.match(chinese, /正在检查本地 Agent 与已批准工作目录/);

  const source = await readFile(componentPath, "utf8");
  assert.match(source, /<fieldset/);
  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /type="(?:file|password)"/i);
  assert.doesNotMatch(source, /name="(?:command|args|env|executable)"/i);
  assert.doesNotMatch(source, /<input[^>]+type="text"[^>]+workspace/i);
  assert.match(source, /JSON\.stringify\(\{ agentId: input\.agentId, workspaceId: input\.workspaceId, policy: "workspace-write" \}\)/);
});

test("standalone styles use the Demo Host theme contract in both appearance modes", async () => {
  const styles = await readFile(stylesPath, "utf8");
  for (const token of [
    "--demo-theme-text",
    "--demo-theme-muted",
    "--demo-theme-border",
    "--demo-theme-focus",
    "--demo-theme-loading",
    "--demo-theme-error",
    "--demo-theme-surface",
    "--demo-theme-surface-elevated",
    "--demo-theme-control-hover-bg",
    "--demo-theme-activate-fill",
  ]) assert.match(styles, new RegExp(token));
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /(?:rgb|hsl)a?\(/i);
});
