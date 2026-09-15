import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {localTaskDay, taskTimelineGroups, taskTimelineLabel, taskTickHeight, taskNameBounds} from "../public/gallery-v3/portfolio/task-timeline-data.js";
const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), "utf8");

test("demo cards use stable view-only thirds while saved creation dates take precedence", () => {
  const authored = Array.from({length: 9}, (_, i) => ({slug: "demo-" + i}));
  const projects = [...authored, {slug: "task-1", preachermanTask: true}];
  const records = [{id: "task-1", createdAt: "2026-09-08T12:30:00", group: "Work"}];
  const before = JSON.stringify({projects, records});
  const groups = taskTimelineGroups(projects, records, authored.map(p => p.slug));
  assert.deepEqual(groups.map(g => g.label), ["Sep.7th", "Sep.8th", "Sep.9th"]);
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
  assert.deepEqual(taskTimelineGroups(tasks, [], []).map(g => g.label), ["Sep.7th 2025", "Sep.7th 2026", "Earlier"]);
});

test("date labels use calendar month abbreviations and correct English ordinals", () => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < 12; i++) assert.equal(taskTimelineLabel(`2026-${String(i + 1).padStart(2, "0")}-05`), months[i] + ".5th");
  for (const [day, label] of [[1,"1st"],[2,"2nd"],[3,"3rd"],[4,"4th"],[11,"11th"],[12,"12th"],[13,"13th"],[21,"21st"],[22,"22nd"],[23,"23rd"],[31,"31st"]]) {
    assert.equal(taskTimelineLabel(`2026-10-${String(day).padStart(2, "0")}`), "Oct." + label);
  }
  assert.equal(taskTimelineLabel("2028-02-29", true), "Feb.29th 2028");
  assert.equal(taskTimelineLabel("undated"), "Earlier");
});

test("ruler ticks rise progressively around dates and the pointer without exceeding markers", () => {
  assert.equal(taskTickHeight(1000), 4);
  assert.ok(taskTickHeight(70) < taskTickHeight(30));
  assert.ok(taskTickHeight(30) < taskTickHeight(0));
  assert.ok(taskTickHeight(1000, 30) < taskTickHeight(1000, 0));
  assert.equal(taskTickHeight(20), taskTickHeight(-20));
  assert.equal(taskTickHeight(0), 13);
  assert.equal(taskTickHeight(0, 0), 19);
  assert.ok(taskTickHeight(0, 0) < 22);
});

test("preview hit bounds are the single name clipped to its own column and viewport", () => {
  const column = {left: 100, top: 200, right: 400, bottom: 800};
  const viewport = {left: 120, top: 100, right: 700, bottom: 850};
  assert.deepEqual(taskNameBounds({left: 110, top: 780, right: 240, bottom: 820}, column, viewport), {left:120,top:780,right:240,bottom:800});
  assert.equal(taskNameBounds({left: 110, top: 820, right: 240, bottom: 850}, column, viewport), null);
  assert.equal(taskNameBounds({left: 20, top: 300, right: 90, bottom: 350}, column, viewport), null);
});

