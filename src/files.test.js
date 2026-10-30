import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFolders, parseMaps, serializeMaps } from './files.js';

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
