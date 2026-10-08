import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/gallery-v3/portfolio");
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("Task profile follows light and dark ink without adding an opaque daytime backdrop", () => {
  const document = {documentElement: {dataset: {galleryAppearance: "light"}, style: {getPropertyValue: () => ""}}};
  let reads = 0;
  const context = vm.createContext({document, getComputedStyle: () => { reads++; return {color: document.documentElement.dataset.galleryAppearance === "light" ? "rgb(22, 25, 28)" : "rgb(245, 250, 252)"}; }});
  vm.runInContext(read("task-profile-appearance.js").replace("export function", "function"), context);
  const text = {el: {isConnected: true}, setColor(value) { this.ink = value; }};
  const folio = {core: {post: {u: {u_daylight: {value: 0}}}}, overlay: [text], hud: []};
  context.syncTaskProfileAppearance(folio);
  assert.equal(folio.core.post.u.u_daylight.value, 1);
  assert.equal(text.ink, "rgb(22, 25, 28)");
  context.syncTaskProfileAppearance(folio);
  assert.equal(reads, 1, "idle frames do not repeatedly read styles or rasterize");
  document.documentElement.dataset.galleryAppearance = "dark";
  context.syncTaskProfileAppearance(folio);
  assert.equal(folio.core.post.u.u_daylight.value, 0);
  assert.equal(text.ink, "rgb(245, 250, 252)");
});

test("Task uses one signature layer and keeps the original lens motion", () => {
  const css = read("task-view-toggle.css");
  const runtime = read("_nuxt/D9b8F35K.js");
  const brand = css.match(/\[data-od-id="profile-toggle"\]\s*\{([^}]+)\}/)[1];
  assert.match(brand, /-webkit-text-fill-color:\s*transparent\s*!important/);
  assert.match(css, /\[data-gallery-profile-copy\][^}]+var\(--demo-theme-text/);
  assert.match(runtime, /sampleAlpha = max\(cr.a, max\(cg.a, cb.a\)\)/);
  assert.match(runtime, /vec4\(0.0, 0.0, 0.0, 1.0 - u_daylight\)/);
  assert.match(runtime, /if \(uv.x < 0.0[^\n]+return vec4\(0.0, 0.0, 0.0, 1.0 - u_daylight\)/);
  assert.match(runtime, /syncHole\(\)\{syncTaskProfileAppearance\(this\)/);
  assert.match(runtime, /openHole\(e\)\{ve.to\(this.hole/);
  for (const page of ["index.html", "full/index.html"]) {
    assert.match(read(page), /galleryAppearance=data.appearance==="light"\?"light":"dark"/);
  }
});

test("hydrated profile copy uses host ink even when its authored CSS is still white", () => {
  let ink = "#16191c";
  const document = {documentElement: {dataset: {galleryAppearance: "light"}, style: {getPropertyValue: () => ink}}};
  const context = vm.createContext({document, getComputedStyle: () => ({color: "rgb(255, 255, 255)"})});
  vm.runInContext(read("task-profile-appearance.js").replace("export function", "function"), context);
  const body = {el: {isConnected: true}, setColor(value) { this.ink = value; }};
  const folio = {core: {post: {u: {u_daylight: {value: 0}}}}, overlay: [body], hud: []};
  context.syncTaskProfileAppearance(folio);
  assert.equal(body.ink, "#16191c");
  document.documentElement.dataset.galleryAppearance = "dark";
  ink = "#f5fafc";
  context.syncTaskProfileAppearance(folio);
  assert.equal(body.ink, "#f5fafc");
});
