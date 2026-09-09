// Exact, idempotent patches to the bundled authored runtime; fail on source drift.
import fs from "node:fs";
import path from "node:path";
const file = path.resolve("apps/preacherman-demo-host/public/active-theory-gallery/gallery/assets/js/app.1780406240914.js");
let source = fs.readFileSync(file, "utf8");
function replace(before, after) {
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error(`Gallery patch drift: ${before.slice(0, 100)}`);
  source = source.replace(before, after);
}
replace('function checkScrollOut(){Math.abs(_scroll.delta.y)>(Device.mobile?20:10)&&_this.set("Work/project",null)}', 'window.PreachermanGalleryDetail.attach(_this);function checkScrollOut(){}');
replace('data?(_this.scrollProgress<.07?_this.fire("ViewController/topOfWork"):_this.scrollProgress>.93&&_this.fire("ViewController/bottomOfWork"),_this.findParent("ViewController").lockScroll()', 'data?(_this.findParent("ViewController").lockScroll()');
replace('_this.startRender(checkScrollOut),_this.detail&&', '/* Gallery detail never exits on wheel input. */_this.detail&&');
replace('_this.stopRender(checkScrollOut),_this.composite.tween("uTransition",0', '/* Explicit back keeps the authored exit tween. */_this.composite.tween("uTransition",0');
replace('_this.set("ChatDOM/updateFilter",{title:"<- Close",tag:null,animated:!0,delay:1400}),GLA11y.textNode', '/* Return control lives beside the host chat baseline. */GLA11y.textNode');
// This is the end of WorkDetailContent: after its original resize listener.
replace('_this.layers.date.group.position.copy(_this.layers.date.originTransform.position)}));for(let key in _this)', '_this.layers.date.group.position.copy(_this.layers.date.originTransform.position)}));_this.layers.body.visible=!1;window.PreachermanGalleryDetail.attachContent(_this,video);for(let key in _this)');
// Preserve room depth and reveal text immediately for lateral detail navigation.
replace("_this.bind(\"Work/project\",(data=>{data?(_this.fire(\"WorkDetailContent/updateText\",data),_this.particles.layers.camera.group.position.z=25,camera.group.position.z=_targetZ+5,tween(camera.group.position,{z:_targetZ},1500,\"workInOut\"),tween(_this.particles.layers.camera.group.position,{z:0},1500,\"workInOut\")):tween(camera.group.position,{z:_targetZ+5},1500,\"workInOut\")}))", "_this.bind(\"Work/project\",((data,prevData)=>{data?(_this.fire(\"WorkDetailContent/updateText\",data),prevData||(_this.particles.layers.camera.group.position.z=25,camera.group.position.z=_targetZ+5,tween(camera.group.position,{z:_targetZ},1500,\"workInOut\"),tween(_this.particles.layers.camera.group.position,{z:0},1500,\"workInOut\"))):tween(camera.group.position,{z:_targetZ+5},1500,\"workInOut\")}))");
replace("title:title===\"Cortana\"?\"Details\":\"Medium Case Study\"", "title:title===\"Cortana\"||title===\"ZIMA\"?\"Details\":\"Medium Case Study\"");
replace("_this.bind(\"updateText\",(({title:title,date:date,body:body,tags:tags,caseStudyURL:caseStudyURL,projectURL:projectURL,ai:ai,color:color})=>{_this.layers.title.setText(title)", "_this.bind(\"updateText\",(({title:title,date:date,body:body,tags:tags,caseStudyURL:caseStudyURL,projectURL:projectURL,ai:ai,color:color})=>{const animateEntry=!window.PreachermanGalleryDetail.isSwitching;_this.layers.title.setText(title)");
replace("text:`${title}`,color:col.getHexString(),animated:!0", "text:`${title}`,color:col.getHexString(),animated:animateEntry");
replace("text:`${text}`,color:col.getHexString(),animated:!0,delay:300", "text:`${text}`,color:col.getHexString(),animated:animateEntry,delay:300");
replace("text:body,color:col.getHexString(),animated:!0,delay:600", "text:body,color:col.getHexString(),animated:animateEntry,delay:600");
replace("title:title===\"Cortana\"||title===\"ZIMA\"?\"Details\":\"Medium Case Study\",href:caseStudyURL,animated:!0,delay:800", "title:title===\"Cortana\"||title===\"ZIMA\"?\"Details\":\"Medium Case Study\",href:caseStudyURL,animated:animateEntry,delay:800");
replace("title:\"Project Link\",href:projectURL,animated:!0,delay:900", "title:\"Project Link\",href:projectURL,animated:animateEntry,delay:900");
fs.writeFileSync(file, source);
