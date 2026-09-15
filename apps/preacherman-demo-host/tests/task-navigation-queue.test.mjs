import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import test from "node:test";

const runtime = readFileSync(new URL("../public/gallery-v3/portfolio/_nuxt/D9b8F35K.js", import.meta.url), "utf8");
const queueSource = runtime.slice(runtime.indexOf("pn={path:null"), runtime.indexOf(",$_=", runtime.indexOf("pn={path:null")));

function setup() {
  let now = 0;
  const visits = [];
  const resolve = value => {const u = new URL(value, "https://task.local"); return {path:u.pathname, fullPath:u.pathname + u.search + u.hash};};
  const router = {currentRoute:{value:resolve("/full")}, resolve, async push(value) {
    const route = resolve(value);
    // Mirror the authored transition guard: a queued hop owns its pathname.
    const allowed = context.owns(route.path) || context.remaining() === 0;
    visits.push({route:route.fullPath, allowed});
    if (allowed) this.currentRoute.value = route;
  }};
  const context = vm.createContext({Nn:()=>router, performance:{now:()=>now}, setTimeout:(fn, delay)=>{now += delay; queueMicrotask(fn);}});
  vm.runInContext("const " + queueSource + ";globalThis.navigation=JB();globalThis.owns=kP;globalThis.remaining=ow;", context);
  return {navigation:context.navigation, router, visits};
}

test("saved conversation query and hash retain transition ownership", async () => {
  const {navigation, router, visits} = setup();
  const target = "/projects/nathan-riley?task=task-alpha#conversation";
  await navigation.to(target);
  assert.equal(router.currentRoute.value.fullPath, target);
  assert.deepEqual(visits, [{route:target, allowed:true}]);
  assert.equal(navigation.aim.path, null);
});

test("different conversations sharing one template remain distinct queued targets", async () => {
  const {navigation, router, visits} = setup();
  const first = "/projects/nathan-riley?task=task-alpha", second = "/projects/nathan-riley?task=task-beta";
  await navigation.to(first);
  await navigation.to(second);
  assert.equal(router.currentRoute.value.fullPath, second);
  assert.deepEqual(visits.map(v => v.route), [first, second]);
  assert.ok(visits.every(v => v.allowed));
  assert.equal(navigation.aim.path, null);
});

test("a rapid newer target wins while the current transition is queued", async () => {
  const {navigation, router, visits} = setup();
  const pending = navigation.to("/projects/nathan-riley?task=task-alpha");
  await navigation.to("/projects/nathan-riley?task=task-beta");
  await pending;
  assert.equal(router.currentRoute.value.fullPath, "/projects/nathan-riley?task=task-beta");
  assert.ok(visits.every(v => v.allowed));
  assert.equal(navigation.aim.path, null);
});
