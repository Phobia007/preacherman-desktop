import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");

test("bottom navigation keeps stable keys while exposing the requested short labels", async () => {
  const source = await readFile(join(sourceRoot, "surfaces", "workspace", "BottomNavigation.tsx"), "utf8");
  for (const label of ["Home", "Work", "Lab", "Gallery", "Test", "Ledger", "Settings"]) {
    assert.match(source, new RegExp(`label:\\s*["']${label}["']`));
  }
  for (const key of ["home", "workspace", "lab", "market", "test", "ledger", "settings"]) {
    assert.match(source, new RegExp(`surfaceType:\\s*["']${key}["']`));
  }
  for (const removed of ["Workspace", "State Gallery", "Text", "Test Zone", "State Ledger"]) {
    assert.doesNotMatch(source, new RegExp(`label:\\s*["']${removed}["']`));
  }
});

test("one persistent two-line indicator accelerates and brakes between navigation labels", async () => {
  const source = await readFile(join(sourceRoot, "surfaces", "workspace", "BottomNavigation.tsx"), "utf8");
  const css = await readFile(join(sourceRoot, "surfaces", "workspace", "workspace.css"), "utf8");
  const activeRule = css.match(/\.pm-workspace__nav-item\.is-active\s*\{[^}]*\}/s)?.[0] ?? "";
  const indicatorRule = css.match(/\.pm-workspace__nav-indicator\s*\{[^}]*\}/s)?.[0] ?? "";
  const lineRule = css.match(/\.pm-workspace__nav-indicator-line\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.match(source, /activeSurfaceType/);
  assert.match(source, /aria-current=\{isActive\s*\?\s*["']page["']/);
  assert.match(source, /useLayoutEffect/);
  assert.match(source, /typeof window\s*===\s*["']undefined["']\s*\?\s*useEffect\s*:\s*useLayoutEffect/);
  assert.match(source, /indicatorRef/);
  assert.equal((source.match(/pm-workspace__nav-indicator-line/g) ?? []).length, 2);
  assert.doesNotMatch(source, /isActive\s*\?\s*<span[^>]+nav-active-line/);
  assert.match(indicatorRule, /position:\s*absolute/);
  assert.match(indicatorRule, /transition:[^}]*transform[^}]*cubic-bezier\(0\.45,\s*0,\s*0\.2,\s*1\)/s);
  assert.match(lineRule, /height:\s*11px/);
  assert.match(activeRule, /background:\s*transparent/);
  assert.match(activeRule, /box-shadow:\s*none/);
  assert.doesNotMatch(activeRule, /border-radius/);
});

test("page surfaces retain content but no longer render persistent shell or corner account controls", async () => {
  const workspace = await readFile(join(sourceRoot, "surfaces", "workspace", "WorkspaceConversationSurface.tsx"), "utf8");
  const home = await readFile(join(sourceRoot, "surfaces", "home", "HomeFlowSurface.tsx"), "utf8");
  const identity = await readFile(join(sourceRoot, "surfaces", "workspace", "UserIdentity.tsx"), "utf8");
  const commands = await readFile(join(sourceRoot, "surfaces", "workspace", "commands.ts"), "utf8");

  for (const surface of [workspace, home]) {
    assert.doesNotMatch(surface, /<WindowChrome\b/);
    assert.doesNotMatch(surface, /<UserIdentity\b/);
    assert.doesNotMatch(surface, /<BottomNavigation\b/);
    assert.doesNotMatch(surface, /pm-workspace__bell|pm-workspace__identity/);
  }
  assert.match(identity, /Open notifications/);
  assert.match(identity, /Open user menu/);
  assert.match(commands, /demo\.notifications\.open/);
  assert.match(commands, /demo\.user\.open/);
});
