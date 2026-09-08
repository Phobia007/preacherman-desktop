import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {isTaskIndexSwitch, taskIndexTransition} from "../public/gallery-v3/portfolio/task-view-transition.js";

test("only the two Task index views use exclusive page ownership", () => {
  assert.equal(isTaskIndexSwitch("/", "/full"), true);
  assert.equal(isTaskIndexSwitch("/full", "/"), true);
  for (const [from, to] of [["/", "/"], ["/full", "/full"], ["/", "/projects/halo"], ["/full", "/projects/halo"], ["/projects/halo", "/"], ["/projects/halo", "/full"]]) {
    assert.equal(isTaskIndexSwitch(from, to), false);
  }
});

test("rapid switches finish old cleanup synchronously and retain authored entry motion", () => {
  const enter = () => {};
  const source = {css: false, mode: "", onEnter: enter, onLeave() {throw new Error("old deferred leave must not run");}};
  const transition = taskIndexTransition(source);
  assert.equal(transition.mode, "out-in");
  assert.equal(transition.onEnter, enter);
  assert.equal(transition.css, false);
  assert.equal(source.mode, "", "project transition is not mutated");
  for (let i = 0; i < 100; i++) {
    let completed = 0, hidden = 0;
    const element = {inert: false, querySelector: () => i % 2 ? null : {hidePopover: () => hidden++}};
    transition.onLeave(element, () => {assert.equal(element.inert, true);completed++;});
    assert.equal(completed, 1);
    assert.equal(hidden, i % 2 ? 0 : 1);
  }
});

test("packaged runtime selects the scoped transition and both views cancel stale async mounts", () => {
  const read = name => readFileSync(new URL("../public/gallery-v3/portfolio/" + name, import.meta.url), "utf8");
  assert.ok(read("_nuxt/D9b8F35K.js").includes("isTaskIndexSwitch(e.path,n.path)"));
  assert.ok(read("_nuxt/D9b8F35K.js").includes("taskIndexTransition(IP(options))"));
  const featured = read("_nuxt/DxOxRmZ4.js");
  assert.ok(featured.includes("L(()=>{disposed=!0})"));
  assert.ok(featured.includes("await e.booted;if(disposed)return;"));
  const timeline = read("task-timeline.js");
  assert.match(timeline, /await nextTick\(\);\s*if \(disposed\) return;\s*folio.declare/);
  assert.match(timeline, /await folio.booted;\s*if \(disposed\) return;/);
});
