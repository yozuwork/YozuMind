// Milanote-style cards floating on the canvas. Columns and folders hold other cards; notes can embed page cards.
// A "board" card links to its own page (a separate map) and can be resized, framed and nested.
import { readImageFile } from './canvas-assets.js';
import { characterProgress, characterStages, characterStage, setCharacterImage, stageXp,characterSourceCards } from './character.js';
import {listStagePresets,saveStagePreset,applyStagePreset,sameStageContent} from './stage-presets.js';
import {setupCharacterTodoDrawer} from './character-todo-drawer.js';
import {setupCharacterPicker} from './character-picker.js';
import { FILE_KINDS, MAX_ATTACHMENT_BYTES, fileKind, formatSize, getFile, putFile } from './attachments.js';

const bi = name => `<i class="bi bi-${name}" aria-hidden="true"></i>`;
// Sticky-note colors; the default follows the theme tokens.
export const NOTE_COLORS = { yellow:['#ffe98f','黃'], orange:['#ffd0a1','橘'], red:['#ffb8b8','紅'], pink:['#ffc7e3','粉紅'], purple:['#ddd0ff','紫'], blue:['#c4ddff','藍'], teal:['#b8ecdf','青'], green:['#cfeeb3','綠'], gray:['#e2e5e9','灰'], white:['#ffffff','白'] };
// Sticky-note icon; `color` is a NOTE_COLORS key, otherwise it follows the theme.
export function stickyIcon(color, size=22) {
  const hex=NOTE_COLORS[color]?.[0];
  return `<svg class="sticky-icon${hex?' tinted':''}"${hex?` style="--sc:${hex}"`:''} viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path class="paper" d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v10.3L15.3 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path class="fold" d="M20.5 15.3h-3.7a1.5 1.5 0 0 0-1.5 1.5v3.7z"/></svg>`;
}
// Folder icon colors; the default follows the theme tokens.
export const FOLDER_COLORS = { orange:['#f59e0b','橘'], red:['#ef5b5b','紅'], pink:['#ec6fae','粉紅'], purple:['#9b7be8','紫'], blue:['#4a90e2','藍'], teal:['#22b0a0','青'], green:['#56b65a','綠'], gray:['#9aa3ad','灰'] };
export function folderIcon(color, size=22) {
  const hex=FOLDER_COLORS[color]?.[0];
  return `<svg class="folder-icon"${hex?` style="--fc:${hex};--fc-back:color-mix(in srgb, ${hex} 72%, #000)"`:''} viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path class="back" d="M2 6a2 2 0 0 1 2-2h5.2l2 2H20a2 2 0 0 1 2 2v2H2z"/><rect class="paper" x="4" y="7.5" width="16" height="6" rx="1"/><path class="front" d="M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>`;
}
export const FOLDER_ICON = folderIcon();
// [type, label, icon html] in rail order; "mindmap" adds another mind-map tree to the board.
export const RAIL_TOOLS = [
  ['character','角色卡',bi('person-badge')],
  ['note','筆記',bi('sticky')], ['link','連結',bi('link-45deg')], ['todo','待辦清單',bi('list-check')], ['column','欄位',bi('card-heading')],
  ['mindmap','心智圖',bi('diagram-3')], ['board','獨立頁面',bi('folder')],
];
const TOOL_INFO = Object.fromEntries(RAIL_TOOLS.map(([type,label,icon])=>[type,{label,icon}]));
const CONTAINERS = ['column','folder'];
// Content cards use a minimum height so resizing never cuts off their content.
const SIZED = ['note','column','character'];
const MIN_SIZE = {board:[100,90], note:[140,48], column:[200,60], character:[200,280]};
// A note line starting with "[ ]" or "[x]" renders as a checkable to-do.
const TODO_LINE = /^\s*\[( |x|X)\]\s?(.*)$/;
// Lines between ``` fences render as a highlighted code block; the opening fence may name the language.
const FENCE = /^\s*```\s*([\w#+.-]*)\s*$/;
const KEYWORDS = new Set('const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false def elif lambda pass None True False self public private protected static void int string bool select where and or not as with yield'.split(' '));
const TOKEN = /(\/\/.*|\/\*.*?\*\/|#(?![\w-]*\().*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(=>|[{}()[\]])/g;
// A tiny line-based highlighter: good enough for JS/TS/JSON/Python/SQL snippets without pulling in a library.
function highlightCode(line) {
  const out=[]; let last=0, m;
  const push=(text,cls)=>{ if(text) out.push(cls ? h('span',cls,text) : document.createTextNode(text)); };
  TOKEN.lastIndex=0;
  while((m=TOKEN.exec(line))) {
    push(line.slice(last,m.index));
    const [t,comment,str,num,word]=m, rest=line.slice(TOKEN.lastIndex);
    let cls='tk-punc';
    if(comment) cls='tk-comment'; else if(str) cls=/^\s*:(?!:)/.test(rest)?'tk-prop':'tk-str'; else if(num) cls='tk-num';
    else if(word) cls=KEYWORDS.has(word)?'tk-kw' : /^\s*:(?!:)/.test(rest)&&!/\?[^:]*$/.test(line.slice(0,m.index))?'tk-prop' : /^\s*\(/.test(rest)?'tk-fn' : /^\s*\)?\s*=>/.test(rest)?'tk-param' : /^[A-Z]/.test(word)?'tk-type' : '';
    push(t,cls); last=TOKEN.lastIndex;
  }
  push(line.slice(last)); return out;
}
// Splits note text into prose and fenced code segments; their lines joined with '\n' give back the text.
function noteSegments(text) {
  const segs=[]; let code=null, prose=null;
  for(const line of text.split('\n')) {
    const f=FENCE.exec(line);
    if(code) { if(f && !f[1]) code=null; else code.body.push(line); continue; }
    if(f) { code={kind:'code', lang:f[1], body:[]}; segs.push(code); prose=null; continue; }
    if(!prose) { prose={kind:'text', lines:[]}; segs.push(prose); }
    prose.lines.push(line);
  }
  return segs;
}
// Paints highlighted, numbered lines; used for the editor's backdrop under a transparent textarea.
function paintCode(body, text) {
  body.replaceChildren(...text.split('\n').map((line,n)=>{
    const row=h('div','code-line'), span=h('span','code-text');
    if(line) span.append(...highlightCode(line)); else span.textContent='\u200b';
    row.append(h('span','code-num',String(n+1)),span); return row;
  }));
}
// The note text back from the editor: prose fields as typed, code blocks re-fenced; empty helper fields drop out.
function editorText(box) {
  const parts=[];
  for(const el of box.children) {
    if(el.tagName==='TEXTAREA') { if(el.dataset.extra===undefined || el.value) parts.push(el.value); }
    else parts.push('```'+el.querySelector('.code-lang-input').value, el.querySelector('.code-input').value, '```');
  }
  return parts.join('\n');
}
const nestable = type => !CONTAINERS.includes(type) && type!=='mindmap';
// Columns and folders take any nestable card; a note only embeds page cards.
const accepts = (box, type) => CONTAINERS.includes(box) ? nestable(type) : box==='note' && type==='board';

const h = (tag, cls, text) => { const el=document.createElement(tag); if(cls) el.className=cls; if(text!=null) el.textContent=text; return el; };
const icon = name => { const i=h('i','bi bi-'+name); i.setAttribute('aria-hidden','true'); return i; };
const textBlock = (cls, value, placeholder) => value ? h('div',cls,value) : h('div',cls+' ph',placeholder);
function field(tag, cls, value, placeholder, data) {
  const el=h(tag,'card-input '+cls); el.value=value||''; el.placeholder=placeholder; Object.assign(el.dataset,data);
  if(tag==='textarea') el.rows=1; return el;
}
function button(cls, label, content, data) {
  const b=h('button',cls); b.type='button'; b.title=label; b.setAttribute('aria-label',label); Object.assign(b.dataset,data);
  if(typeof content==='string') b.innerHTML=content; else b.append(content); return b;
}
function autosize(el) { el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
export function safeUrl(value) {
  if(!value) return null;
  try { const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(value)?value:'https://'+value); return /^https?:$/.test(url.protocol)?url.href:null; } catch { return null; }
}
const hostOf = href => href ? new URL(href).hostname.replace(/^www\./,'') : '';

export function setupCards({ canvas, world, rail, getMap, getMaps, locateTodo, getView, uid, snapshot, dropSnapshot, save, toast, canEdit, clearSelection, hasNodeSelection, createTree, nextZ, isHidden, moved, pinStart, hostOf, nodeAction, createPage, pageInfo, openPage, viewPage, renamePage, pagesChanged, chooseGallery, getNote, openNote, onChange }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const layer = h('div','card-layer'); world.append(layer);
  const picker = h('input'); picker.type='file'; picker.accept='image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif'; picker.multiple=true; picker.hidden=true; document.body.append(picker);
  let selected=null, editing=null, editFresh=false, editBefore='', drag=null, resize=null, tool=null, mapId=null, colorOpen=null, viewOpen=null, pickFor=null;
  let characterMenu=null;
  const imageHover={over:null};
  const availableMaps=()=>getMaps?.()||(getMap()?[getMap()]:[]);
  const sourceCards=card=>characterSourceCards(card,getMap(),availableMaps());
  const currentStage = card => characterStage(card,characterProgress(card,sourceCards(card)).level);
  const setPortrait = (card,src) => setCharacterImage(card,characterProgress(card,sourceCards(card)).level,src);
  let stageDialog=null;
  const characterPicker=setupCharacterPicker({getMap,getMaps:availableMaps,getCard:id=>locate(getMap(),id)?.card,canEdit,onApply:(card,source)=>{
    snapshot();card.stages=structuredClone(characterStages(source));card.title=source.title||card.stages[0].name||'';delete card.src;save(getMap().id);refresh(true);toast('已套用角色與成長階段');
  }});
  const todoDrawer=setupCharacterTodoDrawer({getMap,getMaps:availableMaps,getCard:id=>locate(getMap(),id)?.card,canEdit,
    onUpdate:(card,changes)=>{const map=getMap();if(!map||locate(map,card.id)?.card!==card||!canEdit())return;snapshot();Object.assign(card,changes);save(map.id);refresh(true);},
    onLocate:(mapId,id)=>locateTodo?.(mapId,id),onOpenChange:()=>refresh(true)
  });
  function openTodoLinks(card){if(!canEdit())return;if(editing)commit();clearSelection();selected=card.id;todoDrawer.open(card.id);}
  // Keep canvas shortcuts and clipboard handlers out of the stage editor.
  for(const type of ['keydown','copy','cut','paste']) on(window,type,e=>{
    if(stageDialog?.open && stageDialog.contains(e.target)) {
      if(type==='paste') {
        const files=[...(e.clipboardData?.files||[])].filter(file=>file.type.startsWith('image/'));
        if(!files.length) files.push(...[...(e.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean));
        if(files.length) {e.preventDefault();stageDialog.pasteImage(files[0],e.target);}
      }
      e.stopPropagation();
    }
  },true);
  function openStages(card) {
    if(editing) commit();
    stageDialog?.remove();
    const map=getMap(), draft=structuredClone(characterStages(card)).map(stage=>({...stage,xpPerLevel:stageXp(stage)})), original=JSON.stringify(draft), opener=document.activeElement;
    const dialog=h('dialog','character-stage-dialog'), form=h('form'), list=h('div','character-stage-list');
    dialog.setAttribute('aria-labelledby','character-stage-title');
    dialog.setAttribute('aria-describedby','character-stage-intro');
    form.noValidate=true;
    stageDialog=dialog;
    let uploads=0;
    let activeStage=0;
    let presets=[],presetsLoaded=false;
    function fillPresets(select) {select.replaceChildren(new Option(presets.length?'從常用階段套用…':'尚未收藏常用階段',''),...presets.map(preset=>{const option=new Option(preset.name,preset.id);option.dataset.name=preset.name;return option;}));select.disabled=!presets.length;}
    function syncPresetStates(){for(const row of list.children)row.syncPresetState?.();}
    dialog.addEventListener('focusin',event=>{const row=event.target.closest('.character-stage-row');if(row) activeStage=[...list.children].indexOf(row);});
    dialog.pasteImage=(file,target)=>{
      const row=target.closest('.character-stage-row')||list.children[activeStage]||list.firstElementChild;
      row?.querySelector('.character-stage-image-section')?.receiveImage(file);
    };
    const error=h('p','character-stage-error'); error.setAttribute('role','alert');
    error.id='character-stage-error'; error.hidden=true;
    const header=h('header','character-stage-header'), heading=h('div'), title=h('h2','','角色階段設定'); title.id='character-stage-title';
    heading.append(h('span','character-stage-eyebrow','角色成長'),title,h('p','character-stage-subtitle',currentStage(card).name||'我的角色'));
    const close=button('icon-btn','關閉階段設定',icon('x-lg')); close.autofocus=true; close.addEventListener('click',()=>dialog.close());
    const headerActions=h('div','character-stage-header-actions'),addTop=button('btn btn-ghost character-stage-add-top','新增階段',h('span','','新增階段'));addTop.prepend(icon('plus-lg'));headerActions.append(addTop,close);header.append(heading,headerActions);
    const content=h('div','character-stage-content'), intro=h('p','character-stage-intro','為每個成長階段設定專屬樣貌與升級所需 XP。到達指定等級後，角色會自動切換階段並使用該階段的升級經驗值。'); intro.id='character-stage-intro';
    const count=h('span','character-stage-count'), section=h('div','character-stage-section'); section.append(h('h3','','成長階段'),count);
    const status=h('span','character-stage-status','尚無變更'); status.setAttribute('role','status');
    const clearError=()=>{error.hidden=true;error.textContent='';};
    function changed() {clearError();status.textContent=uploads?'圖片處理中…':JSON.stringify(draft)===original?'尚無變更':'有未儲存的變更';syncPresetStates();}
    function showError(message) {error.hidden=false;error.textContent=message;}
    content.append(intro,section,list); form.append(header,content);
    function renderStages(focusIndex=null) {
      const open=new Set([...list.children].flatMap((el,i)=>el.open?[i]:[]));
      list.replaceChildren();
      count.textContent=`${draft.length} / 100`;
      addTop.disabled=add.disabled=draft.length>=100;
      draft.forEach((stage,index)=>{
        const row=h('details','character-stage-row'); row.open=focusIndex===index || open.has(index);
        const summary=h('summary','character-stage-summary'), number=h('span','character-stage-number',String(index+1)), summaryText=h('div','character-stage-summary-text'), name=h('span','character-stage-name',stage.name||`階段 ${index+1}`), level=h('span','character-stage-level',`Lv. ${stage.level} 起${index===0?' · 初始階段':''}`);
        const thumb=h('span','character-stage-summary-thumb');
        if(stage.src){const img=h('img');img.src=stage.src;img.alt='';img.loading='lazy';thumb.append(img);}else thumb.append(icon('image'));
        summaryText.append(name,level); summary.append(number,summaryText,thumb,icon('chevron-down')); row.append(summary);
        const fields=h('div','character-stage-fields'); row.append(fields);
        const presetBox=h('div','character-stage-preset'),presetLabel=h('label','','套用常用階段'),presetSelect=h('select');presetSelect.id=`character-stage-${index}-preset`;presetSelect.dataset.stagePresets='';presetLabel.htmlFor=presetSelect.id;fillPresets(presetSelect);
        presetSelect.addEventListener('change',()=>{const preset=presets.find(item=>item.id===presetSelect.value);if(!preset)return;if(sameStageContent(stage,preset.stage)){syncPresetStates();return;}Object.assign(stage,applyStagePreset(stage,preset));renderStages(index);changed();list.children[index]?.querySelector('[data-stage-presets]')?.focus({preventScroll:true});});
        presetBox.append(presetLabel,presetSelect,h('span','character-stage-helper','套用名稱、圖片、說明與升級 XP，保留目前的起始等級。'));fields.append(presetBox);
        function input(labelText,key,type='text') {
          const wrap=h('div','character-stage-field'), label=h('label','',labelText), input=h(type==='textarea'?'textarea':'input');
          input.id=`character-stage-${index}-${key}`; label.htmlFor=input.id; input.dataset.stageField=key;
          if(type!=='textarea') input.type=type;
          input.value=stage[key]??'';
          if(type==='number') { input.min=1; input.max=key==='xpPerLevel'?1000000:100000; input.step=1; input.required=true; input.inputMode='numeric'; if(index===0&&key==='level') input.readOnly=true; }
          else input.maxLength=key==='name'?1000:10000;
          if(key==='name') input.placeholder='例如：見習冒險者';
          if(key==='description') {input.placeholder='描述這個階段的角色故事或成長目標';input.rows=3;}
          const helper=h('span','character-stage-helper',key==='xpPerLevel'?'此階段每升一級需累積的 XP。每完成一項待辦獲得 10 XP；進入下一階段後改用下一階段設定。':type==='number'?(index===0?'第一階段固定從等級 1 開始':'需高於前一階段的起始等級'):key==='description'?'選填，會顯示在角色圖片下方':'顯示在角色卡片頂部');
          helper.id=input.id+'-help'; input.setAttribute('aria-describedby',helper.id);
          input.addEventListener('input',()=>{stage[key]=type==='number'?Number(input.value):input.value; input.removeAttribute('aria-invalid'); if(key==='name') name.textContent=input.value||`階段 ${index+1}`; if(key==='level') level.textContent=`Lv. ${input.value||'—'} 起`; changed();});
          wrap.append(label,input,helper); fields.append(wrap);
        }
        input('名稱','name'); input('起始等級','level','number'); input('每升一級所需 XP','xpPerLevel','number');
        const imageSection=h('div','character-stage-image-section'); imageSection.append(h('span','character-stage-field-label','階段圖片'));
        const preview=h('div','character-stage-image');preview.tabIndex=0;preview.setAttribute('role','group');preview.setAttribute('aria-label',`階段 ${index+1} 圖片，選取後可貼上圖片`);
        if(stage.src) { const img=h('img','character-stage-preview'); img.src=stage.src; img.alt=stage.name||`階段 ${index+1}`; preview.append(img); }
        else {preview.append(icon('image'),h('span','','點此後可直接貼上圖片'));}
        imageSection.append(preview);
        const upload=h('input'); upload.type='file'; upload.accept=picker.accept; upload.hidden=true;
        const imageControls=h('div','character-stage-image-controls'), choose=button('btn btn-ghost',stage.src?'更換階段圖片':'上傳階段圖片',h('span','',stage.src?'更換圖片':'上傳圖片'));
        choose.addEventListener('click',()=>upload.click());
        async function receiveImage(file) {
          if(!file||imageSection.getAttribute('aria-busy')==='true') return;
          choose.disabled=true; choose.textContent='處理中…'; imageSection.setAttribute('aria-busy','true'); uploads++; changed();
          try { const {src}=await readImageFile(file); stage.src=src; const currentIndex=draft.indexOf(stage); if(dialog.isConnected&&currentIndex>=0) {renderStages(currentIndex); list.children[currentIndex]?.querySelector('.character-stage-image')?.focus({preventScroll:true});} }
          catch(err) { showError(err.message); choose.disabled=false; choose.textContent=stage.src?'更換圖片':'上傳圖片'; }
          finally { uploads--; imageSection.removeAttribute('aria-busy'); status.textContent=uploads?'圖片處理中…':'有未儲存的變更'; }
        }
        imageSection.receiveImage=receiveImage;
        upload.addEventListener('change',()=>receiveImage(upload.files[0])); imageControls.append(choose,upload);
        if(chooseGallery) {
          const library=button('btn btn-ghost character-stage-gallery','從圖庫選擇階段圖片',h('span','','從圖庫選擇'));library.prepend(icon('images'));
          library.addEventListener('click',()=>chooseGallery(image=>{
            if(!dialog.isConnected || !draft.includes(stage)) return;
            stage.src=image.src;renderStages(index);changed();
            list.children[index]?.querySelector('.character-stage-gallery')?.focus({preventScroll:true});
          }));imageControls.append(library);
        }
        if(stage.src) { const removeImage=button('btn btn-ghost','移除階段圖片',h('span','','移除')); removeImage.addEventListener('click',()=>{stage.src='';renderStages(index);changed();list.children[index]?.querySelector('.character-stage-image-controls button')?.focus({preventScroll:true});}); imageControls.append(removeImage); }
        imageSection.append(imageControls,h('span','character-stage-helper','可直接貼上圖片，或上傳、從圖庫選擇。支援 PNG、JPEG、WebP 等格式，匯入時會自動最佳化。')); fields.append(imageSection);
        input('說明文字','description','textarea');
        const favorite=button('btn btn-ghost character-stage-favorite','存為常用階段',h('span','','存為常用階段'));favorite.prepend(icon('bookmark-plus'));
        let savingPreset=false;
        row.syncPresetState=()=>{
          const matches=new Set(presets.filter(preset=>sameStageContent(stage,preset.stage)).map(preset=>preset.id)),match=matches.values().next().value;
          for(const option of presetSelect.options){if(option.value){const applied=matches.has(option.value),label=option.dataset.name+(applied?'（已套用）':'');if(option.textContent!==label)option.textContent=label;if(option.disabled!==applied)option.disabled=applied;}}
          presetSelect.value=match||'';
          const label=savingPreset?'儲存中…':match?'已套用常用階段':'存為常用階段';favorite.disabled=savingPreset||!presetsLoaded||!!match;favorite.title=label;favorite.setAttribute('aria-label',label);favorite.setAttribute('aria-busy',String(savingPreset));favorite.classList.toggle('is-applied',!!match);favorite.querySelector('span').textContent=label;favorite.querySelector('i').className='bi bi-'+(match?'bookmark-check-fill':'bookmark-plus');
        };
        favorite.addEventListener('click',async()=>{if(savingPreset||presets.some(preset=>sameStageContent(stage,preset.stage)))return;savingPreset=true;syncPresetStates();try{await saveStagePreset(stage,uid);presets=await listStagePresets();dialog.querySelectorAll('[data-stage-presets]').forEach(fillPresets);toast('已存為常用階段');}catch(error){showError(error.message||'收藏失敗，請重試。');}finally{savingPreset=false;syncPresetStates();}});fields.append(favorite);row.syncPresetState();
        if(index>0) { const remove=button('btn btn-ghost character-stage-delete',`刪除階段 ${index+1}`,h('span','','刪除此階段')); remove.prepend(icon('trash')); remove.addEventListener('click',()=>{draft.splice(index,1);renderStages(Math.max(0,index-1));changed();list.children[Math.max(0,index-1)]?.querySelector('summary')?.focus();}); fields.append(remove); }
        list.append(row);
      });
      if(focusIndex!==null) list.children[focusIndex]?.querySelector('input:not([type="file"])')?.focus({preventScroll:true});
    }
    const controls=h('footer','character-stage-controls'), actions=h('div','character-stage-actions');
    const add=button('btn btn-ghost character-stage-add','新增階段',h('span','','新增階段')); add.prepend(icon('plus-lg'));
    function addStage(){if(draft.length>=100) {showError('最多可設定 100 個階段');return;} draft.push({level:Math.max(...draft.map(s=>s.level||1))+1,xpPerLevel:100,name:'',src:'',description:''});renderStages(draft.length-1);changed();list.lastElementChild?.scrollIntoView({block:'nearest'});}
    add.addEventListener('click',addStage);addTop.addEventListener('click',addStage);
    content.append(add);
    const cancel=button('btn btn-ghost','取消',h('span','','取消')); cancel.addEventListener('click',()=>dialog.close());
    const submit=h('button','btn character-stage-save','儲存變更'); submit.type='submit'; actions.append(cancel,submit); controls.append(error,status,actions); form.append(controls);
    form.addEventListener('submit',e=>{
      e.preventDefault();
      if(uploads) {showError('圖片處理中，請稍候再儲存。');return;}
      const invalid=draft.findIndex((s,i)=>!Number.isInteger(s.level)||s.level<1||s.level>100000||(i>0&&s.level<=draft[i-1].level));
      if(invalid>=0) {showError('起始等級須為 1～100000 的整數，並高於前一階段。'); const row=list.children[invalid]; row.open=true; const input=row.querySelector('[data-stage-field="level"]'); input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',input.id+'-help character-stage-error');input.focus();return;}
      const invalidXp=draft.findIndex(stage=>!Number.isInteger(stage.xpPerLevel)||stage.xpPerLevel<1||stage.xpPerLevel>1000000);
      if(invalidXp>=0) {showError('每升一級所需 XP 須為 1～1000000 的整數。');const row=list.children[invalidXp];row.open=true;const input=row.querySelector('[data-stage-field="xpPerLevel"]');input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',input.id+'-help character-stage-error');input.focus();return;}
      if(getMap()!==map || !canEdit() || locate(map,card.id)?.card!==card) {dialog.close();return;}
      if(JSON.stringify(draft)!==original) {snapshot(); card.stages=structuredClone(draft); save(map.id); refresh(true); toast('角色階段已儲存');} dialog.close();
    });
    dialog.addEventListener('close',()=>{dialog.remove();if(stageDialog===dialog) stageDialog=null;const hub=document.querySelector('.characters-page:not([hidden])');if(hub){const target=hub.querySelector(`[data-character-id="${CSS.escape(card.id)}"] .characters-profile-actions button`)||hub.querySelector('.characters-tab.active');target?.focus({preventScroll:true});}else if(opener?.isConnected) opener.focus({preventScroll:true});else cardEl(card.id)?.querySelector('.character-menu')?.focus({preventScroll:true});});
    dialog.append(form);document.body.append(dialog);renderStages();dialog.showModal();
    listStagePresets().then(items=>{if(!dialog.isConnected)return;presets=items;presetsLoaded=true;dialog.querySelectorAll('[data-stage-presets]').forEach(fillPresets);syncPresetStates();}).catch(()=>showError('常用階段載入失敗，仍可手動編輯。'));
  }

  const pointAt = (x, y) => { const r=canvas.getBoundingClientRect(), v=getView(); return {x:(x-r.left-v.x)/v.k, y:(y-r.top-v.y)/v.k}; };
  const cardEl = id => id ? layer.querySelector(`.card[data-id="${CSS.escape(id)}"]`) : null;
  function boxOf(el) { const r=el.getBoundingClientRect(), p=pointAt(r.left,r.top), k=getView().k; return {id:el.dataset.id, x:p.x, y:p.y, w:r.width/k, h:r.height/k}; }
  function locate(map, id) {
    return (function walk(list, parent) {
      for(const [i,card] of list.entries()) {
        if(card.id===id) return {list, i, card, parent};
        const found=card.cards && walk(card.cards, card); if(found) return found;
      }
      return null;
    })(map?.cards||[], null);
  }
  const descendants = card => [card, ...(card.cards||[]).flatMap(descendants)];
  function blank(type) {
    const card={id:uid('c'), type};
    if(type==='note') card.text='';
    else if(type==='link') Object.assign(card,{url:'',title:''});
    else if(type==='todo') Object.assign(card,{title:'',items:[{id:uid('i'),text:'',done:false}]});
    else if(type==='character') Object.assign(card,{title:'',todoIds:[]});
    else if(type==='board') { const page=createPage(); if(!page) return null; Object.assign(card,{title:'',mapId:page,w:160,h:150}); }
    else Object.assign(card,{title:'',cards:[]}, type==='folder'?{open:false}:{});
    return card;
  }
  function tidy(card) {
    if(card.type==='link') card.url=safeUrl(card.url.trim())||card.url.trim();
    if(card.type==='todo') card.items=card.items.filter(item=>item.text.trim() || item.src);
    if(card.type==='note') card.text=card.text.replace(/(\n?[ \t]*\[ \][ \t]*)+$/,'');
    if('title' in card) card.title=card.title.trim();
  }

  /* ---------- render ---------- */
  function build(card, nested) {
    const edit=editing===card.id, closed=card.type==='folder' && !card.open;
    const el=h('div',`card card-${card.type}`+(card.type==='board'&&card.view?' view-'+card.view:'')+(closed?' closed':'')+(card.collapsed?' collapsed':'')+(card.frame===false?' plain':'')+(selected===card.id?' selected':'')+(edit?' editing':''));
    el.dataset.id=card.id; el.dataset.type=card.type;
    if(!nested) { el.style.left=card.x+'px'; el.style.top=card.y+'px'; el.style.zIndex=1+(card.z||0); }
    // A card pinned to a mind-map node shows a pin so the link is visible even when it sits right against the node.
    if(!nested && card.anchor && !hostOf?.(card.id)) { const pin=h('span','pin-badge'); pin.title='已掛在心智圖節點上'; pin.append(icon('pin-angle-fill')); el.append(pin); }
    // Page cards come in three layouts: tile (icon above the name), row (icon left, name right) and icon only.
    if(card.type==='board' && !card.view) { if(!nested) el.style.width=(card.w||160)+'px'; el.style.height=(card.h||150)+'px'; }
    else if(card.type==='board' && card.view==='row' && card.w && !nested) el.style.width=card.w+'px';
    else if(card.type==='character') {
      if(card.w && !nested) el.style.width=card.w+'px';
      if(card.h) {el.style.height=Math.max(MIN_SIZE.character[1],card.h)+'px';el.classList.add('character-sized');}
    }
    else if(SIZED.includes(card.type)) { if(card.w && !nested) el.style.width=card.w+'px'; if(card.h && !card.collapsed) el.style.minHeight=card.h+'px'; }
    if(card.type==='note'&&card.linkedOnly) {
      const note=getNote?.(card.noteIds?.[0]),paper=h('div','note-paper linked-note-paper');
      paper.append(h('span','linked-note-eyebrow','關聯筆記'),h('div','note-title',note?.title||'未命名筆記'),h('p','linked-note-preview',note?.blocks.filter(block=>block.type!=='divider').map(block=>block.text).filter(Boolean).join(' ').slice(0,180)||(note?'尚無內容':'筆記已刪除或無法讀取')));
      el.append(paper);
    }
    else if(card.type==='note') {
      const paper=h('div','note-paper'), color=NOTE_COLORS[card.color];
      if(card.fs) el.style.fontSize=card.fs+'px';
      if(color) { paper.style.setProperty('--nb',color[0]); paper.classList.add('tinted'); }
      // Notes have an optional title above the body.
      if(edit) paper.append(field('input','note-title-input',card.title,'標題',{field:'title'}), noteEditor(card));
      else {
        if(card.title && !card.collapsed) paper.append(h('div','note-title',card.title));
        paper.append(card.collapsed ? collapsedLine(card) : noteBody(card));
        paper.append(button('note-fold',card.collapsed?'展開筆記':'收合筆記',icon(card.collapsed?'chevron-down':'chevron-up'),{head:'collapse'}));
      }
      if(card.cards?.length && !card.collapsed) { const embeds=h('div','note-embeds'); for(const child of card.cards) embeds.append(build(child,true)); paper.append(embeds); }
      el.append(paper);
    }
    else if(card.type==='board') {
      const info=pageInfo(card.mapId), tile=h('div','board-tile'), name=info?.title||card.title||'未命名頁面';
      tile.innerHTML=folderIcon(card.color,64);
      const title=edit ? field('input','board-title',card.title,'頁面名稱',{field:'title'}) : textBlock('board-title',info?.title||card.title,'未命名頁面');
      const meta=h('div','board-meta',info?`${info.count} 個物件`:'頁面已刪除');
      if(card.view==='row') { const text=h('div','board-text'); text.append(title,meta); el.append(tile,text); }
      else if(card.view==='icon') { el.title=name; el.append(tile); if(edit) el.append(title); }
      else el.append(tile,title,meta);
    }
    else if(card.type==='file') {
      const kind=FILE_KINDS[card.kind]||FILE_KINDS.pdf, row=h('div','file-row'), badge=h('span','file-icon'), meta=h('div','file-meta');
      badge.style.setProperty('--fk',kind.color); badge.append(icon(kind.icon));
      meta.append(h('div','file-name',card.name||'未命名檔案'), h('div','file-info',`${kind.label} · ${formatSize(card.size)}`));
      row.append(badge,meta); el.append(row);
    }
    else if(card.type==='image') {
      const img=h('img','card-img'); img.alt='圖片'; img.draggable=false; img.addEventListener('load',onChange,{once:true}); img.src=card.src; el.append(img);
    }
    else if(card.type==='link') {
      if(edit) { const box=h('div','link-edit'); box.append(field('input','',card.url,'貼上網址，例如 milanote.com',{field:'url'}),field('input','',card.title,'標題（選填）',{field:'title'})); el.append(box); }
      else {
        const href=safeUrl(card.url), row=h('div','link-row'), badge=h('span','link-icon'), meta=h('div','link-meta');
        badge.append(icon('link-45deg'));
        meta.append(textBlock('link-title',card.title||hostOf(href),'新增連結'),textBlock('link-url',card.url,'點兩下貼上網址'));
        row.append(badge,meta);
        if(href) { const a=h('a','link-open'); a.href=href; a.target='_blank'; a.rel='noopener noreferrer'; a.title='在新分頁開啟'; a.setAttribute('aria-label','在新分頁開啟連結'); a.append(icon('box-arrow-up-right')); row.append(a); }
        el.append(row);
      }
    }
    else if(card.type==='character') {
      const body=h('div','character-body'), stage=currentStage(card);
      const heading=h('div','character-heading');
      heading.append(edit ? field('input','character-title',stage.name,'角色名稱',{field:'title'}) : textBlock('character-title',stage.name,'我的角色'));
      if(canEdit()) {const pick=button('character-menu','選擇現有角色',icon('person-lines-fill'),{characterPick:''});pick.setAttribute('aria-haspopup','dialog');heading.append(pick);}
      if(canEdit()) { const menu=button('character-menu','角色卡選單',icon('list'),{characterMenu:''}); menu.setAttribute('aria-expanded',String(characterMenu===card.id)); heading.append(menu); }
      body.append(heading);
      if(stage.src) { const portrait=h('div','character-portrait'), img=h('img','character-image'); img.src=stage.src; img.alt=stage.name||'角色圖片'; img.draggable=false; portrait.append(img);body.append(portrait); }
      else body.append(h('div','character-portrait character-placeholder','拖入圖片，或選取角色卡後貼上圖片'));
      if(stage.description) body.append(h('div','character-description',stage.description));
      const stats=characterProgress(card,sourceCards(card));
      body.append(h('div','character-level',`Lv. ${stats.level}`),h('div','character-xp',`${stats.xp} XP · ${stats.progress} / ${stats.required} XP`));
      const progress=h('progress','character-progress'); progress.max=stats.required; progress.value=stats.progress; progress.setAttribute('aria-label','距離下一級的經驗值'); body.append(progress);
      body.append(h('div','character-summary',`已完成 ${stats.completed} / ${stats.total} 項待辦`));
      if(canEdit()) {
        const more=button('character-more','連動待辦清單',icon('three-dots'),{characterLinks:''}); more.setAttribute('aria-expanded',String(todoDrawer.isOpen(card.id)));more.setAttribute('aria-haspopup','dialog');body.append(more);
      }
      el.append(body);
    }
    else if(card.type==='todo') {
      el.append(edit ? field('input','todo-title',card.title,'待辦清單標題',{field:'title'}) : textBlock('todo-title',card.title,'待辦清單'));
      const list=h('div','todo-list');
      for(const item of card.items) {
        const row=h('div','todo-item'+(item.done?' done':'')), check=button('todo-check',item.done?'標為未完成':'標為完成',icon('check-lg'),{check:item.id});
        row.dataset.todoItem=item.id;
        check.disabled=!canEdit(); check.setAttribute('aria-pressed',String(item.done));
        if(!item.displayOnly) row.append(check);
        else row.classList.add('display-only');
        const content=h('div','todo-content');
        content.append(edit ? field('input','todo-text',item.text,item.src?'圖片說明（選填）':'待辦事項',{item:item.id}) : textBlock('todo-text',item.text,item.src?'':'待辦事項'));
        if(item.src) { const img=h('img','todo-image'); img.src=item.src; img.alt=item.text||'待辦圖片'; img.draggable=false; content.append(img); }
        if(canEdit()) {
          const actions=h('div','todo-item-actions');
          if(!item.displayOnly) actions.append(button('','加入展示圖片',icon('image'),{todoImage:item.id}));
          if(item.src) {
            actions.append(button('',item.displayOnly?'改為圖片待辦':'改為展示圖片',icon(item.displayOnly?'list-check':'card-image'),{todoMode:item.id}));
            actions.append(button('','移除圖片',icon('x-lg'),{todoRemoveImage:item.id}));
          }
          content.append(actions);
        }
        row.append(content);
        list.append(row);
      }
      if(canEdit()) { const add=h('button','todo-add'); add.dataset.addItem=''; add.append(icon('plus-lg'),'新增項目'); list.append(add); }
      if(canEdit()) list.append(button('todo-add','新增圖片待辦',h('span','','＋ 圖片待辦'),{todoImage:''}));
      else if(!card.items.length) list.append(h('div','todo-empty','沒有項目'));
      el.append(list);
      const tasks=card.items.filter(i=>!i.displayOnly);
      if(!edit && tasks.length) el.append(h('div','todo-foot',`${tasks.filter(i=>i.done).length} / ${tasks.length} 完成`));
    }
    else if(closed) {
      const tile=h('div','folder-tile'); tile.innerHTML=FOLDER_ICON;
      el.append(tile, edit ? field('input','folder-title',card.title,'資料夾名稱',{field:'title'}) : textBlock('folder-title',card.title,'未命名資料夾'), h('div','folder-count',`${card.cards.length} 個項目`));
    }
    else {
      const head=h('div','column-head'), body=h('div','column-body'), folder=card.type==='folder';
      if(folder) { const mini=h('span','folder-mini'); mini.innerHTML=FOLDER_ICON; head.append(mini); }
      head.append(edit ? field('input','column-title',card.title,folder?'資料夾名稱':'欄位名稱',{field:'title'}) : textBlock('column-title',card.title,folder?'未命名資料夾':'未命名欄位'), h('span','column-count',String(card.cards.length)));
      if(canEdit() && !card.collapsed) head.append(button('head-btn','加入圖片',icon('image'),{head:'add-image'}));
      if(folder) head.append(button('head-btn','收合資料夾',icon('chevron-up'),{head:'folder-toggle'}));
      else head.append(button('head-btn',card.collapsed?'展開欄位':'收合欄位',icon(card.collapsed?'chevron-down':'chevron-up'),{head:'collapse'}));
      el.append(head);
      if(!card.collapsed) {
        for(const child of card.cards) body.append(build(child,true));
        if(!card.cards.length) body.append(h('div','column-empty',folder?'把筆記拖進這裡':'把卡片或圖片拖進這裡'));
        el.append(body);
      }
    }
    if(['note','character'].includes(card.type)&&card.noteIds?.length) {
      const links=h('div','card-note-links');
      for(const id of card.noteIds){const note=getNote?.(id),link=button('card-note-link',note?.title||'開啟關聯筆記',icon('journal-text'),{openNote:id});link.append(h('span','',note?(note.title||'未命名筆記'):'筆記已刪除'));links.append(link);}
      if(canEdit())links.append(button('card-note-manage','管理關聯筆記',icon('link-45deg'),{manageNotes:''}));
      (card.type==='character'?el.querySelector('.character-body'):el).append(links);
    }
    if(selected===card.id && !edit && canEdit()) {
      if((card.type==='board' && card.view!=='icon') || SIZED.includes(card.type)) { const grip=h('div','card-resize'); grip.title='拖曳調整大小'; el.append(grip); }
      if(card.type!=='character') el.append(actions(card));
    }
    return el;
  }
  // A collapsed note shows only its first non-empty line.
  function collapsedLine(card) {
    const lines=[...(card.title?[card.title]:[]), ...(card.text||'').split('\n').filter(l=>l.trim() && !FENCE.test(l))], first=lines[0]?.replace(TODO_LINE,'$2');
    const more=lines.length>1 || card.cards?.length;
    return h('div','note-text note-collapsed'+(first?'':' ph'),(first||'空白筆記')+(more?' …':''));
  }
  function noteBody(card) {
    if(!card.text) return card.title ? h('div','note-text note-empty') : h('div','note-text ph','空白筆記');
    const box=h('div','note-text');
    let code=null;
    card.text.split('\n').forEach((line,i)=>{
      const fence=FENCE.exec(line);
      if(code) { if(fence && !fence[1]) code=null; else code.add(line); return; }
      if(fence) { code=codeBlock(fence[1],i); box.append(code.el); return; }
      const m=TODO_LINE.exec(line);
      if(!m) { box.append(h('div','note-line',line||'\u200b')); return; }
      const done=m[1]!==' ', row=h('div','note-todo'+(done?' done':'')), check=button('todo-check',done?'標為未完成':'標為完成',icon('check-lg'),{noteCheck:String(i)});
      check.disabled=!canEdit(); check.setAttribute('aria-pressed',String(done));
      row.append(check,h('span','note-todo-text',m[2])); box.append(row);
    });
    return box;
  }
  // Edit mode keeps code blocks looking like code: each block gets its own highlighted editor between prose fields.
  function noteEditor(card) {
    const box=h('div','note-editor'), segs=noteSegments(card.text||'');
    if(segs[0]?.kind==='code') segs.unshift({kind:'text', lines:[''], extra:true});
    if(!segs.length || segs.at(-1).kind==='code') segs.push({kind:'text', lines:[''], extra:true});
    for(const seg of segs) {
      if(seg.kind==='text') {
        const ta=field('textarea','note-input',seg.lines.join('\n'),segs.length===1?'寫點什麼…（[ ] 開頭變成待辦，``` 加 Enter 變成程式碼）':'繼續寫…',{seg:''});
        if(seg.extra) { ta.dataset.extra=''; ta.classList.add('extra'); }
        box.append(ta); continue;
      }
      const el=h('div','note-code code-editing'), head=h('div','code-head'), lang=h('input','code-lang-input'), wrap=h('div','code-edit'), back=h('div','code-body code-back'), ta=h('textarea','code-input');
      lang.value=seg.lang; lang.placeholder='語言'; lang.dataset.lang=''; lang.spellcheck=false;
      head.append(lang, button('code-copy','移除程式碼區塊',icon('trash'),{codeRemove:''}));
      ta.value=seg.body.join('\n'); ta.dataset.seg=''; ta.dataset.code=''; ta.spellcheck=false; ta.rows=1; ta.setAttribute('aria-label','程式碼');
      paintCode(back, ta.value); wrap.append(back, ta); el.append(head, wrap); box.append(el);
    }
    return box;
  }
  // Keeps the card text and the code backdrop in step with whatever field just changed.
  function syncNote(card, f) {
    const box=f.closest('.note-editor'); if(!box) return;
    if(f.dataset.lang!==undefined) f.value=f.value.replace(/[^\w#+.-]/g,'');
    if(f.dataset.code!==undefined) paintCode(f.previousElementSibling, f.value);
    else if(f.tagName==='TEXTAREA') autosize(f);
    card.text=editorText(box); onChange();
  }
  // Re-renders the editor and puts the caret at the start of code block `k` (or the last prose field).
  function rebuildEditor(card, k) {
    // Code needs room: widen a default-width note that sits directly on the canvas.
    if(k!=null && !card.w && getMap().cards.includes(card)) card.w=380;
    render(true);
    const el=cardEl(card.id), f=k==null ? [...el.querySelectorAll('.note-input')].at(-1) : el.querySelectorAll('.code-input')[k];
    el.querySelectorAll('textarea.note-input').forEach(autosize);
    if(f) { f.focus({preventScroll:true}); const at=k==null?f.value.length:0; f.setSelectionRange(at,at); }
  }
  // PDFs open in a new tab; Word and Excel (which browsers cannot show) download.
  async function openFile(card, download) {
    const win=!download && card.kind==='pdf' ? window.open('','_blank') : null;
    const blob=await getFile(card.fileId);
    if(!blob) { win?.close(); toast('這個檔案不在此瀏覽器中，請在原本的瀏覽器匯出 JSON 後再匯入'); return; }
    const typed=card.kind==='pdf' && blob.type!=='application/pdf' ? new Blob([blob],{type:'application/pdf'}) : blob, url=URL.createObjectURL(typed);
    if(win) win.location.href=url;
    else { const a=h('a'); a.href=url; a.download=card.name||'檔案'; document.body.append(a); a.click(); a.remove(); }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function codeBlock(lang, start) {
    const el=h('div','note-code'), head=h('div','code-head'), body=h('div','code-body');
    let n=0;
    head.append(h('span','code-lang',lang||'code'), button('code-copy','複製程式碼',icon('copy'),{codeCopy:String(start)}));
    el.append(head,body);
    return { el, add(line) {
      const row=h('div','code-line'), text=h('span','code-text');
      if(line) text.append(...highlightCode(line)); else text.textContent='\u200b';
      row.append(h('span','code-num',String(++n)),text); body.append(row);
    } };
  }
  function codeAt(text, start) {
    const lines=text.split('\n'), out=[];
    for(let i=start+1;i<lines.length;i++) { const f=FENCE.exec(lines[i]); if(f && !f[1]) break; out.push(lines[i]); }
    return out.join('\n');
  }
  function actions(card) {
    const bar=h('div','card-actions');
    if(viewOpen===card.id) {
      bar.classList.add('views');
      for(const [view,label,ic] of [['tile','圖示在上','postcard'],['row','圖示在左','layout-sidebar'],['icon','只顯示圖示','folder']]) {
        const b=button('view-opt'+((card.view||'tile')===view?' on':''),label,'',{boardView:view}); b.append(icon(ic),h('span','',label)); bar.append(b);
      }
      return bar;
    }
    if(colorOpen===card.id) {
      const board=card.type==='board', palette=board?FOLDER_COLORS:NOTE_COLORS, key=board?'boardColor':'noteColor';
      bar.classList.add('colors');
      const plain=button('note-swatch'+(card.color?'':' on'),'預設（跟隨主題）','',{[key]:'default'}); if(board) plain.style.setProperty('--c','var(--folder-front)'); bar.append(plain);
      for(const [k,[hex,name]] of Object.entries(palette)) { const b=button('note-swatch'+(card.color===k?' on':''),name,'',{[key]:k}); b.style.setProperty('--c',hex); bar.append(b); }
      return bar;
    }
    if(card.type==='board') bar.append(button('','開啟頁面',icon('box-arrow-in-up-right'),{cardAct:'page'}), ...(viewPage?[button('','在側邊檢視內容',icon('layout-sidebar-reverse'),{cardAct:'view'})]:[]), button('','版面：圖示在上／在左／只顯示圖示',icon('layout-three-columns'),{cardAct:'viewLayout'}), button('',card.frame===false?'顯示外框':'隱藏外框',icon(card.frame===false?'square':'bounding-box'),{cardAct:'frame'}), button('','資料夾顏色',icon('palette'),{cardAct:'color'}));
    // A column that stands in for a mind-map node gets the node's own actions.
    const host=hostOf?.(card.id);
    if(host) bar.append(button('','新增子節點 (Tab)',icon('plus-lg'),{cardAct:'hostChild'}), button('','轉回一般節點',icon('type'),{cardAct:'hostUnwrap'}));
    if(host) {} // pinned to its node by design, no pin/unpin
    else if(card.anchor) bar.append(button('','取消掛載（不再跟著節點）',icon('pin-angle'),{cardAct:'detach'}));
    else if(pinStart && getMap().cards.includes(card)) bar.append(button('','掛到心智圖節點（再點選節點）',icon('pin-angle-fill'),{cardAct:'pin'}));
    if(card.type==='note' || card.type==='column') bar.append(button('',card.collapsed?'展開':'收合',icon(card.collapsed?'arrows-expand':'arrows-collapse'),{cardAct:'collapse'}));
    if(card.type==='folder') bar.append(button('',card.open?'收合':'開啟',icon(card.open?'folder2':'folder2-open'),{cardAct:'open'}));
    if(card.type==='note') bar.append(button('','加入待辦',icon('check2-square'),{cardAct:'todo'}), button('','插入程式碼',icon('code-slash'),{cardAct:'code'}), button('',`縮小文字（目前 ${card.fs||14}px）`,'A−',{cardAct:'fsDown'}), button('',`放大文字（目前 ${card.fs||14}px）`,'A+',{cardAct:'fsUp'}), button('','便利貼顏色',icon('palette'),{cardAct:'color'}));
    if(card.type==='file') bar.append(button('',card.kind==='pdf'?'開啟 PDF':'開啟（下載）',icon('box-arrow-up-right'),{cardAct:'fileOpen'}), button('','下載',icon('download'),{cardAct:'fileSave'}));
    if(card.type!=='image' && card.type!=='file') bar.append(button('','編輯',icon('pencil'),{cardAct:'edit'}));
    bar.append(button('','刪除',icon('trash'),{cardAct:'delete'}));
    return bar;
  }
  function render(force) {
    todoDrawer.refresh();
    characterPicker.refresh();
    const map=getMap();
    if(mapId!==map?.id) { if(editing && mapId) save(mapId); selected=null; editing=null; drag=null; mapId=map?.id; }
    if(characterMenu!==selected && characterMenu!==editing) characterMenu=null;
    rail.classList.toggle('disabled', !map || !canEdit());
    if(editing && !force && cardEl(editing)) {
      for(const el of layer.querySelectorAll('.card-character')) { const card=locate(map,el.dataset.id)?.card; if(card && card.id!==editing) el.replaceWith(build(card,!!el.parentElement.closest('.card'))); }
      return;
    }
    if(selected && (!locate(map,selected)||locate(map,selected).card.inbox)) selected=null;
    if(editing && (!locate(map,editing)||locate(map,editing).card.inbox)) editing=null;
    if(colorOpen!==selected) colorOpen=null;
    if(viewOpen!==selected) viewOpen=null;
    layer.replaceChildren(...(map?.cards||[]).filter(card=>!card.inbox&&!isHidden?.(card.id)).map(card=>build(card,false)));
  }
  function refresh(force) { render(force); onChange(); }
  function focusEditor(selector) {
    const el=cardEl(editing); if(!el) return;
    el.querySelectorAll('textarea:not(.code-input)').forEach(autosize);
    const f=selector ? el.querySelector(selector) : [...el.querySelectorAll('.note-input')].at(-1) || el.querySelector('[data-field],[data-item]');
    if(f) { f.focus({preventScroll:true}); f.setSelectionRange?.(f.value.length,f.value.length); }
  }

  /* ---------- edits ---------- */
  function create(type, at, containerId, index) {
    const map=getMap(); if(!map || !canEdit()) return;
    if(editing) commit();
    if(type==='mindmap') { if(selected) { selected=null; render(); } createTree(at); return; }
    const card=blank(type); if(!card) return;
    snapshot(); map.cards ||= [];
    const box=containerId && locate(map,containerId)?.card;
    if(box && accepts(box.type,type)) { box.cards ||= []; box.cards.splice(index ?? box.cards.length, 0, card); }
    else { card.x=Math.round(at.x); card.y=Math.round(at.y); card.z=nextZ(); map.cards.push(card); }
    clearSelection(); selected=card.id; editing=card.id; editFresh=true;
    save(map.id); refresh(true); focusEditor(type==='todo'?'[data-item]':null);
    if(type==='board') pagesChanged();
  }
  function createAtCenter(type) {
    const v=getView(), c={x:(canvas.clientWidth/2-v.x)/v.k, y:(canvas.clientHeight/2-v.y)/v.k};
    if(type==='mindmap') return create(type,null);
    const w={column:280, folder:170, board:160}[type]||240, n=(getMap()?.cards||[]).length%6;
    create(type, {x:c.x-w/2+n*24, y:c.y-60+n*24});
  }
  function startEdit(id) {
    const loc=locate(getMap(),id); if(!loc || !canEdit() || loc.card.type==='image' || loc.card.type==='file') return;
    if(loc.card.linkedOnly)return openNote?.(loc.card.noteIds?.[0]);
    if(editing) commit();
    if(loc.card.type==='board') loc.card.title=pageInfo(loc.card.mapId)?.title ?? loc.card.title;
    clearSelection(); selected=id; editing=id; editFresh=false; editBefore=JSON.stringify(loc.card);
    snapshot(); refresh(true); focusEditor();
  }
  function commit() {
    if(!editing) return; const id=editing; editing=null;
    const map=getMap(), loc=locate(map,id);
    if(loc) {
      tidy(loc.card);
      if(loc.card.type==='board') renamePage(loc.card.mapId, loc.card.title||'未命名頁面');
      if(!editFresh && JSON.stringify(loc.card)===editBefore) dropSnapshot(); else save(map.id);
    }
    refresh();
  }
  function remove(id, quiet) {
    const map=getMap(), loc=locate(map,id); if(!loc || !canEdit()) return;
    snapshot(); loc.list.splice(loc.i,1);
    const removed=descendants(loc.card), gone=new Set(removed.map(c=>c.id));
    map.relations=(map.relations||[]).filter(r=>!gone.has(r.from) && !gone.has(r.to));
    if(gone.has(editing)) editing=null;
    selected=null; save(map.id); refresh();
    if(removed.some(c=>c.type==='board')) { pagesChanged(); if(!quiet) toast('頁面卡片已移除，頁面本身移到側欄'); }
  }
  function toggleFolder(card) { card.open=!card.open; if(canEdit()) save(getMap().id); refresh(); }
  function toggleCollapse(card) { if(card.collapsed) delete card.collapsed; else card.collapsed=true; if(canEdit()) save(getMap().id); refresh(); }
  function openPageOf(card) {
    if(editing) commit();
    if(!pageInfo(card.mapId)) { toast('這個頁面已被刪除'); return; }
    openPage(card.mapId);
  }
  // Closed folders, collapsed columns and notes without embeds have no body, so drops append to the end.
  function insertIndex(box, y) {
    const body=box.querySelector(':scope > .column-body, :scope > .note-paper > .note-embeds'); if(!body) return Infinity;
    return [...body.querySelectorAll(':scope > .card:not(.dragging)')].filter(c=>{ const r=c.getBoundingClientRect(); return r.top+r.height/2<y; }).length;
  }
  function highlight(state, box) { if(state.over!==box) { state.over?.classList.remove('drop'); box?.classList.add('drop'); state.over=box; } }
  function containerAt(x, y) { return document.elementFromPoint(x,y)?.closest?.('.card-column,.card-folder') || null; }
  // The innermost card under the pointer that accepts this type (a page dropped on a note in a column lands in the note).
  function containerFor(hit, type) {
    if(type==='image') { const character=hit.closest('.card-character'); if(character) return character; }
    for(let el=hit.closest('.card'); el; el=el.parentElement?.closest('.card')) if(accepts(el.dataset.type,type)) return el;
    return null;
  }
  function dropTarget(e, type) {
    const hit=document.elementFromPoint(e.clientX,e.clientY);
    if(!hit || !canvas.contains(hit) || hit.closest('.zoombar,.asset-panel,.nodebar,.empty-state')) return null;
    return {box: containerFor(hit,type)};
  }
  function dropToast(box, card) { if(box.type==='folder' && !box.open) toast(`已放進資料夾「${box.title||'未命名資料夾'}」`); return card; }

  /* ---------- pointer: select / edit / drag ---------- */
  on(document,'pointerdown',e=>{ if(editing && !cardEl(editing)?.contains(e.target)) commit(); },true);
  on(canvas,'pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    const el=e.target.closest('.card');
    if(!el) { if(selected && !e.target.closest('.zoombar,.asset-panel')) { selected=null; render(); } return; }
    const id=el.dataset.id;
    if(e.target.closest('.card-resize') && canEdit()) {
      e.preventDefault(); const card=locate(getMap(),id)?.card;
      if(card) { const b=boxOf(el); resize={id, pointer:e.pointerId, sx:e.clientX, sy:e.clientY, w:card.w||b.w, h:card.type==='board'?card.h||b.h:b.h, min:MIN_SIZE[card.type], moved:false}; }
      return;
    }
    if(e.target.closest('a,button,input,textarea,select,summary,label')) return;
    if(!canEdit()) {
      const card=locate(getMap(),id)?.card;
      if(card?.type==='folder' && !card.open) toggleFolder(card); else if(card?.type==='board') openPageOf(card); else if(card?.type==='file') openFile(card,false);
      return;
    }
    e.preventDefault();
    canvas.focus({preventScroll:true});
    if(editing===id) return;
    if(editing) commit();
    const was=selected===id;
    if(!was) { clearSelection(); selected=id; render(); }
    drag={id, pointer:e.pointerId, sx:e.clientX, sy:e.clientY, moved:false, was, over:null};
  },true);
  function beginDrag(e) {
    const map=getMap(), loc=locate(map,drag.id), el=cardEl(drag.id);
    if(!loc || !el) { drag=null; return; }
    const b=boxOf(el); snapshot();
    loc.list.splice(loc.i,1); map.cards.push(loc.card); loc.card.z=nextZ();
    if(loc.parent) Object.assign(loc.card,{x:b.x, y:b.y});
    const p=pointAt(e.clientX,e.clientY);
    Object.assign(drag,{moved:true, map:map.id, card:loc.card, dx:p.x-b.x, dy:p.y-b.y});
    render(); drag.el=cardEl(drag.id); drag.el.classList.add('dragging');
  }
  on(window,'pointermove',e=>{
    if(resize && e.pointerId===resize.pointer) {
      const card=locate(getMap(),resize.id)?.card, el=cardEl(resize.id), k=getView().k; if(!card || !el) return;
      if(!resize.moved) { snapshot(); resize.moved=true; }
      const [minW,minH]=resize.min, nested=!!el.parentElement.closest('.card');
      if(!nested) card.w=Math.round(Math.min(1200,Math.max(minW,resize.w+(e.clientX-resize.sx)/k)));
      // A row-style page card only stretches sideways.
      if(!(card.type==='board' && card.view==='row')) card.h=Math.round(Math.min(1200,Math.max(minH,resize.h+(e.clientY-resize.sy)/k)));
      if(!nested) el.style.width=card.w+'px';
      if(card.type==='board' && card.view==='row') { onChange(); return; }
      if(card.type==='character') {el.style.height=card.h+'px';el.style.minHeight='';el.classList.add('character-sized');}
      else if(card.type==='board') el.style.height=card.h+'px'; else if(!card.collapsed) el.style.minHeight=card.h+'px';
      onChange();
      return;
    }
    if(tool && e.pointerId===tool.pointer) {
      if(!tool.ghost) {
        if(Math.hypot(e.clientX-tool.sx,e.clientY-tool.sy)<5) return;
        tool.ghost=h('div','card-ghost'); tool.ghost.innerHTML=TOOL_INFO[tool.type].icon; tool.ghost.append(TOOL_INFO[tool.type].label); document.body.append(tool.ghost);
      }
      tool.ghost.style.transform=`translate(${e.clientX-20}px,${e.clientY-16}px)`;
      highlight(tool, dropTarget(e,tool.type)?.box||null);
      return;
    }
    if(!drag || e.pointerId!==drag.pointer) return;
    if(!drag.moved) { if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<5) return; beginDrag(e); if(!drag) return; }
    const p=pointAt(e.clientX,e.clientY);
    drag.card.x=Math.round(p.x-drag.dx); drag.card.y=Math.round(p.y-drag.dy);
    drag.el.style.left=drag.card.x+'px'; drag.el.style.top=drag.card.y+'px';
    highlight(drag, nestable(drag.card.type) ? dropTarget(e,drag.card.type)?.box||null : null);
    onChange();
  });
  function end(e) {
    if(resize && e.pointerId===resize.pointer) { const r=resize; resize=null; if(r.moved) save(getMap().id); return; }
    if(tool && e.pointerId===tool.pointer) {
      const t=tool; tool=null; t.over?.classList.remove('drop');
      if(!t.ghost) { if(e.type==='pointerup') createAtCenter(t.type); return; }
      t.ghost.remove();
      const target=e.type==='pointerup' && dropTarget(e,t.type); if(!target) return;
      const p=pointAt(e.clientX,e.clientY);
      create(t.type, t.type==='mindmap' ? p : {x:p.x-20, y:p.y-16}, target.box?.dataset.id, target.box && insertIndex(target.box,e.clientY));
      return;
    }
    if(!drag || e.pointerId!==drag.pointer) return;
    const d=drag; drag=null;
    if(!d.moved) {
      if(d.was && e.type==='pointerup') {
        const card=locate(getMap(),d.id)?.card;
        if(card?.type==='folder') toggleFolder(card); else if(card?.type==='board') openPageOf(card); else startEdit(d.id);
      }
      return;
    }
    d.over?.classList.remove('drop');
    const map=getMap(); if(map?.id!==d.map) return;
    const box=d.over && locate(map,d.over.dataset.id)?.card;
    const nested=box && box!==d.card && e.type==='pointerup';
    if(nested) {
      if(box.type==='character' && d.card.type==='image') {
        setPortrait(box,d.card.src);
        map.cards.splice(map.cards.indexOf(d.card),1);
        selected=box.id;
        save(map.id); refresh(); return;
      }
      const index=insertIndex(d.over,e.clientY);
      map.cards.splice(map.cards.indexOf(d.card),1); delete d.card.x; delete d.card.y; delete d.card.z; delete d.card.anchor;
      box.cards ||= []; box.cards.splice(index,0,dropToast(box,d.card));
    }
    save(map.id); refresh();
    if(!nested && e.type==='pointerup') moved?.(d.card.id, e.clientX, e.clientY);
  }
  on(window,'pointerup',end); on(window,'pointercancel',end);

  /* ---------- tool rail ---------- */
  on(rail,'pointerdown',e=>{
    const b=e.target.closest('[data-tool]'); if(!b || (e.pointerType==='mouse' && e.button!==0)) return;
    e.preventDefault();
    if(!getMap() || !canEdit()) { toast(getMap()?'目前是唯讀檢視。':'請先建立心智圖。'); return; }
    tool={type:b.dataset.tool, pointer:e.pointerId, sx:e.clientX, sy:e.clientY, ghost:null, over:null};
  });
  on(rail,'click',e=>{ const b=e.target.closest('[data-tool]'); if(b && e.detail===0 && getMap() && canEdit()) createAtCenter(b.dataset.tool); });

  /* ---------- inputs and buttons inside cards ---------- */
  on(layer,'input',e=>{
    const f=e.target, loc=locate(getMap(),f.closest('.card')?.dataset.id); if(!loc) return;
    if(f.dataset.item) { const item=loc.card.items.find(i=>i.id===f.dataset.item); if(item) item.text=f.value; }
    else if(f.dataset.field) { loc.card[f.dataset.field]=f.value; if(loc.card.type==='character' && f.dataset.field==='title' && loc.card.stages?.length) currentStage(loc.card).name=f.value; }
    else if(f.dataset.seg!==undefined || f.dataset.lang!==undefined) { syncNote(loc.card,f); return; }
    if(f.tagName==='TEXTAREA') autosize(f);
    onChange();
  });
  on(layer,'keydown',e=>{
    if(!editing || e.isComposing || e.keyCode===229) return;
    const f=e.target;
    if(e.key==='Escape' || (e.key==='Enter' && (e.metaKey||e.ctrlKey))) { e.preventDefault(); commit(); canvas.focus({preventScroll:true}); return; }
    const loc=locate(getMap(),editing); if(!loc) return;
    // Tab indents inside the note editor so code can be typed naturally.
    if(f.tagName==='TEXTAREA' && e.key==='Tab' && !e.shiftKey) {
      e.preventDefault(); f.setRangeText('  ',f.selectionStart,f.selectionEnd,'end'); syncNote(loc.card,f); return;
    }
    if(f.dataset.code!==undefined && e.key==='Enter' && !e.shiftKey) {
      // New code lines keep the current line's indentation.
      e.preventDefault(); const pos=f.selectionStart, start=f.value.lastIndexOf('\n',pos-1)+1, indent=/^[ \t]*/.exec(f.value.slice(start,pos))[0];
      f.setRangeText('\n'+indent,pos,f.selectionEnd,'end'); syncNote(loc.card,f); return;
    }
    if(f.dataset.code!==undefined && e.key==='}' && f.selectionStart===f.selectionEnd) {
      // A closing brace on an indented blank line steps back one level.
      const pos=f.selectionStart, start=f.value.lastIndexOf('\n',pos-1)+1, before=f.value.slice(start,pos);
      if(/^ {2,}$/.test(before)) { e.preventDefault(); f.setRangeText('}',pos-2,pos,'end'); syncNote(loc.card,f); return; }
    }
    if(f.dataset.lang!==undefined && e.key==='Enter') { e.preventDefault(); f.closest('.note-code').querySelector('.code-input').focus(); return; }
    if(f.dataset.seg!==undefined && e.key==='Enter' && !e.shiftKey) {
      const pos=f.selectionStart, start=f.value.lastIndexOf('\n',pos-1)+1, line=f.value.slice(start,pos), rest=f.value.slice(pos), end=rest.indexOf('\n');
      // ``` (optionally with a language) then Enter turns the line into a code block right away.
      if(FENCE.test(line) && !(end<0?rest:rest.slice(0,end)).trim()) {
        e.preventDefault();
        const k=[...f.closest('.note-editor').querySelectorAll('.note-code')].filter(c=>c.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING).length;
        f.setRangeText('\n\n```',pos,f.selectionEnd,'end'); if(f.dataset.extra!==undefined) delete f.dataset.extra;
        loc.card.text=editorText(f.closest('.note-editor')); rebuildEditor(loc.card,k); onChange(); return;
      }
      // Enter on a to-do line starts the next one; Enter on an empty to-do ends the list.
      const m=TODO_LINE.exec(line);
      if(!m) return;
      e.preventDefault();
      if(m[2].trim()) f.setRangeText('\n[ ] ',pos,f.selectionEnd,'end'); else f.setRangeText('',start,pos,'end');
      syncNote(loc.card,f); return;
    }
    if(f.dataset.item) {
      const items=loc.card.items, i=items.findIndex(x=>x.id===f.dataset.item);
      if(e.key==='Enter') { e.preventDefault(); const item={id:uid('i'),text:'',done:false}; items.splice(i+1,0,item); render(true); focusEditor(`[data-item="${item.id}"]`); }
      else if(e.key==='Backspace' && !f.value && !items[i].src && items.length>1) { e.preventDefault(); items.splice(i,1); render(true); focusEditor(`[data-item="${items[Math.max(0,i-1)].id}"]`); }
    } else if(e.key==='Enter' && f.tagName==='INPUT') {
      e.preventDefault();
      if(loc.card.type==='note') { const body=cardEl(loc.card.id)?.querySelector('.note-input'); body?.focus(); body?.setSelectionRange(0,0); }
      else if(loc.card.type==='todo') focusEditor('[data-item]'); else if(f.dataset.field==='url') focusEditor('[data-field="title"]'); else commit();
    }
  });
  on(layer,'click',e=>{
    const b=e.target.closest('button'), loc=b && locate(getMap(),b.closest('.card')?.dataset.id);
    if(!loc) return;
    const map=getMap(), card=loc.card;
    if(b.dataset.openNote!==undefined)return openNote?.(b.dataset.openNote);
    if(b.dataset.manageNotes!==undefined){clearSelection();selected=card.id;if(card.type==='character')characterMenu=card.id;refresh(true);document.querySelector('[data-ctx="notes"]')?.click();return;}
    if(b.dataset.head==='folder-toggle' || b.dataset.cardAct==='open') return toggleFolder(card);
    if(b.dataset.head==='collapse' || b.dataset.cardAct==='collapse') return toggleCollapse(card);
    if(b.dataset.cardAct==='page') return openPageOf(card);
    if(b.dataset.cardAct==='fileOpen' || b.dataset.cardAct==='fileSave') return openFile(card, b.dataset.cardAct==='fileSave');
    if(b.dataset.cardAct==='view') { if(pageInfo(card.mapId)) viewPage(card.mapId); else toast('這個頁面已被刪除'); return; }
    if(b.dataset.codeRemove!==undefined && editing===card.id) {
      b.closest('.note-code').remove(); card.text=editorText(cardEl(card.id).querySelector('.note-editor')); rebuildEditor(card,null); onChange(); return;
    }
    if(b.dataset.codeCopy!==undefined) {
      navigator.clipboard?.writeText(codeAt(card.text||'',+b.dataset.codeCopy)).then(()=>toast('已複製程式碼'),()=>toast('無法複製，請手動選取'));
      return;
    }
    if(!canEdit()) return;
    if(b.dataset.characterPick!==undefined) {if(editing)commit();clearSelection();selected=card.id;characterPicker.open(card.id);return;}
    if(b.dataset.characterMenu!==undefined) { if(editing) commit(); clearSelection(); selected=card.id; characterMenu=characterMenu===card.id?null:card.id; refresh(true); return; }
    if(b.dataset.characterImage!==undefined) { if(editing) commit(); pickFor=card.id; picker.value=''; picker.click(); return; }
    if(b.dataset.characterLinks!==undefined) { openTodoLinks(card); return; }
    if(b.dataset.characterRemoveImage!==undefined) { if(editing) commit(); snapshot(); setPortrait(card,''); save(map.id); refresh(); return; }
    if(b.dataset.todoImage!==undefined) {
      if(editing) commit();
      pickFor={id:card.id, after:b.dataset.todoImage}; picker.value=''; picker.click(); return;
    }
    if(b.dataset.todoMode || b.dataset.todoRemoveImage) {
      if(editing) commit();
      const item=card.items.find(i=>i.id===(b.dataset.todoMode||b.dataset.todoRemoveImage)); if(!item) return;
      snapshot();
      if(b.dataset.todoMode) { item.displayOnly=!item.displayOnly; item.done=false; }
      else { delete item.src; if(item.displayOnly || !item.text.trim()) card.items=card.items.filter(i=>i!==item); }
      save(map.id); refresh(); return;
    }
    if(b.dataset.check) {
      const item=card.items.find(i=>i.id===b.dataset.check); if(!item) return;
      if(editing===card.id) { item.done=!item.done; b.closest('.todo-item').classList.toggle('done',item.done); b.setAttribute('aria-pressed',String(item.done)); refresh(); return; }
      snapshot(); item.done=!item.done; save(map.id); refresh();
    }
    else if(b.dataset.addItem!==undefined) {
      if(editing!==card.id) startEdit(card.id);
      const item={id:uid('i'),text:'',done:false}; card.items.push(item); render(true); focusEditor(`[data-item="${item.id}"]`);
    }
    else if(b.dataset.head==='add-image') { pickFor=card.id; picker.value=''; picker.click(); }
    else if(b.dataset.cardAct==='color') { colorOpen=card.id; render(); }
    else if(b.dataset.cardAct==='fsDown' || b.dataset.cardAct==='fsUp') {
      // Note text size steps between 11 and 22 px; 14 px is the default and is not stored.
      const sizes=[11,12,13,14,16,18,20,22], i=sizes.indexOf(card.fs||14), next=sizes[Math.max(0,Math.min(sizes.length-1,i+(b.dataset.cardAct==='fsUp'?1:-1)))];
      if(next===(card.fs||14)) return;
      snapshot(); if(next===14) delete card.fs; else card.fs=next; save(map.id); refresh();
    }
    else if(b.dataset.cardAct==='viewLayout') { viewOpen=card.id; render(); }
    else if(b.dataset.cardAct==='pin') pinStart(card.id);
    else if(b.dataset.cardAct==='hostChild') nodeAction(card.id,'child');
    else if(b.dataset.cardAct==='hostUnwrap') nodeAction(card.id,'unwrap');
    else if(b.dataset.cardAct==='detach') { snapshot(); delete card.anchor; save(map.id); refresh(); toast('已取消掛載'); }
    else if(b.dataset.boardView) {
      snapshot(); if(b.dataset.boardView==='tile') delete card.view; else card.view=b.dataset.boardView;
      delete card.w; delete card.h;
      viewOpen=null; save(map.id); refresh();
    }
    else if(b.dataset.cardAct==='frame') { snapshot(); if(card.frame===false) delete card.frame; else card.frame=false; save(map.id); refresh(); }
    else if(b.dataset.boardColor) {
      snapshot(); if(b.dataset.boardColor==='default') delete card.color; else card.color=b.dataset.boardColor;
      colorOpen=null; save(map.id); refresh();
    }
    else if(b.dataset.noteColor) {
      snapshot(); if(b.dataset.noteColor==='default') delete card.color; else card.color=b.dataset.noteColor;
      colorOpen=null; save(map.id); refresh();
    }
    else if(b.dataset.noteCheck!==undefined) {
      const lines=card.text.split('\n'), i=+b.dataset.noteCheck; if(!TODO_LINE.test(lines[i]||'')) return;
      snapshot(); lines[i]=lines[i].replace(/\[( |x|X)\]/,t=>t==='[ ]'?'[x]':'[ ]'); card.text=lines.join('\n'); save(map.id); refresh();
    }
    else if(b.dataset.cardAct==='todo') {
      startEdit(card.id);
      const ta=[...(cardEl(card.id)?.querySelectorAll('.note-input')||[])].at(-1); if(!ta) return;
      ta.value+=(ta.value && !ta.value.endsWith('\n') ? '\n' : '')+'[ ] '; if(ta.dataset.extra!==undefined) delete ta.dataset.extra;
      syncNote(card,ta); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
    }
    else if(b.dataset.cardAct==='code') {
      startEdit(card.id);
      card.text=(card.text ? card.text+'\n' : '')+'```js\n\n```';
      rebuildEditor(card, noteSegments(card.text).filter(s=>s.kind==='code').length-1); onChange();
    }
    else if(b.dataset.cardAct==='edit') startEdit(card.id);
    else if(b.dataset.cardAct==='delete') remove(card.id);
  });
  on(layer,'dblclick',e=>{
    const el=e.target.closest('.card'); if(!el || editing===el.dataset.id || e.target.closest('a,button,input,textarea,select,summary,label')) return;
    const card=locate(getMap(),el.dataset.id)?.card;
    if(card?.type==='board') openPageOf(card); else if(card?.type==='file') openFile(card,false); else if(card?.type!=='folder') startEdit(el.dataset.id);
  });
  async function addPickedImages(files, target) {
    if(!canEdit()) return;
    if(editing) commit();
    const map=getMap(), id=typeof target==='object'?target.id:target; let first=true, after=target?.after;
    for(const file of files) {
      try {
        const {src}=await readImageFile(file), box=getMap()===map && locate(map,id)?.card;
        if(!box || !canEdit()) break;
        if(first) { snapshot(); first=false; }
        if(box.type==='character') setPortrait(box,src);
        else if(box.type==='todo') {
          const item={id:uid('i'),text:'',done:false,src};
          if(after) {
            const index=box.items.findIndex(i=>i.id===after); if(index<0) continue;
            item.displayOnly=true; box.items.splice(index+1,0,item); after=item.id;
          } else box.items.push(item);
        } else { box.cards.push({id:uid('c'), type:'image', src}); if(box.type==='folder') box.open=true; }
        save(map.id); refresh();
      } catch(error) { toast(error.message); }
    }
  }
  on(picker,'change',()=>addPickedImages([...picker.files],pickFor));
  on(document,'keydown',e=>{
    if(editing || !selected || e.target.closest?.('input,textarea,[contenteditable="true"]')) return;
    if(hasNodeSelection()) { selected=null; render(); return; }
    if(e.key==='Escape') { e.stopImmediatePropagation(); selected=null; render(); }
    else if((e.key==='Delete'||e.key==='Backspace') && canEdit()) { e.preventDefault(); e.stopImmediatePropagation(); remove(selected); }
    else if(e.key==='Enter' && canEdit()) { e.preventDefault(); e.stopImmediatePropagation(); startEdit(selected); }
    else if(e.key==='Tab' && canEdit() && hostOf?.(selected)) { e.preventDefault(); e.stopImmediatePropagation(); nodeAction(selected,'child'); }
  },true);

  return {
    render,
    commit,
    setNoteLinks(id,ids) {const map=getMap(),card=locate(map,id)?.card;if(!card||!['note','character'].includes(card.type)||!canEdit())return;if(editing)commit();snapshot();card.noteIds=[...new Set(ids)];save(map.id);refresh(true);},
    insertLinkedNote(note) {const map=getMap();if(!map||!canEdit())return;if(editing)commit();clearSelection();snapshot();const v=getView(),card={id:uid('c'),type:'note',text:'',linkedOnly:true,noteIds:[note.id],x:(canvas.clientWidth/2-v.x)/v.k-120,y:(canvas.clientHeight/2-v.y)/v.k-80,z:nextZ()};(map.cards||=[]).push(card);selected=card.id;save(map.id);refresh(true);return card.id;},
    focusCard(id) {const map=getMap(),loc=locate(map,id);if(!loc)return;if(editing)commit();for(let parent=loc.parent;parent;parent=locate(map,parent.id)?.parent){if(parent.type==='folder')parent.open=true;else delete parent.collapsed;}clearSelection();selected=id;refresh(true);const el=cardEl(id);return el&&boxOf(el);},
    editCharacterStages(id) {const card=locate(getMap(),id)?.card;if(!card||card.type!=='character'||!canEdit())return;if(editing)commit();clearSelection();selected=id;characterMenu=id;refresh(true);openStages(card);},
    focusCharacter(id) {const card=locate(getMap(),id)?.card;if(!card||card.type!=='character')return;if(editing)commit();clearSelection();selected=id;refresh(true);const el=cardEl(id);return el&&boxOf(el);},
    createCharacterFromPreset(preset) {if(!canEdit()||!getMap())return;createAtCenter('character');const card=locate(getMap(),selected)?.card;if(!card)return;card.stages=[applyStagePreset({level:1},preset)];card.title=card.stages[0].name;card.w=300;card.h=480;save(getMap().id);commit();return card.id;},
    characterPortrait() { const card=locate(getMap(),characterMenu)?.card; return card && currentStage(card).src; },
    characterMenu() { return characterMenu && (selected===characterMenu || editing===characterMenu) ? locate(getMap(),characterMenu)?.card : null; },
    characterAction(action) {
      const card=locate(getMap(),characterMenu)?.card; if(!card || !canEdit()) return;
      if(action==='image') { if(editing) commit(); pickFor=card.id; picker.value=''; picker.click(); }
      else if(action==='removeImage') { if(editing) commit(); snapshot(); setPortrait(card,''); save(getMap().id); refresh(); }
      else if(action==='links') openTodoLinks(card);
      else if(action==='stages') openStages(card);
      else if(action==='rename') startEdit(card.id);
      else if(action==='delete') remove(card.id);
    },
    receiveImages(files, target) {
      if(target?.closest?.('.inbox-panel'))return false;
      const el=target?.closest?.('.card-todo,.card-character');
      if(target?.closest?.('input,textarea,[contenteditable="true"]') && !el) return false;
      const id=el?.dataset.id || (!target?.closest?.('.card') ? editing||selected : null);
      if(!canEdit() || !['todo','character'].includes(locate(getMap(),id)?.card.type)) return false;
      const row=el && target.closest('.todo-item');
      addPickedImages(files,{id,after:row?.dataset.todoItem||''}); return true;
    },
    receiveImage(image, target) {
      if(target?.closest?.('.inbox-panel'))return false;
      const el=target?.closest?.('.card-character');
      const id=el?.dataset.id || editing || selected;
      const map=getMap(), card=locate(map,id)?.card;
      if(!canEdit() || !['character','todo'].includes(card?.type)) return false;
      if(editing) commit();
      snapshot();if(card.type==='character')setPortrait(card,image.src);else card.items.push({id:uid('i'),text:'',done:false,src:image.src});save(map.id); refresh(); return true;
    },
    deselect() { if(editing) commit(); if(selected) { selected=null; render(); } },
    box(id) { const el=cardEl(id); return el && boxOf(el); },
    // Clipboard support: the selected card, removing it for a cut, and pasting a fresh copy.
    selection() { return selected && !editing ? locate(getMap(),selected)?.card || null : null; },
    // The note the contextual rail works on: selected or being edited.
    focused() { const id=editing||selected; return id ? locate(getMap(),id)?.card || null : null; },
    pasteTarget(type,target){if(target?.closest?.('.inbox-panel'))return null;const id=target?.closest?.('.card')?.dataset.id||editing||selected,card=locate(getMap(),id)?.card;return card&&!card.inbox&&(accepts(card.type,type)||(type==='image'&&['todo','character'].includes(card.type)))?card:null;},
    appendText(text,target){if(!target||!['note','todo'].includes(target.type)||!canEdit())return false;if(editing)commit();snapshot();if(target.type==='note')target.text=[target.text,text].filter(Boolean).join('\n');else target.items.push(...text.split('\n').filter(line=>line.trim()).map(line=>({id:uid('i'),text:line,done:false})));save(getMap().id);refresh(true);return true;},
    // Runs one of the card's own toolbar actions (color, size, to-do, code, delete).
    act(id, name) { if(editing && editing!==id) commit(); if(selected!==id) { selected=id; render(); } cardEl(id)?.querySelector(`.card-actions [data-card-act="${name}"]`)?.click(); },
    toggleTitle(id) {
      const card=locate(getMap(),id)?.card; if(!card || !canEdit()) return;
      if(card.title && editing!==id) { snapshot(); delete card.title; save(getMap().id); refresh(); toast('已移除標題'); return; }
      if(editing!==id) startEdit(id);
      const f=cardEl(id)?.querySelector('.note-title-input'); f?.focus(); f?.select();
    },
    cut() { if(selected) remove(selected,true); },
    // Pastes into the selected column, folder or note when it accepts the card; otherwise onto the canvas at `at`.
    // Stores PDF/Word/Excel files and adds a card for each, into `intoId` (a container) or the selected container, else at `at`.
    async addFiles(files, at, intoId) {
      const map=getMap(); if(!map || !canEdit()) { toast('請先建立心智圖，再加入檔案。'); return; }
      let n=0;
      for(const file of files) {
        const kind=fileKind(file);
        if(!kind) { toast(`「${file.name}」不是 PDF、Word 或 Excel 檔案`); continue; }
        if(file.size>MAX_ATTACHMENT_BYTES) { toast(`「${file.name}」超過 50 MB`); continue; }
        const fileId=uid('f');
        try { await putFile(fileId, file); } catch { toast('瀏覽器無法儲存這個檔案，可能是空間不足'); continue; }
        if(getMap()!==map) return;
        this.paste({id:uid('c'), type:'file', fileId, name:file.name, size:file.size, kind}, {x:at.x-120, y:at.y-30+n*72}, intoId); n++;
      }
      if(n) toast(`已加入 ${n} 個檔案，雙擊即可開啟`);
    },
    paste(card, at, intoId,recordHistory=true) {
      const map=getMap(); if(!map || !canEdit()) return;
      if(editing) commit();
      const target=intoId!==undefined ? intoId && locate(map,intoId)?.card : selected && locate(map,selected)?.card;
      if(card.type==='image' && target?.type==='character') {
        if(recordHistory)snapshot(); setPortrait(target,card.src); save(map.id); refresh(); return;
      }
      if(card.type==='image'&&target?.type==='todo'){if(recordHistory)snapshot();target.items.push({id:uid('i'),text:'',done:false,src:card.src});save(map.id);refresh();return;}
      if(recordHistory)snapshot(); delete card.x; delete card.y; delete card.z;
      if(target && accepts(target.type,card.type)) { target.cards ||= []; target.cards.push(card); if(target.type==='folder') target.open=true; if(target.collapsed) delete target.collapsed; }
      else { Object.assign(card,{x:Math.round(at.x), y:Math.round(at.y), z:nextZ()}); (map.cards ||= []).push(card); }
      clearSelection(); selected=card.id; save(map.id); refresh();
      if(descendants(card).some(c=>c.type==='board')) pagesChanged();
    },
    boxes() { return [...layer.querySelectorAll(':scope > .card')].map(boxOf); },
    hoverDrop(x, y) { highlight(imageHover, x==null ? null : document.elementFromPoint(x,y)?.closest('.card-todo,.card-character,.card-column,.card-folder')); },
    // Turns a dragged canvas image into an image card; keeps its id so relations survive.
    dropImage(x, y, image) {
      const target=document.elementFromPoint(x,y), el=target?.closest('.card-todo,.card-character,.card-column,.card-folder'), map=getMap(), box=el && locate(map,el.dataset.id)?.card;
      if(!box || !canEdit()) return false;
      if(box.type==='character') { if(editing) commit(); setPortrait(box,image.src); refresh(); return true; }
      if(box.type==='todo') {
        if(editing) commit();
        const after=target.closest('.todo-item')?.dataset.todoItem, index=box.items.findIndex(i=>i.id===after);
        const item={id:uid('i'),text:'',done:false,src:image.src};
        if(index>=0) { item.displayOnly=true; box.items.splice(index+1,0,item); } else box.items.push(item);
        refresh(); return true;
      }
      box.cards.splice(insertIndex(el,y),0,dropToast(box,{id:image.id, type:'image', src:image.src}));
      refresh(); return true;
    },
    destroy() { characterPicker.destroy();todoDrawer.destroy();listeners.forEach(fn=>fn()); layer.remove(); picker.remove(); stageDialog?.remove(); tool?.ghost?.remove(); },
  };
}
