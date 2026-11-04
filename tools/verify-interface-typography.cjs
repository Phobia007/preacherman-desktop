const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/AppData/Roaming/Open Design/namespaces/release-stable-win/data/projects/11a56137-5bab-4f42-a336-7c4934130094/node_modules/playwright');
const repo=path.resolve(__dirname,'..'),app=path.join(repo,'apps/preacherman-demo-host'),out=path.join(repo,'output/ui-language-fonts');
const styles=['src/styles.css','src/surfaces/home/home-backdrop.css','src/surfaces/market/market-profile.css','src/surfaces/account/account.css','src/settings/native-agent-settings.css','src/settings/ai-providers-settings.css','src/realtime/voice-session.css'];
let browser,server;const report={modes:[],errors:[]};
(async()=>{const timer=setTimeout(()=>browser?.close().finally(()=>process.exit(1)),60000);try{
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/'){
  res.setHeader('Content-Type','text/html');res.end(`<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,">${styles.map(s=>`<link rel="stylesheet" href="/${s}">`).join('')}</head><body><div class="demo-app-shell" data-appearance="${url.searchParams.get('mode')}"><div class="demo-host"><p id="description">Your companion is ready.</p><div class="native-agent-settings"><button id="button">Test connection</button></div><div class="account__dialog" id="account">Account settings</div><div class="ai-provider-settings" id="provider">Choose a provider</div><svg><text class="home-backdrop__statement" id="slogan">We Bring a New.</text></svg><span class="demo-surface-header__signature" id="signature">Preacherman</span></div></div><script>document.documentElement.dataset.appearance=new URL(location.href).searchParams.get('mode')</script></body></html>`);return;}
  const filename=path.resolve(app,url.pathname.startsWith('/src/')?'.':'public','.'+decodeURIComponent(url.pathname));if(!filename.startsWith(app+path.sep)||!fs.existsSync(filename)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.css':'text/css','.ttf':'font/ttf','.otf':'font/otf','.woff2':'font/woff2'})[path.extname(filename)]||'application/octet-stream');fs.createReadStream(filename).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 for(const mode of ['light','dark']){await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);await page.evaluate(()=>document.fonts.ready);
  const fonts=await page.evaluate(()=>Object.fromEntries(['description','button','account','provider','slogan','signature'].map(id=>[id,getComputedStyle(document.getElementById(id)).fontFamily])));
  for(const id of ['description','button','account','provider'])assert.match(fonts[id],/Clash Display/);
  assert.match(fonts.slogan,/Preacherman Home Zodiak/);assert.match(fonts.signature,/Market Task Signature/);
  const loaded=await page.evaluate(()=>document.fonts.check('300 18px "Clash Display"'));assert.ok(loaded);report.modes.push({mode,fonts,loaded});
  await page.addStyleTag({url:`http://127.0.0.1:${server.address().port}/ui-typography.css`});assert.match(await page.locator('#provider').evaluate(e=>getComputedStyle(e).fontFamily),/Clash Display/);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.failure=String(e.stack);process.exitCode=1;}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));clearTimeout(timer);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'typography-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}})();
