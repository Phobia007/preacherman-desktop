import{E as N,C as O,b as z,k as H,p as j,$ as I,aO as U,a7 as V,b1 as G,b5 as J,M as K,a as Q,B as S,aX as Z,aW as q,aA as tt,av as et,aq as W,b0 as L,aC as nt,aD as st,af as at,b3 as it,aL as ot,aN as rt,aJ as R}from"./D5R78ZMm.js";const lt=`precision mediump float;





attribute float aLine;  
attribute float aPitch; 
attribute float aCut;   
attribute float aOver;  

uniform float u_progress;
uniform float u_window;  
uniform float u_stagger; 
uniform float u_planeH;  

varying vec2 vUv;    
varying vec2 vPlane; 
varying float vP;    
varying float vYEl;  
varying float vEdgeTop;
varying float vEdgeBot;

void main() {
	
	
	float p = clamp((u_progress - aLine * u_stagger) / u_window, 0.0, 1.0);
	p = 1.0 - pow(2.0, -10.0 * p);

	
	
	
	vec3 pos = position;
	pos.y -= (1.0 - p) * aPitch / u_planeH;

	
	
	
	
	
	
	
	vEdgeTop = aCut + (1.0 - p) * 1.5;
	vEdgeBot = aCut + aPitch + p * aOver;

	vUv = uv;
	vPlane = vec2(position.x + 0.5, position.y + 0.5);
	vP = p;
	vYEl = (0.5 - pos.y) * u_planeH;

	gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`,ut=`









precision highp float;

uniform sampler2D u_texture;
uniform float u_alpha;






uniform vec2 u_fade;


uniform vec4 u_saber;
uniform vec3 u_saberColor;





uniform vec2 u_flres;
uniform float u_wipe;
uniform int u_wipeType;
uniform float u_wipeSoft;
uniform float u_wipeAspect;
uniform float u_wipeDir;

#include <wipe>

varying vec2 vUv;
varying vec2 vPlane;
varying float vP;
varying float vYEl;
varying float vEdgeTop;
varying float vEdgeBot;

void main() {
	
	
	
	
	float show = max(
		step(vEdgeTop, vYEl) * (1.0 - step(vEdgeBot, vYEl)),
		step(0.9995, vP)
	);

	vec4 tex = texture2D(u_texture, vUv);

	
	float sd = distance(gl_FragCoord.xy, u_saber.xy);
	float sg = u_saber.z * exp(-3.0 * sd / u_saber.w);
	vec3 col = tex.rgb + u_saberColor * sg * 0.8;

	float alpha = tex.a * show * u_alpha * (1.0 - smoothstep(u_fade.x, u_fade.y, vPlane.y));

	if (u_wipe >= 0.0) {
		alpha *= wipeMask(gl_FragCoord.xy / u_flres, u_wipe, u_wipeType, u_wipeSoft, u_wipeAspect, u_wipeDir);
	}

	gl_FragColor = vec4(col, alpha);
}
`,F=2;class T extends N{init({el:s,core:n}){return this.el=s,this.core=n,this.srcs=[],super.init()?(this.canvas=document.createElement("canvas"),this.ctx2d=this.canvas.getContext("2d"),this.texture=new O(this.canvas),this.texture.wrapS=z,this.texture.wrapT=z,this.texture.minFilter=H,this.texture.magFilter=H,this.texture.generateMipmaps=!1,this.texture.colorSpace=j,this.material=new I({vertexShader:lt,fragmentShader:J(ut),uniforms:{...G(),u_texture:{value:this.texture},u_alpha:{value:1},u_progress:{value:0},u_planeH:{value:1},u_window:{value:1},u_stagger:{value:0},u_fade:{value:new V(1e4,2e4)},u_saber:{value:U.data},u_saberColor:{value:U.color}},transparent:!0}),this.mesh=new K(T._geometry([{top:0,bot:1,v0:1,v1:0,cut:0,pitch:1,over:0,line:0}],1),this.material),this.add(this.mesh),this.core.scene.add(this),this.visible=!0,this.active=!0,this._rasterW=0,this._rasterH=0,this._lines=1,this.padX=0,this.padY=0,this.sync(),!0):!1}get progress(){return this.material.uniforms.u_progress.value}set progress(s){this.material.uniforms.u_progress.value=s}setAlpha(s){this.material.uniforms.u_alpha.value=Math.max(0,Math.min(1,s))}timing(s,n){const a=this.material.uniforms,l=s+Math.max(this._lines-1,0)*n;return a.u_window.value=s/l,a.u_stagger.value=n/l,l}static _transform(s,n,a){return n==="uppercase"?s.toUpperCase():n==="lowercase"?s.toLowerCase():n==="capitalize"?s.replace(/(^|\s)(\S)/g,(l,i,x,r)=>r===0&&!a?l:i+x.toUpperCase()):s}rasterize(){const s=this.el;if(!s)return!1;const n=s.getBoundingClientRect();if(!n.width||!n.height||getComputedStyle(s).visibility==="hidden")return!1;const a=Math.min(2,window.devicePixelRatio||1),l=parseFloat(getComputedStyle(s).fontSize)||16;this.padX=Math.ceil(l*.35),this.padY=Math.ceil(l*.2);const i=this.ctx2d,x=document.createTreeWalker(s,NodeFilter.SHOW_TEXT),r=document.createRange(),u=[];let v;for(;v=x.nextNode();){const t=v.parentElement;if(!t)continue;const e=getComputedStyle(t);if(e.visibility==="hidden"||e.display==="none")continue;const M=`${e.fontStyle} ${e.fontWeight} ${e.fontSize} ${e.fontFamily}`,C="letterSpacing"in i&&e.letterSpacing!=="normal"?e.letterSpacing:null,E="wordSpacing"in i&&e.wordSpacing!=="normal"?e.wordSpacing:null;i.font=M,C&&(i.letterSpacing=C),E&&(i.wordSpacing=E);const Y=i.measureText("Hg"),k=Y.fontBoundingBoxAscent??parseFloat(e.fontSize)*.8,X=Y.fontBoundingBoxDescent??parseFloat(e.fontSize)*.25,$=e.textTransform,D=e.textAlign==="justify",A=v.data;let c=null;const B=()=>{if(!c)return;const _=A.slice(c.start,c.end),b=c.start>0&&/\s/.test(A[c.start-1]);u.push({str:T._transform(_,$,b),x:c.x-n.left+this.padX,top:c.top,bottom:c.bottom,base:c.top+k,asc:k,desc:X,font:M,ls:C,ws:E,fill:e.color}),c=null};for(let _=0;_<A.length;_++){r.setStart(v,_),r.setEnd(v,_+1);const b=r.getClientRects()[0];if(!b||(D||!b.width)&&/\s/.test(A[_])){B();continue}c&&Math.abs(b.top-c.top)>1&&B(),c?(c.end=_+1,c.bottom=Math.max(c.bottom,b.bottom)):c={start:_,end:_+1,x:b.left,top:b.top,bottom:b.bottom}}B()}u.sort((t,e)=>t.top-e.top);const p=[];for(const t of u){const e=p[p.length-1];e&&t.top-e.top<2?(e.bottom=Math.max(e.bottom,t.bottom),e.base=Math.max(e.base,t.base),e.asc=Math.max(e.asc,t.asc),e.desc=Math.max(e.desc,t.desc),e.runs.push(t)):p.push({top:t.top,bottom:t.bottom,base:t.base,asc:t.asc,desc:t.desc,runs:[t]})}const f=n.height+this.padY*2,o=t=>t-n.top+this.padY,d=Math.ceil((n.width+this.padX*2)*a);let h=0;for(const t of p)t.stripTop=t.base-t.asc-F,t.stripBot=t.base+t.desc+F,t.stripY=h,h+=t.stripBot-t.stripTop+F;h=Math.max(1,Math.ceil(h));const m=Math.max(1,Math.ceil(h*a));(this.canvas.width!==d||this.canvas.height!==m)&&this.texture.dispose(),this.canvas.width=d,this.canvas.height=m,i.setTransform(a,0,0,a,0,0),i.clearRect(0,0,n.width+this.padX*2,h),i.textBaseline="alphabetic",i.textAlign="left","textRendering"in i&&(i.textRendering="optimizeLegibility");for(const t of p)for(const e of t.runs)i.font=e.font,e.ls&&(i.letterSpacing=e.ls),e.ws&&(i.wordSpacing=e.ws),i.fillStyle=e.fill,i.fillText(e.str,e.x,t.stripY+(e.base-t.stripTop));const w=p.length||1,g=new Float32Array(w+1);g[0]=0;for(let t=1;t<w;t++){const e=(o(p[t-1].bottom)+o(p[t].top))/2;g[t]=Math.max(g[t-1]+1,Math.min(e,f-1))}g[w]=f;const y=p.length?p.map((t,e)=>{const M=g[e+1]-g[e],C=o(t.base-t.asc);return{top:o(t.stripTop),bot:o(t.stripBot),v0:1-t.stripY/h,v1:1-(t.stripY+(t.stripBot-t.stripTop))/h,cut:C,pitch:M,over:Math.max(0,o(t.base+t.desc)-(C+M))+1.5,line:e}}):[{top:0,bot:f,v0:1,v1:0,cut:0,pitch:f,over:0,line:0}];return this.mesh.geometry.dispose(),this.mesh.geometry=T._geometry(y,f),this._lines=w,this.texture.needsUpdate=!0,this._rasterW=n.width,this._rasterH=n.height,!0}static _geometry(s,n){const a=s.length,l=new Float32Array(a*4*3),i=new Float32Array(a*4*2),x=new Float32Array(a*4),r=new Float32Array(a*4),u=new Float32Array(a*4),v=new Float32Array(a*4),p=new Uint16Array(a*6);s.forEach((o,d)=>{const h=.5-o.top/n,m=.5-o.bot/n,w=d*12;l.set([-.5,h,0,.5,h,0,-.5,m,0,.5,m,0],w);const g=d*8;i.set([0,o.v0,1,o.v0,0,o.v1,1,o.v1],g);for(let t=0;t<4;t++)x[d*4+t]=o.line,r[d*4+t]=o.pitch,u[d*4+t]=o.cut,v[d*4+t]=o.over;const y=d*4;p.set([y,y+2,y+1,y+2,y+3,y+1],d*6)});const f=new Q;return f.setAttribute("position",new S(l,3)),f.setAttribute("uv",new S(i,2)),f.setAttribute("aLine",new S(x,1)),f.setAttribute("aPitch",new S(r,1)),f.setAttribute("aCut",new S(u,1)),f.setAttribute("aOver",new S(v,1)),f.setIndex(new S(p,1)),f}sync(){if(!this.el||!this.units())return;const s=this.rect();if(!s)return;const n=s.width+this.padX*2,a=s.height+this.padY*2,l=this.size({width:n,height:a});this.scale.set(l.x,l.y,1),this.position.x=this.px()-this.padX/this.screen.w*this.cam.x,this.position.y=this.py()+this.padY/this.screen.h*this.cam.y,this.material.uniforms.u_planeH.value=a,(Math.abs(s.width-this._rasterW)>.5||Math.abs(s.height-this._rasterH)>.5)&&this.rasterize()}tick=()=>{};dispose(){this.core?.scene.remove(this),this.material.dispose(),this.mesh.geometry.dispose(),this.texture.dispose()}}const pt={__name:"Text",props:{tag:{type:String,default:"p"},start:{type:String,default:"top 80%"},duration:{type:Number,default:1.5},stagger:{type:Number,default:.1},immediate:{type:Boolean,default:!1},delay:{type:Number,default:0},continues:{type:Object,default:null}},setup(P,{expose:s}){const n=P,{$gl:a,$planes:l,$resize:i}=Z(),x=q(),r=R(null);let u=null,v=null;const p=R(!1);return s({el:r,lines:()=>u?._lines??0,measured:p}),tt(async()=>{const o=!!l?.wiping;if(await et(),!i?.gl||!l||!a)return;for(await document.fonts.ready;r.value?.isConnected&&getComputedStyle(r.value).visibility==="hidden";)await new Promise(m=>requestAnimationFrame(m));if(!r.value?.isConnected)return;if(u=new T,u.core=a,!u.init({el:r.value,core:a})){u=null;return}if(l.addExtra(u),r.value.style.opacity=0,p.value=!0,o){u.progress=1,W.fromTo(u.material.uniforms.u_alpha,{value:0},{value:1,duration:.3,ease:"power1",overwrite:"auto"});return}if(!x.flags?.loaded&&(await new Promise(m=>{const w=L(()=>x.flags?.loaded,g=>{g&&(w(),m())})}),!r.value?.isConnected))return;const h={progress:1,duration:u.timing(n.duration,n.stagger),ease:"none"};if(n.immediate)h.delay=n.delay;else{let m=r.value;if(n.continues){if(await new Promise(w=>{if(n.continues.measured)return w();const g=()=>{clearTimeout(y),t(),w()},y=setTimeout(g,3e3),t=L(()=>n.continues.measured,e=>e&&g())}),!r.value?.isConnected)return;n.continues.measured&&(m=n.continues.el??m,h.delay=n.continues.lines()*n.stagger)}h.scrollTrigger={trigger:m,start:n.start}}v=W.fromTo(u,{progress:0},h)}),nt(()=>{v?.scrollTrigger?.kill(),v?.kill()}),(o,d)=>(st(),at(rt(P.tag),{ref_key:"el",ref:r},{default:it(()=>[ot(o.$slots,"default")]),_:3},512))}};export{T,pt as _};
