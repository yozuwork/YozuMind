import {zip,unzip,strToU8,strFromU8} from 'fflate';
import {MAX_FILE_BYTES,serializeMaps} from './files.js';
import {normalizeTags,updateImageTags} from './gallery-tags.js';
import {validatePresets} from './stage-presets.js';
import {validateWorkspaces} from './workspaces.js';
import {validateNotes} from './notes.js';

const IMAGE=/^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=]+$/;
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/avif':'avif','application/pdf':'pdf','application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','text/csv':'csv'};
const runZip=entries=>new Promise((resolve,reject)=>zip(entries,{level:1},(error,data)=>error?reject(error):resolve(data)));
const safePath=path=>typeof path==='string'&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(part=>part==='..'||part==='.');

export function validateGallery(items) {
  if(!Array.isArray(items)||items.length>10000) throw new Error('圖庫格式不正確或圖片過多。');
  return items.map(image=>{
    if(!image||typeof image.name!=='string'||image.name.length>1000||!IMAGE.test(image.src)||![image.width,image.height].every(value=>Number.isFinite(value)&&value>0&&value<=100000)) throw new Error('圖庫圖片資料不完整。');
    if(image.tags!==undefined&&(!Array.isArray(image.tags)||image.tags.some(tag=>typeof tag!=='string'))) throw new Error('圖庫標籤格式不正確。');
    if(image.description!==undefined&&(typeof image.description!=='string'||image.description.length>10000))throw new Error('圖片說明格式不正確。');
    if(image.sourceUrl!==undefined&&(typeof image.sourceUrl!=='string'||image.sourceUrl.length>2000||image.sourceUrl&&!/^https?:\/\//i.test(image.sourceUrl)))throw new Error('圖片來源連結格式不正確。');
    if(image.rating!==undefined&&(!Number.isInteger(image.rating)||image.rating<0||image.rating>5))throw new Error('圖片評分格式不正確。');
    return updateImageTags({name:image.name,src:image.src,width:image.width,height:image.height,createdAt:Number.isFinite(image.createdAt)?image.createdAt:Date.now(),tags:normalizeTags(image.tags),...(typeof image.workspaceId==='string'&&image.workspaceId.length<=100?{workspaceId:image.workspaceId}:{}),...(image.description!==undefined?{description:image.description}:{}),...(image.sourceUrl!==undefined?{sourceUrl:image.sourceUrl}:{}),...(image.rating!==undefined?{rating:image.rating}:{}),...(image.favorite!==undefined?{favorite:image.favorite===true}:{})},[]);
  });
}

// Binary image/file bodies live in real ZIP folders; records hold portable asset references.
export async function createArchive({maps,folders=[],files={},gallery=[],stagePresets=[],workspaces=[],notes=[]}) {
  const entries=Object.create(null),assets=new Map();let bytes=0;
  function add(path,data) {bytes+=data.length;if(bytes>MAX_FILE_BYTES) throw new Error('存檔解壓後超過 300 MB，請分別匯出心智圖或減少圖庫圖片。');entries[path]=data;}
  function pack(value) {
    if(typeof value==='string'&&/^data:[^;,]*;base64,/.test(value)) {
      if(assets.has(value)) return assets.get(value);
      const match=/^data:([^;,]*);base64,([A-Za-z0-9+/=]*)$/.exec(value);
      if(!match) throw new Error('存檔中有無法讀取的圖片或附件。');
      const mime=match[1]||'application/octet-stream',binary=atob(match[2]),data=Uint8Array.from(binary,char=>char.charCodeAt(0));
      const path=`${mime.startsWith('image/')?'images':'files'}/asset-${String(assets.size+1).padStart(6,'0')}.${extensions[mime]||'bin'}`;
      const reference={$yozuAsset:path,mime};assets.set(value,reference);add(path,data);return reference;
    }
    if(Array.isArray(value)) return value.map(pack);
    if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,pack(item)]));
    return value;
  }
  const project=pack(JSON.parse(serializeMaps(maps,folders,files))),library=pack(validateGallery(gallery)),presets=pack(validatePresets(stagePresets));
  add('manifest.json',strToU8(JSON.stringify({format:'yozumind-zip',version:1,exportedAt:new Date().toISOString(),workspaces:validateWorkspaces(workspaces)})));
  add('records/project.json',strToU8(JSON.stringify(project,null,2)));
  add('records/gallery.json',strToU8(JSON.stringify(library,null,2)));
  add('records/stage-presets.json',strToU8(JSON.stringify(presets,null,2)));
  add('records/notes.json',strToU8(JSON.stringify(validateNotes(notes),null,2)));
  add('README.txt',strToU8('YoZuMind 可攜式存檔\n\nrecords/：心智圖、物件、角色階段、升級經驗值、圖庫與標籤紀錄。\nimages/：所有圖片（相同圖片共用一份）。\nfiles/：PDF、Word、Excel 等附件。\n\n在其他電腦或 iPhone 開啟 YoZuMind，選擇「匯入存檔」並選取整個 ZIP，不需解壓縮。\n匯入會保留現有資料。\n'));
  const result=await runZip(entries);
  if(result.length>MAX_FILE_BYTES) throw new Error('ZIP 存檔超過 300 MB，請分別匯出。');
  return result;
}

