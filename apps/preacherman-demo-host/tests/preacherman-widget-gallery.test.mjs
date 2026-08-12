import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "preacherman", "PreachermanWidgetGallery.tsx");
const stylesPath = join(packageRoot, "src", "preacherman", "PreachermanWidgetGallery.css");

async function loadGallery(t) {
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-preacherman-widget-gallery-"));
  const outputPath = join(temporaryDirectory, "gallery.mjs");
  const source = (await readFile(componentPath, "utf8")).replace(/^import "\.\/PreachermanWidgetGallery\.css";\r?\n/m, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await writeFile(outputPath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(outputPath).href}?${Date.now()}`);
}

function widget(id = "task-card") {
  return {
    id,
    pluginId: "demo-plugin",
    revision: 2,
    phase: "ready",
    placement: "work",
    enabled: true,
    error: null,
    permissions: { requested: [], granted: [], missing: [] },
    manifest: { title: "Task card", description: "Current work", placement: "work", permissions: [], version: "1.1.0" },
    schema: {
      type: "container",
      orientation: "vertical",
      gap: 8,
      children: [
        { type: "text", text: "<script>alert(1)</script>", variant: "body", tone: "primary" },
        { type: "metric", label: "Tasks", value: 3, tone: "success" },
        { type: "progress", label: "Done", value: 0.5 },
        { type: "button", label: "Open", action: { type: "emit", event: "open-task" } },
      ],
    },
  };
}

test("loads, validates, and filters widgets through only the injected GET request", async (t) => {
  const { loadPreachermanWidgets } = await loadGallery(t);
  const calls = [];
  const result = await loadPreachermanWidgets(async (path, init) => {
    calls.push([path, init]);
    return { widgets: [widget("z-card"), widget("a-card")] };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/widgets");
  assert.equal(calls[0][1].method, "GET");
  assert.deepEqual(result.map(({ id }) => id), ["a-card", "z-card"]);
  assert.equal(result[0].schema.children[3].action.event, "open-task");

  const legacy = widget("legacy-card");
  delete legacy.placement;
  delete legacy.enabled;
  delete legacy.error;
  delete legacy.permissions;
  delete legacy.manifest.permissions;
  const [migrated] = await loadPreachermanWidgets(async () => ({ widgets: [legacy] }));
  assert.equal(migrated.placement, "work");
  assert.equal(migrated.enabled, true);
  assert.deepEqual(migrated.permissions.missing, []);

  const settingsOnly = await loadPreachermanWidgets(async () => ({
    widgets: [{ ...widget("settings-card"), placement: "settings" }, widget("work-card")],
  }), { placement: "settings" });
  assert.deepEqual(settingsOnly.map(({ id }) => id), ["settings-card"]);
});

test("rejects invalid and executable-looking response shapes before rendering", async (t) => {
  const { loadPreachermanWidgets } = await loadGallery(t);
  await assert.rejects(loadPreachermanWidgets(async () => ({ widgets: [{ ...widget(), schema: { type: "script", source: "alert(1)" } }] })), /Unsupported widget node/);
  await assert.rejects(loadPreachermanWidgets(async () => ({ widgets: [{ ...widget(), schema: { type: "button", label: "Run", action: { type: "javascript", event: "run" } } }] })), /button action is invalid/);
  await assert.rejects(loadPreachermanWidgets(async () => ({ widgets: [{ ...widget(), placement: "global" }] })), /placement is invalid/);
  await assert.rejects(loadPreachermanWidgets(async () => ({ widgets: null })), /invalid response/);
});

test("recursive renderer escapes text and emits only through the supplied local callback", async (t) => {
  const { PreachermanWidgetSchemaRenderer } = await loadGallery(t);
  const emitted = [];
  const markup = renderToStaticMarkup(createElement(PreachermanWidgetSchemaRenderer, { node: widget().schema, onEmit: (event) => emitted.push(event) }));
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /<progress[^>]*value="0\.5"[^>]*>/);
  assert.match(markup, /<button[^>]*type="button"/);
  assert.deepEqual(emitted, []);
});

test("card renders permission, disabled, and error states without mounting actions", async (t) => {
  const { PreachermanWidgetCard } = await loadGallery(t);
  const permission = {
    ...widget("secure-card"), phase: "permission-required", placement: "settings",
    permissions: { requested: ["ledger:read"], granted: [], missing: ["ledger:read"] },
  };
  const permissionMarkup = renderToStaticMarkup(createElement(PreachermanWidgetCard, { locale: "en", widget: permission }));
  assert.match(permissionMarkup, /data-placement="settings"/);
  assert.match(permissionMarkup, /Host permission is required/);
  assert.match(permissionMarkup, /ledger:read/);
  assert.doesNotMatch(permissionMarkup, /<button/);

  const disabledMarkup = renderToStaticMarkup(createElement(PreachermanWidgetCard, { locale: "en", widget: { ...widget("disabled-card"), phase: "disabled", enabled: false } }));
  assert.match(disabledMarkup, /aria-disabled="true"/);
  assert.match(disabledMarkup, /disabled by the host/);

  const errorMarkup = renderToStaticMarkup(createElement(PreachermanWidgetCard, { locale: "en", widget: { ...widget("error-card"), phase: "error", error: "Adapter unavailable" } }));
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Adapter unavailable/);
});

test("gallery is bilingual, has complete runtime states, and never executes widget code", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /Widget gallery/);
  assert.match(source, /组件展廊/);
  assert.match(source, /Loading widgets/);
  assert.match(source, /正在加载小组件/);
  assert.match(source, /No Preacherman widgets are registered/);
  assert.match(source, /目前还没有注册 Preacherman 小组件/);
  assert.match(source, /data-state="error"/);
  assert.match(source, /setRequestRevision/);
  assert.match(source, /No plugin action was executed/);
  assert.match(source, /没有执行任何插件操作/);
  assert.match(source, /setEmitted/);
  for (const placement of ["home", "work", "lab", "gallery", "ledger", "settings"]) assert.match(source, new RegExp(placement));
  for (const state of ["loading", "permission-required", "disabled", "error"]) assert.match(source, new RegExp(state));
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\beval\s*\(|new Function|\.innerHTML\s*=/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("independent CSS covers both appearances and every runtime state with semantic colors", async () => {
  const styles = await readFile(stylesPath, "utf8");
  assert.match(styles, /html\[data-appearance="light"\]/);
  assert.match(styles, /html\[data-appearance="dark"\]/);
  for (const token of ["text", "muted", "border", "border-strong", "surface", "surface-elevated", "focus", "loading", "error", "control-hover", "control-hover-bg"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  for (const state of ["loading", "permission-required", "disabled", "error"]) assert.match(styles, new RegExp(state));
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /\brgba?\(/i);
  assert.doesNotMatch(styles, /\b(?:white|black|red|blue|green)\b/i);
});
