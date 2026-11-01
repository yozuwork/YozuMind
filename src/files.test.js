import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttachments, parseFolders, parseMaps, serializeMaps } from './files.js';

let id = 0;
const newId = prefix => `${prefix}-${++id}`;
const map = { id:'old-map', title:'生活計畫', icon:'lightbulb', layout:'right', root:{ id:'old-root', text:'主題', children:[{id:'old-child',text:'分支',color:'#1767c9',collapsed:true,children:[]}] } };

test('cross-map character links renew forward references, source scopes and nested todo IDs together',()=>{
  const source=[{id:'home',title:'角色',root:null,cards:[{id:'hero',type:'character',x:0,y:0,title:'角色',todoIds:['remote','blocked'],todoMapIds:['other','private']}]},{id:'other',title:'遊戲',root:null,cards:[{id:'folder',type:'folder',title:'資料夾',x:0,y:0,cards:[{id:'remote',type:'todo',title:'遊戲',items:[{text:'完成',done:true}]}]}]},{id:'private',workspaceId:'different',title:'私有',root:null,cards:[{id:'blocked',type:'todo',x:0,y:0,items:[]}]}];
  const copies=parseMaps(serializeMaps(source),newId),hero=copies[0].cards[0];assert.deepEqual(hero.todoMapIds,[copies[1].id]);assert.deepEqual(hero.todoIds,[copies[1].cards[0].cards[0].id]);
  const partial=parseMaps(serializeMaps([source[0]]),newId);assert.deepEqual(partial[0].cards[0].todoIds,[]);assert.deepEqual(partial[0].cards[0].todoMapIds,[]);
  assert.throws(()=>parseMaps(serializeMaps([{...source[0],cards:[{...source[0].cards[0],todoMapIds:'bad'}]}]),newId));
});

test('legacy local links stay local even when old files reuse card IDs across maps',()=>{
  const source=Array.from({length:2},(_,index)=>({id:'m-'+index,title:'map',root:null,cards:[{id:'hero',type:'character',x:0,y:0,title:'role',todoIds:['todo']},{id:'todo',type:'todo',x:250,y:0,items:[]}]}));
  for(const copy of parseMaps(serializeMaps(source),newId))assert.deepEqual(copy.cards[0].todoIds,[copy.cards[1].id]);
});

