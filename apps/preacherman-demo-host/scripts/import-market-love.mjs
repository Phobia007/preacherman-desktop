import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, relative } from "node:path";

// Reproducible vendor import: paper/ink, storage isolation and the requested footer removal.
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/import-market-love.mjs <local Cartier project>");
const destination = resolve(import.meta.dirname, "../public/market-love");
await mkdir(join(destination, "assets"), { recursive: true });
for (const asset of ["configurator", "css", "fonts", "images", "media", "love-intro.js"]) {
  await cp(join(source, "assets", asset), join(destination, "assets", asset), { recursive: true });
}
function replaceOnce(text, needle, replacement) {
  if (text.split(needle).length !== 2) throw new Error(`Source changed: expected one ${needle}`);
  return text.replace(needle, replacement);
}
const contract = `<!-- THESIS: Import the complete LOVE experience onto the existing Preacherman stage.
OWN-WORLD: Original layout, fonts, assets and interaction; transparent paper, white ink.
STORY: Read the full introduction, start designing, configure and return with a saved selection.
FIRST VIEWPORT: The original header, film and introduction below the persistent desktop controls.
FORM: User-pinned complete document import; no composition redesign.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->`;
for (const page of ["cartier-love.html", "love-configurator.html"]) {
  let html = await readFile(join(source, page), "utf8");
  if (page === "cartier-love.html") {
    const footer = html.match(/<footer class="love-footer" data-od-id="site-footer">[\s\S]*?<\/footer>/g);
    if (footer?.length !== 1) throw new Error("Source changed: expected exactly one LOVE footer");
    html = replaceOnce(html, footer[0], "");
  }
  html = replaceOnce(html, "</head>", '<link rel="stylesheet" href="market-embed.css"><script src="market-embed.js"></script></head>');
  html = replaceOnce(html, "<body>", `<body>\n${contract}`);
  await writeFile(join(destination, page), html);
}
const bundlePath = join(destination, "assets/configurator/app.js");
let bundle = await readFile(bundlePath, "utf8");
const originalBundleSha256 = createHash("sha256").update(bundle).digest("hex");
// These four screen-space shaders draw white page/summary backing, not the jewelry.
// Keep their uniforms, animation clocks and lifecycle, making only the backing transparent.
for (const fragment of [
  "gl_FragColor = vec4(color, uOpacity);",
  "gl_FragColor = vec4(color, uOpacity * (1.0 - fade));",
  "gl_FragColor = vec4(color, alpha);",
  "gl_FragColor = vec4(vec3(30.0), alpha);",
]) bundle = replaceOnce(bundle, fragment, "gl_FragColor = vec4(0.0);");
// The solid white environment sphere is visible backing, separate from the EXR lighting.
bundle = replaceOnce(bundle, "G.jsx(e6,{})", "null/* market: transparent world backing */");
// Multiplicative/additive floor planes assumed an opaque white world. Composite their
// shadow and gold caustics with coverage alpha instead, so empty plane pixels stay clear.
bundle = replaceOnce(bundle,
  "color = mix(color, vec3(1.0), uFadeValue);\n\n                    gl_FragColor = vec4(color, 1.0);",
  "color = mix(color, vec3(1.0), uFadeValue);\n\n                    gl_FragColor = vec4(vec3(0.0), 1.0 - clamp(color.r, 0.0, 1.0));");
bundle = replaceOnce(bundle, "depthWrite:!1,blending:Fx", "depthWrite:!1,transparent:!0,blending:1/* market: shadow alpha */");
bundle = replaceOnce(bundle, "gl_FragColor = vec4(color, 1.0 - uFadeValue);",
  "float coverage = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0) * (1.0 - uFadeValue);\n                    gl_FragColor = vec4(color * (1.0 - uFadeValue) / max(coverage, 0.00001), coverage);");
bundle = replaceOnce(bundle, "depthWrite:!1,blending:Px", "depthWrite:!1,transparent:!0,blending:1/* market: caustics alpha */");
await writeFile(bundlePath, bundle);
for (const script of ["assets/love-intro.js", "assets/configurator/local-adapter.js"]) {
  const path = join(destination, script);
  const text = await readFile(path, "utf8");
  if (!text.includes("cartier-love-saved")) throw new Error(`Missing wishlist key in ${script}`);
  await writeFile(path, text.replaceAll("cartier-love-saved", "preacherman.market.love.saved"));
}
const files = [];
async function record(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await record(path);
    else {
      const bytes = await readFile(path);
      files.push({ path: relative(destination, path).replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
await record(join(destination, "assets"));
await writeFile(join(destination, "import-manifest.json"), JSON.stringify({
  sourceProject: "70f215b1-59d7-4c44-a675-0a48d1730917", importedAt: new Date().toISOString(),
  originalBundleSha256,
  scope: "Local experience with the requested site footer removed; transparent paper, white text and isolated wishlist storage.",
  files,
}, null, 2) + "\n");
console.log(`Imported ${files.length} assets into ${destination}`);
