// Milanote-style cards floating on the canvas. Columns and folders hold other cards; folders open and close.
import { readImageFile } from './canvas-assets.js';

const bi = name => `<i class="bi bi-${name}" aria-hidden="true"></i>`;
// Sticky-note colors; the default follows the theme tokens.
export const NOTE_COLORS = { yellow:['#ffe98f','黃'], orange:['#ffd0a1','橘'], red:['#ffb8b8','紅'], pink:['#ffc7e3','粉紅'], purple:['#ddd0ff','紫'], blue:['#c4ddff','藍'], teal:['#b8ecdf','青'], green:['#cfeeb3','綠'], gray:['#e2e5e9','灰'], white:['#ffffff','白'] };
// Sticky-note icon; `color` is a NOTE_COLORS key, otherwise it follows the theme.
export function stickyIcon(color, size=22) {
  const hex=NOTE_COLORS[color]?.[0];
  return `<svg class="sticky-icon${hex?' tinted':''}"${hex?` style="--sc:${hex}"`:''} viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path class="paper" d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v10.3L15.3 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path class="fold" d="M20.5 15.3h-3.7a1.5 1.5 0 0 0-1.5 1.5v3.7z"/></svg>`;
}
export const FOLDER_ICON = '<svg class="folder-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M2 6a2 2 0 0 1 2-2h5.2l2 2H20a2 2 0 0 1 2 2v2H2z" fill="var(--folder-back)"/><rect x="4" y="7.5" width="16" height="6" rx="1" fill="var(--folder-paper)"/><path d="M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="var(--folder-front)"/></svg>';
// [type, label, icon html] in rail order; "mindmap" adds another mind-map tree to the board.
export const RAIL_TOOLS = [
  ['note','筆記',bi('sticky')], ['link','連結',bi('link-45deg')], ['todo','待辦清單',bi('list-check')], ['column','欄位',bi('card-heading')],
  ['mindmap','心智圖',bi('diagram-3')],
];
const TOOL_INFO = Object.fromEntries(RAIL_TOOLS.map(([type,label,icon])=>[type,{label,icon}]));
const CONTAINERS = ['column','folder'];
const nestable = type => !CONTAINERS.includes(type) && type!=='mindmap';

const h = (tag, cls, text) => { const el=document.createElement(tag); if(cls) el.className=cls; if(text!=null) el.textContent=text; return el; };
const icon = name => { const i=h('i','bi bi-'+name); i.setAttribute('aria-hidden','true'); return i; };
const textBlock = (cls, value, placeholder) => value ? h('div',cls,value) : h('div',cls+' ph',placeholder);
function field(tag, cls, value, placeholder, data) {
  const el=h(tag,'card-input '+cls); el.value=value||''; el.placeholder=placeholder; Object.assign(el.dataset,data);
  if(tag==='textarea') el.rows=1; return el;
}
function button(cls, label, content, data) {
  const b=h('button',cls); b.title=label; b.setAttribute('aria-label',label); Object.assign(b.dataset,data);
  if(typeof content==='string') b.innerHTML=content; else b.append(content); return b;
}
function autosize(el) { el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
export function safeUrl(value) {
  if(!value) return null;
  try { const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(value)?value:'https://'+value); return /^https?:$/.test(url.protocol)?url.href:null; } catch { return null; }
}
const hostOf = href => href ? new URL(href).hostname.replace(/^www\./,'') : '';

