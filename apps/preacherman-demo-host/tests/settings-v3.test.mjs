import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { transform } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const hostRoot = join(import.meta.dirname, "..");
const componentPath = join(hostRoot, "src", "settings", "SettingsScreen.tsx");

test("Settings renders the sixteen requested names in order without changing configuration", async () => {
  const source = await readFile(componentPath, "utf8");
  const { code } = await transform(source, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const nativeRequire = createRequire(import.meta.url);
  const context = { exports: {}, module: { exports: {} }, require: (id) => id.endsWith(".css") ? {} : nativeRequire(id) };
  vm.runInNewContext(code, context);
  for (const appearance of ["light", "dark"]) {
    for (const locale of ["en", "zh-CN"]) {
      const html = renderToStaticMarkup(createElement(context.module.exports.SettingsScreen, { appearance, locale }));
      assert.ok(html.includes(locale === "zh-CN" ? 'aria-label="设置"' : 'aria-label="Settings"'));
      assert.ok(html.includes('data-settings-state="framing"'));
      assert.equal((html.match(/<button/g) ?? []).length, 16);
      assert.equal((html.match(/disabled=""/g) ?? []).length, 16);
      const names = ["Execution Mode", "Instructions / Rules", "Memory", "Media Providers", "External MCP", "Connectors", "MCP Servers", "Language", "Appearance", "Design Council", "Notifications", "Pets", "Design System", "Project Location", "Privacy", "About"];
      let previous = -1;
      for (const name of names) {
        const at = html.indexOf(name);
        assert.ok(at > previous, name);
        previous = at;
      }
    }
  }
});

test("Settings only selects locally; no legacy artwork, details or saved configuration writes", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.doesNotMatch(source, /fetch\(|attachShadow|mountLocalPortfolio|settings-v3-local|settings-v3\.css/);
  assert.doesNotMatch(source, /<img|<video|<iframe|<AIProvidersSettings|<canvas/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|setPreferences|serviceRequest/);
  assert.match(source, /onClick=\{\(\) => setSelected\(label\)\}/);
  assert.match(source, /window.clearTimeout\(timer\)/);
  const app = await readFile(join(hostRoot, "src", "App.tsx"), "utf8");
  assert.match(app, /activeSurfaceType === "settings"[\s\S]*<SettingsScreen/);
});

test("Settings reuses Gallery portrait and starts a bounded top-to-bottom wave after framing", async () => {
  const app = await readFile(join(hostRoot, "src", "App.tsx"), "utf8");
  const source = await readFile(componentPath, "utf8");
  const css = await readFile(join(hostRoot, "src", "settings", "settings-menu.css"), "utf8");
  assert.match(app, /activeSurfaceType === "market" \|\| activeSurfaceType === "settings" \? "portrait" : "full-body"/);
  assert.match(source, /reducedMotion.matches \? 0 : 650/);
  assert.match(css, /var\(--settings-order\) \* 35ms/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /font-family: "Clash Display"/);
  assert.match(css, /var\(--demo-theme-brand-menu-text\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /gap: 18px/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /::-webkit-scrollbar/);
});

test("configuration components and reference artwork remain recoverable for the redesign", async () => {
  for (const file of ["AIProvidersSettings.tsx", "NativeAgentSettings.tsx", "McpSettings.tsx", "AgentAccessSettings.tsx", "PluginSettings.tsx"]) {
    assert.ok((await readFile(join(hostRoot, "src", "settings", file), "utf8")).length > 100);
  }
  assert.ok((await readFile(join(hostRoot, "public", "settings-v3-local", "index.html"), "utf8")).length > 100_000);
});
