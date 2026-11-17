import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJsonTree} from './json-tree.js';
import {parseMaps,serializeMaps} from './files.js';
test('JSON tree retains nested properties, array indices and exact numeric literals',()=>{
  const tree=parseJsonTree('[{"id":9007199254740993,"ok":true,"empty":{},"id":-0}]');
  assert.equal(tree.type,'array');assert.equal(tree.children[0].key,'0');
  const properties=tree.children[0].node.children;
  assert.deepEqual(properties.map(p=>p.key),['id','ok','empty','id']);
  assert.equal(properties[0].node.value,'9007199254740993');assert.equal(properties[3].node.value,'-0');assert.deepEqual(properties[2].node.children,[]);
  assert.throws(()=>parseJsonTree('{"broken":}'));
});
test('tree mode and original text survive archive serialization',()=>{
  const text='[{"id":1}]';let id=0;
  const [map]=parseMaps(serializeMaps([{id:'m',title:'JSON',root:null,cards:[{id:'n',type:'note',x:0,y:0,text,jsonTree:true}]}]),()=>String(++id));
  assert.equal(map.cards[0].jsonTree,true);assert.equal(map.cards[0].text,text);
});
test('JSON has its own rail card with tree, format and copy actions',()=>{
  const cards=readFileSync(new URL('./cards.js',import.meta.url),'utf8');
  assert.ok(cards.includes("['json','JSON',bi('braces')]"));
  for(const action of ['jsonRaw','jsonFormat','jsonCopy'])assert.ok(cards.includes(`{cardAct:'${action}'}`));
  assert.ok(cards.includes("box==='note' && (type==='board' || type==='json')"));
});
