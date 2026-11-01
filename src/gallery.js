import {readImageFile} from './canvas-assets.js';
import {normalizeTags,updateImageTags,matchesGalleryImage} from './gallery-tags.js';
import {activeWorkspaceId,inWorkspace} from './workspaces.js';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls) node.className=cls;if(text!==undefined) node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};
const button=(label,cls,action)=>{const node=el('button',cls,label);node.type='button';node.addEventListener('click',action);return node;};
let database;
function db() {
  database ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open('yozu-gallery',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=null;reject(request.error);};
  });
  return database;
}
async function storage(mode,action) {
  const database=await db();
  return new Promise((resolve,reject)=>{const tx=database.transaction('images',mode),request=action(tx.objectStore('images'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(tx.error);});
}

export const exportGalleryImages=async(workspaceId=activeWorkspaceId())=>inWorkspace(await storage('readonly',store=>store.getAll()),workspaceId);
export async function importGalleryImages(images,uid,workspaceId=activeWorkspaceId()) {
  if(!images.length) return [];
  const copies=images.map(image=>({...image,id:uid('g'),...(workspaceId!==null?{workspaceId}:{})}));
  await storage('readwrite',store=>{for(const image of copies) store.put(image);});
  return copies.map(image=>image.id);
}
export const removeGalleryImages=ids=>ids.length?storage('readwrite',store=>{for(const id of ids) store.delete(id);}):Promise.resolve();
export async function saveGalleryImages(images) {
  if(!images.length)return;
  await storage('readwrite',store=>{for(const image of images)store.put(image);});
  window.dispatchEvent(new Event('yozu-gallery-changed'));
}

export function setupGallery({trigger,getSelection,addToCanvas,canEdit,uid,toast}) {
  let dialog=null,images=[],busy=false,disposed=false;
  const listeners=[];
  const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  // The library owns keyboard and clipboard interactions while it is open.
  for(const type of ['keydown','copy','cut','paste']) on(window,type,event=>{
    if(!dialog?.open || !dialog.contains(event.target)) return;
    if(type==='keydown' && event.key==='Enter' && !event.isComposing && event.target.classList.contains('gallery-tag-input')) {event.preventDefault();dialog.applyTags();}
    if(type==='paste') {
      const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
      if(files.length) {event.preventDefault();dialog.receiveFiles(files);}
    }
    event.stopPropagation();
  },true);
  async function open(onSelect=null) {
    if(dialog?.open) return;
    if(busy) {toast('圖片處理中，請稍候再開啟圖庫');return;}
    const workspaceId=activeWorkspaceId();
    const opener=document.activeElement, panel=el('dialog','gallery-panel');dialog=panel;
    panel.setAttribute('aria-labelledby','gallery-title');
    const header=el('header','gallery-header'),title=el('div');
    const heading=el('h2','',onSelect?'選擇階段圖片':'圖片圖庫');heading.id='gallery-title';title.append(el('span','gallery-eyebrow','素材收藏'),heading);
    const headerActions=el('div','gallery-header-actions');
    const expand=button('','icon-btn',()=>{const full=panel.classList.toggle('gallery-full');expand.replaceChildren(icon(full?'fullscreen-exit':'arrows-fullscreen'));expand.setAttribute('aria-label',full?'還原側邊欄':'滿版顯示圖庫');expand.title=full?'還原側邊欄':'滿版顯示';expand.setAttribute('aria-pressed',String(full));});expand.append(icon('arrows-fullscreen'));expand.setAttribute('aria-label','滿版顯示圖庫');expand.setAttribute('aria-pressed','false');expand.title='滿版顯示';
    const close=button('','icon-btn',()=>panel.close());close.append(icon('x-lg'));close.setAttribute('aria-label','關閉圖庫');headerActions.append(expand,close);header.append(title,headerActions);
    const tools=el('div','gallery-tools'),input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';input.multiple=true;input.hidden=true;
    const upload=button('上傳圖片','btn gallery-primary',()=>{input.value='';input.click();});upload.prepend(icon('plus-lg'));
    const collect=button('收藏選取圖片','btn btn-ghost',async()=>{
      const image=getSelection();if(!image?.src) {toast('請先在畫布選取圖片或角色卡');return;}
      const preview=new Image();preview.src=image.src;
      try {await preview.decode();await storeImages([{id:uid('g'),name:image.name||image.title||'收藏圖片',src:image.src,width:preview.naturalWidth,height:preview.naturalHeight,createdAt:Date.now()}]);}
      catch {toast('無法讀取選取的圖片');}
    });
    collect.disabled=!getSelection()?.src;
    const searchLabel=el('label','gallery-search');searchLabel.append(icon('search'));const search=el('input');search.type='search';search.placeholder='搜尋圖片名稱或標籤';search.setAttribute('aria-label','搜尋圖庫');searchLabel.append(search);
    tools.append(upload,collect,input,searchLabel);
    const selected=new Set(),filters=el('div','gallery-filters'),selectLabel=el('label','gallery-select-all'),selectAll=el('input');selectAll.type='checkbox';selectLabel.append(selectAll,el('span','','全選顯示圖片'));
    const filter=el('select','gallery-tag-filter');filter.setAttribute('aria-label','依標籤篩選');filters.append(selectLabel,filter);tools.append(filters);
    const batch=el('div','gallery-batch'),batchHeading=el('div','gallery-batch-heading'),selectedCount=el('span'),clear=button('取消選取','btn btn-ghost',()=>{selected.clear();render();});batchHeading.append(selectedCount,clear);
    const tagLabel=el('label','gallery-tag-label','批次標籤'),tagInput=el('input','gallery-tag-input');tagInput.id='gallery-batch-tags';tagInput.placeholder='例如：角色, 靈感（逗號分隔）';tagInput.maxLength=1200;tagLabel.htmlFor=tagInput.id;
    const batchActions=el('div','gallery-batch-actions'),apply=button('加入標籤','btn gallery-primary',()=>applyTags(false)),removeTags=button('移除標籤','btn btn-ghost',()=>applyTags(true));batchActions.append(apply,removeTags);
    const batchFeedback=el('p','gallery-batch-feedback');batchFeedback.setAttribute('role','status');
    batch.append(batchHeading,tagLabel,tagInput,batchActions,batchFeedback);batch.hidden=true;tools.append(batch);
    function results() {return images.filter(image=>matchesGalleryImage(image,search.value,filter.value));}
    function updateSelectionControls() {
      const visible=results();selectAll.checked=visible.length>0&&visible.every(image=>selected.has(image.id));selectAll.indeterminate=!selectAll.checked&&visible.some(image=>selected.has(image.id));selectAll.disabled=busy||!visible.length;
      batch.hidden=!selected.size;selectedCount.textContent=`已選取 ${selected.size} 張圖片`;apply.disabled=removeTags.disabled=busy;clear.disabled=busy;tagInput.disabled=busy;
    }
    async function applyTags(remove) {
      if(busy||!selected.size) return;
      const tags=normalizeTags(tagInput.value);
      if(!tags.length) {batchFeedback.textContent='請先輸入標籤，以逗號分隔多個標籤。';tagInput.focus();return;}
      let updates;
      try {updates=images.filter(image=>selected.has(image.id)).map(image=>updateImageTags(image,tags,remove));}
      catch(error) {batchFeedback.textContent=error.message;tagInput.focus();return;}
      busy=true;render();batchFeedback.textContent='正在儲存標籤…';
      try {
        await storage('readwrite',store=>{for(const image of updates) store.put(image);});
        const byId=new Map(updates.map(image=>[image.id,image]));images=images.map(image=>byId.get(image.id)||image);
        batchFeedback.textContent=`已為 ${updates.length} 張圖片${remove?'移除':'加入'}標籤`;tagInput.value='';
      } catch {batchFeedback.textContent='標籤儲存失敗，請重試。';}
      finally {busy=false;render();tagInput.focus();}
    }
    panel.applyTags=()=>applyTags(false);
    filter.addEventListener('change',render);
    selectAll.addEventListener('change',()=>{for(const image of results()) {if(selectAll.checked) selected.add(image.id);else selected.delete(image.id);}render();selectAll.focus();});
    const content=el('div','gallery-content'),grid=el('div','gallery-grid'),status=el('p','gallery-status','載入圖片中…');status.setAttribute('role','status');content.append(status,grid);
    const footer=el('footer','gallery-footer','圖片儲存在此瀏覽器。可拖入或貼上圖片，並重複加入不同心智圖。');
    panel.append(header,tools,content,footer);
    function render() {
      if(!panel.isConnected) return;
      const previous=filter.value,allTags=normalizeTags(images.flatMap(image=>normalizeTags(image.tags))).sort((a,b)=>a.localeCompare(b));
      filter.replaceChildren(new Option('所有標籤',''),...allTags.map(tag=>new Option(tag,tag.toLocaleLowerCase())));
      if(previous) {if(!allTags.some(tag=>tag.toLocaleLowerCase()===previous)) filter.append(new Option(previous,previous));filter.value=previous;}
      filter.disabled=busy;for(const id of selected) if(!images.some(image=>image.id===id)) selected.delete(id);
      const query=search.value.trim(),visible=results();updateSelectionControls();
      grid.replaceChildren();status.textContent=busy?'正在儲存…':`${images.length} 張圖片${query||filter.value?` · 找到 ${visible.length} 張`:''}`;
      upload.disabled=busy;collect.disabled=busy||!getSelection()?.src;
      if(!visible.length) {const filtered=query||filter.value,empty=el('div','gallery-empty');empty.append(icon('images'),el('h3','',filtered?'找不到圖片':'建立你的靈感圖庫'),el('p','',filtered?'試試其他關鍵字或標籤':'上傳、拖入或貼上圖片，隨時取用。'));grid.append(empty);return;}
      for(const image of visible) {
        const card=el('article','gallery-item'),preview=el('div','gallery-preview'),img=el('img');img.src=image.src;img.alt=image.name;img.loading='lazy';preview.append(img);
        card.classList.toggle('gallery-selected',selected.has(image.id));
        const choice=el('label','gallery-image-select'),check=el('input');check.type='checkbox';check.checked=selected.has(image.id);check.disabled=busy;check.dataset.galleryId=image.id;check.setAttribute('aria-label',`選取 ${image.name}`);choice.append(check);preview.append(choice);
        check.addEventListener('change',()=>{if(check.checked) selected.add(image.id);else selected.delete(image.id);render();grid.querySelector(`[data-gallery-id="${CSS.escape(image.id)}"]`)?.focus({preventScroll:true});});
        const name=el('p','gallery-name',image.name);name.title=image.name;
        const chips=el('div','gallery-tags');for(const tag of normalizeTags(image.tags)) {const chip=button(tag,'gallery-tag',()=>{filter.value=tag.toLocaleLowerCase();render();});chip.title=`篩選標籤：${tag}`;chips.append(chip);}
        const actions=el('div','gallery-item-actions');
        const add=button(onSelect?'使用這張圖片':'加入畫布','btn gallery-add',()=>{
          if(onSelect) {panel.close();onSelect(image);return;}
          if(!canEdit()) {toast('請先建立或開啟可編輯的心智圖');return;}
          addToCanvas(image);panel.close();toast('圖片已加入畫布，圖庫內仍會保留');
        });
        const download=button('','icon-btn',()=>{const link=el('a'),type=/^data:image\/(\w+)/.exec(image.src)?.[1]||'webp';link.href=image.src;link.download=image.name.replace(/\.[^.]+$/,'')+'.'+(type==='jpeg'?'jpg':type);document.body.append(link);link.click();link.remove();});download.append(icon('download'));download.title='下載圖片';download.setAttribute('aria-label',`下載 ${image.name}`);
        const remove=button('','icon-btn',async()=>{
          if(busy) return;busy=true;render();
          try {await storage('readwrite',store=>store.delete(image.id));images=images.filter(item=>item.id!==image.id);}
          catch {toast('圖片移除失敗，請重試');}
          finally {busy=false;render();search.focus();}
        });remove.append(icon('trash'));remove.title='從圖庫移除（不影響畫布）';remove.setAttribute('aria-label',`從圖庫移除 ${image.name}`);
        const editTags=button('','icon-btn',()=>{selected.clear();selected.add(image.id);render();tagInput.focus();});editTags.append(icon('tags'));editTags.title='設定標籤';editTags.setAttribute('aria-label',`設定 ${image.name} 的標籤`);
        actions.append(add,editTags,download,remove);card.append(preview,name,chips,actions);grid.append(card);
      }
    }
    async function storeImages(items) {
      if(busy) return;busy=true;render();let added=0;
      try {for(const image of items) {image.workspaceId=workspaceId;await storage('readwrite',store=>store.put(image));images.unshift(image);added++;}}
      catch {toast('圖庫儲存失敗，請確認瀏覽器儲存空間');}
      finally {busy=false;render();if(added) toast(`已收藏 ${added} 張圖片`);}
    }
    async function addFiles(files) {
      if(busy) {toast('圖片處理中，請稍候');return;}
      busy=true;render();let added=0;
      for(const file of files) {
        if(disposed) break;
        try {const image={...await readImageFile(file),id:uid('g'),name:file.name||'貼上圖片',createdAt:Date.now(),workspaceId};await storage('readwrite',store=>store.put(image));images.unshift(image);added++;}
        catch(error) {toast(error.message||'無法儲存圖片');}
      }
      busy=false;render();if(added) toast(`已收藏 ${added} 張圖片`);
    }
    panel.receiveFiles=addFiles;
    input.addEventListener('change',()=>addFiles([...input.files]));search.addEventListener('input',render);
    panel.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')) {event.preventDefault();panel.classList.add('gallery-dragover');event.dataTransfer.dropEffect='copy';}});
    panel.addEventListener('dragleave',event=>{if(!panel.contains(event.relatedTarget)) panel.classList.remove('gallery-dragover');});
    panel.addEventListener('drop',event=>{event.preventDefault();panel.classList.remove('gallery-dragover');const files=[...event.dataTransfer.files].filter(file=>file.type.startsWith('image/'));if(files.length) addFiles(files);else toast('請拖入圖片檔案');});
    panel.addEventListener('close',()=>{panel.remove();if(dialog===panel) dialog=null;if(opener?.isConnected) opener.focus();});
    busy=true;upload.disabled=true;collect.disabled=true;
    document.body.append(panel);panel.showModal();close.focus();
    try {images=(await exportGalleryImages(workspaceId)).sort((a,b)=>b.createdAt-a.createdAt);busy=false;render();}
    catch {busy=false;status.textContent='無法載入圖庫，請關閉後重試。';}
  }
  if(trigger)on(trigger,'click',()=>open());
  return {pick:onSelect=>open(onSelect),destroy(){disposed=true;dialog?.remove();listeners.forEach(fn=>fn());}};
}
