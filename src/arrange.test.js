import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeRectangles,unionRectangles} from './arrange.js';

test('mixed cards and images pack from the upper left without overlaps or resizing',()=>{
  const objects=[{id:'hero',x:1000,y:400,w:300,h:600},{id:'todo',x:2300,y:700,w:240,h:180},{id:'image',x:1400,y:500,w:260,h:400},{id:'folder',x:3000,y:900,w:280,h:100}];
  const result=arrangeRectangles(objects,{width:900});assert.deepEqual([result[0].x,result[0].y],[32,32]);
  for(const item of result){const original=objects.find(obj=>obj.id===item.id);assert.equal(item.w,original.w);assert.equal(item.h,original.h);assert.equal(item.x,original.x+item.dx);assert.equal(item.y,original.y+item.dy);for(const other of result){if(item===other)continue;assert.ok(item.x+item.w<=other.x||other.x+other.w<=item.x||item.y+item.h<=other.y||other.y+other.h<=item.y);}}
  assert.equal(result[3].x,32);assert.equal(result[3].y,660);assert.equal(objects[0].x,1000);
  assert.deepEqual(arrangeRectangles(result,{width:900}).map(item=>[item.dx,item.dy]),result.map(()=>[0,0]));
});
test('oversized tree groups and narrow screens still begin at the upper left',()=>{
  const result=arrangeRectangles([{id:'tree',x:-800,y:-400,w:1500,h:900},{id:'note',x:20,y:0,w:240,h:120}],{width:260});assert.deepEqual(result.map(item=>[item.x,item.y]),[[32,32],[32,960]]);assert.deepEqual(unionRectangles(result),{x:32,y:32,w:1500,h:1048});assert.equal(unionRectangles([]),null);assert.deepEqual(arrangeRectangles([]),[]);
});
