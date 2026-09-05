import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");

test("AI Providers keeps presets and credentials in one inline flow", async () => {
  const component = await readFile(join(hostRoot, "src", "settings", "AIProvidersSettings.tsx"), "utf8");
  assert.match(component, /<ProviderPresetSelector/);
  assert.match(component, /<ApiKeyInput/);
  assert.doesNotMatch(component, /role="tablist"|tab === "credentials"/);
  assert.match(component, /<details className="ai-provider-settings__advanced">/);
  assert.match(component, /saveCredentials\(true\)/);
  assert.match(component, /saveCredentials\(false\)/);
  assert.match(component, /testSelectedProvider/);
  assert.match(component, /saveCredentials/);
  assert.match(component, /verifyPort/);
});

test("AI Providers reads and writes the existing real local-service contract without rehydrating secrets", async () => {
  const component = await readFile(join(hostRoot, "src", "settings", "AIProvidersSettings.tsx"), "utf8");
  assert.match(component, /"\/api\/providers\/catalog"/);
  assert.match(component, /"\/api\/settings\/providers"/);
  assert.match(component, /`\/api\/providers\/\$\{encodeURIComponent\(selectedId\)\}\/test`/);
  assert.match(component, /method: "PUT"/);
  const input = await readFile(join(hostRoot, "src", "settings", "cc-switch", "ApiKeyInput.tsx"), "utf8");
  assert.match(input, /data-secret="true"/);
  assert.match(input, /autoComplete="new-password"/);
  assert.match(component, /setDeepseekKey\(""\)/);
  assert.match(component, /setDashscopeKey\(""\)/);
  assert.doesNotMatch(component, /setDeepseekKey\([^)]*(?:response|settings)/);
  assert.doesNotMatch(component, /setDashscopeKey\([^)]*(?:response|settings)/);
});

test("AI Providers retains the original outer divider and guards save/test sequencing", async () => {
  const component = await readFile(join(hostRoot, "src", "settings", "AIProvidersSettings.tsx"), "utf8");
  const styles = await readFile(join(hostRoot, "src", "settings", "ai-providers-settings.css"), "utf8");
  const shell = await readFile(join(hostRoot, "src", "settings", "settings-v3.css"), "utf8");
  assert.match(shell, /grid-template-columns: minmax\(320px, 36.5%\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /\.settings-v3__detail-blank|\.settings-v3__back\s*\{/);
  assert.match(component, /operation\.current = true/);
  assert.match(component, /if \(testAfterSave\)/);
  assert.match(component, /savedTestFailed/);
  assert.match(component, /AbortSignal.timeout\(15000\)/);
  assert.match(component, /setSettings\(status\)/);
});

test("AI Providers uses semantic settings tokens for both appearance modes", async () => {
  const [styles, theme] = await Promise.all([
    readFile(join(hostRoot, "src", "settings", "ai-providers-settings.css"), "utf8"),
    readFile(join(hostRoot, "src", "styles.css"), "utf8"),
  ]);
  for (const token of ["canvas", "text", "muted", "border", "surface", "hover", "focus", "loading", "error", "accent", "accent-text", "success"]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-settings-${token}\\)`));
  }
  assert.match(theme, /data-appearance="dark"[\s\S]*--demo-theme-settings-accent:/);
  assert.match(theme, /--demo-theme-settings-success:/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
