// Milanote-style cards floating on the canvas. Columns and folders hold other cards; notes can embed page cards.
// A "board" card links to its own page (a separate map) and can be resized, framed and nested.
import { readImageFile } from './canvas-assets.js';

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
  ['note','筆記',bi('sticky')], ['link','連結',bi('link-45deg')], ['todo','待辦清單',bi('list-check')], ['column','欄位',bi('card-heading')],
  ['mindmap','心智圖',bi('diagram-3')], ['board','獨立頁面',bi('folder')],
];
const TOOL_INFO = Object.fromEntries(RAIL_TOOLS.map(([type,label,icon])=>[type,{label,icon}]));
const CONTAINERS = ['column','folder'];
// Notes and columns can be resized too; their height is a minimum so content is never cut off.
const SIZED = ['note','column'];
const MIN_SIZE = {board:[100,90], note:[140,48], column:[200,60]};
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
  const b=h('button',cls); b.title=label; b.setAttribute('aria-label',label); Object.assign(b.dataset,data);
  if(typeof content==='string') b.innerHTML=content; else b.append(content); return b;
}
function autosize(el) { el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
export function safeUrl(value) {
  if(!value) return null;
  try { const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(value)?value:'https://'+value); return /^https?:$/.test(url.protocol)?url.href:null; } catch { return null; }
}
const hostOf = href => href ? new URL(href).hostname.replace(/^www\./,'') : '';

