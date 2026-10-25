import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { transform } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
const state = {
  service: { provider: "breeze", model: "Breeze-TTS-2", region: "local", workspaceId: "" },
  selectedVoiceId: "breeze:cortana", breezeStatus: "connected",
  voices: [{ id: "breeze:cortana", name: "cortana", source: "breeze", description: "舒缓的，凌厉的温柔女声" }],
};
async function component(path, values) {
  const { code } = await transform(await readFile(new URL(path, import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" });
  let index = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, require: id => {
    if (id === "react") return { ...React, useState: initial => [index < values.length ? values[index++] : initial, () => {}], useEffect() {}, useRef: current => ({ current }) };
    if (id === "react/jsx-runtime") return nativeRequire(id);
    if (id === "./AssetActivateButton") return { AssetActivateButton: props => React.createElement("button", { disabled: !props.enabled }, props.activated ? "Applied" : "Apply") };
    return {};
  } });
  return module.exports;
}

for (const appearance of ["light", "dark"]) {
  test(`Voice opens directly on its grid without surrounding copy in ${appearance}`, async () => {
    const { AssetVoice } = await component("../src/surfaces/asset/AssetVoice.tsx", [state, "breeze:cortana", null, ""]);
    const html = renderToStaticMarkup(React.createElement("div", { "data-appearance": appearance }, React.createElement(AssetVoice, { character: { id: "cortana", name: "Cortana" }, enabled: true, onOpenService() {} })));
    assert.match(html, /asset-pack-browser__scroll"><div class="asset-pack-grid"/);
    assert.equal((html.match(/class="asset-pack-tile(?: |")/g) || []).length, 12);
    assert.match(html, /Preview cortana/);
    assert.match(html, /aria-label="Applied"/);
    assert.match(html, />Applied<\/button>/);
    assert.match(html, /Add voice preview/);
    assert.doesNotMatch(html, /<h[23]|Voice collection|Connected on this computer|Refresh Breeze|Create \/ manage|Click a tile|Hold Apply|[\u3400-\u9fff]/);
  });
  test(`Breeze management stays available in Voice Service in ${appearance}`, async () => {
    const { VoiceServiceSettings } = await component("../src/settings/VoiceServiceSettings.tsx", [state.service, JSON.stringify(state.service), false, "", "", true]);
    const html = renderToStaticMarkup(React.createElement("div", { "data-appearance": appearance }, React.createElement(VoiceServiceSettings, { characterId: "cortana", onOpenVoice() {} })));
    assert.match(html, /Breeze · Connected on this computer/);
    assert.match(html, /Refresh Breeze voices/);
    assert.match(html, /Create \/ manage in Breeze/);
    assert.match(html, /Open Voice/);
    assert.doesNotMatch(html, /[\u3400-\u9fff]/);
  });
}