export function setupCards({ canvas, world, rail, getMap, getView, uid, snapshot, dropSnapshot, save, toast, canEdit, clearSelection, hasNodeSelection, createTree, onChange }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const layer = h('div','card-layer'); world.append(layer);
  const picker = h('input'); picker.type='file'; picker.accept='image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif'; picker.multiple=true; picker.hidden=true; document.body.append(picker);
  let selected=null, editing=null, editFresh=false, editBefore='', drag=null, tool=null, mapId=null, colorOpen=null, pickFor=null;
  const imageHover={over:null};

  const pointAt = (x, y) => { const r=canvas.getBoundingClientRect(), v=getView(); return {x:(x-r.left-v.x)/v.k, y:(y-r.top-v.y)/v.k}; };
  const cardEl = id => id ? layer.querySelector(`.card[data-id="${CSS.escape(id)}"]`) : null;
  function boxOf(el) { const r=el.getBoundingClientRect(), p=pointAt(r.left,r.top), k=getView().k; return {id:el.dataset.id, x:p.x, y:p.y, w:r.width/k, h:r.height/k}; }
  function locate(map, id) {
    for(const [i,card] of (map?.cards||[]).entries()) {
      if(card.id===id) return {list:map.cards, i, card, parent:null};
      const j=CONTAINERS.includes(card.type) ? card.cards.findIndex(c=>c.id===id) : -1;
      if(j>=0) return {list:card.cards, i:j, card:card.cards[j], parent:card};
    }
    return null;
  }
  function blank(type) {
    const card={id:uid('c'), type};
    if(type==='note') card.text='';
    else if(type==='link') Object.assign(card,{url:'',title:''});
    else if(type==='todo') Object.assign(card,{title:'',items:[{id:uid('i'),text:'',done:false}]});
    else Object.assign(card,{title:'',cards:[]}, type==='folder'?{open:false}:{});
    return card;
  }
  function tidy(card) {
    if(card.type==='link') card.url=safeUrl(card.url.trim())||card.url.trim();
    if(card.type==='todo') card.items=card.items.filter(item=>item.text.trim());
    if('title' in card) card.title=card.title.trim();
  }

  /* ---------- render ---------- */
  function build(card, nested) {
    const edit=editing===card.id, closed=card.type==='folder' && !card.open;
    const el=h('div',`card card-${card.type}`+(closed?' closed':'')+(selected===card.id?' selected':'')+(edit?' editing':''));
    el.dataset.id=card.id;
    if(!nested) { el.style.left=card.x+'px'; el.style.top=card.y+'px'; }
    if(card.type==='note') {
      const paper=h('div','note-paper'), color=NOTE_COLORS[card.color];
      if(color) { paper.style.setProperty('--nb',color[0]); paper.classList.add('tinted'); }
      paper.append(edit ? field('textarea','note-input',card.text,'寫點什麼…',{field:'text'}) : textBlock('note-text',card.text,'空白筆記'));
      el.append(paper);
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
    else if(card.type==='todo') {
      el.append(edit ? field('input','todo-title',card.title,'待辦清單標題',{field:'title'}) : textBlock('todo-title',card.title,'待辦清單'));
      const list=h('div','todo-list');
      for(const item of card.items) {
        const row=h('div','todo-item'+(item.done?' done':'')), check=button('todo-check',item.done?'標為未完成':'標為完成',icon('check-lg'),{check:item.id});
        check.disabled=!canEdit(); check.setAttribute('aria-pressed',String(item.done));
        row.append(check, edit ? field('input','todo-text',item.text,'待辦事項',{item:item.id}) : textBlock('todo-text',item.text,'待辦事項'));
        list.append(row);
      }
      if(edit) { const add=h('button','todo-add'); add.dataset.addItem=''; add.append(icon('plus-lg'),'新增項目'); list.append(add); }
      else if(!card.items.length) list.append(h('div','todo-empty','沒有項目，點兩下新增'));
      el.append(list);
      if(!edit && card.items.length) el.append(h('div','todo-foot',`${card.items.filter(i=>i.done).length} / ${card.items.length} 完成`));
    }
    else if(closed) {
      const tile=h('div','folder-tile'); tile.innerHTML=FOLDER_ICON;
      el.append(tile, edit ? field('input','folder-title',card.title,'資料夾名稱',{field:'title'}) : textBlock('folder-title',card.title,'未命名資料夾'), h('div','folder-count',`${card.cards.length} 個項目`));
    }
    else {
      const head=h('div','column-head'), body=h('div','column-body'), folder=card.type==='folder';
      if(folder) { const mini=h('span','folder-mini'); mini.innerHTML=FOLDER_ICON; head.append(mini); }
      head.append(edit ? field('input','column-title',card.title,folder?'資料夾名稱':'欄位名稱',{field:'title'}) : textBlock('column-title',card.title,folder?'未命名資料夾':'未命名欄位'), h('span','column-count',String(card.cards.length)));
      if(canEdit()) head.append(button('head-btn','加入圖片',icon('image'),{head:'add-image'}));
      if(folder) head.append(button('head-btn','收合資料夾',icon('chevron-up'),{head:'folder-toggle'}));
      for(const child of card.cards) body.append(build(child,true));
      if(!card.cards.length) body.append(h('div','column-empty',folder?'把筆記拖進這裡':'把卡片或圖片拖進這裡'));
      el.append(head,body);
    }
    if(selected===card.id && !edit && canEdit()) el.append(actions(card));
    return el;
  }
  function actions(card) {
    const bar=h('div','card-actions');
    if(colorOpen===card.id) {
      bar.classList.add('colors');
      bar.append(button('note-swatch'+(card.color?'':' on'),'預設（跟隨主題）','',{noteColor:'default'}));
      for(const [key,[hex,name]] of Object.entries(NOTE_COLORS)) { const b=button('note-swatch'+(card.color===key?' on':''),name,'',{noteColor:key}); b.style.setProperty('--c',hex); bar.append(b); }
      return bar;
    }
    if(card.type==='folder') bar.append(button('',card.open?'收合':'開啟',icon(card.open?'folder2':'folder2-open'),{cardAct:'open'}));
    if(card.type==='note') bar.append(button('','便利貼顏色',icon('palette'),{cardAct:'color'}));
    if(card.type!=='image') bar.append(button('','編輯',icon('pencil'),{cardAct:'edit'}));
    bar.append(button('','刪除',icon('trash'),{cardAct:'delete'}));
    return bar;
  }
  function render(force) {
    const map=getMap();
    if(mapId!==map?.id) { if(editing && mapId) save(mapId); selected=null; editing=null; drag=null; mapId=map?.id; }
    rail.classList.toggle('disabled', !map || !canEdit());
    if(editing && !force && cardEl(editing)) return;
    if(selected && !locate(map,selected)) selected=null;
    if(editing && !locate(map,editing)) editing=null;
    if(colorOpen!==selected) colorOpen=null;
    layer.replaceChildren(...(map?.cards||[]).map(card=>build(card,false)));
  }
  function refresh(force) { render(force); onChange(); }
  function focusEditor(selector) {
    const el=cardEl(editing); if(!el) return;
    el.querySelectorAll('textarea').forEach(autosize);
    const f=el.querySelector(selector||'[data-field],[data-item]');
    if(f) { f.focus({preventScroll:true}); f.setSelectionRange?.(f.value.length,f.value.length); }
  }

  /* ---------- edits ---------- */
  function create(type, at, containerId, index) {
    const map=getMap(); if(!map || !canEdit()) return;
    if(editing) commit();
    if(type==='mindmap') { if(selected) { selected=null; render(); } createTree(at); return; }
    const card=blank(type); snapshot(); map.cards ||= [];
    const box=containerId && nestable(type) && map.cards.find(c=>c.id===containerId && CONTAINERS.includes(c.type));
    if(box) box.cards.splice(index ?? box.cards.length, 0, card);
    else { card.x=Math.round(at.x); card.y=Math.round(at.y); map.cards.push(card); }
    clearSelection(); selected=card.id; editing=card.id; editFresh=true;
    save(map.id); refresh(true); focusEditor(type==='todo'?'[data-item]':null);
  }
  function createAtCenter(type) {
    const v=getView(), c={x:(canvas.clientWidth/2-v.x)/v.k, y:(canvas.clientHeight/2-v.y)/v.k};
    if(type==='mindmap') return create(type,null);
    const w={column:280, folder:170}[type]||240, n=(getMap()?.cards||[]).length%6;
    create(type, {x:c.x-w/2+n*24, y:c.y-60+n*24});
  }
  function startEdit(id) {
    const loc=locate(getMap(),id); if(!loc || !canEdit() || loc.card.type==='image') return;
    if(editing) commit();
    clearSelection(); selected=id; editing=id; editFresh=false; editBefore=JSON.stringify(loc.card);
    snapshot(); refresh(true); focusEditor();
  }
  function commit() {
    if(!editing) return; const id=editing; editing=null;
    const map=getMap(), loc=locate(map,id);
    if(loc) { tidy(loc.card); if(!editFresh && JSON.stringify(loc.card)===editBefore) dropSnapshot(); else save(map.id); }
    refresh();
  }
  function remove(id) {
    const map=getMap(), loc=locate(map,id); if(!loc || !canEdit()) return;
    snapshot(); loc.list.splice(loc.i,1);
    const gone=new Set([id, ...(loc.card.cards||[]).map(c=>c.id)]);
    map.relations=(map.relations||[]).filter(r=>!gone.has(r.from) && !gone.has(r.to));
    if(gone.has(editing)) editing=null;
    selected=null; save(map.id); refresh();
  }
  function toggleFolder(card) { card.open=!card.open; if(canEdit()) save(getMap().id); refresh(); }
  // Closed folders have no body, so drops append to the end.
  function insertIndex(box, y) {
    const body=box.querySelector(':scope > .column-body'); if(!body) return Infinity;
    return [...body.querySelectorAll(':scope > .card:not(.dragging)')].filter(c=>{ const r=c.getBoundingClientRect(); return r.top+r.height/2<y; }).length;
  }
  function highlight(state, box) { if(state.over!==box) { state.over?.classList.remove('drop'); box?.classList.add('drop'); state.over=box; } }
  function containerAt(x, y) { return document.elementFromPoint(x,y)?.closest?.('.card-column,.card-folder') || null; }
  function dropTarget(e, type) {
    const hit=document.elementFromPoint(e.clientX,e.clientY);
    if(!hit || !canvas.contains(hit) || hit.closest('.zoombar,.asset-panel,.nodebar,.empty-state')) return null;
    return {box: nestable(type) ? hit.closest('.card-column,.card-folder') : null};
  }
  function dropToast(box, card) { if(box.type==='folder' && !box.open) toast(`已放進資料夾「${box.title||'未命名資料夾'}」`); return card; }

  /* ---------- pointer: select / edit / drag ---------- */
  on(document,'pointerdown',e=>{ if(editing && !cardEl(editing)?.contains(e.target)) commit(); },true);
  on(canvas,'pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    const el=e.target.closest('.card');
    if(!el) { if(selected && !e.target.closest('.zoombar,.asset-panel')) { selected=null; render(); } return; }
    const id=el.dataset.id;
    if(e.target.closest('a,button,input,textarea')) return;
    if(!canEdit()) { const loc=locate(getMap(),id); if(loc?.card.type==='folder' && !loc.card.open) toggleFolder(loc.card); return; }
    e.preventDefault();
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
    loc.list.splice(loc.i,1); map.cards.push(loc.card);
    if(loc.parent) Object.assign(loc.card,{x:b.x, y:b.y});
    const p=pointAt(e.clientX,e.clientY);
    Object.assign(drag,{moved:true, map:map.id, card:loc.card, dx:p.x-b.x, dy:p.y-b.y});
    render(); drag.el=cardEl(drag.id); drag.el.classList.add('dragging');
  }
  on(window,'pointermove',e=>{
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
      if(d.was && e.type==='pointerup') { const card=locate(getMap(),d.id)?.card; if(card?.type==='folder') toggleFolder(card); else startEdit(d.id); }
      return;
    }
    d.over?.classList.remove('drop');
    const map=getMap(); if(map?.id!==d.map) return;
    const box=d.over && map.cards.find(c=>c.id===d.over.dataset.id);
    if(box && e.type==='pointerup') {
      const index=insertIndex(d.over,e.clientY);
      map.cards.splice(map.cards.indexOf(d.card),1); delete d.card.x; delete d.card.y;
      box.cards.splice(index,0,dropToast(box,d.card));
    }
    save(map.id); refresh();
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
    else if(f.dataset.field) loc.card[f.dataset.field]=f.value;
    if(f.tagName==='TEXTAREA') autosize(f);
    onChange();
  });
  on(layer,'keydown',e=>{
    if(!editing || e.isComposing || e.keyCode===229) return;
    const f=e.target;
    if(e.key==='Escape' || (e.key==='Enter' && (e.metaKey||e.ctrlKey))) { e.preventDefault(); commit(); canvas.focus({preventScroll:true}); return; }
    const loc=locate(getMap(),editing); if(!loc) return;
    if(f.dataset.item) {
      const items=loc.card.items, i=items.findIndex(x=>x.id===f.dataset.item);
      if(e.key==='Enter') { e.preventDefault(); const item={id:uid('i'),text:'',done:false}; items.splice(i+1,0,item); render(true); focusEditor(`[data-item="${item.id}"]`); }
      else if(e.key==='Backspace' && !f.value && items.length>1) { e.preventDefault(); items.splice(i,1); render(true); focusEditor(`[data-item="${items[Math.max(0,i-1)].id}"]`); }
    } else if(e.key==='Enter' && f.tagName==='INPUT') {
      e.preventDefault();
      if(loc.card.type==='todo') focusEditor('[data-item]'); else if(f.dataset.field==='url') focusEditor('[data-field="title"]'); else commit();
    }
  });
  on(layer,'click',e=>{
    const b=e.target.closest('button'), loc=b && locate(getMap(),b.closest('.card')?.dataset.id);
    if(!loc) return;
    const map=getMap(), card=loc.card;
    if(b.dataset.head==='folder-toggle' || b.dataset.cardAct==='open') return toggleFolder(card);
    if(!canEdit()) return;
    if(b.dataset.check) {
      const item=card.items.find(i=>i.id===b.dataset.check); if(!item) return;
      if(editing===card.id) { item.done=!item.done; b.closest('.todo-item').classList.toggle('done',item.done); b.setAttribute('aria-pressed',String(item.done)); return; }
      snapshot(); item.done=!item.done; save(map.id); refresh();
    }
    else if(b.dataset.addItem!==undefined) { const item={id:uid('i'),text:'',done:false}; card.items.push(item); render(true); focusEditor(`[data-item="${item.id}"]`); }
    else if(b.dataset.head==='add-image') { pickFor=card.id; picker.value=''; picker.click(); }
    else if(b.dataset.cardAct==='color') { colorOpen=card.id; render(); }
    else if(b.dataset.noteColor) {
      snapshot(); if(b.dataset.noteColor==='default') delete card.color; else card.color=b.dataset.noteColor;
      colorOpen=null; save(map.id); refresh();
    }
    else if(b.dataset.cardAct==='edit') startEdit(card.id);
    else if(b.dataset.cardAct==='delete') remove(card.id);
  });
  on(layer,'dblclick',e=>{
    const el=e.target.closest('.card'); if(!el || editing===el.dataset.id || e.target.closest('a,button')) return;
    if(locate(getMap(),el.dataset.id)?.card.type!=='folder') startEdit(el.dataset.id);
  });
  on(picker,'change',async()=>{
    const files=[...picker.files], map=getMap(), id=pickFor; let first=true;
    for(const file of files) {
      try {
        const {src}=await readImageFile(file), box=getMap()===map && locate(map,id)?.card;
        if(!box) break;
        if(first) { snapshot(); first=false; }
        box.cards.push({id:uid('c'), type:'image', src}); if(box.type==='folder') box.open=true;
        save(map.id); refresh();
      } catch(error) { toast(error.message); }
    }
  });
  on(document,'keydown',e=>{
    if(editing || !selected || e.target.closest?.('input,textarea,[contenteditable="true"]')) return;
    if(hasNodeSelection()) { selected=null; render(); return; }
    if(e.key==='Escape') { e.stopImmediatePropagation(); selected=null; render(); }
    else if((e.key==='Delete'||e.key==='Backspace') && canEdit()) { e.preventDefault(); e.stopImmediatePropagation(); remove(selected); }
    else if(e.key==='Enter' && canEdit()) { e.preventDefault(); e.stopImmediatePropagation(); startEdit(selected); }
  },true);

  return {
    render,
    deselect() { if(editing) commit(); if(selected) { selected=null; render(); } },
    box(id) { const el=cardEl(id); return el && boxOf(el); },
    boxes() { return [...layer.querySelectorAll(':scope > .card')].map(boxOf); },
    hoverDrop(x, y) { highlight(imageHover, x==null ? null : containerAt(x,y)); },
    // Turns a dragged canvas image into an image card; keeps its id so relations survive.
    dropImage(x, y, image) {
      const el=containerAt(x,y), map=getMap(), box=el && map?.cards.find(c=>c.id===el.dataset.id);
      if(!box) return false;
      box.cards.splice(insertIndex(el,y),0,dropToast(box,{id:image.id, type:'image', src:image.src}));
      refresh(); return true;
    },
    destroy() { listeners.forEach(fn=>fn()); layer.remove(); picker.remove(); tool?.ghost?.remove(); },
  };
}
