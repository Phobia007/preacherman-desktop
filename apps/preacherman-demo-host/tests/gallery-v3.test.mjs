import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const galleryRoot = path.join(appRoot, "src", "surfaces", "gallery");
const runtimeRoot = path.join(appRoot, "public", "gallery-v3", "portfolio");

const read = (...segments) => fs.readFileSync(path.join(...segments), "utf8");

test("Gallery v3 embeds the copied local portfolio without replacement imagery", () => {
  const component = read(galleryRoot, "GallerySurface.tsx");
  const preview = read(galleryRoot, "preview", "main.tsx");
  assert.match(component, /gallery-v3\/portfolio\/index\.html/);
  assert.doesNotMatch(component, /\.(?:png|jpe?g|webp|avif)["']/i);
  assert.match(component, /gallery-source-ready/);
  assert.match(component, /gallery-theme/);
  assert.match(component, /hideProjectCards/);
  assert.match(component, /hideFeaturedControl/);
  assert.match(component, /data-reveal-state=\{revealState\}/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /setRevealState\("scanning"\)/);
  assert.match(component, /setRevealState\("waiting"\)/);
  assert.match(component, /setRevealState\("opening"\)/);
  assert.match(preview, /const \[baseReady, setBaseReady\] = useState\(false\)/);
  assert.match(preview, /cortana-model-stage__loading/);
  assert.match(preview, /baseReady \? <GallerySurface \/> : null/);
});

test("Gallery v3 reveal uses semantic theme variables and reduced motion", () => {
  const component = read(galleryRoot, "GallerySurface.tsx");
  const styles = read(galleryRoot, "gallery-surface.css");
  const tauriConfig = JSON.parse(read(appRoot, "src-tauri", "tauri.conf.json"));
  assert.match(styles, /--demo-theme-/);
  assert.match(styles, /--gallery-surface-scan-duration:\s*340ms/);
  assert.match(styles, /--gallery-surface-open-duration:\s*420ms/);
  assert.match(styles, /--gallery-surface-reveal-duration:\s*760ms/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /@keyframes[^}]*gallery/i);
  assert.match(styles, /transform:\s*scaleY\(0\)/);
  assert.match(styles, /transform:\s*scaleY\(1\)/);
  assert.match(styles, /data-reveal-state="opening"/);
  assert.match(styles, /gallery-surface-dismiss-line/);
  assert.match(styles, /gallery-surface__frame[\s\S]*opacity:\s*0\.001/);
  assert.match(
    styles,
    /data-reveal-state="opening"[^}]*gallery-surface__frame/,
  );
  assert.match(tauriConfig.app.security.csp, /worker-src[^;]*blob:/);
  assert.match(tauriConfig.app.security.devCsp, /worker-src[^;]*blob:/);
  assert.match(tauriConfig.app.security.csp, /script-src[^;]*'unsafe-eval'/);
  assert.match(tauriConfig.app.security.devCsp, /script-src[^;]*'unsafe-eval'/);
  assert.doesNotMatch(styles, /mix-blend-mode|isolation:\s*isolate/);
  assert.match(component, /onAnimationEnd=\{handleRevealEnd\}/);
  assert.match(component, /--demo-theme-gallery-control-hover/);
  assert.match(component, /querySelector<HTMLElement>\("\.demo-app-shell"\)/);
  assert.match(styles, /opacity:\s*var\(--demo-theme-gallery-overlay-opacity\)/);
  assert.doesNotMatch(styles, /1480ms|clip-path|inset\(39%|inset\(42%/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});

test("copied portfolio removes only its backdrop grid and top-left brand", () => {
  const runtime = read(runtimeRoot, "_nuxt", "D9b8F35K.js");
  const index = read(runtimeRoot, "index.html");
  assert.match(runtime, /setClearColor\(0,0\)/);
  assert.match(runtime, /setClearAlpha\(0\)/);
  assert.match(
    runtime,
    /setPixelRatio\(Math\.min\(1\.25,window\.devicePixelRatio\)\)/,
  );
  assert.doesNotMatch(runtime, /this\.core\.scene\.add\(e,t\),this\.sky=e,this\.ground=t/);
  assert.match(index, /\[data-od-id="brand-home"\]\{display:none!important\}/);
  assert.match(
    index,
    /\[data-od-id="profile-toggle"\]\{left:50%!important;right:auto!important;transform:translateX\(-50%\)!important\}/,
  );
  assert.match(index, /font-family:"Gallery Brother Signature"/);
  assert.match(index, /toggle\.textContent="Preacherman"/);
  assert.match(index, /一个智能容器/);
  assert.match(
    index,
    /Preacherman 统一管理虚拟人物资产，兼容通用引擎、真实工具完成任务。/,
  );
  assert.match(
    index,
    /在这里管理一位能持续学习、可部署、真正做事的人工智能。/,
  );
  assert.match(index, /信任你在虚拟世界里的第二身份/);
  assert.match(index, /dataset\.galleryProfileLine/);
  assert.match(index, /dataset\.galleryProfileHonors/);
  assert.match(index, /Nathan Riley/);
  assert.match(index, /Casa Di Solare/);
  assert.match(index, /data-od-id="profile-toggle"/);
  assert.match(index, /data-od-id="view-full"/);
  assert.match(
    index,
    /globalProperties\?\.\$router/,
  );
  assert.match(index, /router\.push\(route\)/);
  assert.doesNotMatch(index, /nuxtData\.dataset\.ssr="false"/);
  assert.doesNotMatch(index, /payload\[8\]=false/);
  assert.doesNotMatch(index, /setTimeout\(ready,50\)/);
  assert.doesNotMatch(index, /nuxtRoot\?\.__vue_app__/);
  assert.match(index, /const ready=\(\)=>\{syncInterface\(\)/);
  assert.match(
    index,
    /new MutationObserver\(syncInterface\)\.observe\(document\.documentElement/,
  );
  assert.match(index, /classList\.contains\("preview-ready"\)/);
  assert.match(index, /signalSourceReady/);
  assert.doesNotMatch(index, /setTimeout\(signalSourceReady,10000\)/);
  assert.match(index, /\[data-od-id="error-state"\]\{display:none!important\}/);
  assert.match(
    index,
    /\[data-gallery-hide-project-cards="true"\] \[data-od-id\^="project-card-"\]\{display:none!important\}/,
  );
  assert.doesNotMatch(index, /data-gallery-hide-project-cards="true"[^}]*background:transparent/);
  assert.match(
    index,
    /\[data-gallery-hide-featured-control="true"\] \[data-od-id="profile-toggle"\][\s\S]*-webkit-text-fill-color:currentColor!important/,
  );
  assert.match(
    index,
    /\[data-gallery-hide-featured-control="true"\] \[data-od-id="view-featured"\][\s\S]*display:none!important/,
  );
  assert.match(index, /dataset\.galleryHideProjectCards/);
  assert.match(index, /dataset\.galleryHideFeaturedControl/);
  assert.match(index, /--gallery-host-composite-key/);
  assert.match(index, /\[data-id="nathan-riley"\]\{aspect-ratio:2048\/1172\}/);
  assert.match(index, /\[data-id="casa-di-solare"\]\{aspect-ratio:2048\/1204\}/);
});

test("card-free Gallery leaves the Home scene untouched and exposes only the retained controls", () => {
  const component = read(galleryRoot, "GallerySurface.tsx");
  const styles = read(galleryRoot, "gallery-surface.css");

  assert.match(component, /data-featured-empty=\{showEmptyFeatured \? "true" : "false"\}/);
  assert.match(component, />\s*Preacherman\s*<\/button>/);
  assert.match(component, />\s*全部\s*<\/button>/);
  assert.match(component, /galleryView === "full"/);
  assert.match(styles, /data-featured-empty="true"[\s\S]*opacity:\s*0/);
  assert.doesNotMatch(styles, /mix-blend-mode:\s*screen/);
});

test("copied portfolio keeps original media and scopes runtime paths", () => {
  const manifest = JSON.parse(read(runtimeRoot, "textures", "manifest.json"));
  const values = Object.values(manifest);
  assert.ok(values.length >= 60);
  assert.ok(
    values.every((value) => value.startsWith("/gallery-v3/portfolio/textures/")),
  );
  assert.ok(fs.existsSync(path.join(runtimeRoot, "assets")));
  assert.ok(
    fs.existsSync(
      path.join(
        runtimeRoot,
        "assets",
        "fonts",
        "BrotherSignature-7BWnK.otf",
      ),
    ),
  );
  assert.ok(fs.existsSync(path.join(runtimeRoot, "projects")));
  assert.ok(fs.existsSync(path.join(runtimeRoot, "full", "index.html")));
  assert.ok(
    fs.existsSync(
      path.join(runtimeRoot, "projects", "casa-di-solare", "index.html"),
    ),
  );
});

test("Gallery uses the original Active Theory runtime with a fixed Cortana above the hidden SpineInstancer", () => {
  const app = read(appRoot, "src", "App.tsx");
  const component = read(galleryRoot, "ActiveTheoryGallerySurface.tsx");
  const patcher = read(galleryRoot, "scripts", "patch-active-theory-runtime.mjs");
  const activeTheoryRoot = path.join(appRoot, "public", "active-theory-gallery");
  const runtime = read(
    activeTheoryRoot,
    "gallery",
    "assets",
    "js",
    "app.1780406240914.js",
  );
  const entry = read(activeTheoryRoot, "gallery", "work.html");

  assert.match(app, /activeSurfaceType !== "market"/);
  assert.match(app, /<ActiveTheoryGallerySurface\s*\/>/);
  assert.match(component, /active-theory-gallery\/gallery\/work\.html/);
  assert.match(entry, /<base href="\/active-theory-gallery\/">/);
  assert.match(component, /<CortanaModelStage/);
  assert.match(component, /cameraFraming="portrait"/);
  assert.match(component, /environment="cinematic"/);
  assert.match(component, /renderActive=\{false\}/);
  assert.match(runtime, /__PREACHERMAN_SPINE_REMOVED__/);
  assert.doesNotMatch(runtime, /cortana-runtime\.glb/);
  assert.doesNotMatch(runtime, /node\.shader=_this\.shader/);
  assert.match(runtime, /const geo=\{location:\{countryCode:"US"\}\}/);
  assert.match(runtime, /server:"",roomKey:_this\.key,playerClass:"ScrollPlayer",maxInRoom:-1/);
  assert.match(runtime, /!_video\.destroy\|\|!_this\.texture/);
  assert.match(runtime, /_this\.initSync&&\(await _this\.initSync/);
  assert.match(runtime, /capture\.rt\.upload\(\),_this\.initSync&&/);
  assert.doesNotMatch(runtime, /us-central1-at-services\.cloudfunctions\.net\/geo/);
  assert.doesNotMatch(runtime, /wss:\/\/s\.dreamwave\.network\/ws/);
  assert.doesNotMatch(runtime, /for\(let i=0;i<40;i\+\+\)/);
  assert.match(patcher, /fixed portrait Cortana layer/);
  assert.ok(fs.existsSync(path.join(activeTheoryRoot, "assets", "geometry", "spine", "spine.bin")));
  assert.ok(fs.existsSync(path.join(activeTheoryRoot, "gallery", "external")));
});
