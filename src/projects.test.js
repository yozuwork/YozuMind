import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDays,dateKey,validateProjects,readProjects,saveProject,importProjects,removeProjects} from './projects.js';
import {createArchive,readArchive} from './archive.js';
import {archiveWorkspaces,selectArchiveWorkspace} from './workspaces.js';
const record={id:'projects-a',workspaceId:'workspace-a',favorites:['🚀','📁'],pages:[{id:'page-a',title:'全專案專區',icon:'🚀',view:'board',items:[{id:'task-a',title:'網站上線',status:'進行中',date:'2026-11-04',notes:'確認驗收項目'}]}]};
test('project-only ZIP preserves pages, views, icons, favorites and task details and partitions workspaces',async()=>{
  const other={...record,id:'projects-b',workspaceId:'workspace-b'};
  const bytes=await createArchive({maps:[],projects:[record,other]});
  const archive=await readArchive({name:'projects.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  assert.deepEqual(archive.projects,[record,other]);
  assert.deepEqual(archiveWorkspaces(archive).map(w=>w.id),['workspace-a','workspace-b']);
  assert.deepEqual(selectArchiveWorkspace(archive,'workspace-a').projects,[record]);
});
test('project import renews identifiers, maps ownership and rollback preserves original data',()=>{
  const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  saveProject(record);let n=0;
  const ids=importProjects([record],new Map([['workspace-a','workspace-new']]),prefix=>`${prefix}-${++n}`);
  const imported=readProjects().find(r=>r.id===ids[0]);
  assert.equal(imported.workspaceId,'workspace-new');assert.notEqual(imported.pages[0].id,record.pages[0].id);assert.notEqual(imported.pages[0].items[0].id,record.pages[0].items[0].id);
  removeProjects(ids);assert.deepEqual(readProjects(),[record]);
  assert.throws(()=>importProjects([record],new Map(),()=> 'new'));
  assert.deepEqual(readProjects(),[record]);
});
test('calendar spans six Sunday-first weeks across leap years and year boundaries',()=>{
  const days=calendarDays(2024,1);assert.equal(days.length,42);assert.equal(days[0].getDay(),0);assert.ok(days.some(d=>dateKey(d)==='2024-02-29'));
  assert.equal(dateKey(calendarDays(2026,0)[0]),'2025-12-28');
});
test('malformed project statuses and duplicate item IDs are rejected',()=>{
  const invalid=structuredClone(record);invalid.pages[0].items[0].status='unknown';assert.throws(()=>validateProjects([invalid]));
  const duplicate=structuredClone(record);duplicate.pages[0].items.push(duplicate.pages[0].items[0]);assert.throws(()=>validateProjects([duplicate]));
});
