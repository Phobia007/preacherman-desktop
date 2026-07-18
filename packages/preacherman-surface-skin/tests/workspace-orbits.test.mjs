import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("workspace corner controls keep their requested fixed positions without Alive", async () => {
  const userSource = await readFile(join(packageRoot, "src", "surfaces", "workspace", "UserIdentity.tsx"), "utf8");
  const css = await readFile(join(packageRoot, "src", "surfaces", "workspace", "workspace.css"), "utf8");
  const identityRule = css.match(/\.pm-workspace__identity\s*\{[^}]*\}/s)?.[0] ?? "";
  const bellRule = css.match(/\.pm-workspace__bell\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.doesNotMatch(userSource, /account-divider/);
  assert.match(identityRule, /left:\s*24px/);
  assert.match(identityRule, /bottom:\s*25px/);
  assert.doesNotMatch(identityRule, /\btop:|\bright:/);
  assert.match(bellRule, /right:\s*30px/);
  assert.match(bellRule, /bottom:\s*32px/);
  assert.doesNotMatch(bellRule, /\btop:/);
  assert.doesNotMatch(css, /pm-workspace__status-|pm-alive-breathe|pm-status-popover-in/);
});

test("UserIdentity renders the projected identity number without hard-coding demo data", async () => {
  const source = await readFile(join(packageRoot, "src", "surfaces", "workspace", "UserIdentity.tsx"), "utf8");

  assert.match(source, /Pick<SurfaceViewProps,\s*"dispatch"\s*\|\s*"projection">/);
  assert.match(source, /projection\.data\?\.identity/);
  assert.match(source, /identityNumber\s*\?\s*\(/);
  assert.match(source, /className="pm-workspace__identity-number"/);
  assert.match(source, /#\{identityNumber\}/);
  assert.doesNotMatch(source, /#01/);
});

test("workspace surface keeps its mapped section without orbit markup or interaction", async () => {
  const source = await readFile(join(packageRoot, "src", "surfaces", "workspace", "WorkspaceConversationSurface.tsx"), "utf8");
  const css = await readFile(join(packageRoot, "src", "surfaces", "workspace", "workspace.css"), "utf8");

  assert.match(source, /<section/);
  assert.match(source, /data-figma-frame="281:538"/);
  assert.doesNotMatch(source, /StateVessel|OrbitLayer|data-orbit-|orbitNodeCommand/);
  assert.doesNotMatch(css, /pm-workspace__orbit-|pm-workspace__state-vessel/);
});
