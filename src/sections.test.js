import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionOfFolder,sectionFolders} from './sections.js';
import {parseFolders,parseMaps} from './files.js';
import {createArchive,readArchive} from './archive.js';

test('section ownership follows nested folders and preserves legacy unassigned content',()=>{
  const folders=[{id:'a',kind:'section'},{id:'b',kind:'section'},{id:'child',parentId:'a'},{id:'nested',parentId:'child'},{id:'legacy'}];
  assert.equal(sectionOfFolder('a',folders),'a');
  assert.equal(sectionOfFolder('nested',folders),'a');
  assert.equal(sectionOfFolder('legacy',folders),null);
  assert.deepEqual(sectionFolders(folders,'a').map(f=>f.id),['child','nested']);
  assert.deepEqual(sectionFolders(folders,'b'),[]);
  assert.deepEqual(sectionFolders(folders,null).map(f=>f.id),['legacy']);
  assert.equal(sectionOfFolder('x',[{id:'x',parentId:'y'},{id:'y',parentId:'x'}]),null);
});

test('ZIP round trip preserves sections, nested ownership and empty sections',async()=>{
  const folders=[{id:'section-a',kind:'section',name:'A',workspaceId:'workspace-default'},{id:'nested',parentId:'section-a',name:'Notes'},{id:'empty',kind:'section',name:'Empty'}];
  const maps=[{id:'m',title:'Plan',folderId:'nested',root:{id:'n',text:'Plan',children:[]}}];
  const blob=await createArchive({maps,folders});
  const archive=await readArchive(new Blob([blob]));
  const restored=parseFolders(archive.text);let id=0;
  const restoredMaps=parseMaps(archive.text,p=>p+(++id));
  assert.equal(sectionOfFolder(restoredMaps[0].folderId,restored),'section-a');
  assert.equal(restored.find(f=>f.id==='empty').kind,'section');
  const emptyArchive=await readArchive(new Blob([await createArchive({maps:[],folders:[folders[2]]})]));
  assert.equal(parseFolders(emptyArchive.text)[0].kind,'section');
});
