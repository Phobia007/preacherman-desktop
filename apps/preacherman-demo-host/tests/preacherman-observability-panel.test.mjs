import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const panelPath = join(packageRoot, "src", "preacherman", "PreachermanObservabilityPanel.tsx");
const stylePath = join(packageRoot, "src", "preacherman", "preacherman-observability-panel.css");

async function loadPanelModule() {
  const result = await build({
    bundle: true,
    entryPoints: [panelPath],
    format: "esm",
    platform: "node",
    target: "node22",
    outdir: "out",
    write: false,
  });
  const javascript = result.outputFiles.find((file) => file.path.endsWith(".js"));
  assert.ok(javascript, "observability panel bundle must include JavaScript");
  return import(`data:text/javascript;base64,${Buffer.from(javascript.text).toString("base64")}`);
}

test("observability helper loads the aggregated runtime snapshot from its real endpoint", async () => {
  const { loadPreachermanObservability } = await loadPanelModule();
  const calls = [];
  const response = {
    plugins: [],
    traces: [],
    activity: [],
    diagnostics: { traceCount: 0, failureCount: 0, averageDurationMs: 0, pluginErrorCount: 0, recentFailures: [] },
  };
  const serviceRequest = async (path, init) => { calls.push({ path, init }); return response; };
  assert.deepEqual(await loadPreachermanObservability(serviceRequest), response);
  assert.deepEqual(calls, [{ path: "/api/observability", init: undefined }]);
  await assert.rejects(loadPreachermanObservability(async () => ({ plugins: [] })), /missing history collections/);
});

test("observability panel exposes inspector, IO trace, diagnostics, and lifecycle activity in both languages", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /data-preacherman-control="runtime\.plugin-inspector runtime\.io-tracer plugin\.activity"/);
  assert.match(panel, /Plugin Inspector/);
  assert.match(panel, /插件检查器/);
  assert.match(panel, /IO Trace/);
  assert.match(panel, /IO 追踪/);
  assert.match(panel, /Plugin activity/);
  assert.match(panel, /插件活动/);
  assert.match(panel, /plugin\.manifest/);
  assert.match(panel, /plugin\.phase/);
  assert.match(panel, /plugin\.revision/);
  assert.match(panel, /plugin\.kits/);
  assert.match(panel, /plugin\.bindings/);
  assert.match(panel, /plugin\.tools/);
  assert.match(panel, /plugin\.error/);
  assert.match(panel, /trace\.caller} → \{trace\.target/);
  assert.match(panel, /trace\.durationMs/);
  assert.match(panel, /trace\.status/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /aria-live="polite"/);
});

test("observability panel uses semantic light and dark theme tokens without hard-coded colors", async () => {
  const [panelStyles, themeStyles] = await Promise.all([
    readFile(stylePath, "utf8"),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);
  for (const token of ["surface", "surface-elevated", "text", "muted", "border", "border-strong", "focus", "loading", "error"]) {
    assert.match(panelStyles, new RegExp(`var\\(--demo-theme-${token}\\)`));
    assert.match(themeStyles, new RegExp(`--demo-theme-${token}:`));
  }
  assert.match(themeStyles, /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-surface:/);
  assert.match(panelStyles, /button:focus-visible[\s\S]*var\(--demo-theme-focus\)/);
  assert.doesNotMatch(panelStyles, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
});
