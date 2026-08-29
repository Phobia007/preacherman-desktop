import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");

test("bottom navigation keeps stable keys while exposing the requested short labels", async () => {
  const source = await readFile(join(sourceRoot, "surfaces", "workspace", "BottomNavigation.tsx"), "utf8");
  for (const label of ["Home", "Work", "Lab", "Gallery", "Test", "Market", "Settings"]) {
    assert.match(source, new RegExp(`label:\\s*["']${label}["']`));
  }
  for (const key of ["home", "workspace", "lab", "market", "test", "ledger", "settings"]) {
    assert.match(source, new RegExp(`surfaceType:\\s*["']${key}["']`));
  }
  for (const removed of ["Workspace", "State Gallery", "Text", "Test Zone", "State Ledger"]) {
    assert.doesNotMatch(source, new RegExp(`label:\\s*["']${removed}["']`));
  }
});

test("one persistent navigation uses a restrained active pill", async () => {
  const source = await readFile(join(sourceRoot, "surfaces", "workspace", "BottomNavigation.tsx"), "utf8");
  const css = await readFile(join(sourceRoot, "surfaces", "workspace", "workspace.css"), "utf8");
  const activeRule = css.match(/\.pm-workspace__nav-item\.is-active\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.match(source, /activeSurfaceType/);
  assert.match(source, /aria-current=\{isActive\s*\?\s*["']page["']/);
  assert.doesNotMatch(source, /nav-indicator|useLayoutEffect|indicatorRef/);
  assert.match(activeRule, /background:\s*var\(--demo-theme-activate-fill/);
  assert.match(activeRule, /color:\s*var\(--demo-theme-activate-fill-text/);
  assert.match(activeRule, /box-shadow:\s*none/);
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
