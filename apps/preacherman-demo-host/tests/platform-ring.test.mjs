import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const renderer = new URL("../../../packages/preacherman-avatar-renderer/src/", import.meta.url);
const read = file => readFileSync(new URL(file, renderer), "utf8");
function module(source, require = () => ({}), globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require, ...globals });
  return exports;
}
const motion = module(read("platformRingMotion.ts"));

test("breathing has a longer exhale, bounded intensity and smooth turns without a loop seam", () => {
  const { platformBreath: breath, PLATFORM_BREATH_SECONDS: period } = motion;
  const step = .001;
  for (let t = 0; t < period * 3; t += step) {
    assert.ok(breath(t) >= -1e-10 && breath(t) <= 1 + 1e-10);
    assert.ok(Math.abs(breath(t + step) - breath(t)) < .001);
    assert.ok(Math.abs(breath(t + period) - breath(t)) < 1e-10);
  }
  const peak = 3.1;
  assert.ok(period - peak > peak);
  for (const t of [0, peak, period]) {
    assert.ok(Math.abs(breath(t + step) - breath(t - step)) < 1e-8);
    assert.ok(Math.abs(breath(t + step) - 2 * breath(t) + breath(t - step)) < 1e-8);
  }
});

function sceneHarness(appearance, initiallyReduced = false) {
  let frame, mediaChange, cleaned = false, hiddenAncestor = false;
  const nodes = [], cleanups = [];
  const preference = { matches: initiallyReduced,
    addEventListener: (_, callback) => { mediaChange = callback; },
    removeEventListener: (_, callback) => { assert.equal(callback, mediaChange); cleaned = true; } };
  const document = { hidden: false, documentElement: { dataset: { appearance } } };
  const jsx = (type, props) => {
    if (typeof type === "function") return type(props);
    const node = { type, props }; nodes.push(node); return node;
  };
  const environment = module(read("CinematicEnvironment.tsx"), name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "@react-three/fiber") return { useFrame: callback => { frame = callback; } };
    if (name === "react") return { useRef: current => ({ current }), useMemo: callback => callback(), useEffect: callback => cleanups.push(callback()) };
    if (name === "three") return { AdditiveBlending: 2, DoubleSide: 2 };
    if (name === "./platformRingMotion") return motion;
    throw Error(name);
  }, { document, window: { matchMedia: () => preference } });
  environment.CinematicEnvironment({ isolateCompanion: false });
  const uniforms = nodes.find(node => node.type === "shaderMaterial").props.uniforms;
  return { nodes, uniforms, document,
    tick: delta => frame({ gl: { domElement: { closest: () => hiddenAncestor } } }, delta),
    reduce: value => { preference.matches = value; mediaChange(); },
    hide: value => { hiddenAncestor = value; },
    cleanup: () => { cleanups.forEach(callback => callback?.()); assert.ok(cleaned); } };
}

for (const appearance of ["light", "dark"]) {
  test(`${appearance}: decorative ring pauses for hidden/reduced-motion states and resumes without jumping`, () => {
    const h = sceneHarness(appearance);
    try {
      assert.equal(h.nodes.filter(node => node.type === "shaderMaterial").length, 1);
      assert.ok(h.nodes.every(node => !Object.keys(node.props).some(key => /onClick|onPointer|onFocus/.test(key))));
      const start = h.uniforms.uTime.value;
      h.tick(.016); assert.ok(h.uniforms.uTime.value > start);
      const freeze = JSON.stringify(h.uniforms);
      h.reduce(true); h.tick(30); assert.equal(JSON.stringify(h.uniforms), freeze);
      h.reduce(false); h.document.hidden = true; h.tick(30); assert.equal(JSON.stringify(h.uniforms), freeze);
      h.document.hidden = false; h.hide(true); h.tick(30); assert.equal(JSON.stringify(h.uniforms), freeze);
      h.hide(false); const before = h.uniforms.uTime.value; h.tick(30);
      assert.ok(h.uniforms.uTime.value - before < .051);
      assert.ok(h.uniforms.uBreath.value >= 0 && h.uniforms.uBreath.value <= 1);
    } finally { h.cleanup(); }
  });
  test(`${appearance}: reduced-motion users receive a visible, stable ring from the first frame`, () => {
    const h = sceneHarness(appearance, true);
    try {
      const before = JSON.stringify(h.uniforms);
      h.tick(1); h.tick(1); assert.equal(JSON.stringify(h.uniforms), before);
      assert.ok(h.uniforms.uBreath.value > 0);
    } finally { h.cleanup(); }
  });
}

test("the companion platform cannot start recording or become a hidden button", () => {
  const stage = readFileSync(new URL("../src/gallery/CortanaModelStage.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(stage, /wakeEnabled|toggleWake|awakened|voice-wake|<button/);
  assert.doesNotMatch(app, /wakeEnabled/);
  assert.doesNotMatch(css, /cortana-model-stage__wake-button/);
  assert.match(css, /\.cortana-model-stage--persistent canvas\s*\{\s*pointer-events: none/);
  assert.match(stage, /preacherman:avatar-jaw/);
  assert.match(stage, /motionSource=\{speechMotionRuntime\}/);
});
