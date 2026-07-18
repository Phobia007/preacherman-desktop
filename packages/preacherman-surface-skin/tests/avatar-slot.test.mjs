import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function renderHome(avatarSlot) {
  const { createSurfaceSkinAdapter } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );
  const adapter = createSurfaceSkinAdapter({
    host: { execute: async () => ({ ok: true }) },
    avatarSlot,
  });
  const View = adapter.resolve({
    surfaceType: "home",
    schemaVersion: 1,
    surfaceId: "figma-287-637",
  }).component;
  return renderToStaticMarkup(createElement(View, {
    manifest: {
      surfaceType: "home",
      schemaVersion: 1,
      surfaceId: "figma-287-637",
    },
    projection: {},
  }));
}

async function renderWorkspace(avatarSlot) {
  const { createSurfaceSkinAdapter } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );
  const adapter = createSurfaceSkinAdapter({
    host: { execute: async () => ({ ok: true }) },
    avatarSlot,
  });
  const manifest = {
    surfaceType: "workspace",
    schemaVersion: 1,
    surfaceId: "figma-281-538",
  };
  const View = adapter.resolve(manifest).component;
  return renderToStaticMarkup(createElement(View, {
    manifest,
    projection: {},
  }));
}

test("missing AvatarSlot keeps the existing two-dimensional human fallback", async () => {
  const markup = await renderHome(undefined);

  assert.equal((markup.match(/pm-home-vessel__human/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /data-test-avatar-slot/);
  assert.match(markup, /data-avatar-state="fallback"/);
});

test("provided AvatarSlot renders between the rear and front orbit layers", async () => {
  function TestAvatarSlot(props) {
    return createElement("div", {
      className: props.className,
      "data-test-avatar-slot": "true",
    });
  }
  const markup = await renderHome(TestAvatarSlot);
  const rear = markup.indexOf("pm-home-vessel__orbit--rear");
  const fallback = markup.indexOf("pm-home-vessel__human");
  const avatar = markup.indexOf("data-test-avatar-slot");
  const front = markup.indexOf("pm-home-vessel__orbit--front");
  const halo = markup.indexOf("pm-home-vessel__halo");

  assert.ok(rear >= 0);
  assert.ok(rear < fallback);
  assert.ok(fallback < avatar);
  assert.ok(avatar < front);
  assert.ok(front < halo);
});

test("avatar failures are caught by a local boundary and never replace the Home surface", async () => {
  const vessel = await readFile(
    join(packageRoot, "src", "surfaces", "home", "HomeVessel.tsx"),
    "utf8",
  );
  const flow = await readFile(
    join(packageRoot, "src", "surfaces", "home", "HomeFlowSurface.tsx"),
    "utf8",
  );

  assert.match(vessel, /class AvatarSlotBoundary extends Component/);
  assert.match(vessel, /componentDidCatch/);
  assert.match(vessel, /data-avatar-state=\{avatarState\}/);
  assert.match(vessel, /setAvatarState\("fallback"\)/);
  assert.doesNotMatch(flow, /ErrorBoundary/);
});

test("AvatarSlot remains runtime adapter configuration rather than serialized contract data", async () => {
  const types = await readFile(join(packageRoot, "src", "adapter", "types.ts"), "utf8");
  const manifest = types.match(/export interface SurfaceManifest \{[\s\S]*?\n\}/)?.[0] ?? "";
  const projection = types.match(/export interface SurfaceProjection \{[\s\S]*?\n\}/)?.[0] ?? "";
  const options = types.match(/export interface CreateSurfaceSkinAdapterOptions \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.doesNotMatch(manifest, /avatar/i);
  assert.doesNotMatch(projection, /avatar/i);
  assert.match(options, /avatarSlot\?:\s*AvatarSlot/);
});

test("current empty Workspace mounts the injected AvatarSlot only in its centered viewport", async () => {
  function TestAvatarSlot(props) {
    return createElement("div", {
      className: props.className,
      "data-test-avatar-slot": "true",
    });
  }

  const withAvatar = await renderWorkspace(TestAvatarSlot);
  const withoutAvatar = await renderWorkspace(undefined);

  assert.match(withAvatar, /pm-workspace__avatar-stage/);
  assert.match(withAvatar, /data-test-avatar-slot/);
  assert.doesNotMatch(withoutAvatar, /pm-workspace__avatar-stage/);
  assert.doesNotMatch(withoutAvatar, /data-test-avatar-slot/);
});
