import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WORKSPACE,workspaceOf,inWorkspace,uniqueWorkspaceName,validateWorkspaces,archiveWorkspaces,selectArchiveWorkspace,readWorkspaceState,persistWorkspaceState,activeWorkspaceId,WORKSPACES_KEY,ACTIVE_WORKSPACE_KEY} from './workspaces.js';
const workspaces=[{id:DEFAULT_WORKSPACE,name:'我的工作區',createdAt:0},{id:'studio-b',name:'工作室 B',createdAt:1}];
test('legacy records stay in the default workspace and other collections remain isolated',()=>{
  const list=[{id:'legacy'},{id:'a',workspaceId:DEFAULT_WORKSPACE},{id:'b',workspaceId:'studio-b'}];
  assert.equal(workspaceOf(list[0]),DEFAULT_WORKSPACE);
  assert.deepEqual(inWorkspace(list,DEFAULT_WORKSPACE).map(item=>item.id),['legacy','a']);
  assert.deepEqual(inWorkspace(list,'studio-b').map(item=>item.id),['b']);
  assert.equal(inWorkspace(list,null).length,3);
});
test('workspace metadata validates and imported names do not collide',()=>{
  assert.deepEqual(validateWorkspaces(workspaces),workspaces);
  assert.throws(()=>validateWorkspaces([...workspaces,workspaces[0]]));
  assert.throws(()=>validateWorkspaces([{id:'x',name:' '} ]));
  assert.equal(uniqueWorkspaceName('我的工作區',workspaces),'我的工作區 (2)');
});
test('archive source selection partitions maps, folders, gallery and presets consistently',()=>{
  const archive={zip:true,workspaces,text:JSON.stringify({format:'yozumind',version:1,maps:[{id:'legacy'},{id:'b',workspaceId:'studio-b'}],folders:[{id:'f-a'},{id:'f-b',workspaceId:'studio-b'}]}),gallery:[{name:'legacy'},{name:'b',workspaceId:'studio-b'}],stagePresets:[{name:'legacy'},{name:'b',workspaceId:'studio-b'}]};
  assert.equal(archiveWorkspaces(archive).length,2);
  const selected=selectArchiveWorkspace(archive,'studio-b'),project=JSON.parse(selected.text);
  assert.equal(project.maps[0].id,'b');assert.equal(project.maps.length,1);assert.equal(project.folders[0].id,'f-b');
  assert.equal(selected.gallery[0].name,'b');assert.equal(selected.stagePresets[0].name,'b');
  assert.equal(JSON.parse(selectArchiveWorkspace(archive,null).text).maps.length,2);
  assert.equal(archiveWorkspaces({text:JSON.stringify([{id:'legacy'}])})[0].id,DEFAULT_WORKSPACE);
});
test('workspace selection persists and metadata writes roll back on storage failure',()=>{
  const prior=globalThis.localStorage,data=new Map();let fail=false;
  globalThis.localStorage={getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),setItem(key,value){if(fail&&key===ACTIVE_WORKSPACE_KEY){fail=false;throw new Error('quota');}data.set(key,value);}};
  try {
    persistWorkspaceState(workspaces,'studio-b');assert.equal(readWorkspaceState().activeId,'studio-b');
    const before=data.get(WORKSPACES_KEY);fail=true;
    assert.throws(()=>persistWorkspaceState([...workspaces,{id:'new',name:'New',createdAt:2}],'new'));
    assert.equal(data.get(WORKSPACES_KEY),before);assert.equal(activeWorkspaceId(),'studio-b');
    persistWorkspaceState(workspaces,DEFAULT_WORKSPACE);
  } finally {if(prior===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior;}
});
