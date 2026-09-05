import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { transform } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";

const hostRoot = join(import.meta.dirname, "..");
const componentPath = join(hostRoot, "src", "settings", "SettingsScreen.tsx");

test("Settings renders an empty named surface in both appearances and languages", async () => {
  const source = await readFile(componentPath, "utf8");
  const { code } = await transform(source, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const context = { exports: {}, module: { exports: {} }, require: createRequire(import.meta.url) };
  vm.runInNewContext(code, context);
  for (const appearance of ["light", "dark"]) {
    for (const locale of ["en", "zh-CN"]) {
      const node = context.module.exports.SettingsScreen({ appearance, locale, requestedControl: "provider.credentials" });
      assert.equal(node.type, "main");
      assert.equal(node.props["aria-label"], locale === "zh-CN" ? "设置" : "Settings");
      assert.equal(node.props["data-settings-state"], "cleared");
      assert.equal(node.props.className, "demo-host demo-host--empty");
      assert.equal(node.props.children, undefined);
    }
  }
});

test("cleared Settings does not load artwork, mount legacy controls or mutate saved configuration", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.doesNotMatch(source, /fetch\(|attachShadow|mountLocalPortfolio|settings-v3-local|settings-v3\.css/);
  assert.doesNotMatch(source, /<img|<video|<iframe|<AIProvidersSettings|<button|<canvas/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|setPreferences|serviceRequest|useEffect/);
  const app = await readFile(join(hostRoot, "src", "App.tsx"), "utf8");
  assert.match(app, /activeSurfaceType === "settings"[\s\S]*<SettingsScreen/);
});

test("configuration components and reference artwork remain recoverable for the redesign", async () => {
  for (const file of ["AIProvidersSettings.tsx", "NativeAgentSettings.tsx", "McpSettings.tsx", "AgentAccessSettings.tsx", "PluginSettings.tsx"]) {
    assert.ok((await readFile(join(hostRoot, "src", "settings", file), "utf8")).length > 100);
  }
  assert.ok((await readFile(join(hostRoot, "public", "settings-v3-local", "index.html"), "utf8")).length > 100_000);
});
