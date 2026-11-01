import test from 'node:test';
import assert from 'node:assert/strict';
import {imagePlacement} from './canvas-assets.js';

test('pasted images remain centered and fully visible through pan, zoom and extreme aspect ratios',()=>{
  for(const [width,height] of [[400,240],[100,1600],[1600,100],[1600,1600]])for(const k of [.2,1,2.5])for(const [cw,ch] of [[390,700],[1280,850]]){
    const view={x:-1234,y:567,k},image=imagePlacement(width,height,cw,ch,view),left=view.x+image.x*k,top=view.y+image.y*k;
    assert.ok(Math.abs((image.x+image.w/2)*k+view.x-cw/2)<1e-8);assert.ok(Math.abs((image.y+image.h/2)*k+view.y-ch/2)<1e-8);
    assert.ok(left>=32-1e-8&&top>=72-1e-8);assert.ok(left+image.w*k<=cw-32+1e-8&&top+image.h*k<=ch-72+1e-8);assert.ok(Math.abs(image.w/image.h-width/height)<1e-8);
  }
});
test('hidden canvases and invalid view dimensions cannot create invisible images',()=>{
  for(const [cw,ch,view] of [[0,800,{x:0,y:0,k:1}],[800,0,{x:0,y:0,k:1}],[800,800,{x:0,y:0,k:0}],[800,800,{x:NaN,y:0,k:1}]])assert.throws(()=>imagePlacement(400,300,cw,ch,view));
});
