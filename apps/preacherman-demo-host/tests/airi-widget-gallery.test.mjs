import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "airi", "AiriWidgetGallery.tsx");
const stylesPath = join(packageRoot, "src", "airi", "AiriWidgetGallery.css");

async function loadGallery(t) {
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-airi-widget-gallery-"));
  const outputPath = join(temporaryDirectory, "gallery.mjs");
  const source = (await readFile(componentPath, "utf8")).replace(/^import "\.\/AiriWidgetGallery\.css";\r?\n/m, "");
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
    manifest: { title: "Task card", description: "Current work", placement: "work", version: "1.1.0" },
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

test("loads and validates widgets through only the injected GET service request", async (t) => {
  const { loadAiriWidgets } = await loadGallery(t);
  const calls = [];
  const result = await loadAiriWidgets(async (path, init) => {
    calls.push([path, init]);
    return { widgets: [widget("z-card"), widget("a-card")] };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/widgets");
  assert.equal(calls[0][1].method, "GET");
  assert.deepEqual(result.map(({ id }) => id), ["a-card", "z-card"]);
  assert.equal(result[0].schema.children[3].action.event, "open-task");
});

test("rejects invalid and executable-looking response shapes before rendering", async (t) => {
  const { loadAiriWidgets } = await loadGallery(t);
  await assert.rejects(loadAiriWidgets(async () => ({ widgets: [{ ...widget(), schema: { type: "script", source: "alert(1)" } }] })), /Unsupported widget node/);
  await assert.rejects(loadAiriWidgets(async () => ({ widgets: [{ ...widget(), schema: { type: "button", label: "Run", action: { type: "javascript", event: "run" } } }] })), /button action is invalid/);
  await assert.rejects(loadAiriWidgets(async () => ({ widgets: null })), /invalid response/);
});

test("recursive renderer escapes text and emits only through the supplied local callback", async (t) => {
  const { AiriWidgetSchemaRenderer } = await loadGallery(t);
  const emitted = [];
  const markup = renderToStaticMarkup(createElement(AiriWidgetSchemaRenderer, { node: widget().schema, onEmit: (event) => emitted.push(event) }));
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /<progress[^>]*value="0\.5"[^>]*>/);
  assert.match(markup, /<button[^>]*type="button"/);
  assert.deepEqual(emitted, []);
});

test("gallery is bilingual, has complete states, and never executes widget code", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /Widget gallery/);
  assert.match(source, /组件展廊/);
  assert.match(source, /Loading widgets/);
  assert.match(source, /正在加载小组件/);
  assert.match(source, /No AIRI widgets are registered/);
  assert.match(source, /目前还没有注册 AIRI 小组件/);
  assert.match(source, /data-state="error"/);
  assert.match(source, /setRequestRevision/);
  assert.match(source, /No plugin action was executed/);
  assert.match(source, /没有执行任何插件操作/);
  assert.match(source, /setEmitted/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\beval\s*\(|new Function|\.innerHTML\s*=/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("independent CSS statically covers light and dark appearances with semantic colors", async () => {
  const styles = await readFile(stylesPath, "utf8");
  assert.match(styles, /html\[data-appearance="light"\]/);
  assert.match(styles, /html\[data-appearance="dark"\]/);
  for (const token of ["text", "muted", "border", "border-strong", "surface", "surface-elevated", "focus", "loading", "error", "control-hover", "control-hover-bg"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /\brgba?\(/i);
  assert.doesNotMatch(styles, /\b(?:white|black|red|blue|green)\b/i);
});
