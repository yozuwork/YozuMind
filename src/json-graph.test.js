import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonGraph,JSON_SAMPLE} from './json-graph.js';
import {createArchive,readArchive} from './archive.js';
import {parseMaps} from './files.js';
test('JSON graph groups scalar properties and lays out nested objects without overlaps',()=>{
  const graph=jsonGraph('{"id":9007199254740993,"members":[{"name":"A","powers":["one","two"]},{"name":"B","empty":{}}]}');
  assert.equal(graph.nodes[0].rows[0].value,'9007199254740993');assert.equal(graph.edges.length,graph.nodes.length-1);
  for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){const a=graph.nodes[i],b=graph.nodes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
  const collapsed=jsonGraph(JSON_SAMPLE,new Set(['$']));assert.equal(collapsed.nodes.length,1);assert.equal(collapsed.nodes[0].collapsed,true);
});
test('JSON graph rejects broken data and oversized graphs without mutating source',()=>{
  assert.throws(()=>jsonGraph('{oops}'));assert.throws(()=>jsonGraph(' '.repeat(200001)),/200,000/);
  assert.throws(()=>jsonGraph(JSON.stringify(Array.from({length:1501},()=>({a:1})))),/1,500/);
});
test('JSON pages and embedded page cards survive ZIP with renewed link IDs and exact source',async()=>{
  const source='{"largeId":9007199254740993,"name":"原始資料"}',maps=[{id:'normal',title:'一般',root:null,cards:[{id:'card',type:'board',mapId:'json',x:0,y:0}]},{id:'json',kind:'json',jsonSource:source,title:'JSON 心智圖',icon:'braces',root:null}];
  const bytes=await createArchive({maps}),archive=await readArchive({name:'backup.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});let i=0;const restored=parseMaps(archive.text,()=>`new-${++i}`);
  assert.equal(restored[1].kind,'json');assert.equal(restored[1].jsonSource,source);assert.equal(restored[1].icon,'braces');assert.equal(restored[0].cards[0].mapId,restored[1].id);
});
test('unfinished JSON drafts remain restorable so edits are not discarded',()=>{
  let i=0;const restored=parseMaps(JSON.stringify({format:'yozumind',version:1,maps:[{id:'j',title:'草稿',kind:'json',jsonSource:'{"unfinished":',root:null}]}),()=>String(++i));assert.equal(restored[0].jsonSource,'{"unfinished":');
});
