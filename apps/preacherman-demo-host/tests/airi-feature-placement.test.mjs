import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("AIRI controls have one explicit Preacherman surface placement", async () => {
  const [registry, panel, panelStyles, app, styles] = await Promise.all([
    readFile(join(packageRoot, "src", "airi", "featurePlacement.ts"), "utf8"),
    readFile(join(packageRoot, "src", "airi", "AiriFeaturePanel.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "airi", "airi-feature-panel.css"), "utf8"),
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "styles.css"), "utf8"),
  ]);

  for (const surface of ["home", "workspace", "lab", "market", "test", "ledger", "settings"]) {
    assert.match(registry, new RegExp(`surface: "${surface}"`));
  }
  assert.match(registry, /presentation\.stop/);
  assert.match(registry, /task\.cancel/);
  assert.match(registry, /presentation\.diagnostics/);
  assert.match(registry, /memory\.recall/);
  assert.match(registry, /voice\.providers/);
  assert.match(registry, /status: AiriFeatureStatus/);
  assert.match(app, /activeSurfaceType === "workspace"[\s\S]*workspaceContent/);
  assert.match(app, /activeSurfaceType === "lab"[\s\S]*labContent/);
  assert.match(app, /<AiriFeaturePanel locale=\{preferences\.locale\} surface=\{airiPanelSurface\}/);
  assert.match(panel, /onClick=\{\(\) => setSelectedId\(candidate\.id\)\}/);
  assert.match(panel, /Connected in this demo/);
  assert.match(panel, /UI ready · runtime connection follows/);
  assert.match(panelStyles, /var\(--demo-theme-text\)/);
  assert.match(panelStyles, /var\(--demo-theme-surface-elevated\)/);
  assert.match(panelStyles, /var\(--demo-theme-focus\)/);
  assert.doesNotMatch(panelStyles, /#[0-9a-f]{3,8}\b/i);
  assert.match(styles, /demo-airi-lab__intro/);
  assert.match(styles, /\.demo-app-viewport > \.demo-app-shell[\s\S]*?left: 50%;[\s\S]*?translate\(-50%, -50%\) scale/);
  assert.match(styles, /\.demo-settings[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(styles, /\.demo-ledger[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.doesNotMatch(styles.match(/\.demo-airi-lab__intro[\s\S]*?\.demo-app-shell/)?.[0] ?? "", /#[0-9a-f]{3,8}\b/i);
});
