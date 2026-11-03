import test from 'node:test';
import assert from 'node:assert/strict';
import {createFolderBackup} from './folder-backup.js';

function fixture(options={}) {
  const writes=[],saved=[],files=[];let prompts=0,permission='granted',aborted=false;
  const handle={name:'備份資料夾',queryPermission:async()=>permission,requestPermission:async()=>{prompts++;permission='granted';return permission;},getFileHandle:async name=>{files.push(name);return {createWritable:async()=>({write:async data=>writes.push(data),close:async()=>{},abort:async()=>{aborted=true;}})};}};
  const service=createFolderBackup({load:async()=>null,persist:async value=>saved.push({...value}),pickDirectory:async()=>handle,buildArchive:async()=>new Uint8Array([80,75]),makeId:()=>String(files.length),clock:()=>new Date('2026-11-03T00:00:00Z'),...options});
  return {service,handle,writes,saved,files,get prompts(){return prompts;},get aborted(){return aborted;},setPermission:value=>{permission=value;}};
}
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

test('folder selection is opt-in, manual backups preserve unique history and persist the last success',async()=>{
  const f=fixture();await f.service.init();assert.equal(f.service.state().enabled,false);
  await f.service.choose();assert.equal(f.saved.at(-1).handle,f.handle);assert.equal(f.writes.length,0);
  await f.service.backupNow();await f.service.backupNow();
  assert.equal(f.writes.length,2);assert.equal(new Set(f.files).size,2);assert.match(f.files[0],/^YoZuMind-.*\.zip$/);
  assert.equal(f.service.state().lastSaved,'2026-11-03T00:00:00.000Z');assert.equal(f.service.state().dirty,false);f.service.destroy();
});

test('automatic backup batches edits and never requests permission',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture();await f.service.init();await f.service.choose();await f.service.setEnabled(true);
  f.service.changed();f.service.changed();t.mock.timers.tick(60000);await settle();
  assert.equal(f.writes.length,1);assert.equal(f.prompts,0);t.mock.timers.tick(60000);await settle();assert.equal(f.writes.length,1);f.service.destroy();
});

test('expired permissions stop automatic writes until a user explicitly authorizes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture();await f.service.init();await f.service.choose();await f.service.setEnabled(true);f.setPermission('prompt');
  t.mock.timers.tick(60000);await settle();assert.equal(f.writes.length,0);assert.equal(f.prompts,0);assert.match(f.service.state().error,/授權/);
  await f.service.backupNow();assert.equal(f.writes.length,1);assert.equal(f.prompts,1);f.service.destroy();
});

test('changes arriving while building remain dirty for the next serialized backup',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let resolve,builds=0;
  const f=fixture({buildArchive:()=>{builds++;return builds===1?new Promise(done=>{resolve=done;}):Promise.resolve(new Uint8Array([80,75]));}});
  await f.service.init();await f.service.choose();await f.service.setEnabled(true);t.mock.timers.tick(60000);await settle();
  assert.equal(builds,1);f.service.changed();t.mock.timers.tick(60000);await settle();assert.equal(builds,1);
  resolve(new Uint8Array([80,75]));await settle();assert.equal(f.service.state().dirty,true);
  t.mock.timers.tick(60000);await settle();assert.equal(builds,2);assert.equal(f.writes.length,2);assert.equal(f.service.state().dirty,false);f.service.destroy();
});

test('failed archive creation preserves the previous successful backup and allows manual retry',async()=>{
  let fail=false;const f=fixture({buildArchive:async()=>{if(fail)throw new Error('附件無法讀取');return new Uint8Array([80,75]);}});
  await f.service.init();await f.service.choose();await f.service.backupNow();const last=f.service.state().lastFile;fail=true;f.service.changed();await f.service.backupNow();
  assert.equal(f.files.length,1);assert.equal(f.service.state().lastFile,last);assert.equal(f.service.state().dirty,true);assert.match(f.service.state().error,/附件/);
  fail=false;await f.service.backupNow();assert.equal(f.writes.length,2);assert.equal(f.service.state().error,'');f.service.destroy();
});

test('canceling folder selection keeps the existing settings',async()=>{
  const error=new Error('cancel');error.name='AbortError';const f=fixture({pickDirectory:async()=>{throw error;}});await f.service.init();await f.service.choose();assert.equal(f.service.state().handle,null);assert.equal(f.service.state().error,'');assert.equal(f.saved.length,0);f.service.destroy();
});

test('disabling or destroying cancels scheduled writes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture();await f.service.init();await f.service.choose();await f.service.setEnabled(true);await f.service.setEnabled(false);t.mock.timers.tick(60000);await settle();assert.equal(f.writes.length,0);
  await f.service.setEnabled(true);f.service.destroy();t.mock.timers.tick(60000);await settle();assert.equal(f.writes.length,0);
});

test('automatic backup waits for initial load or import to finish',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let ready=false;const f=fixture({isReady:()=>ready});await f.service.init();await f.service.choose();await f.service.setEnabled(true);t.mock.timers.tick(60000);await settle();assert.equal(f.writes.length,0);
  ready=true;t.mock.timers.tick(60000);await settle();assert.equal(f.writes.length,1);f.service.destroy();
});

test('failed filesystem writes abort without reporting success',async()=>{
  const f=fixture();f.handle.getFileHandle=async()=>({createWritable:async()=>({write:async()=>{throw new Error('磁碟已滿');},close:async()=>assert.fail('must not close failed write'),abort:async()=>{f.handle.wasAborted=true;}})});
  await f.service.init();await f.service.choose();await f.service.backupNow();assert.equal(f.handle.wasAborted,true);assert.equal(f.service.state().lastSaved,null);assert.match(f.service.state().error,/磁碟已滿/);f.service.destroy();
});

test('reopened settings retain the folder and require a user gesture for expired permission',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture();await f.service.init();await f.service.choose();await f.service.setEnabled(true);const stored=f.saved.at(-1);f.service.destroy();f.setPermission('prompt');
  const restored=fixture({load:async()=>stored});await restored.service.init();assert.equal(restored.service.state().handle,f.handle);assert.equal(restored.service.state().enabled,true);assert.equal(restored.service.state().permission,false);
  t.mock.timers.tick(60000);await settle();assert.equal(f.prompts,0);assert.equal(restored.writes.length,0);assert.match(restored.service.state().error,/重新授權/);restored.service.destroy();
});
