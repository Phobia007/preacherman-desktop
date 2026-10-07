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
 const topUp=read('src/surfaces/account/CreditTopUp.tsx');
 assert.match(topUp,/className="account__dialog account__top-up"/);
 assert.match(account,/\.account__credit-add:hover \{[^}]*var\(--demo-theme-account-text\)[^}]*var\(--demo-theme-account-hover\)/);
 assert.match(account,/\.account__top-up-balance \{[^}]*var\(--demo-theme-account-border\)/);
 assert.match(account,/prefers-reduced-motion: reduce[\s\S]*\.account__top-up\[open\]\[data-closing="true"\]::backdrop \{ animation: none;/);
 assert.match(styles,/data-active-surface="account"\] \.demo-window-controls__button img/);
});
test('Account entry preserves a single shared model and does not replace the selected avatar',()=>{
 const app=read('src/App.tsx');
 assert.equal((app.match(/<CortanaModelStage\b/g)||[]).length,1);
 assert.match(app,/cameraFraming=\{!accountHomeHandoff && \(activeSurfaceType === "account"/);
 assert.match(app,/isolateCompanion=\{activeSurfaceType === "account"/);
 assert.match(app,/sceneContent=\{activeSurfaceType === "account" \? <AccountSceneCapture/);
 assert.match(account,/from \{ transform: translateX\(0\); \}/);
 assert.match(account,/account-right 760ms 420ms/);
 assert.match(account,/@media \(prefers-reduced-motion: reduce\)/);
});

for (const appearance of ['light', 'dark']) test(`Account blends the existing Home scene and reverses all layers in ${appearance}`, () => {
 const motion = read('src/app-shell/surfaceMotion.ts');
 const app = read('src/App.tsx');
 assert.match(app, /accountHomeHandoff = navigationPhase === "exiting"[\s\S]*?activeSurfaceType === "account" \|\| routeSurface\(navigationTarget\) === "account"/);
 assert.doesNotMatch(account, /translateX\(-75%\)|translateX\(-100%\)/);
 for (const name of ['account-scene-left', 'account-light', 'account-brand', 'account-vignette', 'account-right']) {
  assert.ok(motion.includes(`"${name}"`), `${name} must reverse with page navigation`);
 }
 assert.match(account, /\.account__mark, \.account__signature \{ animation: account-brand 600ms 420ms/);
 assert.match(account, /prefers-reduced-motion: reduce[\s\S]*\.account-frost, \.account__fade, \.account__mark, \.account__signature, \.account__main/);
});
test('The Account lens uses only authored scene pixels, and login feedback is local',()=>{
 assert.match(scene,/gl\.render\(scene, camera\)/);
 assert.match(scene,/\.detail\(gl\.domElement\)/);
 assert.doesNotMatch(scene,/input|email|html2canvas|document\.body/);
 assert.match(scene,/removeEventListener\(CAPTURE_EVENT/);
 assert.match(scene,/addAfterEffect/);
 assert.match(scene,/frameSubscribers.delete\(copy\)/);
 assert.match(surface,/new TaskProfileLens/);
 assert.match(surface,/lens\.current\?\.dispose\(\)/);
 assert.doesNotMatch(surface,/fetch\(|localStorage|sessionStorage|https?:\/\/|evomap/i);
 assert.match(surface,/type="email"[\s\S]*?autoComplete="email" required/);
 assert.match(surface,/demoAccount.signIn\(email\)/);
 assert.match(surface,/No verification needed/);
 assert.match(surface,/\.showModal\(\)/);
});

test('Account keeps the companion rendering through the lens and reuses its context on close',()=>{
 const app=read('src/App.tsx');
 assert.doesNotMatch(app,/accountLensActive|onLensActiveChange=\{setAccount/);
 assert.match(surface,/settled && progress === 0\) \{ disconnectFrames\(\); setPhase\("closed"\); \}/);
 assert.match(surface,/source.current!.subscribe\(\(\) => lens.current\?\.updateSource\(\)\)/);
 assert.match(account,/data-lens-active="false"\] .account__lens \{ visibility: hidden/);
 assert.match(account,/\.cortana-model-stage--persistent \{[^}]*account-scene-left 1050ms/);
});

for (const appearance of ['light', 'dark']) test(`Account keeps the entire Home backdrop beneath the sliding panel in ${appearance}`, () => {
 const backdrop = account.match(/data-active-surface="account"\] \.demo-app-shell__scene \{([^}]+)\}/)[1];
 assert.match(backdrop, /background: var\(--demo-theme-home-canvas\)/);
 assert.doesNotMatch(backdrop, /transform:|clip-path:|animation:/);
 const movement = account.match(/@keyframes account-scene-left \{([\s\S]+?)\n\}/)[1];
 assert.doesNotMatch(movement, /clip-path/);
 assert.match(account, /\.cortana-model-stage--persistent \{\s*position: absolute;/);
 assert.match(account, /\.account-frost \{[^}]*left: 0;/);
});

test("Apple and Codex icons share the existing theme-aware provider treatment", () => {
  assert.match(account, /\.account__provider img\.account__github, \.account__provider img\.account__monochrome \{[^}]*var\(--demo-theme-account-icon-filter\)/);
});
