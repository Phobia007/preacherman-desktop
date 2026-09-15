import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const styles=read('src/styles.css');
const account=read('src/surfaces/account/account.css');
const scene=read('src/surfaces/account/AccountScene.tsx');
const surface=read('src/surfaces/account/AccountSurface.tsx');
for(const appearance of ['light','dark'])test(`Account defines every glass, form, dialog and control token in ${appearance}`,()=>{
 const blocks=[...styles.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)]
  .filter(m=>appearance==='dark'?m[1].trim()==='[data-appearance="dark"]':m[1].trim()==='')
  .map(m=>m[2]).join('\n');
 for(const token of new Set((account+scene).match(/--demo-theme-account-[a-z-]+/g))){
  assert.match(blocks,new RegExp(token+':\\s*[^;]+;'),token);
 }
 assert.match(account,/\.account button:focus-visible, \.account input:focus-visible/);
 assert.match(account,/\.account__dialog::backdrop/);
 assert.match(styles,/data-active-surface="account"\] \.demo-window-controls__button img/);
});
test('Account entry preserves a single shared model and does not replace the selected avatar',()=>{
 const app=read('src/App.tsx');
 assert.equal((app.match(/<CortanaModelStage\b/g)||[]).length,1);
 assert.match(app,/cameraFraming=\{activeSurfaceType === "account"/);
 assert.match(app,/isolateCompanion=\{activeSurfaceType === "account"/);
 assert.match(app,/sceneContent=\{activeSurfaceType === "account" \? <AccountSceneCapture/);
 assert.match(account,/account-left 820ms/);assert.match(account,/account-right 760ms 420ms/);
 assert.match(account,/@media \(prefers-reduced-motion: reduce\)/);
});
test('The Account lens uses only authored scene pixels, and login feedback is local',()=>{
 assert.match(scene,/gl\.render\(scene, camera\)/);
 assert.match(scene,/\.detail\(gl\.domElement\)/);
 assert.doesNotMatch(scene,/input|email|html2canvas|document\.body/);
 assert.match(scene,/removeEventListener\(CAPTURE_EVENT/);
 assert.match(surface,/new TaskProfileLens/);
 assert.match(surface,/lens\.current\?\.dispose\(\)/);
 assert.doesNotMatch(surface,/fetch\(|localStorage|sessionStorage|https?:\/\/|evomap/i);
 assert.match(surface,/type="email"[\s\S]*?autoComplete="email" required/);
 assert.match(surface,/Your email has not been sent or saved/);
 assert.match(surface,/\.showModal\(\)/);
});
