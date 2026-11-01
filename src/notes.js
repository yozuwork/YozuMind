import {activeWorkspaceId,inWorkspace,workspaceOf} from './workspaces.js';

export const BLOCK_TYPES=['text','heading','subheading','bullet','todo','quote','divider'];
export function validateNotes(list=[]) {
  if(!Array.isArray(list)||list.length>5000)throw new Error('筆記格式不正確或超過 5,000 篇。');
  const ids=new Set();
  return list.map(note=>{
    if(!note||typeof note.id!=='string'||!note.id||note.id.length>100||ids.has(note.id)||typeof note.title!=='string'||note.title.length>1000||!Array.isArray(note.blocks)||note.blocks.length>1000)throw new Error('筆記標題或內容格式不正確。');
    ids.add(note.id);const blockIds=new Set();let length=0;
    const blocks=note.blocks.map(block=>{
      if(!block||typeof block.id!=='string'||!block.id||block.id.length>100||blockIds.has(block.id)||!BLOCK_TYPES.includes(block.type)||typeof block.text!=='string'||block.text.length>10000||(length+=block.text.length)>500000)throw new Error('筆記區塊格式不正確或內容過長。');
      blockIds.add(block.id);return {id:block.id,type:block.type,text:block.text,...(block.type==='todo'?{done:block.done===true}:{})};
    });
    return {id:note.id,workspaceId:workspaceOf(note),title:note.title,blocks,favorite:note.favorite===true,createdAt:Number.isFinite(note.createdAt)?note.createdAt:Date.now(),updatedAt:Number.isFinite(note.updatedAt)?note.updatedAt:Date.now()};
  });
}
export const noteExcerpt=(note,max=150)=>(note?.blocks||[]).filter(block=>block.type!=='divider').map(block=>block.text).filter(Boolean).join(' ').slice(0,max);
export function remapNoteLinks(maps,ids) {
  const walk=list=>{for(const card of list||[]){if(card.noteIds)card.noteIds=card.noteIds.map(id=>ids.get(id)).filter(Boolean);walk(card.cards);}};
  maps.forEach(map=>walk(map.cards));return maps;
}
let database,cache=new Map(),loaded=false;
async function storage(mode,action) {
  database ||= new Promise((resolve,reject)=>{const request=indexedDB.open('yozu-notes',1);request.onupgradeneeded=()=>request.result.createObjectStore('notes',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};});
  const db=await database;
  return new Promise((resolve,reject)=>{const tx=db.transaction('notes',mode),request=action(tx.objectStore('notes'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('筆記儲存失敗'));});
}
const changed=()=>window.dispatchEvent(new Event('yozu-notes-changed'));
export const cachedNote=id=>{const note=cache.get(id);return note&&workspaceOf(note)===activeWorkspaceId()?note:null;};
export async function listNotes(workspaceId=activeWorkspaceId()) {
  if(!loaded){cache=new Map((await storage('readonly',store=>store.getAll())).map(note=>[note.id,note]));loaded=true;}
  return structuredClone(inWorkspace([...cache.values()],workspaceId));
}
export async function saveNote(note) {
  const [valid]=validateNotes([note]);await storage('readwrite',store=>store.put(valid));cache.set(valid.id,valid);changed();return structuredClone(valid);
}
export async function importNotes(notes) {
  const valid=validateNotes(notes);await listNotes(null);
  if(cache.size+valid.length>5000||valid.some(note=>cache.has(note.id)))throw new Error('筆記數量過多或識別資料重複。');
  await storage('readwrite',store=>{for(const note of valid)store.put(note);});valid.forEach(note=>cache.set(note.id,note));changed();return valid.map(note=>note.id);
}
export async function removeNotes(ids) {
  await storage('readwrite',store=>{for(const id of ids)store.delete(id);});ids.forEach(id=>cache.delete(id));changed();
}
