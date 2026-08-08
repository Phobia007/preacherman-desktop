import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

async function loadFeaturePlacement() {
  const result = await build({
    bundle: true,
    entryPoints: [join(packageRoot, "src", "airi", "featurePlacement.ts")],
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

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
  const featureIds = [...registry.matchAll(/feature\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(featureIds.length >= 120, `expected the complete AIRI catalog, received ${featureIds.length}`);
  assert.equal(new Set(featureIds).size, featureIds.length, "each AIRI capability must have one placement");
  assert.match(registry, /presentation\.stop/);
  assert.match(registry, /task\.cancel/);
  assert.match(registry, /presentation\.diagnostics/);
  assert.match(registry, /memory\.recall/);
  assert.match(registry, /voice\.providers/);
  assert.match(registry, /computer-use\.desktop/);
  assert.match(registry, /game\.minecraft/);
  assert.match(registry, /avatar\.live2d-import/);
  assert.match(registry, /agent\.mcp-tools/);
  assert.match(registry, /connection\.telegram/);
  assert.match(registry, /provider\.amazon-bedrock/);
  assert.match(registry, /status: AiriFeatureStatus/);
  assert.match(app, /activeSurfaceType === "workspace"[\s\S]*workspaceContent/);
  assert.match(app, /activeSurfaceType === "lab"[\s\S]*labContent/);
  assert.match(app, /<AiriFeaturePanel[\s\S]*onActivate=\{handleAiriFeatureActivate\}[\s\S]*surface=\{airiPanelSurface\}/);
  assert.match(panel, /onActivate\(candidate\.id\)/);
  assert.match(panel, /loadAiriCapabilityStatuses/);
  assert.match(panel, /Backend available/);
  assert.match(panel, /External runtime required/);
  assert.match(panel, /placement\.features\.length/);
  assert.match(panelStyles, /var\(--demo-theme-text\)/);
  assert.match(panelStyles, /var\(--demo-theme-surface-elevated\)/);
  assert.match(panelStyles, /var\(--demo-theme-focus\)/);
  assert.doesNotMatch(panelStyles, /#[0-9a-f]{3,8}\b/i);
  assert.match(styles, /demo-airi-lab__intro/);
  assert.match(styles, /demo-airi-test__intro/);
  assert.match(styles, /\.demo-app-viewport > \.demo-app-shell[\s\S]*?left: 50%;[\s\S]*?translate\(-50%, -50%\) scale/);
  assert.match(styles, /\.demo-settings[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(styles, /\.demo-ledger[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.doesNotMatch(styles.match(/\.demo-airi-lab__intro[\s\S]*?\.demo-app-shell/)?.[0] ?? "", /#[0-9a-f]{3,8}\b/i);
});

test("each surface has one commercial task hierarchy with no orphaned capability", async () => {
  const { airiFeaturePlacements } = await loadFeaturePlacement();
  for (const placement of airiFeaturePlacements) {
    assert.equal(placement.sections[0].kind, "primary", `${placement.surface} must begin with its primary task`);
    const featureIds = placement.features.map((feature) => feature.id);
    const sectionIds = placement.sections.flatMap((section) => section.featureIds);
    assert.equal(new Set(sectionIds).size, sectionIds.length, `${placement.surface} groups must not duplicate capabilities`);
    assert.deepEqual(new Set(sectionIds), new Set(featureIds), `${placement.surface} groups must include every capability`);
  }
});

test("live AIRI buttons focus controls and every button checks its backend adapter", async () => {
  const [app, panel, client, service, voice, task, gallery, model, settings, ledger] = await Promise.all([
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "airi", "AiriFeaturePanel.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "airi", "capabilityClient.ts"), "utf8"),
    readFile(join(packageRoot, "server", "preachermanServer.mjs"), "utf8"),
    readFile(join(packageRoot, "src", "realtime", "VoiceSessionControl.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "ab", "ABTaskConsole.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "gallery", "CortanaGallery.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "gallery", "CortanaModelStage.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "settings", "SettingsScreen.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "conversation", "ConversationLedgerScreen.tsx"), "utf8"),
  ]);

  assert.match(app, /querySelectorAll<HTMLElement>\("\[data-airi-control\]"\)/);
  assert.match(app, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /findAiriFeature\(featureId\)\?\.target/);
  assert.match(panel, /invokeAiriCapability\(candidate\.id, surface, locale\)/);
  assert.match(panel, /candidateSection\.kind === "extension" \|\| candidateSection\.kind === "system"/);
  assert.match(panel, /<details className="demo-airi-panel__section/);
  assert.match(panel, /data-priority=\{priority\}/);
  assert.match(client, /\/api\/airi\/capabilities\/\$\{encodeURIComponent\(capabilityId\)\}\/invoke/);
  assert.match(panel, /event\.execution\?\.status === "succeeded"/);
  assert.match(service, /airiCapabilityMatch/);
  assert.match(service, /\/api\/airi\/events/);
  assert.match(voice, /data-airi-control="voice\.quick-input voice\.asr"/);
  assert.match(voice, /data-airi-control="presentation\.stop"/);
  assert.match(task, /data-airi-control="task\.create"/);
  assert.match(task, /data-airi-control="task\.confirm"/);
  assert.match(gallery, /data-airi-control="avatar\.select"/);
  assert.match(model, /data-airi-control="avatar\.status"/);
  assert.match(settings, /data-airi-control="appearance\.select"/);
  assert.match(settings, /data-airi-control="provider\.credentials voice\.providers"/);
  assert.match(ledger, /data-airi-control="conversation\.history"/);
});
