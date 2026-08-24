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
  const styles = read(galleryRoot, "gallery-surface.css");
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
  assert.match(styles, /gallery-surface__frame[\s\S]*opacity:\s*0/);
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
  assert.match(index, /classList\.contains\("preview-ready"\)/);
  assert.match(index, /signalSourceReady/);
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
