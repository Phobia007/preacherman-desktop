const assert=require('node:assert/strict');
async function verifyAudio(p,appearance,shot){
 const dock=p.locator('.demo-audio-dock'), settings=p.getByRole('button',{name:'Audio settings',exact:true});
 assert.equal(await dock.locator('i').count(),5);assert.equal((await dock.innerText()).trim(),'');
 const style=await dock.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{font:s.fontFamily,color:s.color,background:s.backgroundColor,right:innerWidth-r.right,bottom:innerHeight-r.bottom};});
 assert.match(style.font,/Clash Display/);assert.ok(style.right>=20&&style.bottom>=10);assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.ok(parseFloat(style.color.match(/[\d.]+/)[0])>150,'Home waveform stays visible over the cinematic scene in either appearance');
 await settings.click();await p.getByRole('dialog',{name:'Audio settings'}).waitFor();
 assert.equal(await p.locator('#preacherman-audio-input').evaluate(e=>document.activeElement===e),true);
 const panel=await p.locator('.demo-audio-dock__panel').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,font:getComputedStyle(e.querySelector('select')).fontFamily}));
 assert.notEqual(panel.color,panel.background);assert.match(panel.font,/Clash Display/);
 await shot(p,appearance+'-audio-settings');await p.keyboard.press('Escape');assert.equal(await settings.getAttribute('aria-expanded'),'false');
 // Real Web Audio signal through the exact microphone/analyser path, without using or recording a person's voice.
 await p.evaluate(()=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);const streams=[];let context,gain;
  window.__audioTest={original,streams,get context(){return context;},get gain(){return gain;}};
  navigator.mediaDevices.getUserMedia=async constraints=>{
   context=new AudioContext();const osc=context.createOscillator();gain=context.createGain();const sink=context.createMediaStreamDestination();
   gain.gain.value=0;osc.frequency.value=220;osc.connect(gain).connect(sink);osc.start();await context.resume();streams.push(sink.stream);return sink.stream;
  };
 });
 try{
  await p.getByRole('button',{name:'Start microphone',exact:true}).click();await p.locator('.demo-audio-dock[data-state="listening"]').waitFor();
  await p.waitForTimeout(200);const rest=()=>p.locator('.demo-audio-dock__wave i').evaluateAll(es=>es.map(e=>e.style.height));const initial=await rest();
  await p.waitForTimeout(180);assert.deepEqual(await rest(),initial);assert.equal(await p.locator('.demo-audio-dock__wave').getAttribute('data-speaking'),'false');
  await p.evaluate(()=>window.__audioTest.gain.gain.value=.22);await p.locator('.demo-audio-dock__wave[data-speaking="true"]').waitFor();const active=await rest();
  await p.waitForTimeout(200);assert.notDeepEqual(await rest(),active);assert.ok(new Set(active).size>1);await shot(p,appearance+'-speaking');
  await p.evaluate(()=>window.__audioTest.gain.gain.value=0);await p.locator('.demo-audio-dock__wave[data-speaking="false"]').waitFor();await p.waitForTimeout(180);assert.deepEqual(await rest(),initial);
  await p.getByRole('button',{name:'Stop microphone',exact:true}).click();await p.locator('.demo-audio-dock[data-state="idle"]').waitFor();
  assert.ok(await p.evaluate(()=>window.__audioTest.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
  await p.evaluate(()=>navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');});
  await p.getByRole('button',{name:'Start microphone',exact:true}).click();await p.locator('.demo-audio-dock[data-state="error"]').waitFor();await p.getByRole('alert').waitFor();await shot(p,appearance+'-permission-error');
  await p.keyboard.press('Escape');
 }finally{await p.evaluate(async()=>{const t=window.__audioTest;if(t){navigator.mediaDevices.getUserMedia=t.original;t.streams.forEach(s=>s.getTracks().forEach(tr=>tr.stop()));if(t.context&&t.context.state!=='closed')await t.context.close();delete window.__audioTest;}});}
 return {appearance,...style,panel,soundReactive:true,silentStationary:true,release:true,permissionError:true};
}
module.exports=verifyAudio;
