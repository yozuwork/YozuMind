import test from 'node:test';
import assert from 'node:assert/strict';
import {focusViewport,readingViewport} from './viewport.js';
test('default reading layout stays at 100% and top left regardless of long note height',()=>{
  for(const h of [100,5000,50000]){
    const box={x:320,y:-200,w:1800,h},view=readingViewport(box);
    assert.equal(view.k,1);assert.equal(view.x+box.x*view.k,32);assert.equal(view.y+box.y*view.k,32);
  }
  assert.equal(readingViewport({x:Infinity,y:Infinity}),null);
});
test('reading focus centers only the selected object and caps enlargement',()=>{
  const box={x:900,y:-100,w:300,h:120},v=focusViewport(box,1200,800);
  assert.equal(v.k,2);assert.equal(v.x+(box.x+box.w/2)*v.k,600);assert.equal(v.y+(box.y+box.h/2)*v.k,400);
  assert.deepEqual(box,{x:900,y:-100,w:300,h:120});
});
test('large portrait content fits available height with a reading margin',()=>{
  const box={x:0,y:0,w:600,h:1400},v=focusViewport(box,1000,800);
  assert.ok(v.k<1);assert.equal(v.y,56);assert.ok(box.w*v.k<=888);
});
test('hidden canvases and invalid bounds do not change the viewport',()=>{
  assert.equal(focusViewport({x:0,y:0,w:100,h:100},0,800),null);
  assert.equal(focusViewport({x:NaN,y:0,w:100,h:100},1000,800),null);
});