export async function readArchive(file) {
  if(file.size>MAX_FILE_BYTES) throw new Error('存檔不可超過 300 MB。');
  const data=new Uint8Array(await file.arrayBuffer());
  if(data[0]!==0x50||data[1]!==0x4b) {
    if(/\.zip$/i.test(file.name||'')) throw new Error('ZIP 存檔損毀或格式不正確。');
    return {text:strFromU8(data),gallery:[],stagePresets:[],workspaces:[],notes:[],zip:false};
  }
  let bytes=0,count=0,invalid=false;
  let entries;
  try {entries=await new Promise((resolve,reject)=>unzip(data,{filter:entry=>{
    bytes+=entry.originalSize;count++;
    if(!safePath(entry.name)||!Number.isSafeInteger(entry.originalSize)||entry.originalSize<0||bytes>MAX_FILE_BYTES||count>20000) invalid=true;
    return !invalid;
  }},(error,result)=>error?reject(error):resolve(result)));}
  catch {throw new Error('無法解開 ZIP 存檔，檔案可能損毀。');}
  if(invalid) throw new Error('ZIP 內容過大或檔案路徑不正確。');
  function json(path) {if(!Object.hasOwn(entries,path)) throw new Error(`存檔缺少 ${path}。`);return JSON.parse(strFromU8(entries[path]));}
  const manifest=json('manifest.json');
  if(manifest.format!=='yozumind-zip'||manifest.version!==1) throw new Error('不是支援的 YoZuMind ZIP 存檔。');
  const workspaces=validateWorkspaces(manifest.workspaces||[]);
  const restored=new Map();
  function unpack(value,depth=0) {
    if(depth>250) throw new Error('存檔內容層級過深。');
    if(value&&typeof value==='object'&&Object.hasOwn(value,'$yozuAsset')) {
      const path=value.$yozuAsset;
      if(!safePath(path)||! /^(images|files)\//.test(path)||!Object.hasOwn(entries,path)||typeof value.mime!=='string'||! /^[\w.+-]+\/[\w.+-]+$/.test(value.mime)) throw new Error('存檔缺少圖片或附件，無法完整還原。');
      const key=path+';'+value.mime;if(restored.has(key)) return restored.get(key);
      const data=entries[path];let binary='';for(let offset=0;offset<data.length;offset+=32768) binary+=String.fromCharCode(...data.subarray(offset,offset+32768));
      const url=`data:${value.mime};base64,${btoa(binary)}`;restored.set(key,url);return url;
    }
    if(Array.isArray(value)) return value.map(item=>unpack(item,depth+1));
    if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,unpack(item,depth+1)]));
    return value;
  }
  const project=unpack(json('records/project.json')),gallery=validateGallery(unpack(json('records/gallery.json')));
  const stagePresets=Object.hasOwn(entries,'records/stage-presets.json')?validatePresets(unpack(json('records/stage-presets.json'))):[];
  const notes=Object.hasOwn(entries,'records/notes.json')?validateNotes(json('records/notes.json')):[];
  if(project.format!=='yozumind'||project.version!==1||!Array.isArray(project.maps)||(!project.maps.length&&!project.folders?.length&&!gallery.length&&!stagePresets.length&&!workspaces.length&&!notes.length)) throw new Error('存檔沒有可還原的資料。');
  return {text:JSON.stringify(project),gallery,stagePresets,workspaces,notes,zip:true};
}
