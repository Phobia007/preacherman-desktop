import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exports={};
runInNewContext(ts.transpileModule(read('src/auth/profileController.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,AbortController,Set});
const {formatMemberNumber,memberName,memberAvatar,createProfileController}=exports;
const user=id=>({id,user_metadata:{full_name:'Example member',avatar_url:'https://avatars.githubusercontent.com/u/123?v=4'}});
const profile=n=>({display_name:'Member '+n,avatar_url:'',member_number:n});
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
function harness(){
 let current={user:null};const listeners=new Set(),requests=[];
 const account={getSnapshot:()=>current,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 const controller=createProfileController(account,(id,signal)=>new Promise((resolve,reject)=>requests.push({id,signal,resolve,reject})));
 return {controller,requests,listeners,login(id){current={user:id?user(id):null};listeners.forEach(fn=>fn())}};
}
test('Member formatting never invents, truncates or rounds an account number',()=>{
 assert.equal(formatMemberNumber(1),'#00001');assert.equal(formatMemberNumber('2'),'#00002');assert.equal(formatMemberNumber(100001),'#100001');
 for(const value of [null,undefined,0,-1,1.5,'01','invalid','9007199254740992'])assert.equal(formatMemberNumber(value),null);
});
test('Profile name fallback and avatar source are safe for display',()=>{
 assert.equal(memberName(user('a'),profile(1)),'Member 1');assert.equal(memberName(user('a'),null),'Example member');
 assert.equal(memberName({user_metadata:{full_name:'\u0001'}},null),'Preacherman member');
 assert.equal(memberAvatar(user('a'),null),'https://avatars.githubusercontent.com/u/123?v=4');
 for(const avatar_url of ['javascript:alert(1)','http://avatars.githubusercontent.com/u/1','https://avatars.githubusercontent.com.evil.test/1','https://user@avatars.githubusercontent.com/u/1','https://avatars.githubusercontent.com:444/u/1'])assert.equal(memberAvatar({user_metadata:{avatar_url}},null),null);
});
test('One shared request per account; switching or signing out rejects stale responses',async()=>{
 const h=harness();h.controller.start();h.login('a');h.login('a');assert.equal(h.requests.length,1);
 h.login('b');assert.ok(h.requests[0].signal.aborted);assert.equal(h.controller.getSnapshot().profile,null);
 h.requests[0].resolve(profile(1));await settle();assert.equal(h.controller.getSnapshot().userId,'b');assert.equal(h.controller.getSnapshot().profile,null);
 h.requests[1].resolve(profile(2));await settle();assert.equal(h.controller.getSnapshot().profile.member_number,2);
 h.controller.retry();h.login(null);h.requests[2].resolve(profile(2));await settle();assert.equal(h.controller.getSnapshot().profile,null);assert.equal(h.controller.getSnapshot().status,'idle');h.controller.dispose();assert.equal(h.listeners.size,0);
});
test('Failed lookup does not fabricate a number and can recover without another login',async()=>{
 const h=harness();h.controller.start();h.login('a');h.requests[0].reject(Error('offline'));await settle();assert.equal(h.controller.getSnapshot().status,'error');assert.equal(h.controller.getSnapshot().profile,null);
 const retry=h.controller.retry();h.requests[1].resolve(profile(1));await retry;assert.equal(h.controller.getSnapshot().status,'ready');assert.equal(h.controller.getSnapshot().profile.member_number,1);
 h.controller.retry();h.controller.dispose();assert.ok(h.requests[2].signal.aborted);h.requests[2].resolve(profile(99));await settle();assert.notEqual(h.controller.getSnapshot().profile?.member_number,99);
});
for(const mode of ['light','dark'])test(`Persistent account controls have complete ${mode} appearance tokens`,()=>{
 const css=read('src/styles.css');const block=[...css.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)].filter(m=>mode==='dark'?m[1].trim()==='[data-appearance="dark"]':m[1].trim()==='').map(m=>m[2]).join('\n');
 for(const token of new Set(css.match(/--demo-theme-member-[a-z-]+/g)))assert.match(block,new RegExp(token+':\\s*[^;]+;'),token);
 assert.match(css,/\.demo-account-dock:focus-visible \.account-badge__avatar/);
 assert.match(css,/\.demo-account-dock:hover \{ color: var\(--demo-theme-member-hover\)/);
 assert.match(block,/--demo-theme-member-surface: transparent;/);
 const dock=css.match(/\.demo-account-dock \{([^}]+)\}/)[1];
 assert.match(dock,/padding: 0/);assert.match(dock,/box-shadow: none; backdrop-filter: none/);
 assert.match(css,/data-menu-hidden="true"\] \{[^}]*pointer-events: none/);
});
