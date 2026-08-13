import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "ab", "PreachermanAgentWorkspace.tsx");
const stylesPath = join(packageRoot, "src", "ab", "preacherman-agent-workspace.css");

async function loadWorkspace(t) {
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-preacherman-agent-workspace-"));
  const outputPath = join(temporaryDirectory, "workspace.mjs");
  const source = (await readFile(componentPath, "utf8")).replace(/^import "\.\/preacherman-agent-workspace\.css";\r?\n/m, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await writeFile(outputPath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(outputPath).href}?${Date.now()}`);
}

const catalog = {
  agents: [{
    id: "preacherman-native", label: "Preacherman Native", status: "ready", description: "Native execution",
    providers: [{ id: "deepseek", label: "DeepSeek", status: "ready", models: [{ id: "deepseek-chat", label: "DeepSeek Chat", status: "ready", verified: true }] }],
  }],
  workspaces: [{ id: "workspace-1", label: "Preacherman", path: "D:\\preacherman" }],
};

test("loads and strictly validates the dynamic Agent, Provider, Model and workspace catalog", async (t) => {
  const { loadAgentWorkspaceCatalog } = await loadWorkspace(t);
  const calls = [];
  const result = await loadAgentWorkspaceCatalog(async (path) => { calls.push(path); return catalog; });
  assert.deepEqual(calls, ["/api/agent-workspace/catalog"]);
  assert.equal(result.agents[0].providers[0].models[0].verified, true);
  assert.equal(result.workspaces[0].id, "workspace-1");
  await assert.rejects(loadAgentWorkspaceCatalog(async () => ({ agents: [{ ...catalog.agents[0], status: "pretend-ready" }], workspaces: [] })), /status is invalid/);
  await assert.rejects(loadAgentWorkspaceCatalog(async () => ({ agents: [], workspaces: null })), /catalog is incomplete/);
});

test("submits only stable IDs, locale, approval policy and an allowlisted workspace ID", async (t) => {
  const { submitAgentWorkspaceTurn } = await loadWorkspace(t);
  const calls = [];
  const result = await submitAgentWorkspaceTurn(async (path, init) => {
    calls.push({ path, init });
    return { displayText: "I prepared a task proposal.", proposal: { proposalId: "proposal-1", objective: "Inspect the repository", executor: "preacherman-native", inputs: ["workspace"], outputs: ["report"] } };
  }, { text: "  Inspect the repository  ", locale: "en", agentId: "preacherman-native", providerId: "deepseek", modelId: "deepseek-chat", policy: "ask", workspaceId: "workspace-1" });
  assert.equal(result.proposal.objective, "Inspect the repository");
  assert.equal(calls[0].path, "/api/agent-workspace/turn");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    input: "Inspect the repository", locale: "en",
    selection: { agentId: "preacherman-native", providerId: "deepseek", modelId: "deepseek-chat" },
    policy: "ask", workspaceId: "workspace-1",
  });
  await assert.rejects(submitAgentWorkspaceTurn(async () => ({}), { text: "Do it", locale: "en", agentId: "a", providerId: "p", modelId: "m", policy: "strict" }), /no displayable result/);
});

test("TaskRun and Artifact parsing rejects fabricated success or malformed server output", async (t) => {
  const { parseAgentWorkspaceTask } = await loadWorkspace(t);
  const task = parseAgentWorkspaceTask({ task: { taskId: "task-1", objective: "Create a report", status: "succeeded", events: [{ stage: "complete", message: "Stored" }], artifacts: [{ artifactId: "artifact-1", name: "report.md", mediaType: "text/markdown" }] } });
  assert.equal(task.status, "succeeded");
  assert.equal(task.artifacts[0].artifactId, "artifact-1");
  assert.throws(() => parseAgentWorkspaceTask({ task: { taskId: "task-1", objective: "Bad", status: "success-ish" } }), /status is invalid/);
  assert.throws(() => parseAgentWorkspaceTask({ task: { taskId: "task-1", objective: "Bad", status: "succeeded", artifacts: [{ name: "missing-id" }] } }), /Artifact id is missing/);
});

test("component owns free input and configuration, but does not duplicate approval, retry or steer controls", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /<textarea[\s\S]*maxLength=\{8_000\}/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /AgentWorkspacePolicy/);
  assert.match(source, /catalog\.agents\.map/);
  assert.match(source, /selectedAgent\?\.providers\.map/);
  assert.match(source, /selectedProvider\?\.models\.map/);
  assert.match(source, /JSON\.stringify\(\{ type: "cancel" \}\)/);
  assert.match(source, /File upload is not available yet/);
  assert.doesNotMatch(source, /type="file"|FileReader|createObjectURL/);
  assert.match(source, /JSON\.stringify\(\{ type: "approve", approvalId: proposal\.approvalId \}\)/);
  assert.doesNotMatch(source, /type: "(?:reject|retry|steer|resume)"/);
  assert.doesNotMatch(source, /name="(?:command|args|executable|apiKey|token|secret)"/i);
});

test("component provides bilingual loading, empty, error, disabled, proposal, TaskRun and Artifact states", async () => {
  const source = await readFile(componentPath, "utf8");
  for (const phrase of [
    "What would you like to work on?", "你想完成什么？", "Loading available Agents", "正在加载可用 Agent",
    "No Agent configuration", "本地服务尚未返回", "Execution options could not be loaded", "无法加载执行选项",
    "Proposal", "任务提案", "TaskRun", "Artifacts", "产物", "disabled={!canSend}", "role=\"alert\"", "aria-live=\"polite\"",
  ]) assert.match(source, new RegExp(phrase));
  assert.match(source, /configuration-required/);
  assert.match(source, /login-required/);
  assert.match(source, /external-runtime-required/);
  assert.match(source, /onOpenSettings/);
  assert.match(source, /onOpenTask/);
  assert.match(source, /onOpenArtifact/);
});

test("standalone styles honor semantic Light and Dark variables and accessible interaction states", async () => {
  const styles = await readFile(stylesPath, "utf8");
  for (const token of [
    "text", "muted", "border", "border-strong", "surface", "surface-elevated", "focus", "loading", "error",
    "control-hover-bg", "activate-rest-text", "activate-rest-bg", "activate-fill", "activate-fill-text",
  ]) assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /button:disabled/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /(?:rgb|hsl)a?\(/i);
});
