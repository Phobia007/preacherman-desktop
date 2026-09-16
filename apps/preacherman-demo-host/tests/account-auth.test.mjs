import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../src/auth/authController.ts',import.meta.url),'utf8');
function harness(options={}) {
 const timers=new Map();let timerId=0;const exports={};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,URL,URLSearchParams,Date,Set,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)});
 const values=new Map(),calls={opens:[],exchanges:[],show:0,signOut:[]};let receive,authEvent,user=options.user||null;
 const missing={name:'AuthSessionMissingError',status:400};
 const auth={
  getUser:async()=>options.offline?{data:{user:null},error:{status:0}}:{data:{user},error:user?null:missing},
  onAuthStateChange:fn=>{authEvent=fn;return {data:{subscription:{unsubscribe(){calls.unsubscribed=true}}}}},
  signInWithOAuth:async config=>{calls.config=config;values.set(exports.AUTH_STORAGE_KEY+'-code-verifier','private-verifier');return {data:{url:options.badUrl||'https://gzqmjzybaosxhkfgbxaz.supabase.co/auth/v1/authorize?provider=github'},error:null}},
  exchangeCodeForSession:async code=>{calls.exchanges.push(code);if(options.exchangeFailure)return {data:{session:null},error:{}};user={id:'test-user',email:'test@example.test',user_metadata:{full_name:'Test User'}};return {data:{session:{user}},error:null}},
  signOut:async config=>{calls.signOut.push(config);user=null;authEvent('SIGNED_OUT');return {error:null}},
 };
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const controller=exports.createAccountController({auth,storage,desktop:options.desktop!==false,openBrowser:async url=>{calls.opens.push(url);if(options.openFailure)throw Error('failed')},listen:async fn=>{receive=fn;return()=>{calls.unlistened=true}},currentUrls:async()=>options.current||null,showAccount:()=>calls.show++});
 return {controller,calls,values,timers,exports,storage,receive:async url=>{receive([url]);for(let i=0;i<8;i++)await Promise.resolve()},event:(e)=>authEvent(e)};
}
test('GitHub sign-in uses PKCE return address, opens once, verifies identity and signs out locally',async()=>{
 const h=harness();await h.controller.start();assert.equal(h.controller.getSnapshot().status,'signed-out');
 await Promise.all([h.controller.signIn(),h.controller.signIn()]);assert.equal(h.calls.opens.length,1);
 assert.equal(h.calls.config.provider,'github');assert.equal(h.calls.config.options.redirectTo,'preacherman://auth/callback');assert.equal(h.calls.config.options.skipBrowserRedirect,true);
 assert.equal(h.controller.getSnapshot().status,'waiting');
 const url='preacherman://auth/callback?code=12345678-1234-1234-1234-123456789012';await h.receive(url);await h.receive(url);
 assert.equal(h.calls.exchanges.length,1);assert.equal(h.calls.show,1);assert.equal(h.controller.getSnapshot().user.id,'test-user');assert.equal(h.controller.getSnapshot().status,'signed-in');
 await h.controller.signOut();assert.equal(h.calls.signOut[0].scope,'local');assert.equal(h.controller.getSnapshot().user,null);h.controller.dispose();assert.ok(h.calls.unsubscribed&&h.calls.unlistened);assert.equal(h.timers.size,0);
});
test('Callback parser rejects other origins, implicit tokens, malformed and duplicate codes',()=>{
 const h=harness();for(const url of ['https://auth/callback?code=1234567890123456','preacherman://evil/callback?code=1234567890123456','preacherman://auth/else?code=1234567890123456','preacherman://u@auth/callback?code=1234567890123456','preacherman://auth/callback#access_token=secret','preacherman://auth/callback?code=short','preacherman://auth/callback?code=1234567890123456&code=1234567890123457'])assert.equal(h.exports.parseDesktopCallback(url),null,url);
 assert.equal(h.exports.parseDesktopCallback('preacherman://auth/callback#error=access_denied').error,'access_denied');h.controller.dispose();
});
test('Unsolicited and cancelled callbacks cannot establish sessions, and retry is usable',async()=>{
 const h=harness();await h.controller.start();const url='preacherman://auth/callback?code=12345678-1234-1234-1234-123456789012';await h.receive(url);assert.equal(h.calls.exchanges.length,0);
 await h.controller.signIn();h.values.set(h.exports.AUTH_STORAGE_KEY+'-flows-code-verifier',JSON.stringify(['abcdefgh']));h.values.set(h.exports.AUTH_STORAGE_KEY+'-flow-abcdefgh-code-verifier','private');h.controller.cancel();await h.receive(url);assert.equal(h.calls.exchanges.length,0);assert.equal(h.values.size,0);
 await h.controller.signIn();assert.equal(h.controller.getSnapshot().status,'waiting');h.controller.dispose();
});
test('Interrupted app launch completes only its still-pending sign-in',async()=>{
 const url='preacherman://auth/callback?code=12345678-1234-1234-1234-123456789012';const h=harness({current:[url]});
 h.values.set(h.exports.AUTH_STORAGE_KEY+'.pending-until',String(Date.now()+60_000));await h.controller.start();assert.equal(h.controller.getSnapshot().status,'signed-in');assert.equal(h.calls.exchanges.length,1);h.controller.dispose();
});
test('Denial, browser failure, expiry and code exchange failure clear waiting state',async()=>{
 for(const reason of ['denied','openFailure','expired','exchangeFailure','badUrl']){
  const h=harness({[reason]:reason==='badUrl'?'https://evil.test/auth':true});await h.controller.start();await h.controller.signIn();
  if(reason==='denied')await h.receive('preacherman://auth/callback?error=access_denied');
  if(reason==='expired')for(const fn of [...h.timers.values()])fn();
  if(reason==='exchangeFailure')await h.receive('preacherman://auth/callback?code=12345678-1234-1234-1234-123456789012');
  assert.equal(h.controller.getSnapshot().status,'signed-out',reason);assert.ok(h.controller.getSnapshot().error,reason);assert.equal(h.values.size,0,reason);h.controller.dispose();
 }
});
test('Restart verifies a saved session; network failure never invents a signed-in identity',async()=>{
 const user={id:'existing-user',email:'existing@example.test',user_metadata:{}};
 const h=harness({user});await h.controller.start();assert.equal(h.controller.getSnapshot().user.id,user.id);h.controller.dispose();
 const failed=harness({user,offline:true});await failed.controller.start();assert.equal(failed.controller.getSnapshot().user,null);assert.ok(failed.controller.getSnapshot().error);failed.controller.dispose();
});
test('Browser preview does not start a desktop authorization flow',async()=>{
 const h=harness({desktop:false});await h.controller.signIn();assert.equal(h.calls.opens.length,0);assert.match(h.controller.getSnapshot().error,/Desktop/);h.controller.dispose();
});
