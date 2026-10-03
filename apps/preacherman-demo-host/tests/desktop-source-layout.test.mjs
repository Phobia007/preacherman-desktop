import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { brandNavigationItems } from "../src/app-shell/navigationDestinations.ts";
import { readDemoScreenRoute } from "../src/demo/screenRoute.ts";

test("named destinations preserve existing deep links after source consolidation", () => {
  assert.deepEqual(brandNavigationItems.map(({ label, surfaceType }) => [label, surfaceType]), [
    ["Home", "home"], ["Task", "workspace"], ["Gallery", "market"],
    ["Market", "ledger"], ["Asset", "asset"], ["Extension", "extension"],
  ]);
  for (const { surfaceType } of brandNavigationItems) {
    assert.deepEqual(readDemoScreenRoute("/__surfaces/" + surfaceType), { kind: "surface", surfaceType });
  }
});

test("packaged entry points exist and retired copies cannot return through Vite public", async () => {
  for (const path of ["public/gallery-v3/portfolio/index.html", "public/gallery-v3/portfolio/full/index.html",
    "public/active-theory-gallery/gallery/work.html", "public/market-love/cartier-love.html"]) {
    await access(new URL("../" + path, import.meta.url));
  }
  for (const path of ["settings-v3-local", "task-lookback-v3", "settings-portfolio", "settings-template", "task-lookback", "sites"]) {
    await assert.rejects(access(new URL("../public/" + path, import.meta.url)), { code: "ENOENT" });
  }
  const task = await readFile(new URL("../src/surfaces/task/TaskExperienceSurface.tsx", import.meta.url), "utf8");
  assert.ok(task.includes("/gallery-v3/portfolio/index.html"));
  assert.ok(task.includes("gallery-source-ready"));
});
