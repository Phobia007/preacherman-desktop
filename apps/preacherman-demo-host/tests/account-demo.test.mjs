import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const source = read('src/auth/demoAccount.ts');
function harness(initial) {
 const values = new Map(initial);
 const storage = {getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,v)};
 const exports = {};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,localStorage:storage,Set,crypto:{randomUUID:()=> '12345678-demo'}});
 return {store:exports.createDemoAccountStore(storage),storage,values,key:exports.DEMO_ACCOUNT_STORAGE_KEY};
}
test('Demo login, profile editing, restart and sign-out stay local and preserve each email profile',()=>{
 const h=harness(); let events=0;const stop=h.store.subscribe(()=>events++);
 h.store.signIn('  Alice@example.test  ');const id=h.store.getSnapshot().id;
 h.store.update('Alice','Hello');assert.equal(events,2);
 const restart=harness(h.values);assert.equal(restart.store.getSnapshot().name,'Alice');
 h.store.signOut();assert.equal(h.store.getSnapshot(),null);assert.equal(harness(h.values).store.getSnapshot(),null);
 h.store.signIn('bob@example.test');assert.equal(h.store.getSnapshot().bio,'');
 h.store.signOut();h.store.signIn('alice@example.test');assert.equal(h.store.getSnapshot().bio,'Hello');assert.equal(h.store.getSnapshot().id,id);
 stop();const before=events;h.store.signOut();assert.equal(events,before);
 assert.deepEqual([...h.values.keys()],[h.key]);
 assert.doesNotMatch(source,/fetch\(|supabase|invoke\(|accountAuth\.\w/);
});
test('Unreadable storage and failed saves do not fabricate a successful demo session',()=>{
 const h=harness([['preacherman.demo-account.v1','invalid']]);assert.equal(h.store.getSnapshot(),null);
 assert.throws(()=>h.store.signIn(''));h.storage.setItem=()=>{throw Error('full')};
 assert.throws(()=>h.store.signIn('alice@example.test'));assert.equal(h.store.getSnapshot(),null);
});
for(const mode of ['light','dark'])test(`Demo profile uses existing ${mode} tokens and keeps reversible Account motion`,()=>{
 const css=read('src/surfaces/account/account.css'),styles=read('src/styles.css');
 const blocks=[...styles.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)].filter(m=>mode==='dark'?m[1].trim()==='[data-appearance="dark"]':m[1].trim()==='').map(m=>m[2]).join('\n');
 for(const token of new Set(css.match(/--demo-theme-account-[a-z-]+/g)))assert.match(blocks,new RegExp(token+':\\s*[^;]+;'));
 assert.match(css,/account-content-out 220ms/);assert.match(css,/account-content-in 420ms/);
 assert.match(css,/account-right 760ms 420ms/);
 assert.match(read('src/app-shell/surfaceMotion.ts'),/"account-right"/);
 assert.match(css,/prefers-reduced-motion: reduce[\s\S]*account__content/);
});