test('complete canvas backup restores all object types, image bodies, stages, dimensions and subpages together',()=>{
  const src='data:image/png;base64,AA==', portrait='data:image/webp;base64,AAAA';
  const source={...map,cards:[
    {id:'hero',type:'character',x:10,y:20,w:480,h:750,title:'角色',todoIds:['tasks'],stages:[{level:1,name:'新手',src:portrait,description:'第一階段'},{level:5,name:'勇者',src,description:'第二階段'}]},
    {id:'col',type:'column',x:500,y:0,cards:[{id:'tasks',type:'todo',title:'任務',items:[{id:'item',text:'完成',done:true,src}]},{id:'picture',type:'image',src},{id:'attachment',type:'file',fileId:'f-backup',kind:'pdf',name:'附件.pdf',size:1}]},
    {id:'page',type:'board',x:800,y:0,mapId:'subpage'},
    {id:'note',type:'note',x:0,y:700,text:'筆記',color:'pink'},
    {id:'link',type:'link',x:0,y:800,url:'https://example.com',title:'連結'},
  ],images:[{id:'canvas-image',src,x:20,y:30,w:200,h:100,z:3}],relations:[{from:'hero',to:'canvas-image',label:'成長'}],strokes:[{id:'stroke',tool:'pen',color:'ink',width:2,points:[[0,0],[1,1]]}]};
  const subpage={...map,id:'subpage',parentId:map.id,title:'子頁面',root:null,images:[{id:'sub-image',src:portrait,x:0,y:0,w:100,h:100}]};
  const text=serializeMaps([source,subpage],[],{'f-backup':'data:application/pdf;base64,AA=='});
  const [restored,child]=parseMaps(text,newId), hero=restored.cards[0];
  assert.deepEqual([hero.w,hero.h],[480,750]);
  assert.deepEqual(hero.stages,source.cards[0].stages);
  assert.deepEqual(hero.todoIds,[restored.cards[1].cards[0].id]);
  assert.equal(restored.images[0].src,src);
  assert.equal(restored.cards[1].cards[0].items[0].src,src);
  assert.equal(restored.cards[1].cards[1].src,src);
  assert.equal(child.images[0].src,portrait);
  assert.equal(restored.cards[2].mapId,child.id);
  assert.equal(child.parentId,restored.id);
  assert.equal(restored.cards.length,5);
  assert.equal(restored.cards[3].text,'筆記');
  assert.equal(restored.cards[4].url,'https://example.com');
  assert.equal(restored.strokes.length,1);
  assert.deepEqual([restored.relations[0].from,restored.relations[0].to],[hero.id,restored.images[0].id]);
  assert.deepEqual(parseAttachments(text),[['f-backup','data:application/pdf;base64,AA==']]);
});

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
test('todo images and display mode survive backups and unsafe images are rejected', () => {
  const src='data:image/webp;base64,AAAA';
  const source={...map,cards:[{id:'todo',type:'todo',x:0,y:0,title:'追番',items:[
    {id:'task',text:'',done:true,src},
    {id:'display',text:'展示',done:false,src,displayOnly:true},
  ]}]};
  const items=parseMaps(serializeMaps([source]),newId)[0].cards[0].items;
  assert.equal(items[0].src,src);
  assert.equal(items[0].done,true);
  assert.equal(items[1].displayOnly,true);
  assert.equal(items[1].src,src);
  source.cards[0].items[0].src='javascript:alert(1)';
  assert.throws(()=>parseMaps(serializeMaps([source]),newId));
});

test('character stages survive backups and invalid thresholds and images are rejected',()=>{
  const src='data:image/webp;base64,AAAA';
  const stages=[{level:1,name:'新手',description:'出發',src},{level:5,name:'勇者',description:'成長',src:''}];
  const source={...map,cards:[{id:'hero',type:'character',x:0,y:0,stages}]};
  assert.deepEqual(parseMaps(serializeMaps([source]),newId)[0].cards[0].stages,stages);
  stages[1].level=1;
  assert.throws(()=>parseMaps(serializeMaps([source]),newId));
  stages[1].level=5; stages[1].src='javascript:alert(1)';
  assert.throws(()=>parseMaps(serializeMaps([source]),newId));
});

test('per-stage XP requirements survive backups and invalid XP is rejected',()=>{
  const source={...map,cards:[{id:'hero',type:'character',x:0,y:0,stages:[{level:1,name:'新手',description:'',src:'',xpPerLevel:50},{level:3,name:'勇者',description:'',src:'',xpPerLevel:250}]}]};
  assert.deepEqual(parseMaps(serializeMaps([source]),newId)[0].cards[0].stages,source.cards[0].stages);
  for(const invalid of [0,-1,1.5,'100',1000001]) {source.cards[0].stages[1].xpPerLevel=invalid;assert.throws(()=>parseMaps(serializeMaps([source]),newId));}
});

test('character backups preserve portrait and renew linked todo IDs',()=>{
  const src='data:image/webp;base64,AAAA';
  const source={...map,cards:[{id:'hero',type:'character',title:'勇者',x:0,y:0,src,todoIds:['tasks','missing']},{id:'tasks',type:'todo',title:'任務',x:250,y:0,items:[]}]};
  const cards=parseMaps(serializeMaps([source]),newId)[0].cards;
  assert.equal(cards[0].src,src);
  assert.equal(cards[0].title,'勇者');
  assert.deepEqual(cards[0].todoIds,[cards[1].id]);
  source.cards[0].src='javascript:alert(1)';
  assert.throws(()=>parseMaps(serializeMaps([source]),newId));
});

