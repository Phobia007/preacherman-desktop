import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const componentFile = join(packageRoot, "src", "airi", "AiriComputerVisionPanel.tsx");
const stylesFile = join(packageRoot, "src", "airi", "airi-computer-vision-panel.css");

test("Computer/Vision panel reads status and only posts explicit adapter tests", async () => {
  const component = await readFile(componentFile, "utf8");

  assert.match(component, /serviceRequest<unknown>\("\/api\/computer-vision"\)/);
  assert.match(component, /`\/api\/computer-vision\/\$\{encodeURIComponent\(capability\)\}\/test`/);
  assert.match(component, /method: "POST"/);
  assert.match(component, /body: "\{\}"/);
  assert.doesNotMatch(component, /\/invoke|mediaDevices|getDisplayMedia|getUserMedia|navigator\./);
});

test("panel renders all four real backend phases, adapter, last test, and safe errors", async () => {
  const component = await readFile(componentFile, "utf8");

  for (const capability of ["screenshot", "camera-window", "cursor-monitor", "vision-analysis"]) {
    assert.match(component, new RegExp(`"${capability}"`));
  }
  assert.match(component, /capability\.phase/);
  assert.match(component, /capability\.adapter\?\.pluginId/);
  assert.match(component, /capability\.lastTest/);
  assert.match(component, /capability\.lastError\?\.message/);
  assert.match(component, /external-runtime-required/);
  assert.match(component, /No external adapter registered/);
  assert.match(component, /尚未注册外部适配器/);
  assert.match(component, /Computer & vision/);
  assert.match(component, /计算机与视觉/);
});

test("test control is disabled without a ready adapter and exposes accessible live state", async () => {
  const component = await readFile(componentFile, "utf8");

  assert.match(component, /const canTest = capability\.adapter !== null && capability\.phase === "ready" && testingId === null/);
  assert.match(component, /disabled=\{!canTest\}/);
  assert.match(component, /if \(!capability\.adapter \|\| capability\.phase !== "ready" \|\| testingId\) return/);
  assert.match(component, /aria-labelledby=\{titleId\}/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-busy=\{loading \|\| testingId !== null\}/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /aria-label=\{`\$\{text\.test\}: \$\{capability\.name \|\| text\.fallbackNames\[id\]\}`\}/);
});

test("standalone panel styles inherit the semantic light and dark theme contract", async () => {
  const styles = await readFile(stylesFile, "utf8");

  for (const token of [
    "text", "muted", "border", "border-strong", "surface", "surface-elevated",
    "focus", "loading", "error", "control", "control-hover-bg",
  ]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /button:disabled/);
  assert.match(styles, /data-phase="ready"/);
  assert.match(styles, /data-phase="error"/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