test("timeline is bounded, scrollable, keyboard accessible and hides both scrollbars", () => {
  const css = read("task-timeline.css"), source = read("task-timeline.js");
  assert.match(css, /inset: calc\(15.5vh - 4rem\) 0 15vh/);
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
  assert.match(source, /onWheel: wheel/);
  assert.match(source, /ruler.value\?\.contains\(event.target\)/);
  assert.match(source, /moveScroll\(column, "scrollTop", event.deltaY \* unit \* .55\)/);
  assert.doesNotMatch(source, /else moveHorizontal|column.scrollHeight > column.clientHeight/);
  assert.match(source, /scrolling\?\.el !== el/);
  assert.match(source, /Math.exp\(-Math.min\(now - last, 50\) \/ 190\)/);
  assert.match(source, /scrolling.position \+= remaining/);
  assert.match(source, /view.columns.set/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /onPointercancel: rulerUp/);
  assert.match(source, /stopScroll\(\)/);
  assert.match(source, /onKeydown: rulerKey/);
  assert.match(css, /task-timeline__column\s*\{[^}]*overflow-y: auto/s);
  assert.match(css, /task-timeline__body\s*\{[^}]*overflow: hidden/s);
  assert.doesNotMatch(css, /border-top:/);
  assert.match(source, /cancelAnimationFrame\(frame\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
  assert.doesNotMatch(source, /localStorage.setItem|sessionStorage.setItem/);
});

test("compact ruler and dates retain name size, larger gaps and full-width bounds", () => {
  const css = read("task-timeline.css");
  assert.match(css, /task-timeline__tick\s*\{[^}]*height: 22px/s);
  assert.match(css, /task-timeline__date\s*\{[^}]*min-height: 44px[^}]*font-size: 1.2rem/s);
  assert.match(css, /task-timeline__axis\s*\{[^}]*padding-bottom: 4rem/s);
  assert.match(css, /task-timeline__names\s*\{[^}]*gap: 3rem/s);
  assert.match(css, /task-timeline__name\s*\{[^}]*font-size: 2.5rem/s);
  assert.doesNotMatch(css, /inset:.* (?:10|7)vw/);
});

test("timeline reuses the original rail and clips its hover bounds to visible names", () => {
  const source = read("task-timeline.js"), runtime = read("_nuxt/D9b8F35K.js");
  assert.match(source, /folio.rail.bind\(panel.value, projects.value, previewBounds\)/);
  assert.match(source, /folio.rail.pick\(index\)/);
  assert.match(source, /folio.rail.point\(/);
  assert.match(source, /onPointerleave: clearPreview/);
  assert.match(source, /pointer.x < bounds.left/);
  assert.match(source, /taskNameBounds\(activeName.getBoundingClientRect/);
  assert.match(source, /folio.rail.bind\(null\)/);
  assert.ok(runtime.includes("bind(e,t=[],getCloud=null){this.getCloud=e?getCloud:null;"));
  assert.ok(runtime.includes("cloud(){if(this.getCloud)return this.getCloud();"));
  assert.match(source, /loadTaskCovers/);
  assert.match(source, /folio.selectTitle\(flying, project.slug\)/);
});

test("title clicks use the authored navigation queue and release the click lock", () => {
  const source = read("task-timeline.js");
  assert.match(source, /aw as useNavigation/);
  assert.match(source, /const \{to: navigate\} = useNavigation\(\)/);
  assert.match(source, /try \{ await navigate\(taskProjectRoute\(project\)\); \}/);
  assert.match(source, /finally \{ navigating = false; \}/);
});

test("every packaged entry lets timeline titles reach their own queued click handler", () => {
  const entries = ["index.html", "full/index.html", ...["nathan-riley", "casa-di-solare", "the-lookback", "book-of-happiness", "dogelon-mars", "gil-huybrecht", "discoveryland", "griflan"].map(slug => `projects/${slug}/index.html`)];
  for (const entry of entries) {
    const source = read(entry);
    assert.ok(source.includes('if(event.target.closest?.(".task-timeline__name"))return;const route=routeFor(event.target);'), entry);
  }
});

test("captured navigation links use the same authored queue during first entry", () => {
  for (const file of ["index.html", "full/index.html", ...["nathan-riley", "casa-di-solare", "the-lookback", "book-of-happiness", "dogelon-mars", "gil-huybrecht", "discoveryland", "griflan"].map(slug => `projects/${slug}/index.html`)]) {
    const source = read(file);
    assert.match(source, /aw:useNavigation/, file);
    assert.match(source, /app\.runWithContext\(\(\)=>useNavigation\(\)\.to\(route\)\)/, file);
    assert.doesNotMatch(source, /Promise\.resolve\(router\.push\(route\)\)/, file);
  }
});
