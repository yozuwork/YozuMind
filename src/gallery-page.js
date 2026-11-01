import {readImageFile} from './canvas-assets.js';
import {exportGalleryImages,saveGalleryImages,removeGalleryImages} from './gallery.js';
import {normalizeTags,updateImageTags,libraryImages} from './gallery-tags.js';
import {activeWorkspaceId} from './workspaces.js';
import {formatSize} from './attachments.js';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};
const button=(label,cls,action)=>{const node=el('button',cls,label);node.type='button';node.addEventListener('click',action);return node;};
const iconButton=(label,name,action)=>{const node=button('','library-icon',action);node.append(icon(name));node.title=label;node.setAttribute('aria-label',label);return node;};
const imageFormat=image=>(/^data:image\/([^;,]+)/.exec(image.src)?.[1]||'image').toUpperCase();
const byteSize=image=>{const body=image.src.slice(image.src.indexOf(',')+1);return Math.max(0,Math.floor(body.length*3/4)-(body.endsWith('==')?2:body.endsWith('=')?1:0));};

export function setupGalleryPage({app,trigger,uid,toast,getSelection,canUse,onUse,beforeOpen,toggleSidebar}) {
  let images=[],scope=activeWorkspaceId(),focusedId=null,busy=false,loading=false,generation=0,disposed=false,category='all',tag='',selectionMode=false,gridWidth=0,layoutFrame=null;
  const selected=new Set(),drafts=new Map(),listeners=[],dialogs=[];
  const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  const mobile=matchMedia('(max-width:1100px)');
  const page=el('section','library-page');page.hidden=true;page.setAttribute('aria-label','圖庫專區');app.querySelector('.main').append(page);
  const header=el('header','library-header'),menu=iconButton('打開側欄','list',()=>{if(app.classList.contains('gallery-focus')){app.classList.remove('gallery-focus','side-closed');full.replaceChildren(icon('arrows-fullscreen'));full.setAttribute('aria-pressed','false');}else toggleSidebar();}),heading=el('div','library-heading');heading.append(el('span','library-eyebrow','素材收藏'),el('h1','','圖庫專區'));
  const headerActions=el('div','library-header-actions'),upload=button('匯入圖片','library-button library-primary',()=>{fileInput.value='';fileInput.click();});upload.prepend(icon('plus-lg'));
  const selectMode=button('多選','library-button library-select-toggle',()=>{selectionMode=!selectionMode;if(!selectionMode)selected.clear();renderAll();});selectMode.setAttribute('aria-pressed','false');
  const full=iconButton('專注模式','arrows-fullscreen',()=>{const enabled=app.classList.toggle('gallery-focus');full.replaceChildren(icon(enabled?'fullscreen-exit':'arrows-fullscreen'));full.setAttribute('aria-pressed',String(enabled));});full.setAttribute('aria-pressed','false');
  const back=button('返回畫布','library-button library-back',()=>hide());back.prepend(icon('arrow-left'));headerActions.append(selectMode,upload,full,back);header.append(menu,heading,headerActions);
  const body=el('div','library-body'),navigation=el('nav','library-navigation');navigation.setAttribute('aria-label','圖庫分類');
  const center=el('section','library-center'),toolbar=el('div','library-toolbar'),searchLabel=el('label','library-search');center.setAttribute('aria-label','圖片瀏覽');searchLabel.append(icon('search'));const search=el('input');search.type='search';search.placeholder='搜尋圖片、標籤或說明';search.setAttribute('aria-label','搜尋圖庫');searchLabel.append(search);
  const filterButton=button('篩選','library-button library-filter-toggle',()=>openFilters());filterButton.prepend(icon('sliders'));
  const sort=el('select','library-sort');sort.setAttribute('aria-label','圖片排序');sort.append(new Option('最近加入','newest'),new Option('最早加入','oldest'),new Option('名稱排序','name'));
  const density=el('label','library-density');density.append(icon('grid'));const range=el('input');range.type='range';range.min='140';range.max='280';range.step='10';range.value='190';range.setAttribute('aria-label','縮圖大小');density.append(range);
  toolbar.append(searchLabel,filterButton,sort,density);
  const selectionBar=el('div','library-selection-bar'),selectAllLabel=el('label','library-select-all'),selectAll=el('input');selectAll.type='checkbox';selectAllLabel.append(selectAll,el('span','','全選顯示圖片'));
  const selectedCount=el('span','library-selected-count'),batchTag=button('設定標籤','library-button',()=>openBatchTags()),clear=button('取消','library-button',()=>{selected.clear();selectionMode=false;renderAll();});batchTag.prepend(icon('tags'));selectionBar.append(selectAllLabel,selectedCount,batchTag,clear);selectionBar.hidden=true;
  const statusRow=el('div','library-status-row'),status=el('p','library-status');status.setAttribute('role','status');const currentFilter=button('','library-active-filter',()=>{category='all';tag='';renderAll();});currentFilter.hidden=true;statusRow.append(status,currentFilter);
  const browser=el('div','library-browser'),grid=el('div','library-masonry');browser.append(grid);center.append(toolbar,selectionBar,statusRow,browser);
  const inspectorHost=el('div','library-inspector-host'),inspector=el('aside','library-inspector');inspector.setAttribute('aria-label','圖片詳細資訊');inspectorHost.append(inspector);body.append(navigation,center,inspectorHost);
  const footer=el('footer','library-footer'),footerHint=el('span','','拖入或貼上圖片，建立自己的靈感收藏。'),collect=button('收藏畫布選取圖片','library-collect',()=>collectImage());collect.prepend(icon('bookmark-plus'));footer.append(footerHint,collect);page.append(header,body,footer);
  const fileInput=el('input');fileInput.type='file';fileInput.multiple=true;fileInput.accept='image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';fileInput.hidden=true;page.append(fileInput);
  const detailDialog=el('dialog','library-detail-dialog');detailDialog.setAttribute('aria-label','圖片詳細資訊');document.body.append(detailDialog);dialogs.push(detailDialog);
  detailDialog.addEventListener('close',()=>{inspectorHost.append(inspector);const target=grid.querySelector(`[data-image-id="${CSS.escape(focusedId||'')}"] .library-open`);if(!page.hidden)target?.focus({preventScroll:true});});
  function filtered(){return libraryImages(images,{query:search.value,category,tag,sort:sort.value});}
  function ownDialog(target){return dialogs.some(dialog=>dialog.open&&dialog.contains(target));}
  function focused(){return images.find(image=>image.id===focusedId);}
  function makeDialog(title) {
    const dialog=el('dialog','library-action-dialog'),h=el('h2','',title),form=el('form');h.id='library-action-title';dialog.setAttribute('aria-labelledby',h.id);form.append(h);dialog.append(form);dialogs.push(dialog);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();dialogs.splice(dialogs.indexOf(dialog),1);});return {dialog,form};
  }
  function renderNavigation(host=navigation,closeAfter=null) {
    const previous=host.scrollTop;host.replaceChildren();
    host.append(el('div','library-nav-label','快速瀏覽'));
    for(const [id,label,ic,count] of [['all','全部圖片','images',images.length],['favorites','已收藏','star',images.filter(image=>image.favorite).length],['untagged','未標籤','tag',images.filter(image=>!normalizeTags(image.tags).length).length]]) {
      const node=button('','library-nav-item'+(category===id&&!tag?' active':''),()=>{category=id;tag='';renderAll();if(closeAfter)closeAfter();else host.querySelector('.active')?.focus({preventScroll:true});});node.append(icon(ic),el('span','',label),el('small','',String(count)));node.setAttribute('aria-pressed',String(category===id&&!tag));host.append(node);
    }
    const allTags=normalizeTags(images.flatMap(image=>normalizeTags(image.tags))).sort((a,b)=>a.localeCompare(b));
    host.append(el('div','library-nav-label','標籤分類'));
    if(!allTags.length)host.append(el('p','library-nav-hint','為圖片加上標籤，讓靈感更容易被找到。'));
    for(const label of allTags){const key=label.toLocaleLowerCase(),count=images.filter(image=>normalizeTags(image.tags).some(value=>value.toLocaleLowerCase()===key)).length,node=button('','library-nav-item'+(tag===key?' active':''),()=>{category='all';tag=key;renderAll();if(closeAfter)closeAfter();else host.querySelector('.active')?.focus({preventScroll:true});});node.append(icon('tag'),el('span','',label),el('small','',String(count)));node.setAttribute('aria-pressed',String(tag===key));host.append(node);}
    host.scrollTop=previous;
  }
  function renderGrid() {
    const scroll=browser.scrollTop,visible=filtered();grid.replaceChildren();
    if(!visible.length){const empty=el('div','library-empty');empty.append(icon(search.value||tag?'search':'images'),el('h2','',loading?'正在整理你的收藏…':images.length?'沒有符合的圖片':'把靈感，收進這裡'),el('p','',images.length?'試試其他搜尋文字、分類或標籤。':'匯入、拖放或貼上圖片。所有素材保留在目前工作區，隨時取用。'));if(!images.length&&!loading)empty.append(button('匯入第一張圖片','library-button library-primary',()=>fileInput.click()));grid.append(empty);return;}
    for(const image of visible){
      const item=el('article','library-item'+(selected.has(image.id)?' selected':'')+(focusedId===image.id?' focused':''));item.dataset.imageId=image.id;
      const frame=el('div','library-image-frame'),open=button('','library-open',()=>{if(selectionMode){selected.has(image.id)?selected.delete(image.id):selected.add(image.id);renderAll();}else focusImage(image.id,true);});open.setAttribute('aria-label',`查看 ${image.name}`);
      const img=el('img');img.src=image.src;img.alt=image.name;img.loading='lazy';img.width=image.width;img.height=image.height;img.addEventListener('load',requestLayout,{once:true});open.append(img);open.addEventListener('dblclick',()=>{if(!selectionMode)openDetail();});frame.append(open);
      const label=el('label','library-check'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=selected.has(image.id);checkbox.disabled=busy;checkbox.setAttribute('aria-label',`選取 ${image.name}`);checkbox.dataset.libraryId=image.id;label.append(checkbox);checkbox.addEventListener('change',()=>{selectionMode=true;if(checkbox.checked)selected.add(image.id);else selected.delete(image.id);renderAll();grid.querySelector(`[data-library-id="${CSS.escape(image.id)}"]`)?.focus({preventScroll:true});});
      const star=iconButton(image.favorite?'取消收藏':'收藏圖片',image.favorite?'star-fill':'star',async()=>{const draft=drafts.get(image.id);if(draft)draft.favorite=!image.favorite;await saveUpdates([{...image,favorite:!image.favorite}],image.favorite?'已取消收藏':'已收藏圖片');grid.querySelector(`[data-image-id="${CSS.escape(image.id)}"] .library-star`)?.focus({preventScroll:true});});star.classList.add('library-star');star.classList.toggle('on',!!image.favorite);star.disabled=busy;
      frame.append(label,star);const name=el('div','library-item-name');name.append(el('span','',image.name),el('small','',imageFormat(image)));name.title=image.name;
      item.append(frame,name);grid.append(item);
    }
    layoutGrid();
    browser.scrollTop=scroll;
  }
  function layoutGrid(){
    if(page.hidden)return;gridWidth=grid.clientWidth;
    const tiles=[...grid.querySelectorAll('.library-item')],gap=parseFloat(getComputedStyle(grid).columnGap)||14;
    const heights=tiles.map(item=>item.querySelector('.library-image-frame').getBoundingClientRect().height+item.querySelector('.library-item-name').getBoundingClientRect().height+2);
    tiles.forEach((item,index)=>{const span=String(Math.ceil((heights[index]+gap)/4));if(item.dataset.rowSpan!==span){item.style.gridRowEnd='span '+span;item.dataset.rowSpan=span;}});
  }
  function requestLayout(){if(layoutFrame!==null||page.hidden||disposed)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;layoutGrid();});}
  function renderInspector() {
    inspector.replaceChildren();const image=focused();
    const head=el('div','library-inspector-heading');head.append(el('span','','圖片資訊'),iconButton('關閉圖片資訊','x-lg',()=>{if(detailDialog.open)detailDialog.close();else{focusedId=null;renderAll();}}));inspector.append(head);
    if(!image){const empty=el('div','library-inspector-empty');empty.append(icon('image'),el('p','','選擇一張圖片，查看資訊、標籤與來源。'));inspector.append(empty);return;}
    const scroll=el('div','library-inspector-scroll'),preview=el('div','library-inspector-preview'),img=el('img');img.src=image.src;img.alt=image.name;preview.append(img,el('span','library-format',imageFormat(image)));scroll.append(preview);
    const form=el('form','library-details-form'),draft=drafts.get(image.id)||image;form.noValidate=true;
    const field=(labelText,key,kind='input')=>{const label=el('label','library-field',labelText),input=el(kind);input.dataset.detailField=key;input.disabled=busy;if(kind==='input')input.type='text';input.value=draft[key]||'';input.maxLength=key==='name'?1000:key==='sourceUrl'?2000:10000;if(key==='name')input.required=true;if(kind==='textarea')input.rows=3;label.append(input);form.append(label);return input;};
    const name=field('名稱','name'),description=field('說明','description','textarea'),source=field('來源連結','sourceUrl');description.placeholder='記錄靈感、用途或提示詞…';source.placeholder='https://…';
    const tagLabel=el('label','library-field','標籤'),tagsInput=el('input');tagsInput.type='text';tagsInput.disabled=busy;tagsInput.value=normalizeTags(draft.tags).join(', ');tagsInput.maxLength=1200;tagsInput.placeholder='以逗號分隔多個標籤';tagLabel.append(tagsInput);form.append(tagLabel);
    const chips=el('div','library-inspector-tags');for(const value of normalizeTags(image.tags)){const chip=button(value,'library-chip',()=>{category='all';tag=value.toLocaleLowerCase();renderAll();if(detailDialog.open)detailDialog.close();});chips.append(chip);}form.append(chips);
    const flags=el('div','library-details-flags'),favoriteLabel=el('label'),favorite=el('input');favorite.type='checkbox';favorite.checked=!!draft.favorite;favoriteLabel.append(favorite,el('span','','收藏圖片'));const rating=el('select');rating.setAttribute('aria-label','圖片評分');for(let value=0;value<=5;value++)rating.append(new Option(value?'★'.repeat(value):'尚未評分',String(value)));rating.value=String(draft.rating||0);flags.append(favoriteLabel,rating);form.append(flags);
    favorite.disabled=rating.disabled=busy;
    const remember=()=>drafts.set(image.id,{name:name.value,description:description.value,sourceUrl:source.value,tags:normalizeTags(tagsInput.value),favorite:favorite.checked,rating:Number(rating.value)});form.addEventListener('input',remember);form.addEventListener('change',remember);
    const metadata=el('dl','library-metadata');for(const [label,value] of [['尺寸',`${image.width} × ${image.height}`],['檔案大小',formatSize(byteSize(image))],['格式',imageFormat(image)],['加入日期',new Date(Number.isFinite(image.createdAt)?image.createdAt:Date.now()).toLocaleDateString('zh-TW')]])metadata.append(el('dt','',label),el('dd','',value));form.append(metadata);
    const error=el('p','library-field-error');error.setAttribute('role','alert');form.append(error);
    const actions=el('div','library-detail-actions'),save=el('button','library-button library-primary library-save-details','儲存資訊');save.type='submit';save.disabled=busy;
    const use=button('加入畫布','library-button library-use-image',()=>useImage(image));use.disabled=!canUse()||busy;actions.append(save,use);
    const secondary=el('div','library-detail-secondary'),download=button('下載圖片','library-button',()=>downloadImage(image)),remove=button('從圖庫移除','library-button library-danger',()=>deleteImage(image));remove.disabled=busy;secondary.append(download,remove);
    form.append(actions,secondary);form.addEventListener('submit',async event=>{event.preventDefault();remember();if(!name.value.trim()){error.textContent='請填寫圖片名稱。';name.focus();return;}if(source.value.trim()&&!/^https?:\/\//i.test(source.value.trim())){error.textContent='來源連結請使用 http:// 或 https://。';source.focus();return;}let updated;try{updated=updateImageTags({...image,name:name.value.trim(),description:description.value,sourceUrl:source.value.trim(),favorite:favorite.checked,rating:Number(rating.value),tags:[]},tagsInput.value);}catch(err){error.textContent=err.message;tagsInput.focus();return;}if(await saveUpdates([updated],'圖片資訊已儲存')){drafts.delete(image.id);renderInspector();inspector.querySelector('.library-save-details')?.focus({preventScroll:true});}});
    scroll.append(form);inspector.append(scroll);
  }
  function renderAll() {
    if(page.hidden||disposed)return;
    page.setAttribute('aria-busy',String(busy||loading));
    for(const id of selected)if(!images.some(image=>image.id===id))selected.delete(id);
    const visible=filtered();if(focusedId&&!visible.some(image=>image.id===focusedId))focusedId=visible[0]?.id||null;status.textContent=loading?'正在載入圖片…':busy?'正在儲存…':`${visible.length} 張圖片${search.value||category!=='all'||tag?` / 共 ${images.length} 張`:''}`;
    currentFilter.hidden=category==='all'&&!tag;currentFilter.textContent=(tag?`#${tag}`:category==='favorites'?'已收藏':'未標籤')+' ×';
    page.classList.toggle('library-selecting',selectionMode);selectMode.textContent=selectionMode?'完成選取':'多選';selectMode.setAttribute('aria-pressed',String(selectionMode));selectionBar.hidden=!selectionMode&&!selected.size;selectedCount.textContent=`已選 ${selected.size} 張`;
    selectAll.checked=visible.length>0&&visible.every(image=>selected.has(image.id));selectAll.indeterminate=!selectAll.checked&&visible.some(image=>selected.has(image.id));selectAll.disabled=busy||!visible.length;batchTag.disabled=busy||!selected.size;upload.disabled=busy;collect.disabled=busy||!getSelection()?.src;
    footerHint.textContent=selected.size?`已選 ${selected.size} 張圖片，可批次設定標籤。`:'圖片保存在此瀏覽器與目前工作區，ZIP 存檔會一起備份。';
    renderNavigation();renderGrid();renderInspector();
  }
  function focusImage(id,showMobile=false){focusedId=id;renderAll();if(showMobile&&mobile.matches)openDetail();else grid.querySelector(`[data-image-id="${CSS.escape(id)}"] .library-open`)?.focus({preventScroll:true});}
  function openDetail(){if(!focused())return;if(!detailDialog.open){detailDialog.append(inspector);detailDialog.showModal();}inspector.querySelector('.library-inspector-heading button')?.focus({preventScroll:true});}
  function useImage(image){if(!canUse()){toast('請先建立或開啟可編輯的心智圖');return;}if(detailDialog.open)detailDialog.close();hide();onUse(image);toast('圖片已加入畫布，圖庫仍會保留');}
  function downloadImage(image){const a=el('a'),extension=imageFormat(image).toLowerCase();a.href=image.src;a.download=image.name.replace(/\.[^.]+$/,'')+'.'+(extension==='jpeg'?'jpg':extension);document.body.append(a);a.click();a.remove();}
  async function saveUpdates(updates,message) {
    if(busy)return false;busy=true;renderAll();const workspace=scope;
    try{await saveGalleryImages(updates);if(workspace===scope){const byId=new Map(updates.map(image=>[image.id,image]));for(const image of images){const update=byId.get(image.id),draft=drafts.get(image.id);if(update&&draft){if(JSON.stringify(update.tags)!==JSON.stringify(image.tags))draft.tags=normalizeTags(update.tags);if(update.favorite!==image.favorite)draft.favorite=update.favorite;}}images=images.map(image=>byId.get(image.id)||image);}toast(message);return true;}
    catch{toast('儲存失敗，請確認瀏覽器儲存空間後重試');return false;}
    finally{busy=false;renderAll();}
  }
  async function deleteImage(image){if(busy)return;busy=true;renderAll();try{await removeGalleryImages([image.id]);images=images.filter(item=>item.id!==image.id);selected.delete(image.id);drafts.delete(image.id);focusedId=images[0]?.id||null;if(detailDialog.open)detailDialog.close();toast('已從圖庫移除，畫布上的圖片不受影響');}catch{toast('移除失敗，請重試');}finally{busy=false;renderAll();}}
  async function addFiles(files){if(busy){toast('圖片處理中，請稍候');return;}const workspace=activeWorkspaceId();busy=true;renderAll();let count=0;for(const file of files){if(disposed)break;try{const image={...await readImageFile(file),id:uid('g'),name:file.name||'貼上圖片',createdAt:Date.now(),workspaceId:workspace,tags:[]};await saveGalleryImages([image]);if(scope===workspace){images.unshift(image);focusedId=image.id;}count++;}catch(error){toast(error.message||'圖片儲存失敗');}}busy=false;renderAll();if(count)toast(`已收藏 ${count} 張圖片`);}
  async function collectImage(){const chosen=getSelection();if(!chosen?.src){toast('請先選取畫布圖片或角色卡');return;}if(busy)return;busy=true;renderAll();const workspace=activeWorkspaceId();try{const preview=new Image();preview.src=chosen.src;await preview.decode();const image={id:uid('g'),name:chosen.name||chosen.title||'收藏圖片',src:chosen.src,width:preview.naturalWidth,height:preview.naturalHeight,createdAt:Date.now(),workspaceId:workspace,tags:[]};await saveGalleryImages([image]);if(scope===workspace){images.unshift(image);focusedId=image.id;}toast('已收藏選取的圖片');}catch{toast('無法收藏圖片，請重試');}finally{busy=false;renderAll();}}
  function openBatchTags(){if(!selected.size||busy)return;const {dialog,form}=makeDialog('批次設定標籤'),label=el('label','library-field',`已選取 ${selected.size} 張圖片`),input=el('input');input.type='text';input.placeholder='例如：角色, 靈感';input.maxLength=1200;label.append(input);const help=el('p','library-dialog-help','以逗號分隔多個標籤，加入時會保留原有標籤。'),error=el('p','library-field-error');error.setAttribute('role','alert');const actions=el('div','library-dialog-actions'),cancel=button('取消','library-button',()=>dialog.close()),remove=button('移除標籤','library-button',()=>apply(true)),add=el('button','library-button library-primary','加入標籤');add.type='submit';actions.append(cancel,remove,add);form.append(label,help,error,actions);
    async function apply(removeTags){if(busy)return;const tags=normalizeTags(input.value);if(!tags.length){error.textContent='請先輸入標籤。';input.focus();return;}let updates;try{updates=images.filter(image=>selected.has(image.id)).map(image=>updateImageTags(image,tags,removeTags));}catch(err){error.textContent=err.message;return;}input.disabled=add.disabled=remove.disabled=true;if(await saveUpdates(updates,`已為 ${updates.length} 張圖片${removeTags?'移除':'加入'}標籤`)){dialog.close();batchTag.focus({preventScroll:true});}else input.disabled=add.disabled=remove.disabled=false;}
    form.addEventListener('submit',event=>{event.preventDefault();apply(false);});dialog.showModal();input.focus();
  }
  function openFilters(){const {dialog,form}=makeDialog('篩選圖片'),nav=el('nav','library-mobile-navigation');renderNavigation(nav,()=>dialog.close());form.append(nav,button('關閉','library-button',()=>dialog.close()));dialog.showModal();}
  async function refresh(){if(page.hidden||disposed)return;const workspace=activeWorkspaceId(),token=++generation;if(scope!==workspace){scope=workspace;images=[];focusedId=null;selected.clear();drafts.clear();category='all';tag='';search.value='';selectionMode=false;}loading=true;renderAll();try{const loaded=await exportGalleryImages(workspace);if(token!==generation||workspace!==activeWorkspaceId()||disposed)return;images=loaded;focusedId=images.some(image=>image.id===focusedId)?focusedId:images[0]?.id||null;}catch{toast('圖庫載入失敗，請重新開啟');}finally{if(token===generation){loading=false;renderAll();}}}
  function show(){beforeOpen?.();page.hidden=false;app.classList.add('gallery-mode');trigger.classList.add('active');trigger.setAttribute('aria-current','page');if(matchMedia('(max-width:760px)').matches)app.classList.add('side-closed');refresh();search.focus({preventScroll:true});}
  function hide(){page.hidden=true;app.classList.remove('gallery-mode','gallery-focus');trigger.classList.remove('active');trigger.removeAttribute('aria-current');full.replaceChildren(icon('arrows-fullscreen'));full.setAttribute('aria-pressed','false');for(const dialog of [...dialogs])if(dialog.open)dialog.close();}
  on(trigger,'click',show);on(fileInput,'change',()=>addFiles([...fileInput.files]));on(search,'input',renderAll);on(sort,'change',renderAll);on(range,'input',()=>{grid.style.setProperty('--library-tile',range.value+'px');layoutGrid();});
  const layoutObserver=new ResizeObserver(()=>{if(!page.hidden&&grid.clientWidth!==gridWidth)requestLayout();});layoutObserver.observe(grid);listeners.push(()=>layoutObserver.disconnect());
  on(selectAll,'change',()=>{for(const image of filtered()){if(selectAll.checked)selected.add(image.id);else selected.delete(image.id);}renderAll();selectAll.focus();});
  on(page,'dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();page.classList.add('library-drop');event.dataTransfer.dropEffect='copy';}});on(page,'dragleave',event=>{if(!page.contains(event.relatedTarget))page.classList.remove('library-drop');});on(page,'drop',event=>{event.preventDefault();page.classList.remove('library-drop');const files=[...event.dataTransfer.files].filter(file=>file.type.startsWith('image/'));if(files.length)addFiles(files);else toast('請拖入圖片檔案');});
  on(window,'yozu-gallery-changed',()=>{if(!busy)refresh();});
  on(mobile,'change',()=>{if(!mobile.matches&&detailDialog.open)detailDialog.close();});
  for(const type of ['keydown','copy','cut','paste'])on(window,type,event=>{
    if(page.hidden||event.target.closest?.('dialog')&&!ownDialog(event.target))return;
    if(type==='paste'){const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();addFiles(files);}}
    if(type==='keydown'&&!event.target.closest?.('input,textarea,select,dialog')){
      if(event.key==='Escape'&&selectionMode){selected.clear();selectionMode=false;renderAll();event.preventDefault();}
      if(['ArrowLeft','ArrowRight'].includes(event.key)){const visible=filtered(),index=visible.findIndex(image=>image.id===focusedId),next=visible[index+(event.key==='ArrowRight'?1:-1)];if(next){event.preventDefault();focusImage(next.id);grid.querySelector(`[data-image-id="${CSS.escape(next.id)}"] .library-open`)?.focus({preventScroll:true});}}
    }
    event.stopPropagation();
  },true);
  return {show,hide,refresh,isOpen:()=>!page.hidden,isBusy:()=>busy||loading,destroy(){disposed=true;if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);listeners.forEach(remove=>remove());dialogs.forEach(dialog=>dialog.remove());page.remove();app.classList.remove('gallery-mode','gallery-focus');}};
}
