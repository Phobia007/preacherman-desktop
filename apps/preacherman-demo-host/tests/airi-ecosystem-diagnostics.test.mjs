import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "airi", "AiriEcosystemDiagnostics.tsx");
const stylesPath = join(packageRoot, "src", "airi", "airi-ecosystem-diagnostics.css");

async function loadDiagnostics(t) {
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-airi-diagnostics-"));
  const outputPath = join(temporaryDirectory, "diagnostics.mjs");
  const source = (await readFile(componentPath, "utf8")).replace(/^import "\.\/airi-ecosystem-diagnostics\.css";\r?\n/m, "");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  await writeFile(outputPath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(outputPath).href}?${Date.now()}`);
}

test("injected service request completes all five checks and returns real IDs", async (t) => {
  const { runAiriEcosystemDiagnostics } = await loadDiagnostics(t);
  const calls = [];
  const statuses = [];
  const responses = new Map([
    ["/api/health", { ok: true }],
    ["/api/airi/kits", { kits: [{ name: "tools" }], bindings: [{ operation: "call" }] }],
    ["/api/mcp/tools", { tools: [{ name: "preacherman::preacherman_runtime_status" }] }],
    ["/api/plugins/tools", { tools: [{ name: "preacherman-runtime::task_summary" }] }],
    ["/api/plugins/tools/call", { result: { isError: false, task: {
      taskId: "plugin_demo",
      status: "completed",
      artifact: { name: "task_summary-result.json", path: "/api/tasks/plugin_demo/artifact" },
    } } }],
  ]);
  const result = await runAiriEcosystemDiagnostics(async (path, init) => {
    calls.push(path);
    if (path === "/api/plugins/tools/call") {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { name: "preacherman-runtime::task_summary", arguments: {} });
    }
    return responses.get(path);
  }, (index, status) => statuses.push([index, status]));

  assert.deepEqual(calls, [...responses.keys()]);
  assert.deepEqual(result.steps.map((step) => step.status), ["pass", "pass", "pass", "pass", "pass"]);
  assert.equal(result.taskRunId, "plugin_demo");
  assert.equal(result.artifactId, "/api/tasks/plugin_demo/artifact");
  assert.equal(statuses.filter(([, status]) => status === "running").length, 5);
});

test("injected request failures remain failed while later checks still run", async (t) => {
  const { runAiriEcosystemDiagnostics } = await loadDiagnostics(t);
  const calls = [];
  const result = await runAiriEcosystemDiagnostics(async (path) => {
    calls.push(path);
    if (path === "/api/health") return { ok: false };
    if (path === "/api/airi/kits") return { kits: null, bindings: [] };
    if (path === "/api/mcp/tools") throw new Error("MCP offline");
    if (path === "/api/plugins/tools") return { tools: [] };
    return { result: { isError: true } };
  });

  assert.deepEqual(calls, [
    "/api/health",
    "/api/airi/kits",
    "/api/mcp/tools",
    "/api/plugins/tools",
    "/api/plugins/tools/call",
  ]);
  assert.deepEqual(result.steps.map((step) => step.status), ["fail", "fail", "fail", "fail", "fail"]);
  assert.equal(result.taskRunId, "");
  assert.equal(result.artifactId, "");
  assert.match(result.steps[2].detail, /MCP offline/);
});

test("ecosystem diagnostics call the real local APIs in strict order", async () => {
  const source = await readFile(componentPath, "utf8");
  const orderedPaths = [
    'requestJson(serviceRequest, "/api/health")',
    'requestJson(serviceRequest, "/api/airi/kits")',
    'requestJson(serviceRequest, "/api/mcp/tools")',
    'requestJson(serviceRequest, "/api/plugins/tools")',
    'requestJson(serviceRequest, "/api/plugins/tools/call"',
  ];
  let previous = -1;
  for (const path of orderedPaths) {
    const index = source.indexOf(path);
    assert.ok(index > previous, `${path} must run after the preceding ecosystem check`);
    previous = index;
  }
  assert.match(source, /preacherman-runtime::task_summary/);
  assert.match(source, /serviceRequest<unknown>\(path, init\)/);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /localServiceUrl/);
  assert.match(source, /emit\(index, "running"\)/);
  assert.match(source, /emit\(index, "pass"/);
  assert.match(source, /emit\(index, "fail"/);
  assert.match(source, /taskRunId = task\.taskId/);
  assert.match(source, /artifactId = artifact\.path/);
});

test("diagnostics are bilingual, rerunnable, and use only semantic theme colors", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(source, /Ecosystem diagnostics/);
  assert.match(source, /生态一键诊断/);
  assert.match(source, /Run again/);
  assert.match(source, /重新诊断/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /data-status=\{step\.status\}/);
  assert.match(styles, /var\(--demo-theme-text\)/);
  assert.match(styles, /var\(--demo-theme-surface-elevated\)/);
  assert.match(styles, /var\(--demo-theme-loading\)/);
  assert.match(styles, /var\(--demo-theme-error\)/);
  assert.match(styles, /var\(--demo-theme-focus\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /\brgba?\(/i);
});