test('daily canvases retain distinct dates and content through backup',()=>{
  const first={...map,dailyDate:'2026-11-01',cards:[{id:'note',type:'note',x:0,y:0,text:'今天'}]};
  const second={...map,id:'tomorrow',dailyDate:'2026-11-02',cards:[{id:'note2',type:'note',x:0,y:0,text:'明天'}]};
  const restored=parseMaps(serializeMaps([first,second,map]),newId);
  assert.equal(restored[0].dailyDate,'2026-11-01');
  assert.equal(restored[1].dailyDate,'2026-11-02');
  assert.equal(restored[0].cards[0].text,'今天');
  assert.equal(restored[1].cards[0].text,'明天');
  assert.equal(restored[2].dailyDate,undefined);
});

test('date associations preserve normal map identity and validate dates in backup',()=>{
  const source={...map,relatedDates:['2026-11-01','2026-11-02','2026-11-01','2026-02-30','invalid']};
  const restored=parseMaps(serializeMaps([source]),newId)[0];
  assert.deepEqual(restored.relatedDates,['2026-11-01','2026-11-02']);
  assert.equal(restored.dailyDate,undefined);
  assert.deepEqual(restored.root.children[0].text,map.root.children[0].text);
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

test('cards round trip keeps content, nests column cards and remaps relation endpoints', () => {
  const source = { ...map, cards:[
    { id:'old-note', type:'note', x:10, y:20, text:'筆記' },
    { id:'old-col', type:'column', x:300, y:0, title:'欄位', cards:[
      { id:'old-todo', type:'todo', title:'清單', items:[{ id:'x', text:'買牛奶', done:true }] },
      { id:'old-link', type:'link', url:'https://milanote.com/', title:'' },
    ] },
  ], relations:[{ id:'r', from:'old-note', to:'old-link', type:'elbow', style:'thick', arrow:'both', color:'#30a46c', label:'下一步', toSide:'left', fromSide:'nowhere' }] };
  const [restored] = parseMaps(serializeMaps([source]), newId);
  const [note, column] = restored.cards;
  assert.equal(note.text, '筆記');
  assert.deepEqual([note.x, note.y], [10, 20]);
  assert.equal(column.cards[0].items[0].text, '買牛奶');
  assert.equal(column.cards[0].items[0].done, true);
  assert.equal(column.cards[1].url, 'https://milanote.com/');
  assert.equal('x' in column.cards[0], false);
  assert.deepEqual([restored.relations[0].from, restored.relations[0].to], [note.id, column.cards[1].id]);
  const { id:_, from:__, to:___, ...style } = restored.relations[0];
  assert.deepEqual(style, { type:'elbow', style:'thick', arrow:'both', color:'#30a46c', label:'下一步', toSide:'left' });
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, cards:[{ type:'column', x:0, y:0, cards:[{ type:'column' }] }] }]), newId));
});

test('extra trees, folders, image cards and note colors survive a round trip', () => {
  const src = 'data:image/webp;base64,AAAA';
  const source = { ...map, rootX:40, rootY:-20,
    trees:[{ id:'t', x:600, y:0, root:{ id:'tree-root', text:'第二張圖', children:[{ id:'tree-kid', text:'分支', children:[] }] } }],
    cards:[
      { id:'f', type:'folder', x:0, y:0, title:'資料夾', open:true, cards:[{ id:'n', type:'note', text:'便利貼', color:'pink' }, { id:'img', type:'image', src }] },
      { id:'n2', type:'note', x:0, y:0, text:'', color:'neon' },
    ],
    relations:[{ from:'tree-kid', to:'img' }] };
  const [restored] = parseMaps(serializeMaps([source]), newId);
  assert.deepEqual([restored.rootX, restored.rootY], [40, -20]);
  assert.equal(restored.trees[0].root.children[0].text, '分支');
  const [folder, plain] = restored.cards;
  assert.equal(folder.open, true);
  assert.equal(folder.cards[0].color, 'pink');
  assert.equal(folder.cards[1].src, src);
  assert.equal('color' in plain, false);
  assert.deepEqual([restored.relations[0].from, restored.relations[0].to], [restored.trees[0].root.children[0].id, folder.cards[1].id]);
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, cards:[{ type:'column', x:0, y:0, cards:[{ type:'folder' }] }] }]), newId));
});

