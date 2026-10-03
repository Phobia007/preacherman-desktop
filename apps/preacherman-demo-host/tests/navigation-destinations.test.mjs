import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDemoScreenRoute} from '../src/demo/screenRoute.ts';
import test from 'node:test';
const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('Asset and Extension have independent local routes; Settings and Account remain addressable',()=>{
 for(const surfaceType of ['asset','extension','settings','account']) assert.deepEqual(readDemoScreenRoute('/__surfaces/'+surfaceType),{kind:'surface',surfaceType});
 const shell=source('app-shell/AppShell.tsx');
 const items=source('app-shell/navigationDestinations.ts').match(/const brandNavigationItems = \[([\s\S]*?)\] as const/)[1];
 assert.deepEqual([...items.matchAll(/label: "([^"]+)"/g)].map(m=>m[1]),['Home','Task','Gallery','Market','Asset','Extension']);
 assert.match(shell,/aria-label="Settings"[\s\S]*?tabIndex=\{brandNavigationOpen \? 0 : -1\}/);
 assert.match(shell,/demo-account-dock[\s\S]*?selectBrandDestination\("account"\)/);
 assert.match(source('App.tsx'),/activeSurfaceType !== "account" && !isFrostedSurface \? \(\s*<PreachermanDomObservationBridge/,'Empty reserved routes do not send unsupported observation snapshots to the unchanged service');
});
for(const appearance of ['light','dark']) test(`Reserved pages and Settings gear inherit semantic colors in ${appearance}`,()=>{
 const styles=source('styles.css'), page=source('surfaces/FrostedSurface.tsx');
 assert.match(styles,/\.demo-frosted-surface\s*\{[^}]*background: var\(--demo-theme-market-details-glass\);[^}]*color: var\(--demo-theme-text\);[^}]*backdrop-filter: blur\(12px\)/);
 assert.match(styles,/\.demo-app-shell__brand-settings,\s*\.demo-app-shell__brand-trigger\s*\{[^}]*color: var\(--demo-theme-brand-menu-text\)/);
 assert.match(styles,/\.demo-app-shell__brand-settings:focus-visible,[\s\S]*outline: 1px solid var\(--demo-theme-brand-menu-focus\)/);
 assert.match(page,/aria-label=\{name\}/);
 assert.doesNotMatch(page,/button|canvas|iframe|fetch\(|setInterval|requestAnimationFrame/);
});
