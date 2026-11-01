import test from 'node:test';
import assert from 'node:assert/strict';
import {inboxEntries,markInbox,clearInbox} from './inbox-state.js';
import {allCards,todoEntries} from './character.js';
import {parseMaps,serializeMaps} from './files.js';
import {createArchive,readArchive} from './archive.js';
import {unzipSync} from 'fflate';

const src='data:image/png;base64,AA==';let id=0;const uid=prefix=>prefix+'-'+(++id);
test('each map owns separate inbox entries and groups survive placing individual objects',()=>{
  const image={id:'image',src,x:0,y:0,w:200,h:100},note={id:'note',type:'note',text:'hello',x:20,y:30},map={images:[image],cards:[note]};markInbox([image,note],'group','two objects');
  assert.equal(inboxEntries(map).length,1);assert.equal(inboxEntries(map)[0].objects.length,2);assert.equal(inboxEntries({cards:[]}).length,0);assert.equal(allCards(map.cards).length,0);clearInbox(note);assert.equal(allCards(map.cards).length,1);assert.equal(inboxEntries(map)[0].objects.length,1);clearInbox(image);assert.equal(inboxEntries(map).length,0);
});
test('ZIP keeps staged images, text, trees, strokes and attachment records with renewed group IDs',async()=>{
  const image={id:'img',src,x:0,y:0,w:200,h:100},note={id:'note',type:'note',text:'draft',x:20,y:30},file={id:'file',type:'file',fileId:'f-inbox',kind:'pdf',name:'draft.pdf',size:4,x:0,y:0},tree={id:'tree',x:0,y:0,root:{id:'root',text:'idea',children:[]}},stroke={id:'stroke',tool:'pen',color:'ink',width:2,points:[[0,0],[10,20]]};markInbox([image,note,file,tree,stroke],'original-group','group');const map={id:'map',title:'inbox',root:null,cards:[note,file],images:[image],trees:[tree],strokes:[stroke]};
  const data=await createArchive({maps:[map],files:{'f-inbox':'data:application/pdf;base64,JVBERg=='}}),entries=unzipSync(data);assert.equal(Object.keys(entries).filter(path=>path.startsWith('images/')).length,1);assert.equal(Object.keys(entries).filter(path=>path.startsWith('files/')).length,1);const loaded=await readArchive({name:'inbox.zip',size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}),[copy]=parseMaps(loaded.text,uid),items=inboxEntries(copy);assert.equal(items.length,1);assert.equal(items[0].objects.length,5);assert.notEqual(items[0].id,'original-group');assert.equal(copy.images[0].src,src);assert.equal(copy.trees[0].inbox,true);assert.equal(copy.strokes[0].inbox,true);assert.equal(copy.cards[1].fileId,'f-inbox');
});
test('unplaced todo lists stay out of character linking and invalid inbox metadata is rejected',()=>{
  const todo={id:'todo',type:'todo',title:'draft',x:0,y:0,items:[]};markInbox([todo],'draft');assert.equal(todoEntries([todo]).length,0);clearInbox(todo);assert.equal(todoEntries([todo]).length,1);
  for(const invalid of [{inbox:true,inboxId:{}},{inbox:true,inboxLabel:'x'.repeat(1001)}])assert.throws(()=>parseMaps(serializeMaps([{id:'m',title:'test',root:null,cards:[{...todo,...invalid}]}]),uid));
});
