import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = join(import.meta.dirname, "..");
const read = path => readFile(join(root, path), "utf8");
const generated = await read("src/surfaces/market/task-profile-source.ts");
const controller = await read("src/surfaces/market/TaskProfileLens.ts");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const task = { exports: {} };
runInNewContext(compile(generated), task);

function harness({ reduced = false, compileFails = false } = {}) {
  let now = 0, id = 0;
  const raf = new Map(), listeners = new Map(), motionListeners = new Map(), resources = [];
  const media = { matches: reduced, addEventListener: (key, fn) => motionListeners.set(key, fn), removeEventListener: key => motionListeners.delete(key) };
  const document = { hidden: false, createElement: () => ({ remove() { this.removed = true; } }), addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  class Disposable { constructor() { resources.push(this); } dispose() { this.disposed = true; } }
  class Material extends Disposable { constructor(options) { super(); Object.assign(this, options); } }
  class Renderer extends Disposable {
    constructor({ canvas }) { super(); this.domElement = canvas; }
    setPixelRatio(ratio) { this.ratio = ratio; }
    setSize() {} setClearColor() {}
    compile() { if (compileFails) throw new Error("compile failed"); }
    render() { this.renders = (this.renders || 0) + 1; }
    forceContextLoss() { this.lost = true; }
  }
  const three = { CanvasTexture: Disposable, LinearFilter: 1, Mesh: class {}, OrthographicCamera: class {}, PlaneGeometry: Disposable, Scene: class { add() {} }, ShaderMaterial: Material, Vector2: class {}, WebGLRenderer: Renderer };
  const module = { exports: {}, require: path => path === "three" ? three : task.exports, window: { matchMedia: () => media }, document, performance: { now: () => now }, requestAnimationFrame: fn => { raf.set(++id, fn); return id; }, cancelAnimationFrame: key => raf.delete(key) };
  runInNewContext(compile(controller), module);
  const frames = [];
  const create = () => new module.exports.TaskProfileLens({ append() {} }, { width: 1800, height: 1000 }, (progress, settled) => frames.push({ progress, settled }));
  const step = time => { now = time; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(fn => fn(now)); };
  return { ...module.exports, create, step, frames, raf, listeners, motionListeners, resources, document };
}

test("the generated vertex/fragment and curve are exactly Task's source, not a CSS imitation", async () => {
  const source = await read("public/gallery-v3/portfolio/_nuxt/D9b8F35K.js");
  const shaders = source.match(/const p0=`([\s\S]*?)`,C3=`([\s\S]*?)`,P3=/);
  const clean = value => value.replace(/\/\/[^\n]*/g, "").replace(/\n\s*\n/g, "\n").trim();
  assert.equal(task.exports.taskProfileVertex, clean(shaders[1]));
  assert.equal(task.exports.taskProfileFragment, clean(shaders[2]));
  assert.equal(JSON.stringify(task.exports.taskProfileCurve), JSON.stringify(runInNewContext(source.match(/pU=(\[\[.*?\]\]),zu=/)[1])));
  assert.ok(source.includes("duration:e?.85:.65,ease:zu"));
  assert.match(source, /WU=\.11,qU=1\.5,XU=\.09,\$U=\.3,YU=\.05,KU=-\.1,jU=\.25,ZU=\.3,JU=\.015,QU=\.004/);
  assert.equal(JSON.stringify(task.exports.taskProfileSettings), JSON.stringify({ open: 850, close: 650, lens: 1.5, reach: 0.09, orbit: 0.3, wave: 0.05, closeSquash: -0.1, squashOpen: 300, squashClose: 250, breath: 0.015, aberration: 0.004 }));
});

test("Market adapts only transparent compositing, retaining every Task lens expression", () => {
  const { marketProfileFragment } = harness();
  const restored = marketProfileFragment
    .replace("return vec4(0.0);", "return vec4(0.0, 0.0, 0.0, 1.0);")
    .replace("vec4 col = vec4(cr.r, cg.g, cb.b, max(cr.a, max(cg.a, cb.a)));", "vec4 col = vec4(cr.r, cg.g, cb.b, 1.0);")
    .replace("mix(col, vec4(0.0), inside)", "mix(col, vec4(0.0, 0.0, 0.0, 1.0), inside)");
  assert.equal(restored, task.exports.taskProfileFragment);
});

test("source easing has exact endpoints and continuous monotone progression", () => {
  const { taskProfileEase: ease } = harness();
  assert.equal(ease(0), 0); assert.equal(ease(1), 1);
  for (let i = 1; i <= 1000; i++) assert.ok(ease(i / 1000) >= ease((i - 1) / 1000));
  for (const point of [0.157, 0.348]) assert.ok(Math.abs(ease(point + 0.00001) - ease(point - 0.00001)) < 0.001);
});

test("interrupted transitions reuse a renderer, pause when hidden and dispose completely", () => {
  const h = harness(), lens = h.create();
  lens.setOpen(true); h.step(250);
  const partial = h.frames.at(-1).progress; assert.ok(partial > 0 && partial < 1);
  lens.setOpen(false); h.step(350); assert.ok(h.frames.at(-1).progress < partial);
  lens.setOpen(true); h.step(1200); assert.equal(h.frames.at(-1).progress, 1);
  assert.equal(h.raf.size, 1);
  h.document.hidden = true; h.listeners.get("visibilitychange")(); assert.equal(h.raf.size, 0);
  h.document.hidden = false; h.listeners.get("visibilitychange")(); assert.equal(h.raf.size, 1);
  lens.setOpen(false); h.step(1850); assert.equal(h.frames.at(-1).progress, 0); assert.equal(h.raf.size, 0);
  lens.dispose(); lens.dispose();
  assert.ok(h.resources.every(resource => resource.disposed));
  assert.equal(h.resources.filter(resource => "renders" in resource).length, 1);
  assert.ok(h.resources.some(resource => resource.lost && resource.domElement.removed && resource.ratio === 1));
  assert.equal(h.listeners.size, 0); assert.equal(h.motionListeners.size, 0);
});

test("reduced motion renders the settled state once without an idle animation", () => {
  const h = harness({ reduced: true }), lens = h.create();
  lens.setOpen(true); h.step(1); assert.equal(h.frames.at(-1).progress, 1); assert.equal(h.raf.size, 0);
  lens.setOpen(false); h.step(2); assert.equal(h.frames.at(-1).progress, 0); assert.equal(h.raf.size, 0);
  lens.dispose(); assert.ok(h.resources.every(resource => resource.disposed));
});

test("failed renderer preparation releases every resource without adding listeners", () => {
  const h = harness({ compileFails: true });
  assert.throws(h.create, /compile failed/);
  assert.ok(h.resources.every(resource => resource.disposed));
  assert.ok(h.resources.some(resource => resource.lost));
  assert.equal(h.raf.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.motionListeners.size, 0);
});

test("capture is current, local, bounded and abortable; text finishes independently of lens timing", async () => {
  const capture = await read("src/surfaces/market/captureMarketFrame.ts");
  const profile = await read("src/surfaces/market/MarketProfile.tsx");
  const css = await read("src/surfaces/market/market-profile.css");
  assert.match(capture, /getBoundingClientRect\(\)/);
  assert.match(capture, /image\.decode\(\)/);
  assert.match(capture, /5000/);
  assert.match(capture, /finally[\s\S]*clearTimeout\(deadline\)[\s\S]*removeEventListener\("abort", cancel\)/);
  assert.doesNotMatch(capture, /fetch\(|getDisplayMedia|https?:\/\//);
  assert.match(profile, /return \(\) => abort\.abort\(\)/);
  assert.match(profile, /settled && progress === 0[\s\S]*dispose\(\)[\s\S]*onLensActiveChange\(false\)/);
  assert.match(css, /\[data-open="true"\] .market-profile__content p span/);
  assert.doesNotMatch(css, /\[data-phase="opening"\]/);
  assert.match(css, /--demo-theme-market-ink-shadow/);
});

