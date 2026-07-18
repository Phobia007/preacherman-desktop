import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = join(packageRoot, "src", "assets", "figma", "281-538");
const workspaceRoot = join(packageRoot, "src", "surfaces", "workspace");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("Workspace center contains no vessel, orbit, or human implementation", async () => {
  const workspace = await readFile(join(workspaceRoot, "WorkspaceConversationSurface.tsx"), "utf8");
  const css = await readFile(join(workspaceRoot, "workspace.css"), "utf8");

  for (const file of ["StateVessel.tsx", "OrbitLayer.tsx", "orbitGeometry.ts"]) {
    assert.equal(await exists(join(workspaceRoot, file)), false);
  }
  assert.doesNotMatch(workspace, /StateVessel|OrbitLayer|orbit/i);
  assert.doesNotMatch(css, /pm-workspace__(?:human|orbit|state-vessel)|pm-vessel-canvas/i);
});

test("workspace removes the human click target and its page transition", async () => {
  const workspace = await readFile(join(workspaceRoot, "WorkspaceConversationSurface.tsx"), "utf8");
  const css = await readFile(join(workspaceRoot, "workspace.css"), "utf8");

  assert.doesNotMatch(workspace, /useState|screenCommand|state-chat-target|state-chat-hint|figma-32-2/);
  assert.doesNotMatch(css, /pm-workspace__state-chat-target|pm-workspace__state-chat-hint/);
});

test("Workspace orbit source assets remain local but are not rendered in either theme", async () => {
  const workspace = await readFile(join(workspaceRoot, "WorkspaceConversationSurface.tsx"), "utf8");
  const css = await readFile(join(workspaceRoot, "workspace.css"), "utf8");

  for (const file of ["orbit-slow.svg", "orbit-secondary.svg", "halo-memory.svg", "halo-skill.svg"]) {
    assert.equal(await exists(join(assetRoot, file)), true, `${file} remains audited locally`);
  }
  assert.doesNotMatch(workspace, /halo-|orbit-/);
  assert.doesNotMatch(css, /data-appearance="dark"[^}]*pm-workspace__orbit-/s);
});

test("Alive is absent from both surfaces, source modules, and workspace styles", async () => {
  const home = await readFile(join(packageRoot, "src", "surfaces", "home", "HomeFlowSurface.tsx"), "utf8");
  const workspace = await readFile(join(workspaceRoot, "WorkspaceConversationSurface.tsx"), "utf8");
  const css = await readFile(join(workspaceRoot, "workspace.css"), "utf8");

  for (const source of [home, workspace]) {
    assert.doesNotMatch(source, /TopLiveStatus|>Alive</);
  }
  assert.equal(await exists(join(workspaceRoot, "TopLiveStatus.tsx")), false);
  assert.doesNotMatch(css, /pm-workspace__status-|pm-alive-breathe|pm-status-popover-in/);
});
