import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

for (const appearance of ["light", "dark"]) test(`Gallery prewarms, pauses and resumes its owned videos in ${appearance}`, () => {
  const events = new Map();
  class Video { paused = false; ended = false; pauses = 0; plays = 0; pause() { this.paused = true; this.pauses++; } play() { this.paused = false; this.plays++; return Promise.resolve(); } }
  const owned = new Video(), userPaused = new Video(); userPaused.paused = true;
  const document = { hidden: false, documentElement: { dataset: { appearance }, setAttribute() {} }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {}, querySelectorAll: () => [userPaused] };
  const Render = { isPaused: false, pause() { this.isPaused = true; }, resume() { this.isPaused = false; } };
  const root = { classes: { video: { video: owned } } };
  const window = { document, Render, Container: { instance: () => root }, addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({ window, document, Render, HTMLVideoElement: Video, setTimeout, clearTimeout });
  vm.runInContext(readFileSync(new URL("../public/active-theory-gallery/gallery/detail-bridge.js", import.meta.url), "utf8"), context);
  const api = window.PreachermanGalleryDetail;
  let draw;
  const view = { flag: () => true, uniforms: { uVisible: { value: 0 } }, scroll: { renderManager: { controller: { scroll: 0 } } } };
  api.attach({ startRender: fn => { draw = fn; }, findParent: () => view, bind() {} });
  api.setActive(false, false); draw(); assert.equal(Render.isPaused, true, "native minimize suspends unfinished prewarming even when document.hidden is false");
  api.setActive(false, true); draw(); assert.equal(Render.isPaused, false, "cold initialization still renders");
  document.hidden = true; events.get("visibilitychange")(); assert.equal(Render.isPaused, true);
  document.hidden = false; events.get("visibilitychange")(); assert.equal(Render.isPaused, false, "prewarming resumes after minimizing during startup");
  view.uniforms.uVisible.value = 1; draw(); assert.equal(Render.isPaused, true); assert.equal(owned.paused, true);
  api.setActive(true); assert.equal(Render.isPaused, false); assert.equal(owned.paused, false); assert.equal(userPaused.plays, 0);
  api.closeWindow(); assert.equal(owned.paused, false, "the foreground mirror does not own playback");
  api.setActive(false); const count = owned.pauses; api.setActive(false); assert.equal(owned.pauses, count);
  api.setActive(true); assert.equal(owned.paused, false);
});
