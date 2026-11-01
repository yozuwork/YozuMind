import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {createArchive,readArchive} from './archive.js';
import {parseMaps,parseAttachments,MAX_FILE_BYTES} from './files.js';

const image='data:image/png;base64,AA==',pdf='data:application/pdf;base64,JVBERg==';
const gallery=[{id:'g-old',name:'角色圖片',src:image,width:100,height:80,tags:['角色','靈感'],createdAt:1}];
const maps=[{id:'m-original',title:'完整存檔',root:null,images:[{id:'img',src:image,x:0,y:0,w:100,h:80}],cards:[
  {id:'hero',type:'character',x:100,y:0,w:400,h:600,title:'角色',todoIds:['todo'],stages:[{level:1,xpPerLevel:50,name:'新手',description:'說明',src:image}]},
  {id:'todo',type:'todo',x:0,y:100,items:[{id:'item',text:'任務',done:true,src:image}]},
  {id:'file',type:'file',x:100,y:100,fileId:'f-original',kind:'pdf',name:'文件.pdf',size:4},
],relations:[{from:'hero',to:'img'}],strokes:[{id:'s1',tool:'pen',color:'ink',width:2,points:[[0,0],[1,1]]}]}];
const asFile=(bytes,name='backup.zip')=>({name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
let index=0;const uid=prefix=>`${prefix}-${++index}`;

test('portable ZIP separates binary assets and restores every record and gallery tag',async()=>{
  const bytes=await createArchive({maps,files:{'f-original':pdf},gallery});
  assert.deepEqual([...bytes.subarray(0,2)],[80,75]);
  const entries=unzipSync(bytes),names=Object.keys(entries);
  assert.ok(names.includes('records/project.json'));
  assert.ok(names.includes('records/gallery.json'));
  assert.equal(names.filter(name=>name.startsWith('images/')).length,1,'identical images are deduplicated across canvas, stages, todos and gallery');
  assert.equal(names.filter(name=>name.startsWith('files/')).length,1);
  assert.equal(strFromU8(entries['records/project.json']).includes('data:image'),false);
  const result=await readArchive(asFile(bytes)),[restored]=parseMaps(result.text,uid);
  assert.equal(result.zip,true);
  assert.equal(restored.images[0].src,image);
  assert.deepEqual(restored.cards[0].stages,maps[0].cards[0].stages);
  assert.deepEqual([restored.cards[0].w,restored.cards[0].h],[400,600]);
  assert.deepEqual(restored.cards[0].todoIds,[restored.cards[1].id]);
  assert.equal(restored.cards[1].items[0].src,image);
  assert.deepEqual(parseAttachments(result.text),[['f-original',pdf]]);
  assert.equal(restored.relations[0].from,restored.cards[0].id);
  assert.equal(restored.strokes.length,1);
  assert.deepEqual(result.gallery[0].tags,['角色','靈感']);
  assert.equal(result.gallery[0].src,image);
});

test('legacy JSON remains importable and gallery-only backups are supported',async()=>{
  const legacy=strToU8(JSON.stringify(maps));
  const result=await readArchive(asFile(legacy,'old.json'));
  assert.equal(result.zip,false);assert.equal(parseMaps(result.text,uid).length,1);
  const library=await readArchive(asFile(await createArchive({maps:[],gallery})));
  assert.equal(JSON.parse(library.text).maps.length,0);
  assert.equal(library.gallery.length,1);
});

test('favorite stage templates and their images travel in ZIP, including template-only backups',async()=>{
  const stagePresets=[{name:'常用勇者',stage:{level:5,xpPerLevel:250,name:'勇者',src:image,description:'說明'},createdAt:1}];
  const result=await readArchive(asFile(await createArchive({maps:[],stagePresets})));
  assert.deepEqual(result.stagePresets,stagePresets);
  const entries=unzipSync(await createArchive({maps,gallery}));delete entries['records/stage-presets.json'];
  assert.deepEqual((await readArchive(asFile(zipSync(entries)))).stagePresets,[]);
});

test('multi-workspace archives keep map and library ownership, including empty workspaces',async()=>{
  const workspaces=[{id:'studio-a',name:'工作室 A',createdAt:1},{id:'studio-b',name:'工作室 B',createdAt:2}];
  const result=await readArchive(asFile(await createArchive({maps:maps.map(map=>({...map,workspaceId:'studio-a'})),files:{'f-original':pdf},gallery:gallery.map(image=>({...image,workspaceId:'studio-b'})),workspaces})));
  assert.deepEqual(result.workspaces,workspaces);assert.equal(result.gallery[0].workspaceId,'studio-b');
  assert.equal(parseMaps(result.text,uid)[0].workspaceId,'studio-a');
  assert.deepEqual((await readArchive(asFile(await createArchive({maps:[],workspaces})))).workspaces,workspaces);
});

test('library names, notes, sources, favorites and ratings survive portable ZIP round trips',async()=>{
  const pictures=[{...gallery[0],name:'靈感照片',description:'攝影筆記與提示詞',sourceUrl:'https://example.com/original',favorite:true,rating:4}];
  const result=await readArchive(asFile(await createArchive({maps:[],gallery:pictures})));
  assert.deepEqual([result.gallery[0].name,result.gallery[0].description,result.gallery[0].sourceUrl,result.gallery[0].favorite,result.gallery[0].rating],['靈感照片','攝影筆記與提示詞','https://example.com/original',true,4]);
});

test('invalid library sources, ratings and oversized notes are rejected before export',async()=>{
  for(const invalid of [{sourceUrl:'javascript:alert(1)'},{rating:6},{rating:1.5},{description:'x'.repeat(10001)}]) await assert.rejects(createArchive({maps:[],gallery:[{...gallery[0],...invalid}]}));
});

test('incomplete, invalid and unsafe ZIP contents are rejected',async()=>{
  const bytes=await createArchive({maps,files:{'f-original':pdf},gallery}),entries=unzipSync(bytes);
  const imagePath=Object.keys(entries).find(path=>path.startsWith('images/'));
  const missing={...entries};delete missing[imagePath];
  await assert.rejects(readArchive(asFile(zipSync(missing))),/缺少圖片或附件/);
  await assert.rejects(readArchive(asFile(zipSync({'random.txt':strToU8('hello')}))),/缺少 manifest/);
  await assert.rejects(readArchive(asFile(zipSync({...entries,'../bad.txt':strToU8('bad')}))),/路徑/);
  await assert.rejects(readArchive(asFile(strToU8('invalid zip'))),/ZIP/);
  await assert.rejects(readArchive({size:MAX_FILE_BYTES+1}),/300 MB/);
  const malformed={...entries,'records/gallery.json':strToU8(JSON.stringify([{...gallery[0],src:'https://example.com/a.png'}]))};
  await assert.rejects(readArchive(asFile(zipSync(malformed))),/圖庫圖片/);
});
