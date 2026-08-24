import{_ as _e}from"./j51ANrW2.js";import{_ as ie}from"./BnmHpkbT.js";import{_ as le,u as ve}from"./DWNT0oVE.js";import{_ as ge}from"./DlAUqK2U.js";import{aD as r,ah as y,ae as i,aX as W,aA as q,aQ as w,aU as n,ag as D,af as R,j as A,aK as N,aw as ae,aj as P,aW as Z,b3 as j,ak as z,ad as L,E as xe,$ as we,h as ye,a7 as X,b1 as be,b5 as Me,M as Se,P as ke,aI as oe,b0 as ze,av as V,aG as $e,aC as Y,aJ as H,aq as E,aF as Q,G as Te,aM as Be,a1 as Ce,at as J}from"./D5R78ZMm.js";import{b as re,u as ce,a as ue,_ as Ie}from"./C8QKviKm.js";import{_ as O,T as Ee}from"./CSeDI5a9.js";import{u as G}from"./DYMbCzA7.js";import{_ as Pe}from"./DwsbHt3x.js";const je={},Re={class:"size-9",viewBox:"0 0 9 9",fill:"none",xmlns:"http://www.w3.org/2000/svg"};function Fe(b,e){return r(),y("svg",Re,[...e[0]||(e[0]=[i("path",{d:"M4.72608 3.43423H8.05808V4.81123H4.72608V8.22823H3.33208V4.81123H8.20383e-05V3.43423H3.33208V0.000233889H4.72608V3.43423Z",fill:"currentColor"},null,-1)])])}const de=ge(je,[["render",Fe]]),Le={class:"max-s:pl-16"},De={class:"-ml-16"},He={key:0,class:"max-w-[30rem]"},Ae={key:0,class:"t-trim"},Oe={class:"mt-[-.15em]"},Ne=["onMouseenter","onClick"],Ue=["href"],te="/sound/fx.mp3",Ve={__name:"ItemsGroup",props:{title:{type:String,required:!0},items:{type:Array,default:()=>[]},inline:{type:Boolean,default:!1},interactive:{type:Boolean,default:!0},icon:{type:String,default:"plus"},label:{type:String,default:""}},emits:["select"],setup(b,{emit:e}){const s=b,u=e,{bar:d,move:h,leave:f}=ve(),M=a=>!!a.url||s.icon==="plus",{$sound:x}=W(),{active:S}=re();q(()=>{S.value||x?.preload(te)});const o=a=>{h(a),S.value||x?.play(te)};return(a,p)=>{const B=le,C=de;return r(),y("li",Le,[i("h4",De,w(b.title),1),b.inline?(r(),y("p",He,w(b.items.map(g=>g.text).join(", ")),1)):(r(),y("div",{key:1,class:"relative",onMouseleave:p[0]||(p[0]=(...g)=>n(f)&&n(f)(...g))},[b.interactive?(r(),y("div",{key:0,ref_key:"bar",ref:d,class:"absolute z-[-1] -left-3 top-0 right-0 h-20 flex items-center justify-end gap-x-5 px-6 bg-white/15 backdrop-blur-lg rounded-5 opacity-0 pointer-events-none"},[b.label?(r(),y("span",Ae,w(b.label),1)):D("",!0),b.icon==="out"?(r(),R(B,{key:1})):(r(),R(C,{key:2}))],512)):D("",!0),i("ul",Oe,[(r(!0),y(A,null,N(b.items,g=>(r(),y("li",{key:g.text,class:ae(["t-trim py-[.15em]",b.interactive&&M(g)&&"cursor-pointer"]),onMouseenter:$=>b.interactive&&(M(g)?o($.currentTarget):n(f)()),onClick:$=>b.interactive&&M(g)&&!g.url&&u("select",g.text)},[g.url?(r(),y("a",{key:0,href:g.url,target:"_blank",rel:"noopener noreferrer",class:"block"},w(g.text),9,Ue)):(r(),y(A,{key:1},[P(w(g.text),1)],64))],42,Ne))),128))])],32))])}}},We={class:"services-content js-modal-bg site-max site-grid items-start pb-16 pt-100 s:pt-16"},qe={class:"relative hidden s:block s:col-span-3 aspect-[7/10] js-flip-modal-ref"},Ge={class:"col-span-full s:col-start-7 s:col-span-8"},Ke={class:"mt-65 flex flex-col gap-y-5","data-cursor":""},Xe={class:"col-span-1 relative overflow-hidden"},Je={class:"col-span-3"},Qe={class:"-ml-16"},Ze={class:""},Ye={__name:"Modal",setup(b){G();const e=Z(),s=L(()=>e.profile?.mediaSpecific?.[1]||null),u=ce(),d=ue(),h=L(()=>(u.value||!d.value)&&!!s.value),f=L(()=>e.global?.servicesTitle),M=L(()=>e.global?.services||[]);return(x,S)=>{const o=ie,a=Ie;return r(),R(a,{name:"services",label:"Services"},{default:j(()=>[i("div",We,[i("div",qe,[n(h)?(r(),R(o,{key:0,item:n(s),aspect:!1},null,8,["item"])):D("",!0)]),i("div",Ge,[z(O,{immediate:"",delay:.25,class:"t-h2","data-cursor":""},{default:j(()=>[P(w(n(f)),1)]),_:1}),i("ul",Ke,[(r(!0),y(A,null,N(n(M),(p,B)=>(r(),y("li",{key:p.title,class:"grid grid-cols-4 s:grid-cols-8 gap-x-14"},[i("div",Xe,w(B+1),1),i("div",Je,[i("h3",Qe,w(p.title),1),i("p",Ze,w(p.text),1)])]))),128))])])])]),_:1})}}},et=`precision mediump float;

#define PI 3.141592

uniform float u_bend;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
	vec3 p = position;

	
	
	float sx = sin(PI * uv.x);
	float sy = 0.75 + 0.25 * sin(PI * uv.y);

	p.z += u_bend * sx * sy;

	
	
	
	float dzdx = u_bend * PI * cos(PI * uv.x) * sy;
	float dzdy = u_bend * sx * 0.25 * PI * cos(PI * uv.y);

	vNormal = normalize(normalMatrix * vec3(-dzdx, -dzdy, 1.0));

	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
	vUv = uv;
}
`,tt=`



precision highp float;

uniform vec2 u_res;
uniform vec2 u_size;
uniform sampler2D u_texture;
uniform float u_alpha;





uniform sampler2D u_specific;
uniform vec2 u_specificSize;
uniform float u_specificBlend;




uniform vec2 u_flres;
uniform float u_wipe;
uniform int u_wipeType;
uniform float u_wipeSoft;
uniform float u_wipeAspect;
uniform float u_wipeDir;

#include <wipe>

varying vec2 vUv;
varying vec3 vNormal;


const vec3 LIGHT = vec3(-0.39, 0.49, 0.78); 
const float AMBIENT = 0.65; 
const float DIFFUSE = 0.45; 
const float BACK = 0.82; 

vec2 uvCover(vec2 screenSize, vec2 imageSize, vec2 uv) {
	float screenRatio = screenSize.x / screenSize.y;
	float imageRatio = imageSize.x / imageSize.y;

	vec2 newSize = screenRatio < imageRatio
		? vec2(imageSize.x * (screenSize.y / imageSize.y), screenSize.y)
		: vec2(screenSize.x, imageSize.y * (screenSize.x / imageSize.x));
	vec2 newOffset = (screenRatio < imageRatio
		? vec2((newSize.x - screenSize.x) / 2.0, 0.0)
		: vec2(0.0, (newSize.y - screenSize.y) / 2.0)) / newSize;

	return uv * screenSize / newSize + newOffset;
}

void main() {
	
	vec2 suv = vUv;
	if (!gl_FrontFacing) suv.x = 1.0 - suv.x;

	vec2 uv = uvCover(u_res, u_size, suv);
	vec4 tex = texture2D(u_texture, uv);

	if (u_specificBlend > 0.0) {
		vec4 spec = texture2D(u_specific, uvCover(u_res, u_specificSize, suv));
		tex = mix(tex, spec, u_specificBlend);
	}

	
	vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);

	float d = clamp(dot(n, LIGHT), 0.0, 1.0);
	float shade = clamp(AMBIENT + DIFFUSE * d, 0.0, 1.0);

	if (!gl_FrontFacing) shade *= BACK;

	float alpha = tex.a * u_alpha;

	if (u_wipe >= 0.0) {
		alpha *= wipeMask(gl_FragCoord.xy / u_flres, u_wipe, u_wipeType, u_wipeSoft, u_wipeAspect, u_wipeDir);
	}

	gl_FragColor = vec4(tex.rgb * shade, alpha);
}
`;class ee extends xe{init({el:e,els:s,core:u,textures:d,srcs:h,geometry:f}){return this.el=e,this.els=s,this.core=u,this.textures=d,this.texture=d[0],this.srcs=h,this.ogeo=!f,this.progress=0,this._idx=0,this.modalRect=null,this.modalBlend=0,this.modalRot=0,this.introable=!0,this.v=0,this._n=null,!super.init()||!s||s.length<2?!1:(this.material=new we({vertexShader:et,fragmentShader:Me(tt),uniforms:{...be(),u_texture:{value:this.texture},u_res:{value:new X(1,1)},u_size:{value:new X(1,1)},u_alpha:{value:1},u_bend:{value:0},u_specific:{value:this.texture},u_specificSize:{value:new X(1,1)},u_specificBlend:{value:0}},transparent:!0,side:ye,depthTest:!1,depthWrite:!1}),this.mesh=new Se(f||new ke(1,1,32,16),this.material),this.mesh.renderOrder=-10,this.add(this.mesh),this.core.scene.add(this),this.visible=!0,this.active=!0,this.tex(),this.sync(),!0)}tex(){const e=this.texture?.image;if(!e)return;const s=e.videoWidth||e.width||1,u=e.videoHeight||e.height||1;this.material.uniforms.u_size.value.set(s,u)}setSpecific(e){if(!e||!this.material)return;const s=e.image,u=s?.videoWidth||s?.width||1,d=s?.videoHeight||s?.height||1;this.material.uniforms.u_specific.value=e,this.material.uniforms.u_specificSize.value.set(u,d)}get specificBlend(){return this.material?.uniforms.u_specificBlend.value??0}set specificBlend(e){this.material&&(this.material.uniforms.u_specificBlend.value=e)}setModalRect(e){if(this.modalRect=e,this.mesh.renderOrder=e?20:-10,e){const s=Math.max(0,Math.min(this.progress,this.els.length-1));this.modalRot=(Math.round(s)+1)*Math.PI}}static _cr(e,s,u,d,h){const f=h*h,M=f*h;return .5*(2*s+(-e+u)*h+(2*e-5*s+4*u-d)*f+(-e+3*s-3*u+d)*M)}sync(){if(this.frozen||!this.units())return;const e=Math.max(0,Math.min(this.progress,this.els.length-1)),s=Math.min(Math.floor(e),this.els.length-2),u=e-s;if(this.textures.length>1){const k=e/(this.els.length-1),_=Math.min(Math.floor(k*this.textures.length),this.textures.length-1);_!==this._idx&&(this._idx=_,this.texture=this.textures[_],this.material.uniforms.u_texture.value=this.texture,this.tex(),this.onSwap?.(_))}const d=this.els.map(oe);if(d.some(k=>!k))return;const h=k=>d[Math.max(0,Math.min(k,d.length-1))],f=h(s-1),M=h(s),x=h(s+1),S=h(s+2),o=k=>ee._cr(f[k],M[k],x[k],S[k],u),a=this.bounds.base;a.width=o("width"),a.height=o("height"),a.left=o("left"),a.top=o("top");const p=this.modalRect?this.modalBlend:0;p>0&&(a.width+=(this.modalRect.width-a.width)*p,a.height+=(this.modalRect.height-a.height)*p,a.left+=(this.modalRect.left-a.left)*p,a.top+=(this.modalRect.top-a.top)*p),this.material.uniforms.u_res.value.set(a.width,a.height);const B=this.size();this.scale.set(B.x,B.y,1),this.position.x=this.px(),this.position.y=this.py();const C=-.4,g=e*Math.PI;this.rotation.set(Math.sin(Math.PI*u)*C*(1-p)+Math.sin(Math.PI*p)*C,p>0?g+(this.modalRot-g)*p:g,0);const $=e+p;this._n===null&&(this._n=$),this.v+=($-this._n-this.v)*.12,this._n=$;const T=Math.max(-1,Math.min(1,this.v*40));this.material.uniforms.u_bend.value=T*this.scale.x*.45}tick=()=>{};dispose(){this.core?.scene.remove(this),this.material.dispose(),this.ogeo&&this.mesh.geometry.dispose()}}const se="/sound/fx.mp3",st={__name:"Flip",props:{srcs:{type:Array,required:!0},selector:{type:String,default:".js-flip-ref"},introDelay:{type:Number,default:0},modalSrcs:{type:Object,default:()=>({})}},setup(b){const e=b,{$gl:s,$planes:u,$resize:d,$scroll:h,$sound:f}=W(),{active:M}=re(),x=ue(),S=H(null);let o=null,a=null;const p=new Map,B=_=>{const v=h.y,t=window.innerHeight;return _.map((I,l)=>{const m=I.getBoundingClientRect(),c=m.top+v;return l===0?c-t/2:c+m.height/2-t/2})},C=_=>{a?.scrollTrigger?.kill(),a?.kill();const v=B(_);a=E.timeline({scrollTrigger:{start:v[0],end:v[v.length-1],scrub:.75}});for(let t=1;t<v.length;t++)a.to(o,{progress:t,duration:v[t]-v[t-1],ease:"none"},">")},g=()=>{o&&(C(o.els),k())},{active:$}=G();let T=null;const k=()=>{if(!o||!T?.isConnected)return;const{width:_,height:v,left:t,top:I}=oe(T);o.setModalRect({width:_,height:v,left:t,top:I})};return ze($,async _=>{if(o)if(E.killTweensOf(o,"modalBlend,specificBlend"),_){if(await V(),T=Q(".js-flip-modal-ref"),!T)return;k(),E.to(o,{modalBlend:1,duration:1,ease:"power3.inOut"});const v=p.get(_);v&&(o.setSpecific(v),E.to(o,{specificBlend:1,duration:1,ease:"power3.inOut"}))}else E.to(o,{modalBlend:0,duration:1,ease:"power3.inOut",onComplete:()=>{T=null,o?.setModalRect(null)}}),E.to(o,{specificBlend:0,duration:1,ease:"power3.inOut"})}),q(async()=>{if(await V(),!d?.gl||!u||!s)return;const _=$e(e.selector);if(_.length<2)return;const v=e.srcs.filter(Boolean);if(!v.length)return;const t=Object.keys(e.modalSrcs).filter(c=>e.modalSrcs[c]),I=[...v,...t.map(c=>e.modalSrcs[c])],l=await Promise.all(I.map(c=>u.get(c))),m=()=>I.forEach(c=>u.release(c));if(!S.value?.isConnected)return m();if(t.forEach((c,U)=>p.set(c,l[v.length+U].texture)),o=new ee,o.core=s,o.introDelay=e.introDelay,!o.init({el:S.value,els:_,core:s,textures:l.slice(0,v.length).map(c=>c.texture),srcs:I,geometry:u.geometry})){m(),o=null;return}u.addExtra(o),C(_),M.value||(f?.preload(se),o.onSwap=()=>f?.play(se)),x.value=!0,d.add(g)}),Y(()=>{x.value=!1,d?.remove(g),a?.scrollTrigger?.kill(),a?.kill()}),(_,v)=>(r(),y("span",{ref_key:"anchor",ref:S,class:"hidden"},null,512))}},ne=62,nt=4.2,it=[.55,.85];class lt{constructor({el:e,core:s}){this.core=s,this.active=!1,this.y=0;const u=s.camera.fov*Math.PI/180,d=2*Math.tan(u/2)*s.camera.position.z;this.group=new Te,this.group.position.y=-d/2,this.group.rotation.x=-(ne*Math.PI)/180;const h=ne*Math.PI/180,f=Math.tan(u/2),M=x=>{const S=2*x-1;return d*x/(Math.cos(h)-S*f*Math.sin(h))};if(this.fade=it.map(M),this.plane=new Ee,this.plane.core=s,!this.plane.init({el:e,core:s})){this.plane=null;return}this.group.add(this.plane),s.scene.add(this.group),this.plane.material.depthTest=!1,this.plane.material.depthWrite=!1,this.plane.mesh.renderOrder=30,this.plane.progress=1,this.plane.setAlpha(0),this.plane.visible=!1,this.place()}place(){this.plane&&(this.plane.position.x=0,this.plane.position.y=this.y+this.plane.scale.y/2,this.plane.position.z=0,this.plane.material.uniforms.u_fade.value.set((this.fade[0]-this.plane.position.y)/this.plane.scale.y+.5,(this.fade[1]-this.plane.position.y)/this.plane.scale.y+.5))}reset(){this.y=-this.plane.scale.y-1}engage(){this.plane&&(this.active=!0,this.plane.visible=!0,this.reset(),E.killTweensOf(this.plane.material.uniforms.u_alpha),E.to(this.plane.material.uniforms.u_alpha,{value:1,duration:.5,ease:"power1"}))}release(){this.plane&&(E.killTweensOf(this.plane.material.uniforms.u_alpha),E.to(this.plane.material.uniforms.u_alpha,{value:0,duration:.45,ease:"power1",onComplete:()=>{this.active=!1,this.plane&&(this.plane.visible=!1)}}))}tick(e=0){!this.active||!this.plane||(this.y+=nt*Math.min(e,.1),this.y>this.fade[1]&&this.reset(),this.place())}resize=()=>{this.plane&&(this.plane.sync(),this.place())};dispose(){this.plane&&(this.group.remove(this.plane),this.plane.dispose(),this.plane=null),this.core?.scene.remove(this.group)}}const at={key:1,class:"fixed inset-0 z-[90]","data-cursor":"release to go back"},ot=350,rt={__name:"Crawl",props:{texts:{type:Array,required:!0}},setup(b){const{$gl:e,$planes:s,$resize:u,$scroll:d,$event:h}=W(),f=Z(),{active:M}=G(),x=H(null),S=H(!1),o=H(!1);let a=null,p=null,B=!1;const C=(t={})=>a?.tick((t.ratio??1)/60),g=t=>!!t?.tagName&&(t.isContentEditable||/^(input|textarea|select)$/i.test(t.tagName)),$=t=>{const I=[Q("main"),Q("header")].filter(Boolean);I.length&&E.to(I,{autoAlpha:t,duration:.5,ease:"power1",overwrite:"auto"})},T=()=>{o.value=!0,s.setHold(!0),d.stop(),$(0),a.engage(),h.emit("crawl",!0)},k=()=>{o.value=!1,s.setHold(!1),d.start(),$(1),a.release(),h.emit("crawl",!1)},_=t=>{t.code!=="KeyF"||t.repeat||p||o.value||M.value||f.flags?.loaded&&(g(t.target)||(p=setTimeout(T,ot)))},v=t=>{t?.code&&t.code!=="KeyF"||(clearTimeout(p),p=null,o.value&&k())};return q(async()=>{await V(),!(!u?.gl||!s||!e)&&document.documentElement.classList.contains("star-wars")&&(S.value=!0,await V(),await document.fonts.ready,await new Promise(t=>"requestIdleCallback"in window?Be(t,{timeout:3e3}):setTimeout(t,1500)),!(B||!x.value?.isConnected)&&(a=new lt({el:x.value,core:e}),u.add(a.resize),h.on("tick",C),window.addEventListener("keydown",_),window.addEventListener("keyup",v),window.addEventListener("blur",v)))}),Y(()=>{B=!0,clearTimeout(p),window.removeEventListener("keydown",_),window.removeEventListener("keyup",v),window.removeEventListener("blur",v),a&&(o.value&&(s.setHold(!1),d.start(),$(1),h.emit("crawl",!1)),u.remove(a.resize),h.off("tick",C),a.dispose(),a=null)}),(t,I)=>(r(),R(Ce,{to:"body"},[n(S)?(r(),y("div",{key:0,ref_key:"src",ref:x,"aria-hidden":"true",class:"crawl-src fixed top-0 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none text-justify"},[(r(!0),y(A,null,N(b.texts,(l,m)=>(r(),y("p",{key:m},w(l),1))),128))],512)):D("",!0),n(o)?(r(),y("div",at)):D("",!0)]))}},ct={class:"about site-max pt-150 s:pt-210"},ut={class:"about-profile site-grid"},dt={class:"relative col-span-full"},ht={class:"about-label relative mb-20 s:absolute s:top-0 s:left-0 s:mb-0 js-t-fade js-i-fade"},pt=["innerHTML"],ft={class:"about-approach site-grid s:mt-20"},mt={class:"hidden s:block relative col-span-2 s:col-span-2 gl:aspect-[1080/1920] js-flip-ref"},_t={class:"relative col-span-full s:col-start-6 s:col-span-9 mt-100 s:mt-0"},vt={class:"about-label relative mb-20 s:absolute s:top-0 s:left-0 s:mb-0 js-t-fade js-i-fade"},gt={class:"about-info site-grid mt-100"},xt={class:"col-span-full s:grid s:grid-cols-9 s:gap-x-14 s:col-start-6 s:col-end-15"},wt={class:"about-label s:col-span-2 mb-20 s:mb-0 js-t-fade js-i-fade"},yt={class:"about-groups s:col-start-4 s:col-end-10 flex flex-col gap-y-3 js-t-fade js-i-fade"},bt={class:"about-newsletter mt-100 s:mt-300 overflow-hidden"},Mt={class:"site-grid"},St={class:"relative col-span-full mt-100 s:mt-40"},kt={class:"about-label relative mb-20 s:absolute s:top-0 s:left-0 s:mb-0"},zt={class:"col-span-full s:col-start-6 s:col-span-8"},$t={class:"relative s:ml-0 s:-mr-100"},Tt={class:"site-grid mt-100"},Bt={class:"col-span-full s:grid s:grid-cols-9 s:gap-x-14 s:col-start-6 s:col-end-15"},Ct={class:"s:col-span-2 mb-20 s:mb-0"},It={class:"about-groups s:col-start-4 s:col-end-10 flex flex-col gap-y-3"},Et={class:"about-course site-grid mt-100 s:mt-300"},Pt={class:"hidden s:block relative col-span-2 s:col-span-2 gl:aspect-[1080/1920] js-flip-ref"},jt={class:"relative col-span-full s:col-start-6 s:col-span-8"},Rt={class:"about-label relative mb-20 s:absolute s:top-0 s:left-0 s:mb-0"},Ft={class:"relative s:ml-0 s:-mr-100"},Lt={class:"col-span-full s:grid s:grid-cols-9 s:gap-x-14 s:col-start-6 s:col-end-15 mt-100"},Dt={class:"s:col-span-2 mb-20 s:mb-0"},Ht={class:"about-groups s:col-start-4 s:col-end-10 flex flex-col gap-y-3"},At=["href"],Qt={__name:"profile",setup(b){const e=Z(),{open:s}=G(),{$resize:u}=W(),d=e.flags?.loaded?.2:0,h={text1:.35-d,text2:.85-d,flip:1.25-d},f=e.profile?.images?.length?e.profile.images.map(l=>l.profile||l.url):["/profile-test.jpg"],M=H(null),x=L(()=>e.profile?.mediaSpecific||[]),S=ce(),o=l=>l?.profile||l?.url||null,a=L(()=>({services:o(x.value[1]),newsletter:o(x.value[2])})),p=H(null),B=H(null),C=H(0),g=L(()=>u?.small?f[C.value]:null);let $=null;q(async()=>{await V(),!(!p.value||f.length<2)&&($=E.matchMedia(),$.add("(max-width: 649px)",()=>{f.forEach(m=>{new Image().src=m});const l={p:0};return E.timeline({scrollTrigger:{trigger:B.value,endTrigger:p.value,start:"bottom bottom",end:"bottom bottom",scrub:!0},defaults:{duration:1,ease:"none"}}).to(l,{p:1,onUpdate:()=>{C.value=Math.min(Math.floor(l.p*f.length),f.length-1)}}),()=>{C.value=0}}))}),Y(()=>{$?.revert()});const T=l=>(l||[]).map(m=>({text:m.text,url:m.url||null})),k=(l,m={})=>(l||[]).map(c=>({title:c.title,items:T(c.items),...m})),_=(l,m={})=>({title:l?.title||"",text:l?.text||"",textMobile:"",text2:l?.textSecondary||"",label:l?.listLabel||"",link:{label:l?.ctaLabel||"",url:l?.ctaUrl||"#"},...m}),v=l=>{if(!l)return[];const m=document.createElement("div");return m.innerHTML=l,[...m.querySelectorAll("p")].map(c=>c.textContent.trim()).filter(Boolean)},t=L(()=>{const l=e.profile,m=e.global;return{profile:_(l?.intro,{textMobile:l?.profileTextMobile||""}),approach:_(l?.approach),info:{title:l?.infoTitle||"",items:[{title:"Services",items:(m?.services||[]).map(c=>({text:c.title,url:null}))},{title:"Recognition",icon:"out",items:T(m?.recognition)},{title:"Clients",inline:!0,items:T(l?.clients)},{title:"Studios",inline:!0,items:T(l?.studios)},{title:"Industries",interactive:!1,items:T(l?.industries)}].filter(c=>c.items.length)},newsletter:_(l?.newsletter,{items:k(l?.newsletter?.groups)}),course:_(l?.course,{items:k(l?.course?.groups,{interactive:!1})})}}),I=L(()=>{const{text:l,textMobile:m}=t.value.profile,c=v(m);return[...c.length?c:[l],t.value.approach.text].filter(Boolean)});return(l,m)=>{const c=_e,U=ie,K=Ve,he=de,pe=le,fe=Ye,me=Pe;return r(),y("main",ct,[i("section",ut,[i("div",dt,[i("h2",ht,[z(c,null,{default:j(()=>[P("1. "+w(n(t).profile.title),1)]),_:1})]),z(O,{immediate:"",delay:h.text1,class:ae(["t-h2 about-text col-indent s:[--indent:5]",{"max-s:hidden":n(t).profile.textMobile}])},{default:j(()=>[P(w(n(t).profile.text),1)]),_:1},8,["delay","class"]),n(t).profile.textMobile?(r(),y("div",{key:0,class:"txt t-h2 about-text col-indent s:hidden",innerHTML:l.$sanitize(n(t).profile.textMobile,["p"],!1)},null,8,pt)):D("",!0)])]),i("section",ft,[i("div",mt,[n(S)&&n(x)[0]?(r(),R(U,{key:0,item:n(x)[0]},null,8,["item"])):D("",!0)]),i("div",_t,[i("h2",vt,[z(c,null,{default:j(()=>[P("2. "+w(n(t).approach.title),1)]),_:1})]),z(O,{immediate:"",delay:h.text2,class:"t-h2 about-text col-indent s:[--cols:9] s:[--indent:3]"},{default:j(()=>[P(w(n(t).approach.text),1)]),_:1},8,["delay"])])]),i("section",gt,[i("div",xt,[i("h2",wt,[z(c,null,{default:j(()=>[P("3. "+w(n(t).info.title),1)]),_:1})]),i("ul",yt,[(r(!0),y(A,null,N(n(t).info.items,F=>(r(),R(K,J({key:F.title},{ref_for:!0},F,{onSelect:Ot=>F.title==="Services"&&n(s)("services")}),null,16,["onSelect"]))),128))])])]),i("section",bt,[i("div",Mt,[i("div",{ref_key:"stick",ref:p,class:"relative col-span-2 s:col-start-6 s:col-span-3 max-s:h-[150svh]"},[i("div",{ref_key:"stickEl",ref:B,class:"max-s:sticky max-s:top-[calc(100svh-(((100vw-2.8rem)/2)/(1080/1920)))] relative gl:aspect-[1080/1920] js-flip-ref"},[n(S)&&n(x)[1]?(r(),R(U,{key:0,item:n(x)[1],src:n(g),aspect:""},null,8,["item","src"])):D("",!0)],512)],512),i("div",St,[i("h2",kt,[z(c,null,{default:j(()=>[P("4. "+w(n(t).newsletter.title),1)]),_:1})]),z(O,{ref_key:"newsletterLead",ref:M,class:"t-h2 about-text col-indent s:[--indent:5]"},{default:j(()=>[P(w(n(t).newsletter.text),1)]),_:1},512)]),i("div",zt,[i("div",$t,[z(O,{continues:n(M),class:"t-h2 about-text col-indent s:[--cols:8]"},{default:j(()=>[P(w(n(t).newsletter.text2),1)]),_:1},8,["continues"])])])]),i("div",Tt,[i("div",Bt,[i("h3",Ct,w(n(t).newsletter.label),1),i("ul",It,[(r(!0),y(A,null,N(n(t).newsletter.items,F=>(r(),R(K,J({key:F.title},{ref_for:!0},F,{icon:"out",label:"Read"}),null,16))),128))])]),i("button",{class:"h-pill h-pill-on group col-span-full s:col-start-9 s:col-end-15 mt-50 s:mt-100 flex items-center justify-between text-left",onClick:m[0]||(m[0]=F=>n(s)("newsletter"))},[i("span",null,w(n(t).newsletter.link.label),1),z(he)])])]),i("section",Et,[i("div",Pt,[n(S)&&n(x)[2]?(r(),R(U,{key:0,item:n(x)[2]},null,8,["item"])):D("",!0)]),i("div",jt,[i("h2",Rt,[z(c,null,{default:j(()=>[P("5. "+w(n(t).course.title),1)]),_:1})]),i("div",Ft,[z(O,{class:"t-h2 about-text col-indent s:[--cols:8] s:[--indent:3]"},{default:j(()=>[P(w(n(t).course.text),1)]),_:1})])]),i("div",Lt,[i("h3",Dt,w(n(t).course.label),1),i("ul",Ht,[(r(!0),y(A,null,N(n(t).course.items,F=>(r(),R(K,J({key:F.title},{ref_for:!0},F),null,16))),128))])]),i("a",{class:"h-pill h-pill-on group col-span-full s:col-start-9 s:col-end-15 mt-50 s:mt-100 flex items-center justify-between",href:n(t).course.link.url,target:"_blank",rel:"noopener noreferrer"},[i("span",null,w(n(t).course.link.label),1),z(pe)],8,At)]),z(st,{srcs:n(f),"intro-delay":h.flip,"modal-srcs":n(a)},null,8,["srcs","intro-delay","modal-srcs"]),z(rt,{texts:n(I)},null,8,["texts"]),z(fe),z(me,{class:"mt-150 s:mt-350"})])}}};export{Qt as default};
