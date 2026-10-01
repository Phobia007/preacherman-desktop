import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const read = file => readFile(new URL('../'+file, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const generated={exports:{}};
runInNewContext(compile(await read('src/surfaces/market/task-featured-card-source.ts')),generated);
const controller={exports:{},require:name=>name==='three'?{}:generated.exports};
runInNewContext(compile(await read('src/surfaces/market/TaskFeaturedCards.ts')),controller);
test('Featured cards reuse the exact Task sheet, hover, corner and lighting shaders',async()=>{
  const source=await read('public/gallery-v3/portfolio/_nuxt/D9b8F35K.js');
  const shader=name=>source.match(new RegExp('\\b'+name+'=`([\\s\\S]*?)`'))[1].replace(/\/\/[^\n]*/g,'').replace(/\n\s*\n/g,'\n').trim();
  const compose=(name,chunks)=>shader(name).replace('#include <chunks>',chunks.map(shader).join('\n'));
  assert.equal(generated.exports.taskCardVertex,compose('q3',['Wl','Nl','Bu']));
  assert.equal(generated.exports.taskCardFragment,compose('X3',['Nl','Bu','L3','Zm','ua','Mo']));
  const settings=generated.exports.taskCardSettings;
  assert.equal(settings.fov,53.4);assert.equal(settings.cameraZ,41.18);assert.equal(settings.segments,24);
  assert.equal(settings.depth,.2);assert.equal(settings.span,1.15);assert.equal(settings.door,-.12);assert.equal(settings.dent,.1);
});
test('Continuous leftward travel keeps equal spacing through wraps, at different frame rates and long runtimes',()=>{
  const {featuredOffset:offset,FEATURED_SPEED:speed}=controller.exports;
  for(const fps of [30,60,120]) {
    for(const time of [0,1,7.5,60,86400]) {
      const positions=Array.from({length:6},(_,i)=>offset(time*speed,i,640,6)).sort((a,b)=>a-b);
      for(let i=1;i<6;i++) assert.ok(Math.abs(positions[i]-positions[i-1]-640)<1e-6);
      for(let i=0;i<6;i++) {
        const before=offset(time*speed,i,640,6),after=offset((time+1/fps)*speed,i,640,6);
        if(Math.abs(before)<1600) assert.ok(Math.abs(after-before+speed/fps)<1e-6);
      }
      assert.equal(offset(time*speed,2,640,6),offset(time*speed+3840,2,640,6));
    }
  }
});
