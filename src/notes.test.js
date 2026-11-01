import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNotes,noteExcerpt,remapNoteLinks} from './notes.js';
import {createArchive,readArchive} from './archive.js';
import {parseMaps} from './files.js';
import {archiveWorkspaces,selectArchiveWorkspace} from './workspaces.js';

const note={id:'note-original',workspaceId:'w-one',title:'角色故事',favorite:true,createdAt:1,updatedAt:2,blocks:[{id:'b1',type:'heading',text:'起點'},{id:'b2',type:'todo',text:'完成設定',done:true},{id:'b3',type:'divider',text:''}]};
const asFile=bytes=>({name:'backup.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
test('notes retain structured content and reject corrupt or duplicate records',()=>{
  assert.deepEqual(validateNotes([note]),[note]);assert.equal(noteExcerpt(note),'起點 完成設定');
  for(const invalid of [{...note,blocks:[{id:'b',type:'html',text:'<script>'}]},{...note,blocks:[note.blocks[0],note.blocks[0]]},{...note,title:4},{...note,blocks:[{id:'b',type:'text',text:'x'.repeat(10001)}]}])assert.throws(()=>validateNotes([invalid]));
  assert.throws(()=>validateNotes([note,note]));
});
test('ZIP carries workspace notes and renews references on nested note and character cards',async()=>{
  const maps=[{id:'m',workspaceId:'w-one',title:'畫布',root:null,cards:[{id:'hero',type:'character',title:'角色',x:0,y:0,noteIds:[note.id]},{id:'column',type:'column',title:'筆記',x:300,y:0,cards:[{id:'linked',type:'note',text:'',linkedOnly:true,noteIds:[note.id]}]}]}];
  const result=await readArchive(asFile(await createArchive({maps,notes:[note,{...note,id:'note-other',workspaceId:'w-two'}]})));
  assert.equal(archiveWorkspaces(result).length,2);const selected=selectArchiveWorkspace(result,'w-one');assert.deepEqual(selected.notes,[note]);
  let n=0;const imported=parseMaps(selected.text,p=>p+'-'+(++n));remapNoteLinks(imported,new Map([[note.id,'note-copy']]));
  assert.deepEqual(imported[0].cards[0].noteIds,['note-copy']);assert.equal(imported[0].cards[1].cards[0].linkedOnly,true);assert.deepEqual(imported[0].cards[1].cards[0].noteIds,['note-copy']);
  remapNoteLinks(imported,new Map());assert.deepEqual(imported[0].cards[0].noteIds,[]);
});
test('a workspace containing only notes can be exported and restored',async()=>{
  const result=await readArchive(asFile(await createArchive({maps:[],notes:[note]})));assert.deepEqual(result.notes,[note]);assert.equal(JSON.parse(result.text).maps.length,0);
});
