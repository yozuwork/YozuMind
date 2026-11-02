import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasLayers,reorderLayer} from './layers.js';

test('layers follow canvas stacking, include nested contents and exclude staged objects',()=>{
  const map={images:[{id:'image',z:2},{id:'staged',z:99,inbox:true}],cards:[{id:'card',type:'column',z:3,cards:[{id:'child',type:'note',text:'Covered note'}]}],strokes:[{id:'stroke',tool:'rect',z:2}],root:{id:'root',text:'Root',children:[{id:'node',text:'Child',children:[]}]},trees:[{inbox:true,root:{id:'hidden'}}]};
  const layers=canvasLayers(map);
  assert.deepEqual(layers.map(e=>e.id),['card','child','image','stroke','root','node']);
  assert.equal(layers.find(e=>e.id==='child').reorder,false);
  assert.equal(layers.find(e=>e.id==='child').depth,1);
  assert.equal(layers.find(e=>e.id==='node').reorder,false);
});

test('layer ordering works across images, cards and strokes without moving objects',()=>{
  const map={images:[{id:'image',z:1,x:10,y:20},{id:'staged',z:90,inbox:true}],cards:[{id:'card',type:'note',z:2}],strokes:[{id:'stroke',tool:'pen',z:3}]};
  const original=JSON.stringify(map);
  assert.equal(reorderLayer(map,'image','front'),true);
  assert.deepEqual(canvasLayers(map).map(e=>e.id),['image','stroke','card']);
  assert.equal(map.images[0].x,10);assert.equal(map.images[0].y,20);assert.equal(map.images[1].z,90);
  assert.equal(reorderLayer(map,'image','back'),true);
  assert.deepEqual(canvasLayers(map).map(e=>e.id),['stroke','card','image']);
  assert.equal(reorderLayer(map,'staged','front'),false);
  assert.deepEqual(canvasLayers(JSON.parse(original)).map(e=>e.id),['stroke','card','image']);
});
