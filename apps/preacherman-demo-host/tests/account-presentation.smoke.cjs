const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const out=process.env.PRESENTATION_REPORT_DIR || __dirname,report={modes:[],errors:[],mockedIdentity:true};
async function dockHidden(page) {
 await page.waitForFunction(() => {
  const dock=document.querySelector('.demo-account-dock'),style=getComputedStyle(dock);
  return dock.getAttribute('aria-hidden')==='true' && dock.tabIndex===-1 && style.visibility==='hidden' && style.opacity==='0' && style.pointerEvents==='none';
 });
 await page.waitForTimeout(1400);
}
async function loginFont(page) {
 const family=await page.locator('.demo-app-shell__brand-menu-item').first().evaluate(el=>getComputedStyle(el).fontFamily);
 for(const selector of ['.account__heading h1','.account__heading p','.account__provider','.account__email','.account__continue']) {
  const font=await page.locator(selector).first().evaluate(el=>({family:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight}));
  assert.equal(font.family,family,selector); assert.equal(font.weight,'300');
 }
}
const user={id:'33333333-3333-4333-8333-333333333333',aud:'authenticated',role:'authenticated',email:'desktop-auth@example.test',email_confirmed_at:'2026-09-16T00:00:00Z',created_at:'2026-09-16T00:00:00Z',app_metadata:{provider:'github',providers:['github']},user_metadata:{full_name:'Desktop Login Test',user_name:'desktop-test',avatar_url:'https://avatars.githubusercontent.com/u/123?v=4'}};
const jwt=()=>{const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})+'.verification-placeholder'};
async function nav(p,name,surface){const toggle=p.locator('.demo-app-shell__brand-trigger');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.press('Enter');await p.getByRole('navigation',{name:'Preacherman sections'}).getByRole('button',{name,exact:true}).click();if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();await p.locator('.demo-app-shell[data-active-surface="'+surface+'"]').waitFor();}
(async()=>{let browser,context,page;try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Users/Administrator/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--enable-gpu','--use-angle=d3d11','--ignore-gpu-blocklist']});
 context=await browser.newContext({viewport:{width:1800,height:1000}});
 await context.addInitScript(()=>{
  window.isTauri=true;const callbacks=new Map(),events=new Map();let id=0;
  window.__authTest={opens:[],events,callbacks,send(url){const handler=events.get('deep-link://new-url');if(!handler)throw Error('No callback listener');callbacks.get(handler)({event:'deep-link://new-url',id:handler,payload:[url]})}};
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback(fn){callbacks.set(++id,fn);return id},unregisterCallback(i){callbacks.delete(i)},invoke:async(cmd,args)=>{
   if(cmd==='plugin:event|listen'){events.set(args.event,args.handler);return args.handler}
   if(cmd==='plugin:event|unlisten')return;
   if(cmd==='plugin:deep-link|get_current')return null;
   if(cmd==='start_auth_return')return 'http://127.0.0.1:43821/auth/callback?desktop_state='+args.nonce;
   if(cmd==='stop_auth_return')return;
   if(cmd==='plugin:opener|open_url'){window.__authTest.opens.push(args.url);return}
   if(cmd==='plugin:window|is_focused')return true;
   return false;
  }};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  if(!localStorage.getItem('preacherman.preferences'))localStorage.setItem('preacherman.preferences',JSON.stringify({appearance:'dark',locale:'en',activeModelId:'apex-legend-pathfinder'}));
 });
 page=await context.newPage();page.setDefaultTimeout(25000);page.setDefaultNavigationTimeout(30000);
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 await context.route('https://avatars.githubusercontent.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#406075"/><circle cx="20" cy="16" r="8" fill="#cad9e0"/><path d="M5 40 Q5 23 20 23 Q35 23 35 40" fill="#cad9e0"/></svg>'}));
 let profileRequests=0;
 await context.route('https://gzqmjzybaosxhkfgbxaz.supabase.co/rest/v1/profiles**',async route=>{
  assert.equal(new URL(route.request().url()).searchParams.get('user_id'),'eq.'+user.id);profileRequests++;
  await route.fulfill({json:{display_name:'Desktop Login Test',avatar_url:user.user_metadata.avatar_url,member_number:1}});
 });
 let tokenRequests=0;await context.route('https://gzqmjzybaosxhkfgbxaz.supabase.co/auth/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/token')){const body=route.request().postDataJSON();assert.equal(url.searchParams.get('grant_type'),'pkce');const authorize=await page.evaluate(()=>window.__authTest.opens.at(-1));const challenge=new URL(authorize).searchParams.get('code_challenge');assert.equal(crypto.createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);tokenRequests++;await route.fulfill({json:{access_token:jwt(),refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,user,provider_token:'synthetic-github-token'}});}
  else if(url.pathname.endsWith('/user'))await route.fulfill({json:user});
  else if(url.pathname.endsWith('/logout'))await route.fulfill({status:204,body:''});
  else await route.fulfill({status:400,json:{message:'Unexpected mock auth request'}});
 });
 await page.goto('http://127.0.0.1:1420');await page.locator('.demo-intro-splash').waitFor({state:'detached'});await page.locator('[data-avatar-load-state="ready"]').first().waitFor({timeout:60000});
 for(const appearance of ['dark','light']){
  if(await page.locator('html').getAttribute('data-appearance')!==appearance){await page.evaluate(a=>{const p=JSON.parse(localStorage.getItem('preacherman.preferences'));localStorage.setItem('preacherman.preferences',JSON.stringify({...p,appearance:a}))},appearance);await page.reload();await page.locator('.demo-intro-splash').waitFor({state:'detached'});}
  await nav(page,'Home','home');
  await page.locator('.demo-account-dock .account-badge[data-signed-in="false"]').waitFor();
  assert.equal(await page.locator('.demo-account-dock .account-badge__details').count(),0);
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-guest-home.png')});
  await page.locator('.demo-app-shell__brand-trigger').click();
  assert.equal(await page.getByRole('navigation',{name:'Preacherman sections'}).getByRole('button',{name:'Account',exact:true}).innerText(),'Account');
  await dockHidden(page);
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-guest-navigation.png')});
  await page.locator('.demo-app-shell__brand-trigger').click();
  await page.getByRole('button',{name:'Sign in to Preacherman',exact:true}).click();
  await page.locator('.account[data-entrance="complete"]').waitFor();await page.locator('[data-auth-state="signed-out"]').waitFor();
  await loginFont(page);
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-login-font.png')});
  await page.getByRole('button',{name:'Continue with GitHub',exact:true}).click();await page.locator('[data-auth-state="waiting"]').waitFor();
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-waiting.png')});
  const url=await page.evaluate(()=>window.__authTest.opens.at(-1));assert.match(new URL(url).searchParams.get('redirect_to'),/^http:\/\/127\.0\.0\.1:43821\/auth\/callback\?desktop_state=[a-f0-9-]{36}$/);assert.equal(new URL(url).searchParams.get('code_challenge_method'),'s256');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('[data-auth-state="signed-out"]').waitFor();
  await loginFont(page);
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-login-font.png')});
  await page.getByRole('button',{name:'Continue with GitHub',exact:true}).click();await page.locator('[data-auth-state="waiting"]').waitFor();
  await page.evaluate(()=>window.__authTest.send('preacherman://auth/callback?error=access_denied'));await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/cancelled/);await page.screenshot({path:path.join(out,'preview-'+appearance+'-denied.png')});
  await page.getByRole('button',{name:'Continue with GitHub',exact:true}).click();await page.locator('[data-auth-state="waiting"]').waitFor();await nav(page,'Home','home');
  await page.evaluate(()=>window.__authTest.send('preacherman://auth/callback?code=12345678-1234-1234-1234-123456789012'));await page.locator('[data-auth-state="signed-in"]').waitFor();assert.equal(await page.getByRole('heading',{name:'Your account'}).count(),1);await page.getByText(user.email,{exact:true}).waitFor();
  await page.locator('.account[data-entrance="complete"]').waitFor();
  await page.locator('.demo-account-dock .account-badge__number').filter({hasText:'#00001'}).waitFor();
  await page.locator('.account__identity').getByText('#00001',{exact:true}).waitFor();
  assert.equal(await page.locator('.demo-account-dock .account-badge__name').innerText(),'Desktop Login Test');
  await page.waitForFunction(()=>document.querySelector('.demo-account-dock img')?.naturalWidth>0);
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-signed-in.png')});
  await nav(page,'Home','home');await page.screenshot({path:path.join(out,'preview-'+appearance+'-member-home.png')});
  await page.locator('.demo-app-shell__brand-trigger').click();
  await dockHidden(page);
  const accountNav=page.getByRole('navigation',{name:'Preacherman sections'}).getByRole('button',{name:'Account',exact:true});
  assert.equal(await accountNav.locator('.account-badge__number').innerText(),'#00001');
  await page.screenshot({path:path.join(out,'preview-'+appearance+'-member-navigation.png')});
  await accountNav.click();await page.locator('.demo-app-shell__brand-trigger').click();await page.locator('.account[data-entrance="complete"]').waitFor();
  await page.locator('.demo-account-dock img').dispatchEvent('error');assert.equal(await page.locator('.demo-account-dock .account-badge__outline').count(),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('preacherman.account.gzqmjzybaosxhkfgbxaz').includes('synthetic-github-token')),false);
  await page.reload();await page.locator('.demo-intro-splash').waitFor({state:'detached'});await nav(page,'Account','account');await page.locator('[data-auth-state="signed-in"]').waitFor();await page.getByText(user.email,{exact:true}).waitFor();
  const styles=await page.locator('.account__main').evaluate(e=>({background:getComputedStyle(e).backgroundColor,text:getComputedStyle(e).color}));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('[data-auth-state="signed-out"]').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('preacherman.account.gzqmjzybaosxhkfgbxaz')),null);
  await page.locator('.account__signature').click();await page.locator('.account[data-phase="open"]').waitFor();assert.equal(await page.locator('.demo-app-shell__scene .preacherman-avatar-viewport').getAttribute('data-avatar-render-active'),'true');await page.keyboard.press('Escape');await page.locator('.account[data-phase="closed"]').waitFor();
  report.modes.push({appearance,styles,guestDockHidden:true,memberDockHidden:true,loginFontMatchesNavigation:true,pkceVerified:true,cancel:true,denied:true,callbackAfterNavigation:true,restart:true,signOut:true,liveCompanion:true});
 }
 assert.equal(tokenRequests,2);assert.equal(profileRequests,4);report.profileRequests=profileRequests;report.memberNumber='#00001';report.errors=[...new Set(report.errors)];report.newErrors=report.errors.filter(e=>e!=='Hydration completed but contains mismatches.');assert.deepEqual(report.newErrors,[]);report.passed=true;
}catch(e){report.failure=String(e.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'preview-failure.png')}).catch(()=>{})}
finally{if(context){await page?.close().catch(()=>{});await context.close().catch(()=>{})}await browser?.close().catch(()=>{});fs.writeFileSync(path.join(out,'preview-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}})();
