import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMaps, serializeMaps } from './files.js';

let id = 0;
const newId = prefix => `${prefix}-${++id}`;
const map = { id:'old-map', title:'生活計畫', icon:'lightbulb', layout:'right', root:{ id:'old-root', text:'主題', children:[{id:'old-child',text:'分支',color:'#1767c9',collapsed:true,children:[]}] } };

test('single map and full backup round trip preserves content and renews IDs', () => {
  for (const source of [[map], [map, map]]) {
    const restored = parseMaps(serializeMaps(source), newId);
    assert.equal(restored.length, source.length);
    assert.equal(restored[0].title, map.title);
    assert.equal(restored[0].icon, 'lightbulb');
    assert.equal(restored[0].layout, 'right');
    assert.equal(restored[0].root.children[0].collapsed, true);
    assert.equal(restored[0].root.children[0].color, '#1767c9');
    assert.notEqual(restored[0].id, map.id);
    assert.notEqual(restored[0].root.id, map.root.id);
    if (restored.length > 1) assert.notEqual(restored[0].root.id, restored[1].root.id);
  }
});
test('legacy array and single-map files, including BOM, are supported', () => {
  assert.equal(parseMaps('\uFEFF'+JSON.stringify([map]), newId)[0].title, map.title);
  assert.equal(parseMaps(JSON.stringify(map), newId)[0].root.text, '主題');
});
test('invalid, future-version and partially corrupt backups are rejected', () => {
  for (const value of ['{', 'null', '[]', '{"format":"yozumind","version":2,"maps":[]}', JSON.stringify([map, {...map,root:{text:12}}])]) {
    assert.throws(() => parseMaps(value, newId));
  }
});
test('excessive nesting is rejected before importing', () => {
  let root = {text:'leaf',children:[]};
  for(let i=0;i<102;i++) root={text:'branch',children:[root]};
  assert.throws(()=>parseMaps(JSON.stringify({...map,root}),newId));
});

test('images and relation endpoints survive import with renewed IDs', () => {
  const source = {...map, images:[{id:'photo',src:'data:image/png;base64,YQ==',x:-20,y:30,w:200,h:100}],relations:[{id:'line',from:'old-child',to:'photo'}]};
  const restored=parseMaps(serializeMaps([source]),newId)[0];
  assert.equal(restored.images[0].x,-20);
  assert.equal(restored.images[0].w/restored.images[0].h,2);
  assert.equal(restored.relations[0].from,restored.root.children[0].id);
  assert.equal(restored.relations[0].to,restored.images[0].id);
  assert.notEqual(restored.images[0].id,'photo');
  assert.throws(()=>parseMaps(JSON.stringify({...source,images:[{...source.images[0],src:'https://example.com/image.svg'}]}),newId));
});
