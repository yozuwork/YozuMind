import {activeWorkspaceId,inWorkspace} from './workspaces.js';
const IMAGE=/^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=]+$/;
export function validateStage(stage) {
  if(!stage||!Number.isInteger(stage.level)||stage.level<1||stage.level>100000) throw new Error('常用階段的起始等級不正確。');
  const xp=stage.xpPerLevel??100;
  if(!Number.isInteger(xp)||xp<1||xp>1000000) throw new Error('常用階段的升級 XP 不正確。');
  if((stage.src&& !IMAGE.test(stage.src))||typeof (stage.name??'')!=='string'||(stage.name||'').length>1000||typeof (stage.description??'')!=='string'||(stage.description||'').length>10000) throw new Error('常用階段的圖片或文字格式不正確。');
  return {level:stage.level,xpPerLevel:xp,name:stage.name||'',src:stage.src||'',description:stage.description||''};
}
export function validatePresets(list=[]) {
  if(!Array.isArray(list)||list.length>2000) throw new Error('常用階段格式不正確或超過 2,000 筆。');
  return list.map(item=>({name:typeof item?.name==='string'?item.name.slice(0,1000):'',stage:validateStage(item?.stage),createdAt:Number.isFinite(item.createdAt)?item.createdAt:Date.now(),...(typeof item.workspaceId==='string'&&item.workspaceId.length<=100?{workspaceId:item.workspaceId}:{})}));
}
export function applyStagePreset(target,preset) {
  return {...validateStage(preset.stage),level:target.level};
}
export function sameStageContent(a,b) {
  return !!a&&!!b&&(a.name||'')===(b.name||'')&&(a.src||'')===(b.src||'')&&(a.description||'')===(b.description||'')&&(a.xpPerLevel??100)===(b.xpPerLevel??100);
}
let database;
async function storage(mode,action) {
  database ||= new Promise((resolve,reject)=>{const request=indexedDB.open('yozu-stage-presets',1);request.onupgradeneeded=()=>request.result.createObjectStore('presets',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};});
  const db=await database;
  return new Promise((resolve,reject)=>{const tx=db.transaction('presets',mode),request=action(tx.objectStore('presets'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(tx.error);});
}
const changed=()=>window.dispatchEvent(new Event('yozu-presets-changed'));
export const listStagePresets=async(workspaceId=activeWorkspaceId())=>inWorkspace(await storage('readonly',store=>store.getAll()),workspaceId);
export async function saveStagePreset(stage,uid,workspaceId=activeWorkspaceId()) {
  const valid=validateStage(stage),preset={id:uid('preset'),name:valid.name||`Lv. ${valid.level} 階段`,stage:valid,createdAt:Date.now(),workspaceId};
  const existing=await listStagePresets(workspaceId),match=existing.find(({stage:s})=>sameStageContent(s,valid));
  if(match) return match;
  if(existing.length>=2000) throw new Error('常用階段最多可收藏 2,000 筆。');
  await storage('readwrite',store=>store.put(preset));changed();return preset;
}
export async function importStagePresets(list,uid,workspaceId=activeWorkspaceId()) {
  if(!list.length) return [];
  const copies=validatePresets(list).map(item=>({...item,id:uid('preset'),...(workspaceId!==null?{workspaceId}:{})}));
  if((await listStagePresets(null)).length+copies.length>2000) throw new Error('匯入後常用階段超過 2,000 筆。');
  await storage('readwrite',store=>{for(const item of copies) store.put(item);});changed();return copies.map(item=>item.id);
}
export async function removeStagePresets(ids) {
  if(!ids.length) return;
  await storage('readwrite',store=>{for(const id of ids) store.delete(id);});changed();
}
