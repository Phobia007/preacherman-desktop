import fs from "node:fs";
import path from "node:path";

const runtimeRoot = path.resolve(
  process.cwd(),
  "apps/preacherman-demo-host/public/gallery-v3/portfolio",
);

if (!runtimeRoot.endsWith(path.join("public", "gallery-v3", "portfolio"))) {
  throw new Error(`Unexpected runtime root: ${runtimeRoot}`);
}

function replaceExact(source, before, after, expectedCount, label) {
  const actualCount = source.split(before).length - 1;
  const patchedCount = source.split(after).length - 1;
  if (actualCount === 0 && patchedCount >= expectedCount) return source;
  if (actualCount !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} occurrence(s), found ${actualCount}`);
  }
  return source.split(before).join(after);
}

const scenePath = path.join(runtimeRoot, "_nuxt", "D9b8F35K.js");
let scene = fs.readFileSync(scenePath, "utf8");
scene = replaceExact(
  scene,
  "this.renderer.setClearColor(0,1),this.renderer.setPixelRatio",
  "this.renderer.setClearColor(0,0),this.renderer.setPixelRatio",
  1,
  "transparent renderer clear",
);
scene = replaceExact(
  scene,
  "setClearAlpha(1)",
  "setClearAlpha(0)",
  3,
  "transparent frame clears",
);
scene = replaceExact(
  scene,
  "this.core.scene.add(e,t),this.sky=e,this.ground=t",
  "this.sky=e,this.ground=t",
  1,
  "remove backdrop and floor grid",
);
scene = replaceExact(
  scene,
  "this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio))",
  "this.renderer.setPixelRatio(Math.min(1.25,window.devicePixelRatio))",
  1,
  "cap foreground renderer pixel ratio",
);
scene = scene
  .replaceAll('"./models/award.glb"', '"/gallery-v3/portfolio/models/award.glb"')
  .replaceAll(
    '"./textures/manifest.json"',
    '"/gallery-v3/portfolio/textures/manifest.json"',
  )
  .replaceAll(
    'setTranscoderPath("./basis/")',
    'setTranscoderPath("/gallery-v3/portfolio/basis/")',
  );
scene = replaceExact(
  scene,
  '"/models/award.glb"',
  '"/gallery-v3/portfolio/models/award.glb"',
  1,
  "scope award model",
);
scene = replaceExact(
  scene,
  '"/textures/manifest.json"',
  '"/gallery-v3/portfolio/textures/manifest.json"',
  1,
  "scope texture manifest",
);
scene = replaceExact(
  scene,
  'setTranscoderPath("/basis/")',
  'setTranscoderPath("/gallery-v3/portfolio/basis/")',
  1,
  "scope basis transcoder",
);
fs.writeFileSync(scenePath, scene);

const rainPath = path.join(runtimeRoot, "_nuxt", "BNIAOxM5.js");
let rain = fs.readFileSync(rainPath, "utf8");
rain = rain.replaceAll(
  '"./models/llama.glb"',
  '"/gallery-v3/portfolio/models/llama.glb"',
);
rain = replaceExact(
  rain,
  '"/models/llama.glb"',
  '"/gallery-v3/portfolio/models/llama.glb"',
  1,
  "scope llama model",
);
fs.writeFileSync(rainPath, rain);

const manifestPath = path.join(runtimeRoot, "textures", "manifest.json");
let manifest = fs.readFileSync(manifestPath, "utf8");
const scopedTextureCount = manifest.split('": "/textures/').length - 1;
const relativeTextureCount = manifest.split('": "./textures/').length - 1;
if (scopedTextureCount > 0 || relativeTextureCount > 0) {
  manifest = manifest
    .replaceAll('": "/textures/', '": "/gallery-v3/portfolio/textures/')
    .replaceAll('": "./textures/', '": "/gallery-v3/portfolio/textures/');
} else if (!manifest.includes('": "/gallery-v3/portfolio/textures/')) {
  throw new Error("texture manifest contains no runtime texture paths");
}
fs.writeFileSync(manifestPath, manifest);

const sourceOverrides = `<style id="gallery-host-overrides">
html,body,#__nuxt,#__nuxt>.bg-black{background:var(--gallery-host-composite-key,#000)!important}
body:before{display:none!important}
[data-od-id="error-state"]{display:none!important}
[data-id="nathan-riley"]{aspect-ratio:2048/1172}
[data-id="casa-di-solare"]{aspect-ratio:2048/1204}
[data-id="the-lookback"]{aspect-ratio:1250/720}
[data-id="book-of-happiness"]{aspect-ratio:2048/1114}
[data-id="dogelon-mars"]{aspect-ratio:3360/2200}
[data-id="gil-huybrecht"]{aspect-ratio:1196/720}
[data-id="discoveryland"]{aspect-ratio:1372/1029}
[data-id="griflan"]{aspect-ratio:1162/720}
@font-face{font-family:"Gallery Brother Signature";src:url("/gallery-v3/portfolio/assets/fonts/BrotherSignature-7BWnK.otf") format("opentype");font-style:normal;font-weight:400;font-display:swap}
[data-od-id="brand-home"]{display:none!important}
[data-od-id="profile-toggle"]{left:50%!important;right:auto!important;transform:translateX(-50%)!important}
[data-od-id="profile-toggle"][aria-expanded="false"]{font-family:"Gallery Brother Signature","Segoe Script","Brush Script MT",cursive!important;font-size:clamp(28px,2.2vw,38px)!important;font-style:normal!important;font-weight:400!important;line-height:1!important;letter-spacing:normal!important;text-transform:none!important;white-space:nowrap}
[data-gallery-profile-copy]{max-width:none!important}
[data-gallery-profile-line]{display:block;white-space:nowrap}
[data-gallery-profile-honors]{display:none!important}
@media(max-width:649px){[data-gallery-profile-line]{white-space:normal}}
[data-gallery-hide-project-cards="true"] [data-od-id^="project-card-"]{display:none!important}
[data-gallery-hide-featured-control="true"] [data-od-id="view-featured"],[data-gallery-hide-featured-control="true"] nav[aria-label="项目视图"]>span[aria-hidden="true"]{display:none!important}
[data-gallery-hide-featured-control="true"] [data-od-id="profile-toggle"],[data-gallery-hide-featured-control="true"] [data-od-id="view-full"]{-webkit-text-fill-color:currentColor!important}
[data-od-id="interface-chrome"]{color:var(--gallery-host-text,#fff)}
:focus-visible{outline:2px solid var(--gallery-host-focus,#fff)!important;outline-offset:4px}
</style>`;

const sourceBridge = `<script id="gallery-host-bridge">(()=>{
const base="/gallery-v3/portfolio/";
const applyTheme=data=>{if(!data||data.type!=="gallery-theme")return;const root=document.documentElement;root.dataset.galleryAppearance="dark";root.dataset.galleryHideProjectCards=String(Boolean(data.hideProjectCards));root.dataset.galleryHideFeaturedControl=String(Boolean(data.hideFeaturedControl));if(data.text)root.style.setProperty("--gallery-host-text",data.text);if(data.focus)root.style.setProperty("--gallery-host-focus",data.focus);if(data.compositeKey)root.style.setProperty("--gallery-host-composite-key",data.compositeKey)};
addEventListener("message",event=>applyTheme(event.data));
const normalizeLinks=()=>{for(const anchor of document.querySelectorAll("a[href]")){const raw=anchor.getAttribute("href");if(!raw||raw.startsWith("#")||raw.startsWith("mailto:")||raw.startsWith("tel:"))continue;let url;try{url=new URL(raw,location.href)}catch{continue}if(url.origin!==location.origin)continue;const odId=anchor.dataset.odId;const relative=url.pathname.startsWith(base)?url.pathname.slice(base.length):url.pathname.slice(1);const parts=relative.split("/").filter(Boolean);if(odId==="brand-home"||odId==="view-featured"||url.pathname==="/"){url.pathname=base}else if(odId==="view-full"||parts[0]==="full"){url.pathname=base+"full/index.html"}else if(parts[0]==="projects"&&parts[1]){url.pathname=base+"projects/"+parts[1]+"/index.html"}else continue;anchor.href=url.href}};
const routeFor=target=>{const card=target.closest?.('[data-od-id^="project-card-"]');const slug=card?.dataset?.id;if(slug)return"/projects/"+encodeURIComponent(slug);const anchor=target.closest?.("a[href]");if(!anchor)return null;const odId=anchor.dataset.odId;if(odId==="brand-home"||odId==="view-featured")return"/";if(odId==="view-full")return"/full";let url;try{url=new URL(anchor.href,location.href)}catch{return null}if(url.origin!==location.origin)return null;const relative=url.pathname.startsWith(base)?url.pathname.slice(base.length):url.pathname.slice(1);const parts=relative.split("/").filter(Boolean);if(relative===""||relative==="index.html")return"/";if(parts[0]==="full")return"/full";if(parts[0]==="projects"&&parts[1])return"/projects/"+parts[1];return null};
const fallbackFor=route=>route==="/"?base:route==="/full"?base+"full/index.html":base+route.slice(1)+"/index.html";
const navigate=route=>{const router=document.querySelector("#__nuxt")?.__vue_app__?.config?.globalProperties?.$router;if(!router){location.href=fallbackFor(route);return}Promise.resolve(router.push(route)).catch(()=>{location.href=fallbackFor(route)})};
document.addEventListener("click",event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const route=routeFor(event.target);if(!route)return;event.preventDefault();event.stopImmediatePropagation();navigate(route)},true);
const normalizeProfileLabel=()=>{const toggle=document.querySelector('[data-od-id="profile-toggle"]');if(toggle?.textContent?.trim()==="简介")toggle.textContent="Preacherman"};
const profileLines=["一个智能容器","Preacherman 统一管理虚拟人物资产，兼容通用引擎、真实工具完成任务。","在这里管理一位能持续学习、可部署、真正做事的人工智能。","信任你在虚拟世界里的第二身份"];
const normalizeProfileCopy=()=>{const paragraphs=[...document.querySelectorAll("p")];const biography=paragraphs.find(paragraph=>paragraph.textContent?.includes("Jesper Landberg"));if(biography){biography.replaceChildren(...profileLines.map((line,index)=>{const span=document.createElement("span");span.dataset.galleryProfileLine=String(index+1);span.textContent=line;return span}));biography.dataset.galleryProfileCopy="true"}const honors=paragraphs.find(paragraph=>paragraph.textContent?.includes("Awwwards")&&paragraph.textContent?.includes("74"));if(honors)honors.dataset.galleryProfileHonors="true"};
const syncInterface=()=>{normalizeLinks();normalizeProfileLabel();normalizeProfileCopy()};
let sourceReadySent=false;
const signalSourceReady=()=>{if(sourceReadySent)return;sourceReadySent=true;requestAnimationFrame(()=>requestAnimationFrame(()=>parent.postMessage({type:"gallery-source-ready",path:location.pathname},"*")))};
const ready=()=>{syncInterface();if(document.body.classList.contains("preview-ready")){signalSourceReady();return}const observer=new MutationObserver(()=>{if(!document.body.classList.contains("preview-ready"))return;observer.disconnect();signalSourceReady()});observer.observe(document.body,{attributes:true,attributeFilter:["class"]})};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});else ready();
new MutationObserver(syncInterface).observe(document.documentElement,{subtree:true,childList:true});
})()</script>`;

function collectHtmlFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectHtmlFiles(entryPath));
    else if (entry.name === "index.html") files.push(entryPath);
  }
  return files;
}

const htmlFiles = collectHtmlFiles(runtimeRoot);
for (const htmlPath of htmlFiles) {
  let html = fs.readFileSync(htmlPath, "utf8");
  const hasOverrides = html.includes('id="gallery-host-overrides"');
  const hasBridge = html.includes('id="gallery-host-bridge"');
  if (hasOverrides !== hasBridge) {
    throw new Error(`Gallery source patch is incomplete: ${htmlPath}`);
  }
  html = html.replaceAll('baseURL:"/"', 'baseURL:"/gallery-v3/portfolio/"');
  html = html
    .replaceAll('url("RECON/screenshots/polish-1440.png")', "none")
    .replaceAll('url("RECON/screenshots/polish-768.png")', "none")
    .replaceAll('url("RECON/screenshots/polish-390.png")', "none");
  if (!hasOverrides) {
    html = html.replace("</head>", `${sourceOverrides}</head>`);
    html = html.replace("</body>", `${sourceBridge}</body>`);
  } else {
    html = html.replace(
      /<style id="gallery-host-overrides">[\s\S]*?<\/style>/,
      sourceOverrides,
    );
    html = html.replace(
      /<script id="gallery-host-bridge">[\s\S]*?<\/script>/,
      sourceBridge,
    );
    if (!html.includes("body:before{background:transparent!important}")) {
      html = html.replace(
        "html,body{background:transparent!important}",
        "html,body{background:transparent!important}\\nbody:before{background:transparent!important}",
      );
    }
  }
  fs.writeFileSync(htmlPath, html);
}

console.log(JSON.stringify({ runtimeRoot, htmlFiles: htmlFiles.length }, null, 2));
