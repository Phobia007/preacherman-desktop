// Keep the authored detail camera. The shared companion scene owns the overview.
import fs from "node:fs";
import path from "node:path";
const file = path.resolve("apps/preacherman-demo-host/public/active-theory-gallery/gallery/assets/js/app.1780406240914.js");
let source = fs.readFileSync(file, "utf8");
const before = '_this.handleCameraScroll=_=>{if(_this.flag("locked"))return;';
const after = '_this.handleCameraScroll=_=>{if(document.documentElement.dataset.galleryNavigationOwner==="native"||document.documentElement.dataset.galleryNativeRail==="true"||_this.flag("locked"))return;';
if (!source.includes(after)) {
  if (source.split(before).length !== 2) throw new Error("Gallery orbit camera patch drift");
  source = source.replace(before, after);
  fs.writeFileSync(file, source);
}

// The native picker owns navigation even while the legacy detail is visible.
const navigationPatches = [
  [
    "document.documentElement.dataset.galleryNativeRail===\"true\"||typeof _this.get!==\"function\"",
    "document.documentElement.dataset.galleryNavigationOwner===\"native\"||document.documentElement.dataset.galleryNativeRail===\"true\"||typeof _this.get!==\"function\""
  ],
  [
    "val==`work/${_this.data.perma}`&&(_this.set(\"Work/project\",_this.data)",
    "val==`work/${_this.data.perma}`&&(window.PreachermanGalleryDetail?.acceptsProjectRoute(_this.data.perma)??true)&&(_this.set(\"Work/project\",_this.data)"
  ]
];
for (const [before, after] of navigationPatches) {
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw new Error("Gallery navigation patch drift");
  source = source.replace(before, after);
}
fs.writeFileSync(file, source);


// Native cards and the detail room are separate scenes. Never composite the
// retired colorful orbit into the room, including its first and last frames.
const nativeRoomPatches = [
  [
    '_this.handleCameraScroll=_=>{if(document.documentElement.dataset.galleryNativeRail==="true"||_this.flag("locked"))return;',
    '_this.handleCameraScroll=_=>{if(document.documentElement.dataset.galleryNavigationOwner==="native"||document.documentElement.dataset.galleryNativeRail==="true"||_this.flag("locked"))return;'
  ],
  [
    'uTransition:{value:0},tDetail:{value:_this.detail}',
    'uTransition:{value:document.documentElement.dataset.galleryNavigationOwner==="native"?1:0},tDetail:{value:_this.detail}'
  ],
  [
    '_this.bind("Work/project",((data,prevData)=>{data?(_this.findParent("ViewController").lockScroll()',
    '_this.bind("Work/project",((data,prevData)=>{if(document.documentElement.dataset.galleryNavigationOwner==="native"){_this.composite.set("uTransition",1);if(data){_this.findParent("ViewController").lockScroll();_this.detail.visible=!0}else if(prevData){_this.fire("ChatDOM/clearText");_this.fire("ChatDOM/resetOptions");_this.navigate("work");_this.findParent("ViewController").unlockScroll()}return}data?(_this.findParent("ViewController").lockScroll()'
  ],
  [
    '_this.bind("Work/project",((data,prevData)=>{data?(_this.fire("WorkDetailContent/updateText",data)',
    '_this.bind("Work/project",((data,prevData)=>{if(document.documentElement.dataset.galleryNavigationOwner==="native"){camera.group.position.z=_targetZ;_this.particles.layers.camera.group.position.z=0;if(data)_this.fire("WorkDetailContent/updateText",data);return}data?(_this.fire("WorkDetailContent/updateText",data)'
  ],
  [
    '_this.layers.flower.group.visible=!1;let attenuation=1;',
    '_this.layers.flower.group.visible=!1;if(document.documentElement.dataset.galleryNavigationOwner==="native")_this.nuke.preventNewRender=!0;let attenuation=1;'
  ]
];
for (const [before, after] of nativeRoomPatches) {
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw new Error("Gallery native room patch drift: " + before);
  source = source.replace(before, after);
}
fs.writeFileSync(file, source);