test('sidebar folders and sticky-note colors round trip with a backup', () => {
  const folders = [{ id:'f-1', name:'工作', open:false, createdAt:5 }, { id:7, name:'壞資料' }];
  const text = serializeMaps([{ ...map, color:'blue', folderId:'f-1' }, { ...map, color:'neon' }], folders);
  const [inFolder, loose] = parseMaps(text, newId);
  assert.equal(inFolder.color, 'blue');
  assert.equal(inFolder.folderId, 'f-1');
  assert.equal('color' in loose, false);
  assert.equal('folderId' in loose, false);
  assert.deepEqual(parseFolders(text), [{ id:'f-1', name:'工作', open:false, createdAt:5 }]);
  assert.deepEqual(parseFolders(serializeMaps([map])), []);
});

test('a board whose mind maps were all deleted keeps its cards', () => {
  const [restored] = parseMaps(serializeMaps([{ ...map, root:null, cards:[{ id:'n', type:'note', x:0, y:0, text:'留著' }] }]), newId);
  assert.equal(restored.root, null);
  assert.equal(restored.cards[0].text, '留著');
});

test('nested folders keep their parent and icon color', () => {
  const text = serializeMaps([map], [{ id:'a', name:'外層', createdAt:1, color:'blue' }, { id:'b', name:'內層', parentId:'a', createdAt:2, color:'neon' }]);
  assert.deepEqual(parseFolders(text), [
    { id:'a', name:'外層', open:true, createdAt:1, color:'blue' },
    { id:'b', name:'內層', open:true, createdAt:2, parentId:'a' },
  ]);
});

test('freehand strokes survive a round trip and bad strokes are rejected', () => {
  const strokes = [{ id:'s', tool:'highlighter', color:'#eab308', width:16, points:[[0,0],[10.5,4]] }, { id:'t', tool:'pen', color:'ink', width:2, points:[[3,3]] }];
  const [restored] = parseMaps(serializeMaps([{ ...map, strokes }]), newId);
  assert.deepEqual(restored.strokes.map(({ id, ...s }) => s), strokes.map(({ id, ...s }) => s));
  assert.notEqual(restored.strokes[0].id, 's');
  assert.deepEqual(parseMaps(serializeMaps([map]), newId)[0].strokes, []);
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, strokes:[{ tool:'pen', color:'red', width:2, points:[[0,0]] }] }]), newId));
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, strokes:[{ tool:'pen', color:'ink', width:2, points:[[0]] }] }]), newId));
});

test('drawn shapes keep their geometry and fill', () => {
  const strokes = [
    { tool:'rect', color:'#e5484d', width:4, fill:'#eab308', points:[[0,0],[120,40]] },
    { tool:'arrow', color:'ink', width:2, fill:'#eab308', points:[[5,5],[50,60]] },
  ];
  const [restored] = parseMaps(serializeMaps([{ ...map, strokes }]), newId);
  assert.equal(restored.strokes[0].fill, '#eab308');
  assert.deepEqual(restored.strokes[0].points, [[0,0],[120,40]]);
  assert.equal('fill' in restored.strokes[1], false);
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, strokes:[{ tool:'rect', color:'ink', width:2, points:[[0,0]] }] }]), newId));
});

