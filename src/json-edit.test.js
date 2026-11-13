import test from 'node:test';
import assert from 'node:assert/strict';
import {editJson,copyJsonValue,nodeAtPath,stringifyJsonNode} from './json-edit.js';
import {parseJsonTree} from './json-tree.js';
import {jsonGraph} from './json-graph.js';
const source='{"id":9007199254740993,"files":[{"name":"a","id":"long-id"},{"name":"b"}],"decimal":1.2300e+40}';
test('field edit and rename preserve exact unrelated numbers and order',()=>{
  const updated=editJson(source,{path:'$/1/0/0',key:'filename',value:'"new.pdf"'});
  assert.ok(updated.includes('"filename": "new.pdf"'));assert.ok(updated.includes('9007199254740993'));assert.ok(updated.includes('1.2300e+40'));
  const numeric=editJson(source,{path:'$/0',value:'99999999999999999999'});assert.ok(numeric.includes('99999999999999999999'));
});
test('deleting array elements and nested objects updates only the intended subtree',()=>{
  const updated=editJson(source,{path:'$/1/0',remove:true});
  assert.deepEqual(JSON.parse(updated).files,[{name:'b'}]);
  assert.throws(()=>editJson(source,{path:'$',remove:true}));assert.throws(()=>editJson(source,{path:'$/9',remove:true}));
});
test('invalid values and duplicate renamed properties are rejected',()=>{
  assert.throws(()=>editJson(source,{path:'$/0',value:'1,2'}));assert.throws(()=>editJson(source,{path:'$/0',value:'bad'}));assert.throws(()=>editJson(source,{path:'$/0',key:'files',value:'1'}));
  assert.equal(editJson(source,{path:'$',value:'{}'}),'{}');
});
test('copy returns unquoted string values or complete exact JSON subtrees',()=>{
  const tree=parseJsonTree(source);assert.equal(copyJsonValue(nodeAtPath(tree,'$/1/0/1')),'long-id');assert.equal(copyJsonValue(nodeAtPath(tree,'$/0')),'9007199254740993');
  assert.deepEqual(JSON.parse(stringifyJsonNode(nodeAtPath(tree,'$/1/0'))),{name:'a',id:'long-id'});
});
test('expanded long fields and collapsed cards keep graph nodes from overlapping',()=>{
  const text=JSON.stringify({items:[{id:'字'.repeat(400)},{id:'b'}]});
  const graph=jsonGraph(text,new Set(),new Set(['$/0/0']));assert.equal(graph.nodes.find(n=>n.id==='$/0/0').w,600);
  for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){const a=graph.nodes[i],b=graph.nodes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
  const collapsed=jsonGraph(text,new Set(['$/0/0']));assert.equal(collapsed.nodes.find(n=>n.id==='$/0/0').h,44);
});
