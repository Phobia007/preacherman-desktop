import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createTaskViewToggle} from "../public/gallery-v3/portfolio/task-view-toggle.js";

function setup(initial = "featured") {
  const props = {mode: initial}, visits = [];
  let sync;
  const component = createTaskViewToggle({
    element: (tag, attributes, children) => ({tag, attributes, children}),
    ref: value => ({value}), watch: (_read, callback) => {sync = callback;},
    useNavigation: () => ({to(path) {let resolve, reject;const promise = new Promise((a,b) => {resolve=a;reject=b;});visits.push({path,resolve,reject});return promise;}}),
  });
  return {render: component.setup(props), visits, commit(mode) {props.mode=mode;sync(mode);}};
}

test("one accessible icon replaces both labels and switches through the existing queue", async () => {
  const h = setup();
  assert.equal(h.render().tag, "button");
  assert.equal(h.render().attributes["aria-label"], "切换到全部");
  assert.equal(h.render().children[0].tag, "svg");
  const first = h.render().attributes.onClick();
  assert.equal(h.render().attributes["data-mode"], "full", "morph starts on the click");
  assert.equal(h.visits[0].path, "/full");
  h.commit("full");h.visits[0].resolve();await first;
  assert.equal(h.render().attributes["aria-pressed"], true);
  const second = h.render().attributes.onClick();
  assert.equal(h.visits[1].path, "/");
  h.commit("featured");h.visits[1].resolve();await second;
  assert.equal(h.render().attributes["aria-pressed"], false);
});

test("a superseded route completion cannot reset the newest icon state", async () => {
  const h = setup();
  const first = h.render().attributes.onClick();
  const second = h.render().attributes.onClick();
  h.commit("full");h.visits[0].resolve();await first;
  assert.equal(h.render().attributes["data-mode"], "featured");
  h.commit("featured");h.visits[1].resolve();await second;
  h.commit("full");assert.equal(h.render().attributes["data-mode"], "full", "external navigation stays synchronized");
});

test("a failed navigation restores the actual mode", async () => {
  const h = setup("full");
  const visit = h.render().attributes.onClick();
  h.visits[0].reject(new Error("Navigation cancelled"));
  await assert.rejects(visit, /cancelled/);
  assert.equal(h.render().attributes["data-mode"], "full");
});

for (const appearance of ["light", "dark"]) test(`centered Task icon uses shared theme and keyboard/reduced-motion states in ${appearance}`, () => {
  const root = new URL("../", import.meta.url);
  const css = readFileSync(new URL("public/gallery-v3/portfolio/task-view-toggle.css",root),"utf8");
  const styles = readFileSync(new URL("src/styles.css",root),"utf8");
  const block = [...styles.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)]
    .filter(m => appearance === "dark" ? m[1].trim() === '[data-appearance="dark"]' : m[1].trim() === "").map(m=>m[2]).join("\n");
  for (const token of new Set(css.match(/--demo-theme-[a-z-]+/g))) assert.ok(block.includes(token+":"),token);
  assert.match(css, /left: 50%/);assert.match(css, /bottom: 5vh/);
  assert.match(css, /:focus-visible/);assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\[inert\] .task-view-toggle/);
  for (const page of ["index.html", "full/index.html", "projects/nathan-riley/index.html"]) {
    const html=readFileSync(new URL("public/gallery-v3/portfolio/"+page,root),"utf8");
    assert.match(html, /class="task-view-toggle"/);
    assert.doesNotMatch(html, /<nav data-od-id="project-view-switcher"/);
    assert.match(html, /task-view-toggle.css/);
  }
});
