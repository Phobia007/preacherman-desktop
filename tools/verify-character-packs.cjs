// Real GLBs, shaders and React state wiring; one browser, bounded, always cleaned up.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..'), app = path.join(repo, 'apps/preacherman-demo-host');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const esbuild = require(path.join(app, 'node_modules/esbuild'));
const out = path.resolve(process.env.VERIFY_OUTPUT || path.join(repo, 'output/playwright/character-packs-20261008'));
fs.mkdirSync(out, {recursive: true});
const report = {checks: [], errors: []};
let browser, server;
(async () => { try {
  const bundle = await esbuild.build({stdin: {resolveDir: app, loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import {InteractiveAvatarViewport} from '../../packages/preacherman-avatar-renderer/src/InteractiveAvatarViewport';
    function App(){const [props,set]=useState(null);window.configure=set;return props?<InteractiveAvatarViewport key={props.modelId+props.appearance} {...props} assetBaseUrl={'/assets/avatars/'+props.modelId+'/'} onError={e=>window.errors.push(String(e))}/>:null;}
    window.errors=[];createRoot(document.getElementById('root')).render(<App/>);`},
    bundle: true, format: 'esm', write: false, jsx: 'automatic',
    alias: { 'three/addons': path.join(app,'node_modules/three/examples/jsm'), ...Object.fromEntries(['three','react','react-dom','@react-three/fiber','@react-three/drei'].map(n=>[n,path.join(app,'node_modules',n)])) },
    plugins: [{name:'observe-controller',setup(build){build.onLoad({filter:/characterKits\.ts$/},async args=>({loader:'ts',contents:fs.readFileSync(args.path,'utf8').replace(/return new (PathfinderAnimationAdapter|ThreeKitanaAnimationAdapter)\(options\)/g,'return window.__kit = new $1(options)')}));}}]});
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><style>html,body,#root,.preacherman-avatar-viewport{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');return;}if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}const f=path.resolve(app,'public','.'+decodeURIComponent(url.pathname));if(!f.startsWith(path.join(app,'public')+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}fs.createReadStream(f).pipe(res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(25000);p.setDefaultNavigationTimeout(25000);
  p.on('pageerror',e=>report.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>typeof window.configure==='function');
  for(const appearance of ['light','dark'])for(const modelId of ['apex-legend-pathfinder','kitana-mk11-in-mk9-suit']){
    await p.evaluate(({appearance,modelId})=>{document.documentElement.dataset.appearance=appearance;document.body.style.background=appearance==='light'?'linear-gradient(130deg,#fff,#adb3bc)':'#000';window.configure({appearance,modelId,environment:'transparent',motionState:'idle',actionId:'idle.default',quality:'low'});},{appearance,modelId});
    await p.locator('[data-avatar-load-state="ready"]').waitFor();await p.waitForTimeout(700);
    const initial=await p.evaluate(()=>window.__kit.getDebugSnapshot());const kitana=modelId.includes('kitana');assert.equal(initial.boneCount,kitana?225:145);assert.equal(initial.currentAction,'idle.default');assert.ok(initial.registeredActions>= (kitana?13:9));
    for(const state of ['listening','thinking','speaking','idle']){
      await p.evaluate(state=>window.configure(prev=>({...prev,motionState:state,jawOpen:state==='speaking'?.6:0})),state);await p.waitForTimeout(state==='idle'?1800:600);
      const snapshot=await p.evaluate(()=>window.__kit.getDebugSnapshot());
      if(kitana){assert.equal(snapshot.state,state);if(state==='listening')assert.equal(snapshot.face.expressionId,'attentive');if(state==='thinking')assert.equal(snapshot.face.expressionId,'curious_question');}
      else {if(state==='thinking')assert.equal(snapshot.screen.expression,'curious');if(state==='speaking')assert.ok(snapshot.body.speakingActive);}
      if(state==='idle')assert.equal(snapshot.currentAction,'idle.default');
      if(state==='speaking')assert.match(snapshot.currentAction,/talk|speech/);
      report.checks.push({appearance,modelId,state,action:snapshot.currentAction});
    }
    const expressions=kitana?['gentle_smile','friendly_smile','attentive','soft_concern','curious_question','soft_surprise']:await p.evaluate(()=>window.__kit.listExpressions().map(e=>e.id));assert.equal(expressions.length,kitana?6:12);
    for(const id of expressions){await p.evaluate(async({id,kitana})=>{if(kitana)await window.__kit.playExpression(id);else await window.__kit.setExpression(id);},{id,kitana});await p.waitForTimeout(300);const state=await p.evaluate(()=>window.__kit.getDebugSnapshot());assert.equal(kitana?state.face.expressionId:state.screen.expression,id);}
    await p.evaluate(async kitana=>{if(kitana)await window.__kit.playExpression('gentle_smile');else await window.__kit.setAutomaticExpressions(true);},kitana);await p.waitForTimeout(350);
    await p.screenshot({path:path.join(out,`${modelId}-${appearance}.png`)});
    const valid=await p.evaluate(()=>{let ok=true;window.__kit.getRoot().traverse(o=>{if(![...o.position,...o.quaternion,...o.scale].every(Number.isFinite))ok=false;});return ok;});assert.ok(valid);
    await p.evaluate(()=>{window.__previousKit=window.__kit;window.configure(null);});await p.locator('[data-avatar-load-state]').waitFor({state:'detached'});await p.waitForFunction(()=>window.__previousKit.getRoot()===null);
    report.checks.push({appearance,modelId,expressions:expressions.length,disposed:true,finiteRig:true});
  }
  report.errors.push(...await p.evaluate(()=>window.errors));assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=String(e.stack);process.exitCode=1;}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'preview-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}})();