test('stacking order and note to-do text survive a round trip', () => {
  const [restored] = parseMaps(serializeMaps([{ ...map,
    images:[{ id:'i', src:'data:image/png;base64,AAAA', x:0, y:0, w:10, h:10, z:3 }],
    cards:[{ id:'n', type:'note', x:0, y:0, z:5, text:'清單\n[x] 買牛奶\n[ ] 寫報告' }],
    strokes:[{ tool:'pen', color:'ink', width:2, z:4, points:[[0,0]] }] }]), newId);
  assert.deepEqual([restored.images[0].z, restored.cards[0].z, restored.strokes[0].z], [3, 5, 4]);
  assert.equal(restored.cards[0].text, '清單\n[x] 買牛奶\n[ ] 寫報告');
});

test('page cards, note embeds and collapsed state follow their pages through an export', () => {
  const parent = { ...map, id:'p', cards:[
    { id:'b', type:'board', x:0, y:0, mapId:'child', title:'子頁', w:220, h:180, frame:false, color:'blue' },
    { id:'n', type:'note', x:0, y:0, text:'筆記', collapsed:true, cards:[{ id:'b2', type:'board', mapId:'child' }] },
    { id:'c', type:'column', x:0, y:0, title:'欄', collapsed:true, cards:[{ id:'b3', type:'board', mapId:'elsewhere' }] },
  ] };
  const child = { ...map, id:'child', title:'子頁', parentId:'p' };
  const [p, c] = parseMaps(serializeMaps([parent, child]), newId);
  const [board, note, column] = p.cards;
  assert.equal(board.mapId, c.id);
  assert.equal(c.parentId, p.id);
  assert.deepEqual([board.w, board.h, board.frame, board.color], [220, 180, false, 'blue']);
  assert.equal(note.collapsed, true);
  assert.equal(note.cards[0].mapId, c.id);
  assert.equal(column.collapsed, true);
  assert.equal(column.cards[0].mapId, 'elsewhere');
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, cards:[{ type:'note', x:0, y:0, text:'', cards:[{ type:'link', url:'' }] }] }]), newId));
});

test('file cards keep their attachment id and exports carry the file bodies', () => {
  const source = { ...map, cards:[{ id:'f1', type:'file', x:5, y:6, fileId:'f-abc123', kind:'pdf', name:'規格.pdf', size:2048 },
    { id:'c', type:'column', x:0, y:0, title:'欄', cards:[{ id:'f2', type:'file', fileId:'f-xyz', kind:'excel', name:'報表.xlsx', size:10 }] }] };
  const text = serializeMaps([source], [], { 'f-abc123':'data:application/pdf;base64,JVBERg==', 'bad id':'data:x' });
  const [restored] = parseMaps(text, newId);
  assert.deepEqual([restored.cards[0].fileId, restored.cards[0].kind, restored.cards[0].name, restored.cards[0].size], ['f-abc123', 'pdf', '規格.pdf', 2048]);
  assert.equal(restored.cards[1].cards[0].kind, 'excel');
  assert.deepEqual(parseAttachments(text), [['f-abc123', 'data:application/pdf;base64,JVBERg==']]);
  assert.throws(() => parseMaps(JSON.stringify([{ ...map, cards:[{ type:'file', x:0, y:0, fileId:'f-1', kind:'exe' }] }]), newId));
});

test('cards and images pinned to a node keep the pin on the renewed node id', () => {
  const src = { ...map,
    cards:[{ id:'c1', type:'note', x:1, y:2, text:'說明', anchor:{ node:'old-child', dx:0, dy:60 } }, { id:'c2', type:'note', x:0, y:0, anchor:{ node:'missing', dx:0, dy:0 } }],
    images:[{ id:'i1', src:'data:image/png;base64,AA==', x:0, y:0, w:10, h:10, anchor:{ node:'old-root', dx:5, dy:6 } }] };
  const [m] = parseMaps(serializeMaps([src]), newId);
  const child = m.root.children[0];
  assert.deepEqual(m.cards[0].anchor, { node: child.id, dx: 0, dy: 60 });
  assert.equal(m.cards[1].anchor, undefined);
  assert.deepEqual(m.images[0].anchor, { node: m.root.id, dx: 5, dy: 6 });
});
