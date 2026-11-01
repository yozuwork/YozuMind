import {BLOCK_TYPES,listNotes,saveNote,removeNotes,noteExcerpt} from './notes.js';
import {activeWorkspaceId,workspaceOf} from './workspaces.js';
import './notes.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};
const button=(label,cls,fn,ic)=>{const node=el('button',cls);node.type='button';node.title=label;node.setAttribute('aria-label',label);if(ic)node.append(icon(ic));node.append(el('span','',label));node.addEventListener('click',fn);return node;};
const types={text:'文字',heading:'大標題',subheading:'小標題',bullet:'項目清單',todo:'待辦事項',quote:'引言',divider:'分隔線'};
const date=value=>new Intl.DateTimeFormat('zh-TW',{month:'short',day:'numeric'}).format(value);

export function setupNotesPage({app,trigger,uid,toast,canEdit,beforeOpen,toggleSidebar,getBacklinks,onLocate,onInsert}) {
  let notes=[],selected=null,draft=null,workspace=activeWorkspaceId(),filter='all',timer,version=0,savedVersion=0,saveQueue=Promise.resolve(),loading=false,disposed=false,picker=null;
  const page=el('section','notes-page');page.hidden=true;page.setAttribute('aria-label','筆記專區');app.querySelector('.main').append(page);
  const top=el('header','notes-top'),side=button('開啟側欄','icon-btn',toggleSidebar,'list'),crumb=el('span','notes-crumb','收藏 / 筆記專區');
  const back=button('返回畫布','btn btn-ghost',()=>hide(),'arrow-left');top.append(side,crumb,back);
  const layout=el('div','notes-layout'),index=el('aside','notes-index'),indexHead=el('div','notes-index-head');
  indexHead.append(el('span','notes-eyebrow','寫下想法，連起脈絡'),el('h1','','筆記專區'));
  const create=button('新增筆記','btn notes-primary',()=>createNote(),'plus-lg');create.disabled=!canEdit();indexHead.append(create);
  const searchBox=el('label','notes-search');searchBox.append(icon('search'));const search=el('input');search.type='search';search.placeholder='搜尋標題或內容';search.setAttribute('aria-label','搜尋筆記');searchBox.append(search);
  const filters=el('div','notes-filters');filters.setAttribute('aria-label','筆記篩選');
  const all=button('全部','',()=>{filter='all';renderIndex();}),favorites=button('收藏','',()=>{filter='favorites';renderIndex();},'star');filters.append(all,favorites);
  const count=el('p','notes-count');count.setAttribute('role','status');const list=el('div','notes-list');
  index.append(indexHead,searchBox,filters,count,list);
  const editor=el('section','notes-editor');editor.setAttribute('aria-label','筆記編輯器');layout.append(index,editor);page.append(top,layout);
  const status=el('button','notes-save-status');status.type='button';status.setAttribute('aria-live','polite');

  function localEvent(event) {
    if((!page.hidden||picker?.contains(event.target))&&!event.target.closest?.('dialog:not(.notes-picker):not(.notes-confirm)')){
      if(event.type==='keydown'&&event.target.closest?.('input,textarea'))return;
      event.stopPropagation();
    }
  }
  // Stop canvas shortcuts at the window boundary without disabling text editing or native clipboard actions.
  for(const type of ['keydown','copy','cut','paste'])window.addEventListener(type,localEvent,true);
  function visibleNotes(){const q=search.value.trim().toLocaleLowerCase();return notes.filter(note=>(filter!=='favorites'||note.favorite)&&(!q||[note.title,...note.blocks.map(block=>block.text)].join(' ').toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updatedAt-a.updatedAt);}
  function renderIndex(){
    create.disabled=!canEdit();
    all.classList.toggle('active',filter==='all');favorites.classList.toggle('active',filter==='favorites');all.setAttribute('aria-pressed',String(filter==='all'));favorites.setAttribute('aria-pressed',String(filter==='favorites'));
    const found=visibleNotes();count.textContent=loading?'正在載入筆記…':`${found.length} 篇筆記`;list.replaceChildren();
    if(!found.length){const empty=el('div','notes-index-empty');empty.append(icon(search.value?'search':'journal-text'),el('strong','',search.value?'沒有符合的筆記':filter==='favorites'?'還沒有收藏':'留一頁給新的想法'),el('p','',search.value?'試試其他關鍵字':filter==='favorites'?'點亮筆記上的星星，讓它更好找。':'建立筆記，再將它關聯到畫布上的卡片。'));list.append(empty);}
    for(const note of found){
      const row=button(note.title||'未命名筆記','notes-list-item',()=>open(note.id));row.dataset.noteId=note.id;row.replaceChildren();row.classList.toggle('selected',selected===note.id);if(selected===note.id)row.setAttribute('aria-current','page');
      const title=el('div','notes-list-title');title.append(icon('file-earmark-text'),el('strong','',note.title||'未命名筆記'));if(note.favorite)title.append(icon('star-fill'));
      const preview=el('p','notes-list-preview',noteExcerpt(note)||'還沒有內容，寫下第一個想法。'),meta=el('div','notes-list-meta');meta.append(el('time','',date(note.updatedAt)),el('span','',`${getBacklinks(note.id).length} 個關聯`));row.append(title,preview,meta);list.append(row);
    }
  }
  function updateLocal(){if(!draft)return;draft.updatedAt=Date.now();const i=notes.findIndex(note=>note.id===draft.id);if(i>=0)notes[i]=structuredClone(draft);version++;status.textContent='尚未儲存';status.classList.remove('error');renderIndex();clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),400);}
  function flush(){
    clearTimeout(timer);if(!draft||savedVersion===version)return saveQueue;
    const current=structuredClone(draft),revision=version;status.textContent='儲存中…';
    saveQueue=saveQueue.catch(()=>{}).then(()=>saveNote(current)).then(()=>{if(draft?.id===current.id&&version===revision){savedVersion=revision;status.textContent='已儲存在此瀏覽器';status.classList.remove('error');}return true;}).catch(error=>{status.textContent='儲存失敗，點此重試';status.classList.add('error');toast(error.message||'筆記儲存失敗，請重試。');throw error;});return saveQueue;
  }
  status.addEventListener('click',()=>flush().catch(()=>{}));status.setAttribute('aria-label','筆記儲存狀態，點擊重試儲存');
  function fit(field){field.style.height='auto';field.style.height=field.scrollHeight+'px';}
  function focusBlock(id){requestAnimationFrame(()=>{const field=editor.querySelector(`[data-block-id="${CSS.escape(id)}"] textarea`);field?.focus();if(field)fit(field);});}
  function renderBlocks(container){
    container.replaceChildren();if(!draft)return;
    for(const block of draft.blocks){
      const row=el('div','notes-block notes-block-'+block.type);row.dataset.blockId=block.id;
      const select=el('select','notes-block-type');select.setAttribute('aria-label','區塊類型');for(const type of BLOCK_TYPES)select.append(new Option(types[type],type));select.value=block.type;select.disabled=!canEdit();select.addEventListener('change',()=>{block.type=select.value;updateLocal();renderBlocks(container);focusBlock(block.id);});
      const controls=el('div','notes-block-controls');const up=button('上移區塊','icon-btn',()=>move(-1),'arrow-up'),down=button('下移區塊','icon-btn',()=>move(1),'arrow-down'),remove=button('刪除區塊','icon-btn',()=>{draft.blocks=draft.blocks.filter(item=>item.id!==block.id);updateLocal();renderBlocks(container);},'trash');
      function move(offset){const i=draft.blocks.indexOf(block),to=i+offset;if(to<0||to>=draft.blocks.length)return;[draft.blocks[i],draft.blocks[to]]=[draft.blocks[to],draft.blocks[i]];updateLocal();renderBlocks(container);focusBlock(block.id);}
      up.disabled=!canEdit()||draft.blocks.indexOf(block)===0;down.disabled=!canEdit()||draft.blocks.indexOf(block)===draft.blocks.length-1;remove.disabled=!canEdit();controls.append(select,up,down,remove);
      const more=el('details','notes-block-menu'),summary=el('summary');summary.setAttribute('aria-label','區塊選單');summary.title='區塊選單';summary.append(icon('grip-vertical'));more.append(summary,controls);row.append(more);
      if(block.type==='divider')row.append(el('hr'));
      else {
        if(block.type==='todo'){const check=el('input','notes-block-check');check.type='checkbox';check.checked=block.done;check.disabled=!canEdit();check.setAttribute('aria-label','完成待辦');check.addEventListener('change',()=>{block.done=check.checked;row.classList.toggle('done',block.done);updateLocal();});row.append(check);row.classList.toggle('done',block.done);}
        if(block.type==='bullet')row.append(el('span','notes-bullet','•'));
        const field=el('textarea');field.value=block.text;field.rows=1;field.maxLength=10000;field.placeholder=block.type==='text'?'寫下想法…':types[block.type];field.setAttribute('aria-label',types[block.type]);field.readOnly=!canEdit();field.addEventListener('input',()=>{block.text=field.value;fit(field);updateLocal();});
        field.addEventListener('keydown',event=>{if(event.isComposing||!canEdit())return;if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();const next={id:uid('block'),type:['heading','subheading','quote'].includes(block.type)?'text':block.type,text:'',done:false};if(draft.blocks.length>=1000)return toast('每篇筆記最多 1,000 個區塊');draft.blocks.splice(draft.blocks.indexOf(block)+1,0,next);updateLocal();renderBlocks(container);focusBlock(next.id);}if(event.key==='Backspace'&&!field.value&&draft.blocks.length>1){event.preventDefault();const i=draft.blocks.indexOf(block),previous=draft.blocks[Math.max(0,i-1)];draft.blocks.splice(i,1);updateLocal();renderBlocks(container);focusBlock(previous.id);}});
        row.append(field);requestAnimationFrame(()=>{if(field.isConnected)fit(field);});
      }
      container.append(row);
    }
  }
  function renderEditor(){
    editor.replaceChildren();page.classList.toggle('has-note',!!draft);
    if(!draft){const welcome=el('div','notes-welcome');welcome.append(icon('journal-richtext'),el('span','notes-eyebrow','你的想法，有自己的位置'),el('h2','','從一篇筆記，展開更多可能'),el('p','','記錄靈感、整理計畫，或替角色補上故事。\n將筆記關聯到畫布，想法就有了脈絡。'),button('建立第一篇筆記','btn notes-primary',()=>createNote(),'plus-lg'));editor.append(welcome);return;}
    const bar=el('div','notes-editor-bar'),mobileBack=button('所有筆記','btn btn-ghost notes-mobile-back',async()=>{try{await flush();selected=null;draft=null;renderIndex();renderEditor();}catch{}},'arrow-left');
    const star=button(draft.favorite?'取消收藏':'收藏筆記','icon-btn notes-star',()=>{draft.favorite=!draft.favorite;updateLocal();renderEditor();},draft.favorite?'star-fill':'star');star.disabled=!canEdit();
    const insert=button('插入畫布','btn btn-ghost',async()=>{try{await flush();onInsert(structuredClone(draft));}catch{}},'box-arrow-in-down');insert.disabled=!canEdit();
    const remove=button('刪除筆記','icon-btn',()=>confirmDelete(),'trash');remove.disabled=!canEdit();bar.append(mobileBack,status,star,insert,remove);
    const scroll=el('div','notes-document-scroll'),document=el('article','notes-document'),heading=el('textarea','notes-document-title');heading.rows=1;heading.value=draft.title;heading.placeholder='未命名筆記';heading.maxLength=1000;heading.readOnly=!canEdit();heading.setAttribute('aria-label','筆記標題');heading.addEventListener('input',()=>{draft.title=heading.value.replace(/\n/g,' ');fit(heading);updateLocal();});heading.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();if(draft.blocks[0])focusBlock(draft.blocks[0].id);}});
    const info=el('div','notes-document-meta');info.append(icon('clock'),el('span','',`建立於 ${date(draft.createdAt)}`));const blocks=el('div','notes-blocks');renderBlocks(blocks);
    const add=el('div','notes-add-block'),type=el('select');type.setAttribute('aria-label','新增區塊類型');for(const value of BLOCK_TYPES)type.append(new Option(types[value],value));const addButton=button('新增區塊','btn btn-ghost',()=>{if(draft.blocks.length>=1000)return toast('每篇筆記最多 1,000 個區塊');const block={id:uid('block'),type:type.value,text:'',done:false};draft.blocks.push(block);updateLocal();renderBlocks(blocks);focusBlock(block.id);},'plus-lg');type.disabled=addButton.disabled=!canEdit();add.append(type,addButton);
    const links=el('section','notes-backlinks'),sources=getBacklinks(draft.id);links.append(el('h2','',`來自畫布的關聯 · ${sources.length}`));
    if(!sources.length)links.append(el('p','','在角色卡或筆記卡的工具列，選擇「關聯筆記」即可連結到這裡。'));
    for(const source of sources){const link=button(source.title,'notes-backlink',async()=>{try{await flush();onLocate(source.mapId,source.cardId);}catch{}},source.type==='character'?'person-badge':'sticky');link.append(el('small','',source.mapTitle));links.append(link);}
    document.append(el('div','notes-document-icon','▤'),heading,info,blocks,add,links);scroll.append(document);editor.append(bar,scroll);requestAnimationFrame(()=>{if(heading.isConnected)fit(heading);});
  }
  async function confirmDelete(){
    const id=draft.id,dialog=el('dialog','notes-confirm'),heading=el('h2','','刪除這篇筆記？');heading.id='notes-delete-title';dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading,el('p','',`「${draft.title||'未命名筆記'}」將從此工作區移除。畫布上的關聯會標示為已刪除，可重新選擇筆記。`));const actions=el('div','notes-dialog-actions');
    actions.append(button('取消','btn btn-ghost',()=>dialog.close()),button('刪除筆記','btn notes-danger',async()=>{try{await flush();await removeNotes([id]);notes=notes.filter(note=>note.id!==id);draft=null;selected=null;dialog.close();renderIndex();renderEditor();}catch(error){toast(error.message||'刪除失敗');}}));dialog.append(actions);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  async function refresh(){
    const target=activeWorkspaceId();loading=true;renderIndex();try{const records=await listNotes(target);if(disposed||target!==activeWorkspaceId())return;if(workspace!==target){workspace=target;draft=null;selected=null;version=savedVersion=0;}notes=records;if(draft&&workspaceOf(draft)===target){const i=notes.findIndex(note=>note.id===draft.id);if(i>=0)notes[i]=structuredClone(draft);}loading=false;renderIndex();if(!draft)renderEditor();}catch{loading=false;count.textContent='筆記載入失敗';toast('無法讀取筆記，請重新開啟專區。');}
  }
  async function show(id){try{await flush();}catch{return;}beforeOpen?.();page.hidden=false;app.classList.add('notes-mode');trigger.classList.add('active');trigger.setAttribute('aria-current','page');if(matchMedia('(max-width:760px)').matches){app.classList.add('side-closed');if(!id){draft=null;selected=null;version=savedVersion=0;}}await refresh();if(id)await open(id);else renderEditor();}
  function hide(){flush().catch(()=>{});page.hidden=true;app.classList.remove('notes-mode');trigger.classList.remove('active');trigger.removeAttribute('aria-current');}
  async function open(id){try{await flush();const note=notes.find(item=>item.id===id);if(!note)return toast('這篇筆記已刪除或不在目前工作區。');selected=id;draft=structuredClone(note);version=savedVersion=0;status.textContent='已儲存在此瀏覽器';renderIndex();renderEditor();editor.querySelector('.notes-document-title')?.focus({preventScroll:true});}catch{}}
  async function createNote(){
    if(!canEdit())return;try{await flush();const now=Date.now(),note={id:uid('note'),workspaceId:activeWorkspaceId(),title:'',blocks:[{id:uid('block'),type:'text',text:''}],createdAt:now,updatedAt:now,favorite:false};await saveNote(note);notes.unshift(note);await open(note.id);}catch(error){toast(error.message||'無法建立筆記');}
  }
  async function pick(initial=[],multiple=true){
    if(picker?.open)return null;await flush();const target=activeWorkspaceId(),records=await listNotes(target);
    return new Promise(resolve=>{
      const opener=document.activeElement,dialog=el('dialog','notes-picker');picker=dialog;dialog.setAttribute('aria-labelledby','notes-picker-title');const head=el('div','notes-picker-head');head.append(el('span','notes-eyebrow','連結你的想法'),el('h2','','選擇關聯筆記'));head.querySelector('h2').id='notes-picker-title';
      const input=el('input','notes-picker-search');input.type='search';input.placeholder='搜尋筆記';input.setAttribute('aria-label','搜尋要關聯的筆記');const results=el('div','notes-picker-results'),chosen=new Set(initial),footer=el('div','notes-dialog-actions'),cancel=button('取消','btn btn-ghost',()=>dialog.close()),apply=button('套用關聯','btn notes-primary',()=>{if(target!==activeWorkspaceId()){dialog.close();return;}resolve([...chosen].filter(id=>records.some(note=>note.id===id)));dialog.close();});
      function draw(){results.replaceChildren();const q=input.value.trim().toLocaleLowerCase(),found=records.filter(note=>(note.title+' '+noteExcerpt(note,500000)).toLocaleLowerCase().includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt);if(!found.length)results.append(el('p','notes-picker-empty',records.length?'找不到符合的筆記。':'還沒有筆記，請先到筆記專區建立。'));for(const note of found){const label=el('label','notes-picker-item'),check=el('input');check.type=multiple?'checkbox':'radio';check.name='related-note';check.checked=chosen.has(note.id);check.addEventListener('change',()=>{if(multiple&&check.checked&&chosen.size>=100){check.checked=false;toast('每張卡片最多關聯 100 篇筆記');return;}if(!multiple)chosen.clear();check.checked?chosen.add(note.id):chosen.delete(note.id);apply.disabled=!multiple&&!chosen.size;});const copy=el('div');copy.append(el('strong','',note.title||'未命名筆記'),el('p','',noteExcerpt(note)||'尚無內容'));label.append(check,icon('file-earmark-text'),copy);results.append(label);}}
      apply.disabled=!multiple&&!chosen.size;footer.append(cancel,apply);dialog.append(head,input,results,footer);input.addEventListener('input',draw);dialog.addEventListener('close',()=>{resolve(null);dialog.remove();if(picker===dialog)picker=null;if(opener?.isConnected)opener.focus({preventScroll:true});});document.body.append(dialog);draw();dialog.showModal();
    });
  }
  const onTrigger=()=>show();trigger.addEventListener('click',onTrigger);search.addEventListener('input',renderIndex);
  let wasMobile=matchMedia('(max-width:760px)').matches;
  const resize=()=>{const mobile=matchMedia('(max-width:760px)').matches;if(!page.hidden){if(mobile&&!wasMobile)app.classList.add('side-closed');editor.querySelectorAll('textarea').forEach(fit);}wasMobile=mobile;};window.addEventListener('resize',resize);
  const unload=event=>{if(version!==savedVersion){flush().catch(()=>{});event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);
  return {show,hide,refresh,flush,pick,isOpen:()=>!page.hidden,destroy(){disposed=true;flush().catch(()=>{});clearTimeout(timer);page.remove();picker?.close();app.classList.remove('notes-mode');trigger.removeEventListener('click',onTrigger);window.removeEventListener('resize',resize);window.removeEventListener('beforeunload',unload);for(const type of ['keydown','copy','cut','paste'])window.removeEventListener(type,localEvent,true);}};
}
