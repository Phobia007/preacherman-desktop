import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const componentFile = join(packageRoot, "src", "airi", "AiriProviderConnectionsPanel.tsx");
const stylesFile = join(packageRoot, "src", "airi", "airi-provider-connections-panel.css");

test("provider connection loader reads both live service endpoints", async () => {
  const component = await readFile(componentFile, "utf8");
  assert.match(component, /Promise\.all\(\[/);
  assert.match(component, /serviceRequest<[^>]+>\("\/api\/providers\/catalog"\)/);
  assert.match(component, /serviceRequest<[^>]+>\("\/api\/connections"\)/);
  assert.match(component, /providers: asArray<ProviderSnapshot>/);
  assert.match(component, /connections: asArray<ConnectionSnapshot>/);
});

test("panel keeps incomplete and unknown connection states visibly blocked", async () => {
  const component = await readFile(componentFile, "utf8");
  assert.match(component, /function normalizeConnectionState[\s\S]*?return "error";/);
  assert.match(component, /\["ready", "configuration-required", "external-runtime-required", "adapter-required", "error"\]\.includes\(status\)/);
  assert.match(component, /\["connected", "disconnected", "testing", "connecting", "disconnecting"\]\.includes\(status\)/);
  assert.match(component, /function normalizeProviderState[\s\S]*?return "error";/);
  assert.match(component, /const state = connection \? normalizeConnectionState\(connection\.status\) : "error"/);
  assert.match(component, /const state = normalizeProviderState\(status\?\.state \|\| "error"\)/);
});

test("panel groups the complete commercial catalog with bilingual and accessible states", async () => {
  const [component, styles] = await Promise.all([readFile(componentFile, "utf8"), readFile(stylesFile, "utf8")]);
  for (const capability of ["chat", "asr", "tts", "vision", "image"]) assert.match(component, new RegExp(`"${capability}"`));
  for (const connection of ["discord", "telegram", "youtube", "minecraft", "factorio"]) assert.match(component, new RegExp(`"${connection}"`));
  for (const state of ["ready", "configuration-required", "external-runtime-required", "adapter-required", "error"]) {
    assert.match(component, new RegExp(state));
    assert.match(styles, new RegExp(`data-state=\\"${state}\\"`));
  }
  assert.match(component, /服务商与外部连接/);
  assert.match(component, /Providers & connections/);
  assert.match(component, /aria-labelledby=\{titleId\}/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /aria-busy=\{loading\}/);
  assert.match(component, /disabled=\{loading\}/);
  assert.doesNotMatch(component, /method:\s*"(?:POST|PUT|DELETE)"/);
});

test("standalone panel styles use the shared light and dark theme contract", async () => {
  const styles = await readFile(stylesFile, "utf8");
  for (const token of ["text", "muted", "border", "surface", "surface-elevated", "focus", "loading", "error", "control-hover-bg"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
