import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
const css=read('app-shell/drawer-social.css'),shell=read('app-shell/AppShell.tsx'),social=read('app-shell/DrawerSocial.tsx');
test('Friends stays inside the drawer and hides inactive navigation from keyboard access',()=>{
 assert.match(shell,/<DrawerSocial open=\{brandNavigationOpen\}/);
 assert.match(shell,/toggleAttribute\("inert", !brandNavigationOpen \|\| drawerView !== "menu"\)/);
 assert.match(social,/toggleAttribute\("inert", !visible\)/);
 assert.match(shell,/if \(!brandNavigationOpen\) setDrawerView\("menu"\)/);
 assert.match(social,/onViewChange\(view === "friends" \? "menu" : "friends"\)/);
 assert.doesNotMatch(social,/fetch\(|supabase|localStorage|setInterval|requestAnimationFrame/);
});
test('Add friend uses an inline form without navigating, and Friends returns from its footer',()=>{
 assert.match(social,/export type DrawerView = "menu" \| "friends";/);
 assert.doesNotMatch(social,/view === "add"|Adding friends is coming soon/);
 assert.match(social,/onClick=\{\(\) => searching \? closeSearch\(\) : setSearchOpen\(true\)\}/);
 assert.match(social,/onSubmit=\{event => \{ event.preventDefault\(\); if \(query.trim\(\)\)/);
 assert.match(social,/event.stopPropagation\(\); closeSearch\(\)/);
 assert.match(social,/data-back=\{view === "friends"\}/);
 assert.doesNotMatch(social.match(/className="demo-drawer-social__heading">([\s\S]*?)<\/div>/)[1],/<button/);
 assert.match(social,/toggleAttribute\("inert", !searching\)/);
 assert.match(social,/tabIndex=\{open && !searching \? 0 : -1\}/);
 assert.match(css,/data-search-open="true"\] > \.demo-drawer-social-actions__friends \{ visibility: hidden; pointer-events: none;/);
});
for(const theme of ['light','dark'])test(`Drawer social controls retain aligned corners and semantic states in ${theme}`,()=>{
 const styles=read('styles.css');
 const block=[...styles.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)].filter(m=>m[1].trim()===(theme==='dark'?'[data-appearance="dark"]':'')).map(m=>m[2]).join('\n');
 for(const token of new Set(css.match(/--demo-theme-[a-z-]+/g)))assert.ok(block.includes(token+':'),token);
 assert.match(css,/left: 16px; right: 16px; bottom: 6px/);
 assert.match(css,/width: 48px; height: 48px/);
 assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/translate3d\(-288px, 0, 0\)/);assert.match(css,/translate3d\(100%, 0, 0\)/);
});
