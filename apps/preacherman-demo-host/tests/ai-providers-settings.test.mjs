import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");

test("AI Providers distills the configuration surface to four necessary entry points", async () => {
  const component = await readFile(join(hostRoot, "src", "settings", "AIProvidersSettings.tsx"), "utf8");
  for (const tab of ["providers", "credentials", "routing", "local"]) {
    assert.match(component, new RegExp(`${tab}:`));
  }
  assert.doesNotMatch(component, /tab === "usage"|tab === "about"/);
  assert.doesNotMatch(component, /ai-provider-settings__provider-card/);
  assert.doesNotMatch(component, /Provider overview|Service endpoint|Adapter package|Configuration tips/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /aria-selected=\{tab === id\}/);
  assert.match(component, /aria-pressed=\{selectedId === id\}/);
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
  assert.match(component, /data-secret="true"/);
  assert.match(component, /autoComplete="new-password"/);
  assert.match(component, /setDeepseekKey\(""\)/);
  assert.match(component, /setDashscopeKey\(""\)/);
  assert.doesNotMatch(component, /setDeepseekKey\([^)]*(?:response|settings)/);
  assert.doesNotMatch(component, /setDashscopeKey\([^)]*(?:response|settings)/);
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
