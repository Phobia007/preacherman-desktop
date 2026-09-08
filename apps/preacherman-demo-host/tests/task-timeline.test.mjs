import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {localTaskDay, taskTimelineGroups} from "../public/gallery-v3/portfolio/task-timeline-data.js";
const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), "utf8");

test("demo cards use stable view-only thirds while saved creation dates take precedence", () => {
  const authored = Array.from({length: 9}, (_, i) => ({slug: "demo-" + i}));
  const projects = [...authored, {slug: "task-1", preachermanTask: true}];
  const records = [{id: "task-1", createdAt: "2026-09-08T12:30:00", group: "Work"}];
  const before = JSON.stringify({projects, records});
  const groups = taskTimelineGroups(projects, records, authored.map(p => p.slug));
  assert.deepEqual(groups.map(g => g.label), ["7.sep", "8.sep", "9.sep"]);
  assert.deepEqual(groups.map(g => g.items.length), [3, 4, 3]);
  assert.equal(JSON.stringify({projects, records}), before);
  assert.equal(groups[1].items.at(-1).index, 9); // Original preview index, not column row.
  assert.equal(groups[1].items.at(-1).project, projects[9]);
  const hidden = taskTimelineGroups(projects.slice(1), records, authored.map(p => p.slug));
  assert.equal(hidden.find(g => g.items.some(item => item.project.slug === "demo-3")).day, "2026-09-08");
});

test("unknown dates, empty lists, local dates and cross-year labels remain explicit", () => {
  assert.equal(localTaskDay(""), null);
  assert.equal(localTaskDay("not-a-date"), null);
  assert.equal(localTaskDay("2026-09-08T23:55:00"), "2026-09-08");
  assert.deepEqual(taskTimelineGroups([], [], []), []);
  const tasks = [
    {slug: "task-old", preachermanTask: true, createdAt: "2025-09-07T12:00:00"},
    {slug: "task-new", preachermanTask: true, createdAt: "2026-09-07T12:00:00"},
    {slug: "task-unknown", preachermanTask: true},
  ];
  assert.deepEqual(taskTimelineGroups(tasks, [], []).map(g => g.label), ["7.sep 2025", "7.sep 2026", "Earlier"]);
});

test("timeline is bounded, scrollable, keyboard accessible and hides both scrollbars", () => {
  const css = read("task-timeline.css"), source = read("task-timeline.js");
  assert.match(css, /inset: 23vh 10vw 15vh/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /min-height: 0/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /::-webkit-scrollbar[^}]+display: none/s);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const appearance of ["light", "dark"]) {
    const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    assert.ok(styles.includes(`data-appearance="${appearance}"`));
    for (const token of ["--demo-theme-brand-menu-text", "--demo-theme-brand-menu-text-hover", "--demo-theme-brand-menu-focus"]) {
      assert.ok(styles.includes(token));
      assert.ok(css.includes(token));
    }
  }
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
  assert.match(source, /"aria-expanded": open.value.has/);
  assert.match(source, /"aria-controls":/);
  assert.match(source, /onFocus: event => preview/);
  assert.match(source, /onWheel: event => event.stopPropagation/);
  assert.match(source, /cancelAnimationFrame\(frame\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
  assert.doesNotMatch(source, /localStorage.setItem|sessionStorage.setItem/);
});

test("timeline reuses the original rail and clips its hover bounds to visible names", () => {
  const source = read("task-timeline.js"), runtime = read("_nuxt/D9b8F35K.js");
  assert.match(source, /folio.rail.bind\(panel.value, projects.value, \(\) => bounds\)/);
  assert.match(source, /folio.rail.pick\(index\)/);
  assert.match(source, /folio.rail.point\(/);
  assert.match(source, /Math.max\(clip.top, rect.top\)/);
  assert.match(source, /Math.min\(clip.bottom, rect.bottom\)/);
  assert.match(source, /folio.rail.bind\(null\)/);
  assert.ok(runtime.includes("bind(e,t=[],getCloud=null){this.getCloud=e?getCloud:null;"));
  assert.ok(runtime.includes("cloud(){if(this.getCloud)return this.getCloud();"));
  assert.match(source, /loadTaskCovers/);
  assert.match(source, /folio.selectTitle\(flying, project.slug\)/);
});
