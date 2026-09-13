import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { manageGalleryCardMedia } from '../src/surfaces/gallery/galleryCardMedia.ts';

for (const appearance of ['dark','light']) test(`Visible Gallery cards autoplay once, pause and release their own decoder in ${appearance}`, async () => {
  const v={muted:false,loop:false,plays:0,pauses:0,loads:0,removed:false,src:'',getAttribute(){return this.src;},play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;},removeAttribute(){this.src='';},load(){this.loads++;},remove(){this.removed=true;}};
  const media=manageGalleryCardMedia(v,'/assets/gallery/rail-media/climatune.mp4');
  assert.equal(v.src,'');assert.equal(v.plays,0,'offscreen cards must not start downloading');
  media.setActive(true);media.setActive(true);assert.equal(v.plays,1);assert(v.muted&&v.defaultMuted&&v.loop&&v.playsInline);assert.match(v.src,/climatune/);
  media.setActive(false);assert.equal(v.pauses,1);media.setActive(true);assert.equal(v.plays,2);
  media.dispose();assert.equal(v.src,'');assert(v.removed);assert.equal(v.loads,1);media.setActive(true);assert.equal(v.plays,2,'disposed cards cannot restart');
});

test('Every authored Gallery video and logo has a packaged rail asset',()=>{
  const folder=new URL('../public/active-theory-gallery/gallery/',import.meta.url),window={};
  vm.runInNewContext(fs.readFileSync(new URL('rail-media.js',folder),'utf8'),{window});
  const projects=JSON.parse(fs.readFileSync(new URL('external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json',folder),'utf8'));
  assert.equal(projects.length,31);
  for(const p of projects){
    for(const src of [p.video.url,p.projectLogo?.url].filter(Boolean)){
      const local=window.PreachermanGalleryRailMedia[src];assert(local?.startsWith('/assets/gallery/'),p.slug);
      assert(fs.statSync(new URL('../public'+local,import.meta.url)).size>1000,p.slug);
    }
  }
});
