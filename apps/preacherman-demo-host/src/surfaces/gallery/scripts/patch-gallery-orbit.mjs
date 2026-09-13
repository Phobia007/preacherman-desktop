// Keep the authored detail camera. The shared companion scene owns the overview.
import fs from "node:fs";
import path from "node:path";
const file = path.resolve("apps/preacherman-demo-host/public/active-theory-gallery/gallery/assets/js/app.1780406240914.js");
let source = fs.readFileSync(file, "utf8");
const before = '_this.handleCameraScroll=_=>{if(_this.flag("locked"))return;';
const after = '_this.handleCameraScroll=_=>{if(document.documentElement.dataset.galleryNativeRail==="true"||_this.flag("locked"))return;';
if (!source.includes(after)) {
  if (source.split(before).length !== 2) throw new Error("Gallery orbit camera patch drift");
  source = source.replace(before, after);
  fs.writeFileSync(file, source);
}
