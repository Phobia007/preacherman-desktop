import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = path => readFile(join(import.meta.dirname, "..", path), "utf8");
const source = await read("src/surfaces/captureSurfaceContent.ts");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(appearance) {
  const ink = appearance === "light" ? "rgb(32, 35, 38)" : "rgb(229, 239, 243)";
  const text = [], clips = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, clip() {}, fill() {}, stroke() {}, roundRect() {},
    rect: (...args) => clips.push(args), fillText(word, x, y) { text.push({ word, x, y, color: this.fillStyle }); },
    measureText: () => ({ fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 }),
  };
  const canvas = { getContext: () => ctx };
  const rect = (left, top, width, height) => ({ left, top, width, height });
  const style = { display: "block", visibility: "visible", opacity: "1", borderRadius: "0", backgroundColor: "transparent",
    borderTopWidth: "0", overflowX: "visible", overflowY: "visible", fontSize: "16px", fontFamily: "sans-serif", fontWeight: "400", fontStyle: "normal", color: ink, textTransform: "none", zIndex: "auto" };
  const doc = { defaultView: { getComputedStyle: element => ({ ...style, ...element.style }) },
    createRange() { return { setStart(node) { this.node = node; }, setEnd() {}, getBoundingClientRect() { return this.node.box; } }; },
  };
  const el = (tagName, box, children = [], custom = {}) => ({
    tagName, children, childNodes: children, ownerDocument: doc, getBoundingClientRect: () => box,
    matches: () => false, style: custom,
  });
  const copy = el("P", rect(20, 60, 180, 20));
  copy.childNodes = [{ nodeType: 3, textContent: "Visible", box: rect(20, 60, 60, 20) }];
  const untouched = el("P", rect(20, 1200, 100, 20));
  untouched.getBoundingClientRect = () => { throw new Error("Offscreen subtree must not be visited"); };
  const belowFold = el("SECTION", rect(0, 1000, 800, 300), [untouched]);
  const body = el("BODY", rect(0, 0, 800, 1800), [copy, belowFold]);
  const frame = Object.assign(el("IFRAME", rect(0, 100, 800, 500)), { contentDocument: { body }, clientWidth: 800, clientHeight: 500 });
  const content = el("DIV", rect(0, 0, 800, 600), [frame]);
  const stage = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => rect(0, 0, 800, 600),
    querySelector: selector => selector === ".demo-surface-header" ? { getBoundingClientRect: () => rect(0, 0, 800, 100) } : content };
  const module = { exports: {}, document: { createElement: () => canvas }, Node: { TEXT_NODE: 3 }, DOMException, setTimeout, clearTimeout };
  runInNewContext(compiled, module);
  return { ...module.exports, stage, text, clips, ink };
}

for (const appearance of ["light", "dark"]) test(`${appearance}: imported iframe copy retains its ink, viewport position and transparent fixed header`, async () => {
  const h = harness(appearance);
  const canvas = await h.captureSurfaceContent(h.stage, new AbortController().signal);
  assert.equal(canvas.width, 800); assert.equal(canvas.height, 600);
  assert.deepEqual(h.text, [{ word: "Visible", x: 20, y: 174, color: h.ink }]);
  assert.ok(h.clips.length > 0 && h.clips.every(([, top]) => top >= 100));
});

test("cancelled captures stop before traversing the imported page", async () => {
  const h = harness("light"), abort = new AbortController(); abort.abort();
  await assert.rejects(h.captureSurfaceContent(h.stage, abort.signal), { name: "AbortError" });
  assert.equal(h.clips.length, 0);
});

test("Asset and Extension reuse the reversible Market interaction and exclude the fixed header from refraction", async () => {
  const [header, profile, css, capture] = await Promise.all([
    read("src/surfaces/SurfaceBrandHeader.tsx"), read("src/surfaces/market/MarketProfile.tsx"),
    read("src/surfaces/market/market-profile.css"), read("src/surfaces/market/captureMarketFrame.ts"),
  ]);
  assert.match(header, /<MarketProfile open=\{open\}/);
  assert.match(header, /captureSource=\{capture\}/);
  assert.match(profile, /if \(!captureSource && !frame\) return/);
  assert.match(profile, /event.key === "Escape"[\s\S]*onOpenChange\(false\)/);
  assert.match(profile, /settled && progress === 0[\s\S]*dispose\(\)/);
  assert.match(css, /clip-path: inset\(var\(--market-content-top, 100px\) 0 0\)/);
  assert.match(capture, /clearRect\(0, 0, canvas.width, headerHeight\)/);
  assert.doesNotMatch(capture, /header.backgroundColor/);
  assert.match(css, /color: var\(--demo-theme-gallery-control-hover\)/);
});