export function setupCards({ canvas, world, rail, getMap, getView, uid, snapshot, dropSnapshot, save, toast, canEdit, clearSelection, hasNodeSelection, createTree, nextZ, createPage, pageInfo, openPage, viewPage, renamePage, pagesChanged, onChange }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const layer = h('div','card-layer'); world.append(layer);
  const picker = h('input'); picker.type='file'; picker.accept='image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif'; picker.multiple=true; picker.hidden=true; document.body.append(picker);
  let selected=null, editing=null, editFresh=false, editBefore='', drag=null, resize=null, tool=null, mapId=null, colorOpen=null, pickFor=null;
  const imageHover={over:null};

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
    else if(type==='board') { const page=createPage(); if(!page) return null; Object.assign(card,{title:'',mapId:page,w:160,h:150}); }
    else Object.assign(card,{title:'',cards:[]}, type==='folder'?{open:false}:{});
    return card;
  }
  function tidy(card) {
    if(card.type==='link') card.url=safeUrl(card.url.trim())||card.url.trim();
    if(card.type==='todo') card.items=card.items.filter(item=>item.text.trim());
    if(card.type==='note') card.text=card.text.replace(/(\n?[ \t]*\[ \][ \t]*)+$/,'');
    if('title' in card) card.title=card.title.trim();
  }

  /* ---------- render ---------- */
  function build(card, nested) {
    const edit=editing===card.id, closed=card.type==='folder' && !card.open;
    const el=h('div',`card card-${card.type}`+(closed?' closed':'')+(card.collapsed?' collapsed':'')+(card.frame===false?' plain':'')+(selected===card.id?' selected':'')+(edit?' editing':''));
    el.dataset.id=card.id; el.dataset.type=card.type;
    if(!nested) { el.style.left=card.x+'px'; el.style.top=card.y+'px'; el.style.zIndex=1+(card.z||0); }
    if(card.type==='board') { if(!nested) el.style.width=(card.w||160)+'px'; el.style.height=(card.h||150)+'px'; }
    else if(SIZED.includes(card.type)) { if(card.w && !nested) el.style.width=card.w+'px'; if(card.h && !card.collapsed) el.style.minHeight=card.h+'px'; }
    if(card.type==='note') {
      const paper=h('div','note-paper'), color=NOTE_COLORS[card.color];
      if(color) { paper.style.setProperty('--nb',color[0]); paper.classList.add('tinted'); }
      if(edit) paper.append(field('textarea','note-input',card.text,'寫點什麼…（[ ] 開頭變成待辦，``` 包住變成程式碼）',{field:'text'}));
      else {
        paper.append(card.collapsed ? collapsedLine(card) : noteBody(card));
        paper.append(button('note-fold',card.collapsed?'展開筆記':'收合筆記',icon(card.collapsed?'chevron-down':'chevron-up'),{head:'collapse'}));
      }
      if(card.cards?.length && !card.collapsed) { const embeds=h('div','note-embeds'); for(const child of card.cards) embeds.append(build(child,true)); paper.append(embeds); }
      el.append(paper);
    }
    else if(card.type==='board') {
      const info=pageInfo(card.mapId), tile=h('div','board-tile'); tile.innerHTML=folderIcon(card.color,64);
      el.append(tile, edit ? field('input','board-title',card.title,'頁面名稱',{field:'title'}) : textBlock('board-title',info?.title||card.title,'未命名頁面'), h('div','board-meta',info?`${info.count} 個物件`:'頁面已刪除'));
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
    if(selected===card.id && !edit && canEdit()) {
      if(card.type==='board' || SIZED.includes(card.type)) { const grip=h('div','card-resize'); grip.title='拖曳調整大小'; el.append(grip); }
      el.append(actions(card));
    }
    return el;
  }
  // A collapsed note shows only its first non-empty line.
  function collapsedLine(card) {
    const lines=(card.text||'').split('\n').filter(l=>l.trim() && !FENCE.test(l)), first=lines[0]?.replace(TODO_LINE,'$2');
    const more=lines.length>1 || card.cards?.length;
    return h('div','note-text note-collapsed'+(first?'':' ph'),(first||'空白筆記')+(more?' …':''));
  }
  function noteBody(card) {
    if(!card.text) return h('div','note-text ph','空白筆記');
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
    if(colorOpen===card.id) {
      const board=card.type==='board', palette=board?FOLDER_COLORS:NOTE_COLORS, key=board?'boardColor':'noteColor';
      bar.classList.add('colors');
      const plain=button('note-swatch'+(card.color?'':' on'),'預設（跟隨主題）','',{[key]:'default'}); if(board) plain.style.setProperty('--c','var(--folder-front)'); bar.append(plain);
      for(const [k,[hex,name]] of Object.entries(palette)) { const b=button('note-swatch'+(card.color===k?' on':''),name,'',{[key]:k}); b.style.setProperty('--c',hex); bar.append(b); }
      return bar;
    }
    if(card.type==='board') bar.append(button('','開啟頁面',icon('box-arrow-in-up-right'),{cardAct:'page'}), ...(viewPage?[button('','在側邊檢視內容',icon('layout-sidebar-reverse'),{cardAct:'view'})]:[]), button('',card.frame===false?'顯示外框':'隱藏外框',icon(card.frame===false?'square':'bounding-box'),{cardAct:'frame'}), button('','資料夾顏色',icon('palette'),{cardAct:'color'}));
    if(card.type==='note' || card.type==='column') bar.append(button('',card.collapsed?'展開':'收合',icon(card.collapsed?'arrows-expand':'arrows-collapse'),{cardAct:'collapse'}));
    if(card.type==='folder') bar.append(button('',card.open?'收合':'開啟',icon(card.open?'folder2':'folder2-open'),{cardAct:'open'}));
    if(card.type==='note') bar.append(button('','加入待辦',icon('check2-square'),{cardAct:'todo'}), button('','插入程式碼',icon('code-slash'),{cardAct:'code'}), button('','便利貼顏色',icon('palette'),{cardAct:'color'}));
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
    const loc=locate(getMap(),id); if(!loc || !canEdit() || loc.card.type==='image') return;
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
  function remove(id) {
    const map=getMap(), loc=locate(map,id); if(!loc || !canEdit()) return;
    snapshot(); loc.list.splice(loc.i,1);
    const removed=descendants(loc.card), gone=new Set(removed.map(c=>c.id));
    map.relations=(map.relations||[]).filter(r=>!gone.has(r.from) && !gone.has(r.to));
    if(gone.has(editing)) editing=null;
    selected=null; save(map.id); refresh();
    if(removed.some(c=>c.type==='board')) { pagesChanged(); toast('頁面卡片已移除，頁面本身移到側欄'); }
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
    if(e.target.closest('a,button,input,textarea')) return;
    if(!canEdit()) {
      const card=locate(getMap(),id)?.card;
      if(card?.type==='folder' && !card.open) toggleFolder(card); else if(card?.type==='board') openPageOf(card);
      return;
    }
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
      card.h=Math.round(Math.min(1200,Math.max(minH,resize.h+(e.clientY-resize.sy)/k)));
      if(!nested) el.style.width=card.w+'px';
      if(card.type==='board') el.style.height=card.h+'px'; else if(!card.collapsed) el.style.minHeight=card.h+'px';
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
    if(box && box!==d.card && e.type==='pointerup') {
      const index=insertIndex(d.over,e.clientY);
      map.cards.splice(map.cards.indexOf(d.card),1); delete d.card.x; delete d.card.y; delete d.card.z;
      box.cards ||= []; box.cards.splice(index,0,dropToast(box,d.card));
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
    // Tab indents inside the note editor so code can be typed naturally.
    if(f.tagName==='TEXTAREA' && e.key==='Tab' && !e.shiftKey) {
      e.preventDefault(); f.setRangeText('  ',f.selectionStart,f.selectionEnd,'end'); loc.card.text=f.value; onChange(); return;
    }
    if(f.tagName==='TEXTAREA' && e.key==='Enter' && !e.shiftKey) {
      // Enter on a to-do line starts the next one; Enter on an empty to-do ends the list.
      const pos=f.selectionStart, start=f.value.lastIndexOf('\n',pos-1)+1, m=TODO_LINE.exec(f.value.slice(start,pos));
      if(!m) return;
      e.preventDefault();
      if(m[2].trim()) f.setRangeText('\n[ ] ',pos,f.selectionEnd,'end'); else f.setRangeText('',start,pos,'end');
      loc.card.text=f.value; autosize(f); onChange(); return;
    }
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
    if(b.dataset.head==='collapse' || b.dataset.cardAct==='collapse') return toggleCollapse(card);
    if(b.dataset.cardAct==='page') return openPageOf(card);
    if(b.dataset.cardAct==='view') { if(pageInfo(card.mapId)) viewPage(card.mapId); else toast('這個頁面已被刪除'); return; }
    if(b.dataset.codeCopy!==undefined) {
      navigator.clipboard?.writeText(codeAt(card.text||'',+b.dataset.codeCopy)).then(()=>toast('已複製程式碼'),()=>toast('無法複製，請手動選取'));
      return;
    }
    if(!canEdit()) return;
    if(b.dataset.check) {
      const item=card.items.find(i=>i.id===b.dataset.check); if(!item) return;
      if(editing===card.id) { item.done=!item.done; b.closest('.todo-item').classList.toggle('done',item.done); b.setAttribute('aria-pressed',String(item.done)); return; }
      snapshot(); item.done=!item.done; save(map.id); refresh();
    }
    else if(b.dataset.addItem!==undefined) { const item={id:uid('i'),text:'',done:false}; card.items.push(item); render(true); focusEditor(`[data-item="${item.id}"]`); }
    else if(b.dataset.head==='add-image') { pickFor=card.id; picker.value=''; picker.click(); }
    else if(b.dataset.cardAct==='color') { colorOpen=card.id; render(); }
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
      const ta=cardEl(card.id)?.querySelector('textarea'); if(!ta) return;
      ta.value+=(ta.value && !ta.value.endsWith('\n') ? '\n' : '')+'[ ] '; card.text=ta.value;
      autosize(ta); ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); onChange();
    }
    else if(b.dataset.cardAct==='code') {
      startEdit(card.id);
      const ta=cardEl(card.id)?.querySelector('textarea'); if(!ta) return;
      // Code needs room: widen a default-width note that sits directly on the canvas.
      if(!card.w && !loc.parent) { card.w=380; cardEl(card.id).style.width='380px'; }
      ta.value+=(ta.value && !ta.value.endsWith('\n') ? '\n' : '')+'```js\n\n```'; card.text=ta.value;
      const caret=ta.value.length-4; autosize(ta); ta.focus(); ta.setSelectionRange(caret,caret); onChange();
    }
    else if(b.dataset.cardAct==='edit') startEdit(card.id);
    else if(b.dataset.cardAct==='delete') remove(card.id);
  });
  on(layer,'dblclick',e=>{
    const el=e.target.closest('.card'); if(!el || editing===el.dataset.id || e.target.closest('a,button')) return;
    const card=locate(getMap(),el.dataset.id)?.card;
    if(card?.type==='board') openPageOf(card); else if(card?.type!=='folder') startEdit(el.dataset.id);
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
