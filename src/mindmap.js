import { MAX_FILE_BYTES, parseAttachments, parseFolders, parseMaps, serializeMaps } from './files.js';
import { blobToDataUrl, dataUrlToBlob, fileKind, getFile, putFile } from './attachments.js';
import { setupCanvasAssets } from './canvas-assets.js';
import { setupCards, stickyIcon, NOTE_COLORS, folderIcon, FOLDER_COLORS } from './cards.js';
import { setupRelations } from './relations.js';
import { setupDraw } from './draw.js';
import { applyTheme } from './theme.js';

export function initializeMindMap() {
const disposers = [];
function listen(target, type, callback, options) { target.addEventListener(type, callback, options); disposers.push(() => target.removeEventListener(type, callback, options)); }

'use strict';
const $ = s => document.getElementById(s);
const PALETTE = ['#a414b8','#1767c9','#008a77','#c9821a','#d0336f','#3f8f35'];
const LS_KEY = 'yozu-mindmap-v1';
const FOLDER_KEY = 'yozu-folders-v1', FOLDER_DOC = '__folders';
const uid = (p) => (p||'n') + '-' + Math.random().toString(36).slice(2,10);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const isMobile = () => window.matchMedia('(max-width:760px)').matches;

const app=$('app'), canvas=$('canvas'), world=$('world'), edges=$('edges'), measurer=$('measure');
// Text written on a branch line (Whimsical style) sits in its own layer between the lines and the nodes.
const edgeLabels=document.createElement('div'); edgeLabels.className='edge-labels'; edges.after(edgeLabels);
// Lines from a node to the cards and images pinned to it.
const pinEdges=document.createElementNS('http://www.w3.org/2000/svg','svg'); pinEdges.setAttribute('class','pin-edges'); pinEdges.setAttribute('width','1'); pinEdges.setAttribute('height','1'); edges.before(pinEdges);
let edgeEditing=null;
const nodebar=$('nodebar');

const store = { mode:'loading', db:null, readOnly:false };
const maps = new Map();
let folders = [];
let currentId=null, selectedId=null, editingId=null, editOrig='', editFresh=false;
let view={x:0,y:0,k:1};
let L=new Map(), idx=new Map();
const els=new Map();
const undoS=new Map(), redoS=new Map();
const mcache=new Map();
let ready=false;
let assets=null, cards=null, relations=null, draw=null;

/* ---------------- persistence ---------------- */
function lsLoad(){ try{ const a=JSON.parse(localStorage.getItem(LS_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
let localSaveFailed = false;
function lsSaveAll(){
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...maps.values()]));
    localSaveFailed = false; setStatus(); return true;
  } catch(e) {
    localSaveFailed = true; setStatus();
    toast('瀏覽器暫存失敗，請立即匯出存檔，避免關閉後遺失。');
    return false;
  }
}

// Folders may nest via parentId; missing parents and cycles fall back to the top level.
function cleanFolders(list){
  const out=(Array.isArray(list)?list:[]).filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string').map(f=>({id:f.id,name:f.name,open:f.open!==false,createdAt:+f.createdAt||0,
    ...(typeof f.parentId==='string'?{parentId:f.parentId}:{}), ...(FOLDER_COLORS[f.color]?{color:f.color}:{})}));
  const byId=new Map(out.map(f=>[f.id,f]));
  for(const f of out){ const seen=new Set([f.id]); for(let p=f.parentId; p; p=byId.get(p).parentId){ if(!byId.has(p)||seen.has(p)){ delete f.parentId; break; } seen.add(p); } }
  return out;
}
async function saveFolders(){
  if(store.readOnly) return;
  if(store.mode==='cloud'){ try{ await store.db.doc('maps/'+FOLDER_DOC).set({folders:JSON.parse(JSON.stringify(folders))}); }catch(e){ writeError(e); } return; }
  try{ localStorage.setItem(FOLDER_KEY, JSON.stringify(folders)); }catch(e){ toast('瀏覽器暫存失敗，請立即匯出存檔，避免關閉後遺失。'); }
}

const pending=new Map(), inflight=new Set(), again=new Set(), myRevs=new Set(), retried=new Set();
function isBusy(id){ return pending.has(id)||inflight.has(id); }
function save(id, immediate){
  if(store.readOnly) return;
  const m=maps.get(id); if(!m) return;
  m.updatedAt=Date.now();
  if(store.mode!=='cloud'){ lsSaveAll(); return; }
  clearTimeout(pending.get(id));
  pending.set(id, setTimeout(()=>flush(id), immediate?0:500));
  setStatus();
}
async function flush(id){
  pending.delete(id);
  if(inflight.has(id)){ again.add(id); return; }
  const m=maps.get(id); if(!m){ setStatus(); return; }
  m.rev=uid('r'); myRevs.add(m.rev);
  inflight.add(id); setStatus();
  try{
    await store.db.doc('maps/'+id).set(JSON.parse(JSON.stringify(m)));
    retried.delete(id);
  }catch(e){ writeError(e, ()=>save(id,true), id); }
  finally{
    inflight.delete(id);
    if(again.has(id)){ again.delete(id); flush(id); } else setStatus();
  }
}
async function removeRemote(id){
  if(store.mode!=='cloud'){ lsSaveAll(); return; }
  clearTimeout(pending.get(id)); pending.delete(id);
  try{ await store.db.doc('maps/'+id).delete(); }catch(e){ writeError(e); }
}
function writeError(e, retry, id){
  const code=e&&e.code;
  if(code==='invalid_argument'||code==='not_granted'){ store.readOnly=true; applyReadOnly(); toast('你目前只有檢視權限，修改不會被儲存'); }
  else if(code==='quota_exceeded'){ toast('儲存空間已滿，刪除幾張不用的心智圖後再試'); }
  else if(code==='unavailable' && retry && !retried.has(id)){ retried.add(id); setTimeout(retry, 800+Math.random()*1200); }
  else if(code==='revoked'){ store.readOnly=true; applyReadOnly(); }
  else { toast('儲存失敗，請檢查網路後再編輯一次'); }
}
function setStatus(){
  const dot=$('stDot'), t=$('stText');
  dot.className='dotst';
  if(store.mode==='loading'){ t.textContent='載入中…'; return; }
  if(store.readOnly){ t.textContent='唯讀檢視'; return; }
  if(store.mode==='local'){
    dot.classList.add(localSaveFailed ? 'busy' : 'ok');
    t.textContent=localSaveFailed ? '暫存失敗，請匯出存檔' : '已自動暫存於此瀏覽器'; return;
  }
  if(pending.size||inflight.size){ dot.classList.add('busy'); t.textContent='儲存中…'; }
  else { dot.classList.add('ok'); t.textContent='已同步到雲端'; }
}

/* ---------------- data helpers ---------------- */
function cur(){ return currentId ? maps.get(currentId) : null; }
function mkNode(text,color){ const n={id:uid('n'),text:text||'',children:[]}; if(color) n.color=color; return n; }
function makeMap(sample){
  const root = sample
    ? Object.assign(mkNode('YoZuLife'),{children:[mkNode('LIFE生活區',PALETTE[0]),mkNode('英雄習慣區',PALETTE[1]),mkNode('其他YoZU頁面',PALETTE[2])]})
    : mkNode('中心主題');
  const now=Date.now();
  return { id:uid('m'), title: sample?'YoZuLife':'未命名心智圖', layout:'down', root, createdAt:now, updatedAt:now, rev:'' };
}
// The main tree sits at (rootX, rootY); extra trees live in m.trees with their own position.
// m.root is null once every mind map on the board has been deleted.
function treesOf(m){ return [...(m.root?[{main:true, root:m.root, x:m.rootX||0, y:m.rootY||0}]:[]), ...(m.trees||[])]; }
function firstRootId(m){ return treesOf(m)[0]?.root.id||null; }
function setTreePos(tree,x,y){ if(tree.main){ const m=cur(); m.rootX=x; m.rootY=y; } else { tree.x=x; tree.y=y; } }
function sanitizeMap(m){
  m.root=m.root?sanitize(m.root):null;
  m.trees=Array.isArray(m.trees) ? m.trees.filter(t=>t&&t.root).map(t=>({id:t.id||uid('t'), x:+t.x||0, y:+t.y||0, root:sanitize(t.root)})) : [];
  return m;
}
function createTree(at){
  if(!guard()) return; const m=cur();
  if(editingId) commitEdit();
  // Without a drop point, start the new tree in free space right of everything on the board.
  if(!at){
    const bb=bbox(), v={x:(canvas.clientWidth/2-view.x)/view.k, y:(canvas.clientHeight/2-view.y)/view.k};
    at=Number.isFinite(bb.x1) ? {x:bb.x1+(isDown()?260:160), y:m.root?(m.rootY||0):bb.y0} : v;
  }
  snapshot(); const root=mkNode('新主題');
  m.trees ||= []; m.trees.push({id:uid('t'), x:Math.round(at.x), y:Math.round(at.y), root});
  selectedId=root.id; renderMap(); ensureVisible(root.id); startEdit(root.id,null,true); save(currentId);
}
// A node resized by hand: fixed width (text wraps inside), height as a minimum.
function sizeNode(el, n){
  const w=n.w?n.w+'px':'', h=n.h?n.h+'px':'';
  if(el.style.width!==w){ el.style.width=w; el.style.maxWidth=n.w?'none':''; }
  if(el.style.minHeight!==h) el.style.minHeight=h;
}
const noteTitled=n=>n.titled ?? (n.text||'').includes('\n');
// Note and column styles hold several lines: first line is the title.
const multiLine=n=>!!(n&&(n.note||n.column));
const styleOf=n=>n.column?'column':n.note?'note':'plain';
// Note-style nodes read their first line as a title and the rest as body text; column-style nodes show each further line as a small card.
function paintNode(el, n){
  const key=styleOf(n)+'|'+(n.column?n.children?.length||0:'')+'|'+n.titled+'|'+(n.text||'');
  if(el._painted===key) return;
  el._painted=key;
  if(n.column){
    const lines=(n.text||'').split('\n'), head=document.createElement('div'), t=document.createElement('span'), c=document.createElement('span');
    head.className='ch'; t.className='ct'; t.textContent=lines[0]||'未命名欄位'; c.className='cc'; c.textContent=String(n.children?.length||0); head.append(t,c);
    const rows=lines.slice(1).filter(l=>l.trim()).map(l=>{ const r=document.createElement('div'); r.className='cr'; r.textContent=l; return r; });
    el.replaceChildren(head,...rows); return;
  }
  if(!n.note||!n.text){ el.textContent=n.text||''; return; }
  const lines=n.text.split('\n'), b=document.createElement('div');
  // With a title (the 標題 tool, or older notes with several lines) the first line is the title; otherwise everything is body.
  if(!noteTitled(n)){ b.className='nb plain'; b.textContent=n.text; el.replaceChildren(b); return; }
  const t=document.createElement('div'); t.className='nt'+(lines[0].trim()?'':' ph'); t.textContent=lines[0].trim()||'標題';
  const body=lines.slice(1).join('\n').replace(/^\n+/,'');
  if(!body){ el.replaceChildren(t); return; }
  b.className='nb'; b.textContent=body; el.replaceChildren(t,b);
}
function sanitize(n){ if(!n||typeof n!=='object') return mkNode(''); n.text=typeof n.text==='string'?n.text:''; n.children=Array.isArray(n.children)?n.children.map(sanitize):[]; if(!n.id) n.id=uid('n'); return n; }
function countDesc(n){ let c=0; (n.children||[]).forEach(ch=>{ c+=1+countDesc(ch); }); return c; }
function nextColor(root){
  const used=new Map(PALETTE.map(c=>[c,0]));
  root.children.forEach((c,i)=>{ const col=c.color||PALETTE[i%PALETTE.length]; if(used.has(col)) used.set(col,used.get(col)+1); });
  let best=PALETTE[0], min=Infinity; for(const [c,v] of used){ if(v<min){min=v;best=c;} } return best;
}
function isAncestor(aId, bId){ let i=idx.get(bId); while(i&&i.parent){ if(i.parent.id===aId) return true; i=idx.get(i.parent.id); } return false; }

/* ---------------- undo ---------------- */
function capture(m){ return JSON.stringify({root:m.root,trees:m.trees||[],rootX:m.rootX||0,rootY:m.rootY||0,images:m.images||[],relations:m.relations||[],cards:m.cards||[],strokes:m.strokes||[]}); }
function snapshot(){ const m=cur(); if(!m) return; const s=undoS.get(m.id)||[]; s.push(capture(m)); if(s.length>80) s.shift(); undoS.set(m.id,s); redoS.set(m.id,[]); }
function dropSnapshot(){ const m=cur(); if(!m) return; const s=undoS.get(m.id); if(s) s.pop(); }
function doUndo(){ step(undoS, redoS); }
function doRedo(){ step(redoS, undoS); }
function step(from,to){
  if(store.readOnly) return; const m=cur(); if(!m) return;
  const s=from.get(m.id); if(!s||!s.length) return;
  const t=to.get(m.id)||[]; t.push(capture(m)); to.set(m.id,t);
  Object.assign(m,JSON.parse(s.pop()));
  renderMap(); if(!idx.has(selectedId)) { selectedId=firstRootId(m); renderMap(); }
  renderSidebar();
  save(m.id);
}

/* ---------------- layout ---------------- */
const isDown = () => (cur()&&cur().layout)!=='right';
function lvl(d){ return d===0?'root':d===1?'l1':'l2'; }
function measure(n,d){
  const hs=n.column&&hostSize(n); if(hs) return hs;
  const k=lvl(d)+'|'+styleOf(n)+(n.column?n.children.length:'')+(n.titled??'')+'|'+(n.w||'')+'x'+(n.h||'')+'|'+(n.text||'輸入文字');
  let v=mcache.get(k); if(v) return v;
  measurer.className='node '+lvl(d)+(n.note?' as-note':'')+(n.column?' as-column':''); sizeNode(measurer, n); paintNode(measurer, multiLine(n)?n:{text:n.text||'輸入文字'});
  const r=measurer.getBoundingClientRect(); v={w:Math.ceil(r.width), h:Math.ceil(r.height)};
  mcache.set(k,v); return v;
}
function gapSib(d){ return isDown() ? (d===1?72:30) : (d===1?30:12); }
function gapLvl(d){ return isDown() ? (d===0?120:62) : (d===0?110:56); }
function buildIndex(){
  idx=new Map(); const m=cur(); if(!m) return;
  for(const tree of treesOf(m)) (function walk(n,parent,depth,color){
    idx.set(n.id,{node:n,parent,depth,color,tree});
    n.children.forEach((c,i)=>walk(c,n,depth+1, depth===0 ? (c.color||PALETTE[i%PALETTE.length]) : color));
  })(tree.root,null,0,null);
}
function doLayout(){
  L=new Map(); const m=cur(); if(!m) return; const down=isDown();
  function size(n,d){
    const s=measure(n,d); const kids=n.collapsed?[]:n.children; let tot=0;
    kids.forEach((c,i)=>{ size(c,d+1); const o=L.get(c.id); tot += down?o.sw:o.sh; if(i) tot+=gapSib(d+1); });
    L.set(n.id,{w:s.w,h:s.h,tot, sw:down?Math.max(s.w,tot):0, sh:down?0:Math.max(s.h,tot), x:0,y:0});
  }
  function placeDown(n,cx,y,d){
    const o=L.get(n.id); o.x=cx-o.w/2; o.y=y; let s=cx-o.tot/2;
    (n.collapsed?[]:n.children).forEach(c=>{ const co=L.get(c.id); placeDown(c, s+co.sw/2, y+o.h+gapLvl(d), d+1); s+=co.sw+gapSib(d+1); });
  }
  function placeRight(n,x,cy,d){
    const o=L.get(n.id); o.x=x; o.y=cy-o.h/2; let s=cy-o.tot/2;
    (n.collapsed?[]:n.children).forEach(c=>{ const co=L.get(c.id); placeRight(c, x+o.w+gapLvl(d), s+co.sh/2, d+1); s+=co.sh+gapSib(d+1); });
  }
  for(const tree of treesOf(m)){ size(tree.root,0); (down?placeDown:placeRight)(tree.root,tree.x,tree.y,0); }
  // Nodes dragged to a free spot keep an offset from their automatic place; descendants move along.
  for(const tree of treesOf(m)) (function shift(n,ax,ay){
    const o=L.get(n.id); if(!o) return;
    const x=ax+(n.off?.x||0), y=ay+(n.off?.y||0); o.x+=x; o.y+=y;
    if(!n.collapsed) n.children.forEach(c=>shift(c,x,y));
  })(tree.root,0,0);
}

/* ---------------- render ---------------- */
function renderMap(){
  const m=cur();
  updateEmpty();
  if(!m){ for(const el of els.values()) el.remove(); els.clear(); edges.innerHTML=''; hideBar(); cards?.render(); assets?.render(); relations?.render(); draw?.render(); return; }
  buildIndex(); ensureHosts(m); doLayout(); syncPins();
  const alive=new Set();
  for(const [id,info] of idx){
    const o=L.get(id); if(!o) continue; alive.add(id);
    let el=els.get(id);
    if(!el){ el=document.createElement('div'); el.dataset.id=id; el.dataset.ph='輸入文字'; world.appendChild(el); els.set(id,el); }
    let cls='node '+lvl(info.depth);
    if(id===selectedId) cls+=' sel';
    if(id===editingId) cls+=' editing';
    if(drag && drag.id===id) cls+=' dragging';
    if(drag && drag.target===id) cls+=' drop';
    if(info.node.page && maps.has(info.node.page)) cls+=' has-page';
    if(info.node.note) cls+=' as-note';
    if(info.node.column) cls+=' as-column';
    if(el.className!==cls) el.className=cls;
    const host=hostCard(info.node);
    if(host){ el.classList.add('col-host'); if(el.textContent) el.textContent=''; el._painted=null; }
    else if(id!==editingId) paintNode(el, info.node);
    el.style.transform=`translate(${o.x}px,${o.y}px)`;
    el.style.setProperty('--c', info.color||'var(--accent)');
    sizeNode(el, info.node);
    if(host){ el.style.width=o.w+'px'; el.style.maxWidth='none'; el.style.minHeight=o.h+'px'; }
  }
  for(const [id,el] of els){ if(!alive.has(id)){ el.remove(); els.delete(id); } }
  cards?.render();
  // Column-style nodes are drawn by a real column card; once it has rendered at a new size, lay the tree out again.
  if(!relayingOut && hostsResized()){ relayingOut=true; try{ renderMap(); } finally{ relayingOut=false; } return; }
  draw?.render(); drawEdges(); applyView(); placeBar(); renderGroup(); placeGrip(); syncCtxRail();
}
/* ---------------- note tool rail ---------------- */
// While a note card or a note-style node is selected, the left rail turns into that note's tools (Milanote style).
function ctxTarget(){
  if(groupSize()) return null;
  const c=cards?.focused(); if(c&&c.type==='note') return {kind:'card', card:c};
  const info=selectedId&&idx.get(selectedId); if(info&&info.node.note&&info.parent) return {kind:'node', id:selectedId, node:info.node};
  return null;
}
function syncCtxRail(){
  const t=store.readOnly?null:ctxTarget(), rail=$('ctxRail');
  rail.hidden=!t; if(!t) return;
  const show=(k,on)=>{ const b=rail.querySelector(`[data-ctx="${k}"]`); if(b) b.hidden=!on; };
  ['smaller','bigger','todo','code'].forEach(k=>show(k,t.kind==='card'));
  const titled=t.kind==='card' ? !!t.card.title : noteTitled(t.node);
  const tb=rail.querySelector('[data-ctx="title"]'); tb.classList.toggle('on',titled); tb.title=titled?'移除標題':'加入標題';
  rail.querySelector('[data-ctx="title"] .rail-label').textContent=titled?'移除標題':'標題';
}
function toggleNodeTitle(id){
  const info=idx.get(id); if(!info||!guard()) return; const n=info.node;
  if(editingId) commitEdit();
  snapshot();
  if(noteTitled(n)){ n.titled=false; const lines=n.text.split('\n'); if(!lines[0].trim()) n.text=lines.slice(1).join('\n'); renderMap(); save(currentId); toast('已移除標題'); return; }
  // Turning the title on keeps the current text as body and opens an empty title line to type into.
  n.titled=true; n.text='\n'+(n.text||''); renderMap(); save(currentId);
  startEdit(id,null,true);
  const el=els.get(id), r=document.createRange(); r.setStart(el.firstChild||el,0); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
}
listen($('ctxRail'),'pointerdown',e=>e.preventDefault());
listen($('ctxRail'),'click',e=>{
  const b=e.target.closest('[data-ctx]'), t=ctxTarget(); if(!b) return;
  const k=b.dataset.ctx;
  if(k==='back'||!t){ clearNodeSelection(); cards?.deselect(); syncCtxRail(); return; }
  if(t.kind==='card'){
    if(k==='title') cards.toggleTitle(t.card.id);
    else cards.act(t.card.id, {color:'color',smaller:'fsDown',bigger:'fsUp',todo:'todo',code:'code',delete:'delete'}[k]);
  } else {
    if(k==='title') toggleNodeTitle(t.id);
    else if(k==='color'){ selectedId=t.id; renderMap(); nodebar.classList.add('colors'); placeBar(); }
    else if(k==='delete') deleteSel();
  }
  setTimeout(syncCtxRail);
});
// Selection lives in several modules, so re-check after every interaction.
for(const type of ['pointerup','keyup']) listen(document,type,()=>setTimeout(syncCtxRail));
/* ---------------- column-style nodes ---------------- */
// node.column + node.colCard: the node's body is a column card pinned exactly on the node, so it holds cards and images like any column.
let relayingOut=false;
function hostCard(n){ return n?.column&&n.colCard ? (cur()?.cards||[]).find(c=>c.id===n.colCard)||null : null; }
function hostOf(cardId){ for(const [id,info] of idx) if(info.node.colCard===cardId&&info.node.column) return id; return null; }
function ensureHosts(m){
  for(const [id,info] of idx){
    const n=info.node; if(!n.column) continue;
    if(n.colCard){ const c=hostCard(n); if(c){ n.text=c.title||''; c.anchor={node:id, dx:0, dy:0}; continue; } delete n.column; delete n.colCard; continue; }
    // First time: the title and each further line become a column with note cards.
    const lines=(n.text||'').split('\n'), card={id:uid('c'), type:'column', title:(lines[0]||'').trim(), cards:lines.slice(1).filter(l=>l.trim()).map(t=>({id:uid('c'), type:'note', text:t.trim()})), x:0, y:0, z:nextZ(), anchor:{node:id, dx:0, dy:0}};
    (m.cards ||= []).push(card); n.colCard=card.id; n.text=card.title;
  }
}
function hostSize(n){ const c=hostCard(n), b=c&&cards?.box(c.id); return b ? {w:Math.ceil(b.w), h:Math.ceil(b.h)} : c ? {w:c.w||280, h:c.collapsed?48:110+(c.cards||[]).length*60} : null; }
function hostsResized(){
  for(const [id,info] of idx){ const o=L.get(id), s=info.node.column&&o&&hostSize(info.node); if(s&&(Math.abs(s.w-o.w)>1||Math.abs(s.h-o.h)>1)) return true; }
  return false;
}
function nodeAction(cardId, act){
  const id=hostOf(cardId); if(!id) return;
  cards?.deselect(); selectedId=id;
  if(act==='child') addChild(); else if(act==='unwrap') setNodeStyle(id,'plain');
}
const nodeGrip=document.createElement('div'); nodeGrip.className='node-grip'; nodeGrip.title='拖曳調整大小'; world.append(nodeGrip);
function placeGrip(){
  const o=selectedId&&L.get(selectedId), show=!!o&&!editingId&&!store.readOnly&&(!drag);
  nodeGrip.style.display=show?'':'none';
  if(show){ nodeGrip.style.left=(o.x+o.w)+'px'; nodeGrip.style.top=(o.y+o.h)+'px'; }
}
function drawEdges(){
  const down=isDown(); let out='', hits='';
  const labels=[];
  for(const [id,info] of idx){
    const n=info.node, o=L.get(id); if(!o) continue;
    if(n.collapsed && n.children.length){
      const cx= down? o.x+o.w/2 : o.x+o.w+14, cy= down? o.y+o.h+14 : o.y+o.h/2;
      const col = info.depth===0 ? 'var(--ink-2)' : info.color;
      out+=`<g class="chip" data-toggle="${id}"><circle cx="${cx}" cy="${cy}" r="11" fill="${col}"/><text x="${cx}" y="${cy}">${countDesc(n)+pinsUnder(n)}</text></g>`;
      continue;
    }
    const kids=n.children, k=kids.length;
    kids.forEach((c,i)=>{
      const co=L.get(c.id), ci=idx.get(c.id); if(!co) return;
      const t = k>1 ? (i/(k-1)-.5) : 0;
      let d;
      if(down){
        const sx=o.x+o.w/2 + t*(info.depth===0? o.w*0.36 : 0), sy=o.y+o.h-(info.depth===0?0:3);
        const ex=co.x+co.w/2, ey=co.y+2, dy=ey-sy;
        d=`M${sx} ${sy} C${sx} ${sy+dy*.55} ${ex} ${ey-dy*.55} ${ex} ${ey}`;
      } else {
        const sx=o.x+o.w-(info.depth===0?0:3), sy=o.y+o.h/2 + t*(info.depth===0? o.h*0.4 : 0);
        const ex=co.x+2, ey=co.y+co.h/2, dx=ex-sx;
        d=`M${sx} ${sy} C${sx+dx*.55} ${sy} ${ex-dx*.55} ${ey} ${ex} ${ey}`;
      }
      out+=`<path d="${d}" stroke="${ci.color}" stroke-width="${ci.depth===1?5:3.2}"/>`;
      // A wide invisible twin catches double-clicks for adding text; the label sits at the curve's midpoint.
      hits+=`<path class="edge-hit" data-edge="${c.id}" d="${d}"><title>雙擊線條加入文字</title></path>`;
      const [p0,p1,p2,p3]=d.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number).reduce((a,v,i)=>(i%2?a[a.length-1].push(v):a.push([v]),a),[]);
      if(c.edgeLabel||edgeEditing===c.id) labels.push({id:c.id, text:c.edgeLabel||'', x:(p0[0]+3*p1[0]+3*p2[0]+p3[0])/8, y:(p0[1]+3*p1[1]+3*p2[1]+p3[1])/8});
    });
  }
  edges.innerHTML=out+hits; drawPinEdges();
  const editingEl=edgeEditing&&edgeLabels.querySelector('.editing');
  if(editingEl){ const el=editingEl, at=labels.find(l=>l.id===edgeEditing); if(el&&at){ el.style.left=at.x+'px'; el.style.top=at.y+'px'; } }
  else edgeLabels.replaceChildren(...labels.map(l=>{ const el=document.createElement('div'); el.className='edge-label'; el.dataset.edgeLabel=l.id; el.textContent=l.text; el.style.left=l.x+'px'; el.style.top=l.y+'px'; el.title='雙擊編輯線上文字'; return el; }));
  assets?.render(); relations?.render();
}
function applyView(){
  world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.k})`;
  const g=24*view.k;
  canvas.style.backgroundSize=`${g}px ${g}px`;
  canvas.style.backgroundPosition=`${view.x}px ${view.y}px`;
  $('zLabel').textContent=Math.round(view.k*100)+'%';
  relations?.place(); draw?.place(); placeGroupBar();
}
function bbox(){ let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity; for(const o of [...L.values(),...(assets?.boxes()||[]),...(cards?.boxes()||[]),...(draw?.boxes()||[])]){ a=Math.min(a,o.x); b=Math.min(b,o.y); c=Math.max(c,o.x+o.w); d=Math.max(d,o.y+o.h);} return {x0:a,y0:b,x1:c,y1:d}; }
function fit(){
  const bb=bbox(); if(!Number.isFinite(bb.x0)) return; const cw=canvas.clientWidth, ch=canvas.clientHeight; const pad=isMobile()?32:90;
  const k=clamp(Math.min((cw-pad*2)/Math.max(1,bb.x1-bb.x0),(ch-pad*2)/Math.max(1,bb.y1-bb.y0)), .25, 1);
  view.k=k; view.x=cw/2-(bb.x0+bb.x1)/2*k; view.y=ch/2-(bb.y0+bb.y1)/2*k; applyView(); placeBar();
}
function ensureVisible(id){
  const o=L.get(id); if(!o) return; const cw=canvas.clientWidth, ch=canvas.clientHeight, m=60;
  const x0=view.x+o.x*view.k, y0=view.y+o.y*view.k, x1=x0+o.w*view.k, y1=y0+o.h*view.k;
  let dx=0, dy=0;
  if(x0<m) dx=m-x0; else if(x1>cw-m) dx=(cw-m)-x1;
  if(y0<m+40) dy=m+40-y0; else if(y1>ch-m) dy=(ch-m)-y1;
  if(dx||dy){ view.x+=dx; view.y+=dy; applyView(); placeBar(); }
}
function zoomAt(px,py,f){ const k=clamp(view.k*f,.2,2.5); f=k/view.k; view.x=px-(px-view.x)*f; view.y=py-(py-view.y)*f; view.k=k; applyView(); placeBar(); }
function zoomCenter(f){ zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, f); }

/* ---------------- node toolbar ---------------- */
function hideBar(){ nodebar.classList.remove('show','colors','styling'); }
function placeBar(){
  const info=idx.get(selectedId), o=L.get(selectedId);
  if(!info||!o||editingId||store.readOnly||drag){ hideBar(); return; }
  const showColor=info.depth>0, custom=!!(info.node.off||info.node.w||info.node.h);
  nodebar.querySelector('[data-act="reset"]').style.display=custom?'':'none';
  nodebar.querySelector('[data-act="color"]').style.display=showColor?'':'none';
  nodebar.querySelector('[data-for="color"]').style.display=showColor?'':'none';
  nodebar.querySelector('[data-act="collapse"]').style.display=info.node.children.length?'':'none';
  nodebar.querySelector('[data-act="collapse"]').firstElementChild.style.transform=info.node.collapsed?'rotate(-90deg)':'';
  nodebar.querySelector('[data-act="style"]').style.display=info.depth>0?'':'none';
  nodebar.querySelectorAll('[data-nstyle]').forEach(b=>b.classList.toggle('on',b.dataset.nstyle===styleOf(info.node)));
  const pageBtn=nodebar.querySelector('[data-act="page"]'), hasPage=!!(info.node.page&&maps.has(info.node.page));
  pageBtn.title=hasPage?'開啟獨立頁面（雙擊節點）':'建立獨立頁面';
  pageBtn.querySelector('i').className='bi '+(hasPage?'bi-folder2-open':'bi-folder-plus');
  $('curSwatch').style.setProperty('--c', info.color||PALETTE[0]);
  nodebar.classList.add('show');
  const bw=nodebar.offsetWidth, bh=nodebar.offsetHeight, cw=canvas.clientWidth;
  let left=view.x+(o.x+o.w/2)*view.k-bw/2, top=view.y+o.y*view.k-bh-10;
  if(top<8) top=view.y+(o.y+o.h)*view.k+10;
  left=clamp(left,8,Math.max(8,cw-bw-8));
  nodebar.style.left=left+'px'; nodebar.style.top=top+'px';
}
(function buildSwatches(){
  const box=$('swatches'); box.replaceChildren();
  PALETTE.forEach(c=>{ const b=document.createElement('button'); b.style.setProperty('--c',c); b.dataset.color=c; b.title='換成這個顏色'; b.setAttribute('aria-label','分支顏色 '+c); box.appendChild(b); });
})();
listen(nodebar, 'pointerdown', e=>e.stopPropagation());
listen(nodebar, 'click', e=>{
  const ns=e.target.closest('[data-nstyle]');
  if(ns){ nodebar.classList.remove('styling'); setNodeStyle(selectedId, ns.dataset.nstyle); return; }
  const sw=e.target.closest('[data-color]');
  if(sw){ setBranchColor(sw.dataset.color); nodebar.classList.remove('colors'); return; }
  const b=e.target.closest('[data-act]'); if(!b) return;
  const a=b.dataset.act;
  if(a==='edit') startEdit(selectedId);
  else if(a==='child') addChild();
  else if(a==='sibling') addSibling();
  else if(a==='delete') deleteSel();
  else if(a==='collapse') toggleCollapse(selectedId);
  else if(a==='page') openNodePage(selectedId);
  else if(a==='view') viewNodePage(selectedId);
  else if(a==='style'){ nodebar.classList.add('styling'); placeBar(); }
  else if(a==='reset') resetNodeLayout(selectedId);
  else if(a==='color'){
    const info=idx.get(selectedId);
    $('swatches').querySelectorAll('button').forEach(x=>x.classList.toggle('on', x.dataset.color===(info&&info.color)));
    nodebar.classList.add('colors'); placeBar();
  }
});

/* ---------------- edits ---------------- */
function guard(){ return !store.readOnly && !!cur(); }
function addChild(){
  if(!guard()) return; const info=idx.get(selectedId); if(!info) return;
  if(editingId) commitEdit();
  snapshot();
  const n=mkNode('', info.depth===0? nextColor(info.node):null);
  info.node.collapsed=false; info.node.children.push(n);
  selectedId=n.id; renderMap(); ensureVisible(n.id); startEdit(n.id,null,true); save(currentId);
}
function addSibling(){
  if(!guard()) return; const info=idx.get(selectedId); if(!info) return;
  if(!info.parent) return addChild();
  if(editingId) commitEdit();
  snapshot();
  const p=info.parent, i=p.children.indexOf(info.node);
  const n=mkNode('', info.depth===1? nextColor(info.parent):null);
  p.children.splice(i+1,0,n);
  selectedId=n.id; renderMap(); ensureVisible(n.id); startEdit(n.id,null,true); save(currentId);
}
function deleteSel(){
  if(!guard()) return; const info=idx.get(selectedId); if(!info) return;
  snapshot();
  if(!info.parent){
    // Deleting a central topic removes its whole tree; the next tree becomes the main one.
    const m=cur(), removed=new Set();
    (function collect(node){removed.add(node.id);node.children.forEach(collect);})(info.node);
    m.relations=(m.relations||[]).filter(line=>!removed.has(line.from)&&!removed.has(line.to));
    if(info.tree.main){ const next=(m.trees||[]).shift(); m.root=next?next.root:null; m.rootX=next?next.x:0; m.rootY=next?next.y:0; }
    else m.trees=m.trees.filter(t=>t!==info.tree);
    selectedId=null; renderMap(); save(currentId); renderSidebar();
    if(!m.root) toast('已刪除心智圖，可用左側「心智圖」工具再新增');
    return;
  }
  const p=info.parent, i=p.children.indexOf(info.node);
  const removed=new Set();
  (function collect(node){removed.add(node.id);node.children.forEach(collect);})(info.node);
  cur().relations=(cur().relations||[]).filter(line=>!removed.has(line.from)&&!removed.has(line.to));
  p.children.splice(i,1);
  selectedId = (p.children[i]||p.children[i-1]||p).id;
  renderMap(); save(currentId); renderSidebar();
}
function resetNodeLayout(id){
  if(!guard()) return; const n=idx.get(id)?.node; if(!n) return;
  snapshot(); delete n.off; delete n.w; delete n.h; renderMap(); save(currentId); toast('已還原自動排列的位置與大小');
}
// A node can switch to note style: a paper card that holds several lines, still part of the tree.
function setNodeStyle(id, style){
  if(!guard()) return; const info=idx.get(id); if(!info||!info.parent||styleOf(info.node)===style) return;
  if(editingId) commitEdit();
  snapshot();
  const n=info.node, host=hostCard(n);
  if(host){
    const m=cur(), a=L.get(id)||{x:0,y:0,w:0,h:0};
    const notes=(host.cards||[]).filter(c=>c.type==='note'), rest=(host.cards||[]).filter(c=>c.type!=='note');
    n.text=[host.title||'', ...notes.map(c=>[c.title,c.text].filter(Boolean).join(' '))].filter((l,i)=>i===0||l.trim()).join('\n');
    m.cards=m.cards.filter(c=>c!==host);
    rest.forEach((c,i)=>{ Object.assign(c,{x:a.x+a.w+40, y:a.y+i*90, z:nextZ()}); m.cards.push(c); });
  }
  delete n.note; delete n.column; delete n.colCard;
  if(style==='note') n.note=true; else if(style==='column') n.column=true; else n.text=n.text.replace(/\s+/g,' ').trim();
  renderMap(); save(currentId);
  toast(style==='note'?'已轉成筆記：第一行是標題，按 Shift+Enter 換行寫內文':style==='column'?'已轉成欄位：可以把卡片或圖片拖進來':'已轉回一般節點');
}
function toggleCollapse(id){
  if(!guard()) return; const info=idx.get(id); if(!info||!info.node.children.length) return;
  snapshot(); info.node.collapsed=!info.node.collapsed;
  if(info.node.collapsed && selectedId && isAncestor(id, selectedId)) selectedId=id;
  renderMap(); save(currentId);
}
function setBranchColor(c){
  if(!guard()) return; let info=idx.get(selectedId); if(!info||!info.depth) return;
  while(info.depth>1) info=idx.get(info.parent.id);
  snapshot(); info.node.color=c; renderMap(); save(currentId);
}
function moveNode(id, targetId, snapped){
  if(!guard()) return; const a=idx.get(id), t=idx.get(targetId); if(!a||!t||!a.parent) return;
  if(id===targetId || isAncestor(id,targetId) || a.parent.id===targetId) return;
  if(!snapped) snapshot();
  a.parent.children.splice(a.parent.children.indexOf(a.node),1);
  if(t.depth===0) a.node.color = a.node.color || nextColor(t.node);
  t.node.collapsed=false; t.node.children.push(a.node);
  selectedId=id; renderMap(); save(currentId);
}

/* ---------------- text editing ---------------- */
function startEdit(id, initial, fresh){
  if(store.readOnly) return; const el=els.get(id), info=idx.get(id); if(!el||!info) return;
  if(editingId && editingId!==id) commitEdit();
  if(!fresh) snapshot();
  editingId=id; editOrig=info.node.text; editFresh=!!fresh; selectedId=id;
  try{ el.contentEditable='plaintext-only'; }catch(e){}
  if(el.contentEditable!=='plaintext-only') el.contentEditable='true';
  el.className+=' editing';
  if(initial!=null){ el.textContent=initial; info.node.text=initial; }
  else if(multiLine(info.node)) el.textContent=info.node.text;
  el._painted=null;
  hideBar(); el.focus({preventScroll:true});
  const r=document.createRange(); r.selectNodeContents(el); if(initial!=null) r.collapse(false);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  if(initial!=null) renderMap();
}
function commitEdit(){
  if(!editingId) return; const id=editingId; editingId=null;
  const el=els.get(id), info=idx.get(id);
  if(el){ el.contentEditable='false'; }
  if(info){
    // Note-style nodes keep their line breaks; plain nodes stay on one line.
    const raw=el?el.textContent:info.node.text;
    let t=multiLine(info.node) ? raw.replace(/\r/g,'').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').replace(/\s+$/,'') : raw.replace(/\s+/g,' ').trim();
    // A title left empty switches the title off instead of promoting the first body line.
    if(multiLine(info.node)){ if(info.node.titled && /^\s*\n/.test(t)){ t=t.replace(/^\s*\n/,''); info.node.titled=false; } t=t.replace(/^\s+/,''); }
    info.node.text=t;
    if(!editFresh && t===editOrig) dropSnapshot(); else save(currentId);
  }
  const sel=window.getSelection(); if(sel) sel.removeAllRanges();
  renderMap();
  canvas.focus({preventScroll:true});
}
listen(world, 'input', e=>{
  if(!editingId) return; const el=els.get(editingId), info=idx.get(editingId); if(!el||!info) return;
  info.node.text=el.textContent.replace(/\n/g,' ');
  renderMap();
});
listen(world, 'keydown', e=>{
  if(!editingId) return;
  if(e.isComposing || e.keyCode===229) return;
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); commitEdit(); }
  else if(e.key==='Enter' && e.shiftKey){ if(!multiLine(idx.get(editingId)?.node)) e.preventDefault(); }
  else if(e.key==='Tab'){ e.preventDefault(); commitEdit(); addChild(); }
  else if(e.key==='Escape'){ e.preventDefault(); commitEdit(); }
  e.stopPropagation();
});
listen(world, 'focusout', e=>{ if(editingId && e.target===els.get(editingId)) commitEdit(); });
listen(world, 'paste', e=>{
  if(!editingId) return; e.preventDefault();
  const raw=(e.clipboardData||window.clipboardData).getData('text'), t=multiLine(idx.get(editingId)?.node) ? raw.replace(/\r/g,'') : raw.replace(/\s+/g,' ');
  document.execCommand('insertText', false, t);
});

/* ---------------- pointer: select / pan / drag / pinch ---------------- */
const ptrs=new Map(); let gesture=null, drag=null, ghost=null;
listen(canvas, 'pointerdown', e=>{
  if(e.pointerType==='mouse' && e.button!==0) return;
  if(e.target.closest('.zoombar,.empty-state,.nodebar,.card,.draw-panel,.edge-label.editing')) return;
  closePops();
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){ endDrag(false); const p=[...ptrs.values()]; gesture={type:'pinch', d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y), mx:(p[0].x+p[1].x)/2, my:(p[0].y+p[1].y)/2}; return; }
  if(ptrs.size>2) return;
  if(e.target.closest('.node-grip') && selectedId && !store.readOnly){
    const el=els.get(selectedId), n=idx.get(selectedId)?.node; if(!el||!n) return;
    snapshot(); gesture={type:'resize', id:selectedId, sx:e.clientX, sy:e.clientY, w:el.offsetWidth, h:el.offsetHeight, moved:false}; hideBar();
    return;
  }
  const chip=e.target.closest('.chip');
  if(chip){ toggleCollapse(chip.dataset.toggle); gesture=null; return; }
  const nodeEl=e.target.closest('.node');
  if(nodeEl){
    const id=nodeEl.dataset.id;
    if(id===editingId) return;
    if(editingId) commitEdit();
    if(selectedId!==id){ selectedId=id; nodebar.classList.remove('styling','colors'); renderMap(); }
    else nodebar.classList.remove('colors');
    canvas.focus({preventScroll:true});
    gesture={type:'press', id, sx:e.clientX, sy:e.clientY};
    return;
  }
  if(editingId) commitEdit();
  if(selectedId){ selectedId=null; renderMap(); }
  canvas.focus({preventScroll:true});
  gesture={type:'pan'}; canvas.classList.add('panning');
});
listen(window, 'pointermove', e=>{
  if(!ptrs.has(e.pointerId)) return;
  const prev=ptrs.get(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(!gesture) return;
  if(gesture.type==='pinch' && ptrs.size===2){
    const p=[...ptrs.values()], d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y), mx=(p[0].x+p[1].x)/2, my=(p[0].y+p[1].y)/2;
    const r=canvas.getBoundingClientRect();
    view.x+=mx-gesture.mx; view.y+=my-gesture.my;
    zoomAt(mx-r.left, my-r.top, d/Math.max(1,gesture.d));
    gesture.d=d; gesture.mx=mx; gesture.my=my;
  } else if(gesture.type==='pan'){
    view.x+=e.clientX-prev.x; view.y+=e.clientY-prev.y; applyView(); placeBar();
  } else if(gesture.type==='press'){
    if(Math.hypot(e.clientX-gesture.sx,e.clientY-gesture.sy)>6){
      const info=idx.get(gesture.id);
      if(!store.readOnly && info && info.depth>0){ startDrag(gesture.id, e, gesture.sx, gesture.sy); gesture.type='drag'; }
      else if(!store.readOnly && info){ snapshot(); Object.assign(gesture,{type:'tree', tree:info.tree, ox:info.tree.x, oy:info.tree.y}); hideBar(); }
      else { gesture.type='pan'; canvas.classList.add('panning'); }
    }
  } else if(gesture.type==='drag'){ moveDrag(e); }
  else if(gesture.type==='resize'){
    const n=idx.get(gesture.id)?.node; if(!n) return; gesture.moved=true;
    n.w=Math.round(clamp(gesture.w+(e.clientX-gesture.sx)/view.k, 60, 900));
    n.h=Math.round(clamp(gesture.h+(e.clientY-gesture.sy)/view.k, 24, 900));
    renderMap(); hideBar();
  }
  else if(gesture.type==='tree'){ setTreePos(gesture.tree, Math.round(gesture.ox+(e.clientX-gesture.sx)/view.k), Math.round(gesture.oy+(e.clientY-gesture.sy)/view.k)); renderMap(); }
});
function upHandler(e){
  if(!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if(gesture && gesture.type==='drag') endDrag(e.type==='pointerup');
  if(gesture && gesture.type==='tree') save(currentId);
  if(gesture && gesture.type==='resize'){ if(gesture.moved) save(currentId); else dropSnapshot(); placeBar(); }
  if(ptrs.size===0 || (gesture && gesture.type==='pinch')){ gesture=null; }
  canvas.classList.remove('panning');
}
listen(window, 'pointerup', upHandler);
listen(window, 'pointercancel', upHandler);

// Dragging a node moves it live: dropped on another node it becomes that node's child, dropped elsewhere it stays put.
function startDrag(id, e, px, py){
  const n=idx.get(id).node;
  snapshot();
  drag={id, target:null, sx:px??e.clientX, sy:py??e.clientY, ox:n.off?.x||0, oy:n.off?.y||0};
  hideBar(); moveDrag(e);
}
function moveDrag(e){
  if(!drag) return;
  const n=idx.get(drag.id)?.node; if(!n) return;
  n.off={x:Math.round(drag.ox+(e.clientX-drag.sx)/view.k), y:Math.round(drag.oy+(e.clientY-drag.sy)/view.k)};
  const hit=document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.classList?.contains('node')&&el.dataset.id&&el.dataset.id!==drag.id&&!isAncestor(drag.id,el.dataset.id));
  const info=idx.get(drag.id); let t=hit?.dataset.id||null;
  if(t && info?.parent?.id===t) t=null;
  drag.target=t; renderMap();
}
function endDrag(drop){
  if(!drag) return; const d=drag; drag=null;
  const n=idx.get(d.id)?.node;
  if(drop && d.target){ if(n) delete n.off; moveNode(d.id, d.target, true); return; }
  if(n && !drop){ if(d.ox||d.oy) n.off={x:d.ox,y:d.oy}; else delete n.off; dropSnapshot(); }
  else if(n && n.off && !n.off.x && !n.off.y) delete n.off;
  renderMap(); if(drop) save(currentId);
}

function editEdgeLabel(id){
  const info=idx.get(id); if(!info||!info.parent||store.readOnly) return;
  if(editingId) commitEdit();
  hideBar(); snapshot(); edgeEditing=id; drawEdges();
  const el=edgeLabels.querySelector(`[data-edge-label="${CSS.escape(id)}"]`); if(!el){ edgeEditing=null; dropSnapshot(); return; }
  el.classList.add('editing');
  try{ el.contentEditable='plaintext-only'; }catch(err){} if(el.contentEditable!=='plaintext-only') el.contentEditable='true';
  el.focus({preventScroll:true}); const r=document.createRange(); r.selectNodeContents(el); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
}
function commitEdgeLabel(cancel){
  const id=edgeEditing; if(!id) return; edgeEditing=null;
  const el=edgeLabels.querySelector('.editing'), info=idx.get(id);
  const before=info?.node.edgeLabel||'', t=cancel?before:(el?.textContent||'').replace(/\s+/g,' ').trim();
  if(info){ if(t) info.node.edgeLabel=t; else delete info.node.edgeLabel; }
  if(t===before) dropSnapshot(); else save(currentId);
  drawEdges();
}
listen(edgeLabels,'keydown',e=>{
  if(!edgeEditing||e.isComposing||e.keyCode===229) return;
  if(e.key==='Enter'||e.key==='Escape'){ e.preventDefault(); commitEdgeLabel(false); canvas.focus({preventScroll:true}); }
  e.stopPropagation();
});
listen(edgeLabels,'focusout',e=>{ if(edgeEditing&&e.target.classList.contains('editing')) commitEdgeLabel(false); });
listen(edgeLabels,'paste',e=>{ if(!edgeEditing) return; e.preventDefault(); e.stopPropagation(); document.execCommand('insertText',false,(e.clipboardData?.getData('text')||'').replace(/\s+/g,' ')); });
listen(canvas, 'dblclick', e=>{
  // Double-clicking a branch line (or its text) writes on the line.
  const hit=e.target.closest?.('[data-edge],[data-edge-label]') || document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-edge],[data-edge-label]');
  if(hit && !e.target.closest('.node,.card')){ e.preventDefault(); editEdgeLabel(hit.dataset.edge||hit.dataset.edgeLabel); return; }
  const n=e.target.closest('.node');
  if(!n || n.dataset.id===editingId) return;
  e.preventDefault();
  // A node that owns a page opens it; otherwise double-click edits the text.
  const page=idx.get(n.dataset.id)?.node.page;
  if(page && maps.has(page)) openNodePage(n.dataset.id); else startEdit(n.dataset.id);
});
listen(canvas, 'wheel', e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  if(e.ctrlKey||e.metaKey) zoomAt(e.clientX-r.left, e.clientY-r.top, Math.exp(-e.deltaY*0.01));
  else { view.x-=e.deltaX; view.y-=e.deltaY; applyView(); placeBar(); }
},{passive:false});

/* ---------------- keyboard ---------------- */
function nav(key){
  const info=idx.get(selectedId); if(!info) return false; const down=isDown();
  const toP=down?'ArrowUp':'ArrowLeft', toC=down?'ArrowDown':'ArrowRight', prv=down?'ArrowLeft':'ArrowUp', nxt=down?'ArrowRight':'ArrowDown';
  let t=null;
  if(key===toP) t=info.parent;
  else if(key===toC){ const ks=info.node.collapsed?[]:info.node.children; if(ks.length) t=ks[Math.floor((ks.length-1)/2)]; }
  else if((key===prv||key===nxt) && info.parent){ const a=info.parent.children, i=a.indexOf(info.node); t=a[i+(key===nxt?1:-1)]||null; }
  else return false;
  if(t){ selectedId=t.id; renderMap(); ensureVisible(t.id); }
  return true;
}
listen(document, 'keydown', e=>{
  if(editingId) return;
  const tg=e.target; if(tg && (tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.isContentEditable)) return;
  const mod=e.metaKey||e.ctrlKey;
  if(e.key==='Escape'){ closePops(); if(selectedId){ selectedId=null; renderMap(); } return; }
  if(!cur()) return;
  if(mod && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?doRedo():doUndo(); return; }
  if(mod && e.key.toLowerCase()==='y'){ e.preventDefault(); doRedo(); return; }
  if(mod && (e.key==='='||e.key==='+')){ e.preventDefault(); zoomCenter(1.2); return; }
  if(mod && e.key==='-'){ e.preventDefault(); zoomCenter(1/1.2); return; }
  if(mod && e.key==='0'){ e.preventDefault(); fit(); return; }
  if(!selectedId) {
    if(e.key.startsWith('Arrow') || e.key==='Tab'){ if(tg===canvas && firstRootId(cur())){ e.preventDefault(); selectedId=firstRootId(cur()); renderMap(); } }
    return;
  }
  if(e.key.startsWith('Arrow')){ if(nav(e.key)) e.preventDefault(); return; }
  if(store.readOnly) return;
  switch(e.key){
    case 'Tab': e.preventDefault(); addChild(); break;
    case 'Enter': e.preventDefault(); addSibling(); break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteSel(); break;
    case 'F2': e.preventDefault(); startEdit(selectedId); break;
    case ' ': e.preventDefault(); toggleCollapse(selectedId); break;
    default:
      if(e.key.length===1 && !mod && !e.altKey){ e.preventDefault(); startEdit(selectedId, e.key); }
  }
});

/* ---------------- sidebar ---------------- */
function sortedMaps(){ return [...maps.values()].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)); }
/* ---------------- independent pages ---------------- */
// A page is a map opened from a board card; it stays out of the sidebar while its parent still holds that card.
// Pages are referenced by board cards and by mind-map nodes that open into their own page.
function boardRefs(m){
  const ids=new Set();
  (function walk(list){ for(const c of list||[]){ if(c.type==='board'&&c.mapId) ids.add(c.mapId); walk(c.cards); } })(m?.cards);
  if(m) for(const t of treesOf(m)) (function walk(n){ if(n.page) ids.add(n.page); n.children.forEach(walk); })(t.root);
  return ids;
}
// The node's page id, creating one named after the node the first time.
function ensureNodePage(info){
  if(info.node.page&&maps.has(info.node.page)) return info.node.page;
  if(!guard()) return null;
  snapshot();
  const pid=createPage(); if(!pid){ dropSnapshot(); return null; }
  info.node.page=pid; renamePage(pid, info.node.text||'未命名頁面');
  save(currentId); renderMap(); return pid;
}
function viewNodePage(id){
  const info=idx.get(id); if(!info) return;
  if(editingId) commitEdit();
  const pid=ensureNodePage(info); if(pid) openViewer(pid);
}
/* ---------------- clipboard ---------------- */
// Ctrl+C / Ctrl+X / Ctrl+V copy cards, images, drawings and branches between maps and pages (and across windows of the app).
const CLIP_TYPE='application/x-yozumind+json';
let clip=null, pasteCount=0, lastPointer=null;
listen(canvas,'pointermove',e=>{ lastPointer={x:e.clientX, y:e.clientY}; });
listen(canvas,'pointerleave',()=>{ lastPointer=null; });
function typingIn(t){ return t && (t.closest?.('input,textarea') || t.isContentEditable); }
function clipSelection(){
  if(groupSize()) return {kind:'group', items:[groupData()], label:`${groupSize()} 個物件`};
  const strokes=draw?.selection()||[]; if(strokes.length) return {kind:'strokes', items:strokes, label:`${strokes.length} 筆塗鴉`};
  const card=cards?.selection(); if(card) return {kind:'card', items:[card], label:card.text||card.title||card.url||'卡片'};
  const image=assets?.selection(); if(image) return {kind:'image', items:[image], label:'圖片'};
  const info=selectedId&&idx.get(selectedId); if(info) return {kind:'node', items:[info.node], label:info.node.text||'節點'};
  return null;
}
function onCopy(e, cutting){
  if(typingIn(e.target) || String(window.getSelection())) return;
  const sel=clipSelection(); if(!sel||!cur()) return;
  e.preventDefault();
  clip={kind:sel.kind, items:JSON.parse(JSON.stringify(sel.items)), text:sel.label};
  e.clipboardData?.setData('text/plain', sel.label); e.clipboardData?.setData(CLIP_TYPE, JSON.stringify(clip));
  pasteCount=0;
  if(!cutting){ toast('已複製，可到任何心智圖或頁面按 Ctrl+V 貼上'); return; }
  if(store.readOnly) return;
  if(sel.kind==='group') deleteGroup(); else if(sel.kind==='strokes') draw.cut(); else if(sel.kind==='card') cards.cut(); else if(sel.kind==='image') assets.cut(); else deleteSel();
  renderSidebar(); toast('已剪下，到要放的位置按 Ctrl+V 貼上');
}
// Canvas pointer handlers cancel the default focus change, so each window (main or side viewer) claims focus itself to receive shortcuts.
listen(document,'pointerdown',e=>{
  if(document.activeElement?.tagName==='IFRAME' && !e.target.closest?.('iframe')) document.activeElement.blur();
  if(!document.hasFocus()) window.focus();
},true);
listen(document,'copy',e=>onCopy(e,false));
listen(document,'cut',e=>onCopy(e,true));
// Fresh ids everywhere, keeping each id's prefix (c-, n-, i-, img-, s-).
function reId(value){
  if(Array.isArray(value)) return value.map(reId);
  if(!value||typeof value!=='object') return value;
  const out={}; for(const [k,v] of Object.entries(value)) out[k]=k==='id'&&typeof v==='string' ? uid(v.split('-')[0]) : reId(v);
  return out;
}
// A pasted page link takes the page along: an orphaned page (left by a cut) moves here, a page still in use is duplicated.
function adoptPages(items){
  const relink=id=>{
    const page=maps.get(id); if(!page) return id;
    const owner=page.parentId&&maps.get(page.parentId);
    if(!owner||!boardRefs(owner).has(id)){ page.parentId=currentId; save(id); return id; }
    return duplicatePage(id, currentId);
  };
  (function walk(v){ if(Array.isArray(v)) return v.forEach(walk); if(!v||typeof v!=='object') return;
    if(v.type==='board'&&v.mapId) v.mapId=relink(v.mapId);
    if(typeof v.page==='string'&&!('type' in v)) v.page=relink(v.page);
    Object.values(v).forEach(walk); })(items);
}
function duplicatePage(id, parentId){
  const src=maps.get(id), copy=JSON.parse(JSON.stringify(src));
  Object.assign(copy,{id:uid('m'), parentId, createdAt:Date.now(), updatedAt:Date.now(), rev:''});
  if(copy.root) copy.root=reId(copy.root);
  copy.trees=reId(copy.trees||[]); copy.cards=reId(copy.cards||[]); copy.images=reId(copy.images||[]); copy.strokes=reId(copy.strokes||[]); copy.relations=[];
  maps.set(copy.id,copy); save(copy.id,true);
  adoptPagesIn(copy);
  return copy.id;
}
function adoptPagesIn(m){
  const prev=currentId; currentId=m.id;
  try{ adoptPages([m.cards, m.root, m.trees]); } finally { currentId=prev; }
}
function pastePoint(){
  const r=canvas.getBoundingClientRect(), off=24*(pasteCount++%8);
  const sx=lastPointer?lastPointer.x-r.left:canvas.clientWidth/2, sy=lastPointer?lastPointer.y-r.top:canvas.clientHeight/2;
  return {x:(sx-view.x)/view.k+off, y:(sy-view.y)/view.k+off};
}
listen(document,'paste',e=>{
  if(typingIn(e.target)) return;
  const docs=[...(e.clipboardData?.files||[])].filter(fileKind);
  if(docs.length){ e.preventDefault(); e.stopImmediatePropagation(); cards?.addFiles(docs, pastePoint()); return; }
  let data=null;
  try{ const raw=e.clipboardData?.getData(CLIP_TYPE); if(raw) data=JSON.parse(raw); }catch(err){}
  if(!data && clip && e.clipboardData?.getData('text/plain')===clip.text && !e.clipboardData?.files?.length) data=clip;
  if(!data || !Array.isArray(data.items) || !data.items.length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const m=cur(); if(!m){ toast('請先建立或開啟一張心智圖'); return; }
  if(store.readOnly){ toast('你目前只有檢視權限'); return; }
  if(editingId) commitEdit();
  const items=reId(data.items), at=pastePoint();
  (function unpin(v){ if(Array.isArray(v)) return v.forEach(unpin); if(v&&typeof v==='object'){ delete v.anchor; Object.values(v).forEach(unpin); } })(items);
  adoptPages(items);
  if(data.kind==='group') pasteGroup(items[0], at);
  else if(data.kind==='card') cards.paste(items[0], at);
  else if(data.kind==='image') assets.paste(items[0], at);
  else if(data.kind==='strokes'){ if(!draw) return; draw.paste(items, at); }
  else if(data.kind==='node'){
    const node=sanitize(items[0]), parent=selectedId&&idx.get(selectedId);
    snapshot();
    if(parent){ parent.node.collapsed=false; parent.node.children.push(node); }
    else { m.trees ||= []; m.trees.push({id:uid('t'), x:Math.round(at.x), y:Math.round(at.y), root:node}); }
    cards?.deselect(); assets?.deselect(); relations?.deselect();
    selectedId=node.id; renderMap(); ensureVisible(node.id); save(currentId);
  }
  renderSidebar();
}, true);
// Files dragged in from the desktop: documents become file cards (inside a column or folder when dropped on one), images become canvas images.
listen(canvas,'dragover',e=>{ if(e.dataTransfer?.types.includes('Files')){ e.preventDefault(); e.dataTransfer.dropEffect=store.readOnly?'none':'copy'; } });
listen(canvas,'drop',e=>{
  const files=[...(e.dataTransfer?.files||[])]; if(!files.length) return;
  e.preventDefault();
  const r=canvas.getBoundingClientRect(), at={x:(e.clientX-r.left-view.x)/view.k, y:(e.clientY-r.top-view.y)/view.k};
  const box=document.elementFromPoint(e.clientX,e.clientY)?.closest('.card-column,.card-folder');
  const docs=files.filter(fileKind), images=files.filter(f=>f.type.startsWith('image/'));
  if(docs.length) cards?.addFiles(docs, at, box?.dataset.id||null);
  if(images.length) assets?.addFiles(images);
  if(!docs.length && !images.length) toast('只支援 PDF、Word、Excel 檔案與圖片');
});
listen($('attachBtn'),'click',()=>{ $('attachFile').value=''; $('attachFile').click(); });
listen($('attachFile'),'change',()=>{ const files=[...$('attachFile').files]; if(files.length) cards?.addFiles(files, pastePoint()); });
/* ---------------- objects pinned to nodes ---------------- */
// A top-level card or canvas image can hang from a node (anchor: {node, dx, dy} relative to the node's box):
// it follows the node when the layout moves and hides while any ancestor is collapsed.
let pinHidden=new Set();
const pinnedObjects=m=>[...(m?.cards||[]), ...(m?.images||[])].filter(o=>o.anchor);
function syncPins(){
  pinHidden=new Set(); const m=cur(); if(!m) return;
  for(const o of pinnedObjects(m)){
    const info=idx.get(o.anchor.node);
    if(!info){ delete o.anchor; continue; }
    const b=L.get(o.anchor.node);
    if(!b){ pinHidden.add(o.id); continue; }
    // While a group drag carries the object but not its mind map, let it move freely.
    if(groupDrag?.moved && (group?.cards.has(o.id)||group?.images.has(o.id)) && !group.trees.has(info.tree.root.id)) continue;
    o.x=b.x+o.anchor.dx; o.y=b.y+o.anchor.dy;
  }
}
function pinBox(o){ return o.src!==undefined&&o.w ? o : cards?.box(o.id); }
function drawPinEdges(){
  const m=cur(); let out='';
  for(const o of pinnedObjects(m)){
    if(pinHidden.has(o.id)||hostOf(o.id)) continue;
    const a=L.get(o.anchor.node), b=pinBox(o), info=idx.get(o.anchor.node); if(!a||!b) continue;
    const acx=a.x+a.w/2, acy=a.y+a.h/2, bcx=b.x+b.w/2, bcy=b.y+b.h/2, vertical=Math.abs(bcy-acy)*1.2>=Math.abs(bcx-acx);
    let d;
    if(vertical){ const sy=bcy>acy?a.y+a.h:a.y, ey=bcy>acy?b.y:b.y+b.h, my=(sy+ey)/2; d=`M${acx} ${sy} C${acx} ${my} ${bcx} ${my} ${bcx} ${ey}`; }
    else { const sx=bcx>acx?a.x+a.w:a.x, ex=bcx>acx?b.x:b.x+b.w, mx=(sx+ex)/2; d=`M${sx} ${acy} C${mx} ${acy} ${mx} ${bcy} ${ex} ${bcy}`; }
    const color=info.depth===0?'var(--ink-2)':info.color;
    out+=`<path d="${d}" stroke="${color}"/><circle cx="${vertical?acx:(bcx>acx?a.x+a.w:a.x)}" cy="${vertical?(bcy>acy?a.y+a.h:a.y):acy}" r="3.5" fill="${color}"/>`;
  }
  pinEdges.innerHTML=out;
}
function objectById(m,id){ return (m?.cards||[]).find(c=>c.id===id)||(m?.images||[]).find(i=>i.id===id); }
function nodeAtPoint(x,y){ return document.elementsFromPoint(x,y).find(el=>el.classList?.contains('node')&&el.dataset.id&&L.has(el.dataset.id)); }
// After a card or image is dropped: onto a node pins it there; a pinned object keeps following its node unless dragged far away.
function objectMoved(id, cx, cy){
  const m=cur(), o=objectById(m,id); if(!o||store.readOnly) return;
  clearAttachHint();
  const hostNode=hostOf(id);
  if(hostNode){
    const n=idx.get(hostNode).node, a=L.get(hostNode); if(!a) return;
    n.off={x:Math.round((n.off?.x||0)+o.x-a.x), y:Math.round((n.off?.y||0)+o.y-a.y)};
    save(currentId); renderMap(); return;
  }
  const target=cx!=null&&nodeAtPoint(cx,cy);
  if(target){
    const nid=target.dataset.id, a=L.get(nid), b=pinBox(o)||{w:o.w||240,h:o.h||80}, info=idx.get(nid);
    // Park the object just below (or right of) the node so it doesn't cover it.
    if(isDown()){ o.x=a.x+a.w/2-b.w/2; o.y=a.y+a.h+48; } else { o.x=a.x+a.w+48; o.y=a.y+a.h/2-b.h/2; }
    o.anchor={node:nid, dx:o.x-a.x, dy:o.y-a.y};
    save(currentId); renderMap(); assets?.render();
    toast(`已掛到「${(info.node.text||'節點').slice(0,20)}」，收合時會一起收起`);
    return;
  }
  if(!o.anchor) return;
  const a=L.get(o.anchor.node), b=pinBox(o); if(!a||!b) return;
  const gap=Math.max(b.x-(a.x+a.w), a.x-(b.x+b.w), b.y-(a.y+a.h), a.y-(b.y+b.h), 0);
  if(gap>480){ delete o.anchor; toast('已取消掛載（拖離節點太遠）'); }
  else o.anchor={node:o.anchor.node, dx:o.x-a.x, dy:o.y-a.y};
  save(currentId); drawPinEdges();
}
// 掛到節點 from a card or image toolbar: the next click on a node pins the object there.
let pinPick=null;
function pinStart(id){ pinPick=id; canvas.classList.add('pin-picking'); toast('點選要掛上的心智圖節點（Esc 取消）'); }
function pinStop(){ pinPick=null; canvas.classList.remove('pin-picking'); clearAttachHint(); }
listen(canvas,'pointerdown',e=>{
  if(!pinPick) return;
  // The node may sit under the very object being pinned, so look through everything at the pointer.
  const n=nodeAtPoint(e.clientX,e.clientY), id=pinPick;
  e.preventDefault(); e.stopImmediatePropagation(); pinStop();
  if(!n){ toast('已取消'); return; }
  const m=cur(), o=objectById(m,id), a=L.get(n.dataset.id); if(!o||!a) return;
  snapshot();
  const b=pinBox(o)||{w:o.w||240,h:o.h||80};
  if(isDown()){ o.x=a.x+a.w/2-b.w/2; o.y=a.y+a.h+48; } else { o.x=a.x+a.w+48; o.y=a.y+a.h/2-b.h/2; }
  o.anchor={node:n.dataset.id, dx:o.x-a.x, dy:o.y-a.y};
  save(currentId); renderMap(); assets?.render();
  toast(`已掛到「${(idx.get(n.dataset.id)?.node.text||'節點').slice(0,20)}」，收合時會一起收起`);
},true);
listen(canvas,'pointermove',e=>{ if(!pinPick) return; const n=nodeAtPoint(e.clientX,e.clientY)||null; if(n!==attachHint){ clearAttachHint(); if(n){ n.classList.add('attach-target'); attachHint=n; } } });
listen(document,'keydown',e=>{ if(pinPick&&e.key==='Escape'){ e.stopImmediatePropagation(); pinStop(); } },true);
// A relation line between a node and a card or image can be turned into a pin.
function relationPin(r){
  const m=cur(), [node,other]=idx.has(r.from)?[r.from,r.to]:[r.to,r.from];
  if(!idx.has(node)||idx.has(other)) return null;
  const o=objectById(m,other); return o&&L.has(node) ? {node,o} : null;
}
function pinFromRelation(r){
  const p=relationPin(r); if(!p||store.readOnly) return false;
  const m=cur(), a=L.get(p.node);
  snapshot();
  p.o.anchor={node:p.node, dx:p.o.x-a.x, dy:p.o.y-a.y};
  m.relations=(m.relations||[]).filter(x=>x!==r);
  save(currentId); renderMap(); assets?.render();
  toast(`已改成掛在「${(idx.get(p.node)?.node.text||'節點').split('\n')[0].slice(0,20)}」，收合時會一起收起`);
  return true;
}
let attachHint=null;
function clearAttachHint(){ attachHint?.classList.remove('attach-target'); attachHint=null; }
listen(window,'pointermove',e=>{
  if(!(e.buttons&1)||!document.querySelector('.card.dragging,.canvas-image.dragging')){ if(attachHint) clearAttachHint(); return; }
  const n=nodeAtPoint(e.clientX,e.clientY)||null;
  if(n!==attachHint){ clearAttachHint(); if(n){ n.classList.add('attach-target'); attachHint=n; } }
});
// Objects pinned under a collapsed node count toward its badge.
function pinsUnder(n){ const m=cur(), ids=new Set(); (function walk(x){ ids.add(x.id); x.children.forEach(walk); })(n); ids.delete(n.id); return pinnedObjects(m).filter(o=>ids.has(o.anchor.node)||o.anchor.node===n.id).length; }
/* ---------------- marquee selection ---------------- */
// The 框選 tool (or Shift+drag on empty canvas) selects cards, images, drawings and whole mind maps inside a box;
// the group then moves, copies, cuts and deletes together.
const groupLayer=document.createElement('div'); groupLayer.className='group-layer'; world.append(groupLayer);
let selectMode=false, group=null, marq=null, groupDrag=null;
const groupSize=()=>group ? group.cards.size+group.images.size+group.strokes.size+group.trees.size : 0;
function treeOfRoot(m, rootId){ return treesOf(m).find(t=>t.root.id===rootId); }
function treeBox(t){ let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity; (function walk(n){ const o=L.get(n.id); if(o){ a=Math.min(a,o.x); b=Math.min(b,o.y); c=Math.max(c,o.x+o.w); d=Math.max(d,o.y+o.h); } if(!n.collapsed) n.children.forEach(walk); })(t.root); return Number.isFinite(a)?{x:a,y:b,w:c-a,h:d-b}:null; }
function groupBoxes(){
  const m=cur(), out=[]; if(!m||!group) return out;
  for(const b of cards?.boxes()||[]) if(group.cards.has(b.id)) out.push(b);
  for(const i of m.images||[]) if(group.images.has(i.id)) out.push(i);
  const sb=draw?.boxes()||[]; (m.strokes||[]).forEach((s,i)=>{ if(group.strokes.has(s.id)&&sb[i]) out.push(sb[i]); });
  for(const id of group.trees){ const t=treeOfRoot(m,id), b=t&&treeBox(t); if(b) out.push(b); }
  return out;
}
function selectInRect(r){
  const m=cur(), hit=b=>b&&b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y;
  group={cards:new Set, images:new Set, strokes:new Set, trees:new Set};
  for(const b of cards?.boxes()||[]) if(hit(b)) group.cards.add(b.id);
  for(const i of m.images||[]) if(hit(i)) group.images.add(i.id);
  const sb=draw?.boxes()||[]; (m.strokes||[]).forEach((s,i)=>{ if(hit(sb[i])) group.strokes.add(s.id); });
  // A mind map joins when the box touches its central topic, and then moves as a whole.
  for(const t of treesOf(m)) if(hit(L.get(t.root.id))) group.trees.add(t.root.id);
  if(!groupSize()) group=null;
}
function clearGroup(){ if(!group) return; group=null; renderGroup(); }
function renderGroup(){
  const m=cur();
  if(group&&m){
    const ids=new Set((m.cards||[]).map(c=>c.id)); for(const id of group.cards) if(!ids.has(id)) group.cards.delete(id);
    const imgs=new Set((m.images||[]).map(i=>i.id)); for(const id of group.images) if(!imgs.has(id)) group.images.delete(id);
    const sts=new Set((m.strokes||[]).map(s=>s.id)); for(const id of group.strokes) if(!sts.has(id)) group.strokes.delete(id);
    for(const id of group.trees) if(!treeOfRoot(m,id)) group.trees.delete(id);
    if(!groupSize()) group=null;
  }
  const boxes=groupBoxes();
  groupLayer.replaceChildren();
  if(!boxes.length){ $('groupBar').classList.remove('show'); return; }
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const o of boxes){ const r=document.createElement('div'); r.className='group-item'; Object.assign(r.style,{left:o.x+'px',top:o.y+'px',width:o.w+'px',height:o.h+'px'}); groupLayer.append(r); a=Math.min(a,o.x); b=Math.min(b,o.y); c=Math.max(c,o.x+o.w); d=Math.max(d,o.y+o.h); }
  const box=document.createElement('div'); box.className='group-box'; box.title='拖曳一起移動';
  Object.assign(box.style,{left:(a-8)+'px',top:(b-8)+'px',width:(c-a+16)+'px',height:(d-b+16)+'px'}); groupLayer.append(box);
  $('groupCount').textContent=`已選取 ${groupSize()} 個物件`;
  $('groupBar').classList.add('show'); placeGroupBar();
}
function placeGroupBar(){
  const box=groupLayer.querySelector('.group-box'), bar=$('groupBar'); if(!box||!bar.classList.contains('show')) return;
  const x=parseFloat(box.style.left), y=parseFloat(box.style.top), w=parseFloat(box.style.width), h=parseFloat(box.style.height);
  const bw=bar.offsetWidth, bh=bar.offsetHeight, cw=canvas.clientWidth;
  let top=view.y+y*view.k-bh-8; if(top<8) top=view.y+(y+h)*view.k+8;
  bar.style.left=clamp(view.x+(x+w/2)*view.k-bw/2, 8, Math.max(8,cw-bw-8))+'px'; bar.style.top=top+'px';
}
function moveGroup(dx, dy){
  const m=cur();
  for(const c of m.cards||[]) if(group.cards.has(c.id)){ c.x+=dx; c.y+=dy; }
  for(const i of m.images||[]) if(group.images.has(i.id)){ i.x+=dx; i.y+=dy; }
  for(const s of m.strokes||[]) if(group.strokes.has(s.id)) s.points=s.points.map(([x,y])=>[x+dx,y+dy]);
  for(const id of group.trees){ if(m.root&&m.root.id===id){ m.rootX=(m.rootX||0)+dx; m.rootY=(m.rootY||0)+dy; } else { const t=(m.trees||[]).find(t=>t.root.id===id); if(t){ t.x+=dx; t.y+=dy; } } }
}
function deleteGroup(){
  const m=cur(); if(!m||!groupSize()||store.readOnly) return;
  snapshot();
  const gone=new Set([...group.cards, ...group.images, ...group.strokes]);
  (function walk(list){ for(const c of list||[]){ gone.add(c.id); walk(c.cards); } })((m.cards||[]).filter(c=>group.cards.has(c.id)));
  for(const id of group.trees){ const t=treeOfRoot(m,id); if(t) (function walk(n){ gone.add(n.id); n.children.forEach(walk); })(t.root); }
  m.cards=(m.cards||[]).filter(c=>!group.cards.has(c.id));
  m.images=(m.images||[]).filter(i=>!group.images.has(i.id));
  m.strokes=(m.strokes||[]).filter(s=>!group.strokes.has(s.id));
  m.trees=(m.trees||[]).filter(t=>!group.trees.has(t.root.id));
  if(m.root&&group.trees.has(m.root.id)){ const next=m.trees.shift(); m.root=next?next.root:null; m.rootX=next?next.x:0; m.rootY=next?next.y:0; }
  m.relations=(m.relations||[]).filter(r=>!gone.has(r.from)&&!gone.has(r.to));
  const n=groupSize(); group=null; selectedId=null;
  renderMap(); draw?.render(true); save(currentId); renderSidebar();
  toast(`已刪除 ${n} 個物件`);
}
// A self-contained copy of the group: card/image/stroke data plus each mind map with its position.
function groupData(){
  const m=cur();
  return JSON.parse(JSON.stringify({
    cards:(m.cards||[]).filter(c=>group.cards.has(c.id)),
    images:(m.images||[]).filter(i=>group.images.has(i.id)),
    strokes:(m.strokes||[]).filter(s=>group.strokes.has(s.id)),
    trees:treesOf(m).filter(t=>group.trees.has(t.root.id)).map(t=>({x:t.x, y:t.y, root:t.root})),
  }));
}
function pasteGroup(g, at){
  const m=cur(); if(!g) return;
  const xs=[...(g.cards||[]).map(c=>c.x), ...(g.images||[]).map(i=>i.x), ...(g.strokes||[]).flatMap(s=>s.points.map(p=>p[0])), ...(g.trees||[]).map(t=>t.x)];
  const ys=[...(g.cards||[]).map(c=>c.y), ...(g.images||[]).map(i=>i.y), ...(g.strokes||[]).flatMap(s=>s.points.map(p=>p[1])), ...(g.trees||[]).map(t=>t.y)];
  if(!xs.length) return;
  const dx=at.x-Math.min(...xs), dy=at.y-Math.min(...ys);
  snapshot();
  group={cards:new Set, images:new Set, strokes:new Set, trees:new Set};
  for(const c of g.cards||[]){ c.x=Math.round(c.x+dx); c.y=Math.round(c.y+dy); c.z=nextZ(); (m.cards ||= []).push(c); group.cards.add(c.id); }
  for(const i of g.images||[]){ i.x+=dx; i.y+=dy; i.z=nextZ(); (m.images ||= []).push(i); group.images.add(i.id); }
  for(const s of g.strokes||[]){ s.points=s.points.map(([x,y])=>[x+dx,y+dy]); s.z=nextZ(); (m.strokes ||= []).push(s); group.strokes.add(s.id); }
  for(const t of g.trees||[]){ const root=sanitize(t.root); (m.trees ||= []).push({id:uid('t'), x:Math.round(t.x+dx), y:Math.round(t.y+dy), root}); group.trees.add(root.id); }
  selectedId=null; cards?.deselect(); assets?.deselect(); relations?.deselect();
  renderMap(); draw?.render(true); save(currentId); renderGroup();
  if((g.cards||[]).some(c=>JSON.stringify(c).includes('"board"'))) renderSidebar();
}
function setSelectMode(on){ selectMode=on; $('selectBtn').classList.toggle('on',on); canvas.classList.toggle('selecting',on); if(on && canvas.classList.contains('drawing')) draw?.exit(); }
listen($('selectBtn'),'click',()=>setSelectMode(!selectMode));
listen($('drawBtn'),'click',()=>{ if(selectMode) setSelectMode(false); clearGroup(); });
const BUSY='.node,.card,.canvas-image,.zoombar,.nodebar,.empty-state,.draw-panel,.shape-bar,.asset-panel,.edge-label,.edge-hit,.chip,[data-relation],.rel-label,.image-handle,.hint';
// Registered before the card, image, relation and drawing handlers so a marquee or group drag wins over them.
listen(canvas,'pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0) return;
  if(e.target.closest('#groupBar')){ e.stopImmediatePropagation(); return; }
  if(e.target.closest('.group-box')&&group&&!store.readOnly){
    e.preventDefault(); e.stopImmediatePropagation(); canvas.focus({preventScroll:true});
    groupDrag={pointer:e.pointerId, sx:e.clientX, sy:e.clientY, lx:e.clientX, ly:e.clientY, moved:false};
    return;
  }
  const drawing=canvas.classList.contains('drawing');
  if((selectMode||e.shiftKey)&&!drawing&&!e.target.closest(BUSY)&&cur()){
    e.preventDefault(); e.stopImmediatePropagation();
    if(editingId) commitEdit();
    selectedId=null; cards?.deselect(); assets?.deselect(); relations?.deselect(); group=null; renderMap();
    canvas.focus({preventScroll:true});
    marq={pointer:e.pointerId, sx:e.clientX, sy:e.clientY};
    return;
  }
  if(group) clearGroup();
},true);
listen(window,'pointermove',e=>{
  if(marq&&e.pointerId===marq.pointer){
    const r=canvas.getBoundingClientRect(), x=Math.min(e.clientX,marq.sx)-r.left, y=Math.min(e.clientY,marq.sy)-r.top;
    Object.assign($('marquee').style,{left:x+'px',top:y+'px',width:Math.abs(e.clientX-marq.sx)+'px',height:Math.abs(e.clientY-marq.sy)+'px'}); $('marquee').hidden=false;
    return;
  }
  if(groupDrag&&e.pointerId===groupDrag.pointer){
    if(!groupDrag.moved){ if(Math.hypot(e.clientX-groupDrag.sx,e.clientY-groupDrag.sy)<4) return; snapshot(); groupDrag.moved=true; }
    moveGroup((e.clientX-groupDrag.lx)/view.k, (e.clientY-groupDrag.ly)/view.k); groupDrag.lx=e.clientX; groupDrag.ly=e.clientY;
    renderMap(); draw?.render(true);
  }
});
function endGroupGesture(e){
  if(marq&&e.pointerId===marq.pointer){
    const r=canvas.getBoundingClientRect(), m=marq; marq=null; $('marquee').hidden=true;
    if(Math.hypot(e.clientX-m.sx,e.clientY-m.sy)<4) return;
    const x0=(Math.min(e.clientX,m.sx)-r.left-view.x)/view.k, y0=(Math.min(e.clientY,m.sy)-r.top-view.y)/view.k;
    selectInRect({x:x0, y:y0, w:Math.abs(e.clientX-m.sx)/view.k, h:Math.abs(e.clientY-m.sy)/view.k});
    renderGroup();
  }
  if(groupDrag&&e.pointerId===groupDrag.pointer){
    const d=groupDrag; groupDrag=null; if(!d.moved) return;
    for(const o of pinnedObjects(cur())) if((group?.cards.has(o.id)||group?.images.has(o.id))&&L.get(o.anchor.node)){ const a=L.get(o.anchor.node); o.anchor={node:o.anchor.node, dx:o.x-a.x, dy:o.y-a.y}; }
    save(currentId);
  }
}
listen(window,'pointerup',endGroupGesture); listen(window,'pointercancel',endGroupGesture);
listen($('groupBar'),'click',e=>{
  const b=e.target.closest('[data-gact]'); if(!b) return;
  if(b.dataset.gact==='delete') deleteGroup();
  else if(b.dataset.gact==='clear') clearGroup();
  else if(b.dataset.gact==='copy'){ canvas.focus({preventScroll:true}); document.execCommand('copy'); }
});
listen(document,'keydown',e=>{
  if(!groupSize()||typingIn(e.target)) return;
  if(e.key==='Escape'){ e.stopImmediatePropagation(); clearGroup(); }
  else if((e.key==='Delete'||e.key==='Backspace')&&!store.readOnly){ e.preventDefault(); e.stopImmediatePropagation(); deleteGroup(); }
  else if(e.key.startsWith('Arrow')&&!store.readOnly){
    e.preventDefault(); e.stopImmediatePropagation();
    const step=e.shiftKey?24:4; snapshot();
    moveGroup(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0, e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);
    renderMap(); draw?.render(true); save(currentId);
  }
},true);
// Ctrl+A selects everything on the board.
listen(document,'keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='a'||typingIn(e.target)||editingId||!cur()) return;
  e.preventDefault(); e.stopImmediatePropagation();
  selectedId=null; cards?.deselect(); assets?.deselect(); relations?.deselect();
  selectInRect({x:-1e7, y:-1e7, w:2e7, h:2e7}); renderMap();
},true);
/* ---------------- side viewer ---------------- */
// Shows a page in an embedded copy of the app; both windows stay in sync through the storage event.
let viewing=null;
function openViewer(id){
  const m=maps.get(id); if(!m) return;
  if(store.mode==='cloud'){ goto(id); return; }
  viewing=id; $('viewTitle').textContent=m.title||'未命名頁面';
  const src=location.pathname+'?embed=1#'+id, frame=$('viewFrame');
  if(frame.getAttribute('src')!==src) frame.setAttribute('src',src);
  $('viewPanel').hidden=false; app.classList.add('viewing');
  // The canvas just got narrower: bring the selected node back into view.
  const o=L.get(selectedId);
  if(o){ const cw=canvas.clientWidth, sx=view.x+o.x*view.k, ex=view.x+(o.x+o.w)*view.k; if(sx<20||ex>cw-20){ view.x=cw/2-(o.x+o.w/2)*view.k; applyView(); } }
  placeBar();
}
function closeViewer(){ viewing=null; $('viewPanel').hidden=true; $('viewPanel').classList.remove('full'); app.classList.remove('viewing'); syncViewFull(); }
function syncViewFull(){ const full=$('viewPanel').classList.contains('full'), b=$('viewFull'); b.title=full?'還原側邊':'滿版'; b.setAttribute('aria-label',b.title); b.firstElementChild.className='bi '+(full?'bi-fullscreen-exit':'bi-arrows-fullscreen'); }
listen($('viewClose'),'click',closeViewer);
listen($('viewFull'),'click',()=>{ $('viewPanel').classList.toggle('full'); syncViewFull(); });
listen($('viewOpen'),'click',()=>{ const shown=$('viewFrame').contentWindow?.location.hash.slice(1), id=maps.has(shown)?shown:viewing; closeViewer(); if(id) goto(id); });
listen($('viewFrame'),'load',()=>{ try{ listen($('viewFrame').contentWindow,'hashchange',()=>{ const id=$('viewFrame').contentWindow.location.hash.slice(1); if(maps.has(id)){ viewing=id; $('viewTitle').textContent=maps.get(id).title||'未命名頁面'; } }); }catch(e){} });
listen(document,'keydown',e=>{ if(e.key==='Escape' && viewing && !editingId && !e.defaultPrevented && document.activeElement?.tagName!=='INPUT' && document.activeElement?.tagName!=='TEXTAREA'){ closeViewer(); } });
// Another window of the app (or the side viewer) saved: take its newer maps and folders without writing back.
listen(window,'storage',e=>{
  if(store.mode==='cloud') return;
  if(e.key===FOLDER_KEY){ try{ folders=cleanFolders(JSON.parse(e.newValue||'[]')); }catch(err){} renderSidebar(); return; }
  if(e.key!==LS_KEY) return;
  let list; try{ list=JSON.parse(e.newValue||'[]'); }catch(err){ return; } if(!Array.isArray(list)) return;
  const incoming=new Map(list.filter(m=>m&&m.id&&'root' in m).map(m=>[m.id,m]));
  let curChanged=false;
  for(const [id,m] of incoming){ const mine=maps.get(id); if(!mine||(m.updatedAt||0)>(mine.updatedAt||0)){ if(id===currentId&&editingId) continue; maps.set(id,sanitizeMap(m)); if(id===currentId) curChanged=true; } }
  for(const id of [...maps.keys()]) if(!incoming.has(id)){ maps.delete(id); if(id===currentId) curChanged=true; }
  if(viewing&&maps.has(viewing)) $('viewTitle').textContent=maps.get(viewing).title||'未命名頁面';
  if(curChanged){ if(!maps.has(currentId)){ const first=sortedMaps()[0]; openMap(first?first.id:null); } else { if(!idx.has(selectedId)) selectedId=null; syncHeader(); renderMap(); } }
  renderSidebar();
});
// Opens the node's page, creating one named after the node the first time.
function openNodePage(id){
  const info=idx.get(id); if(!info) return;
  if(editingId) commitEdit();
  const pid=ensureNodePage(info); if(pid) goto(pid);
}
function isSubPage(m){ const p=m&&m.parentId&&maps.get(m.parentId); return !!p&&boardRefs(p).has(m.id); }
function topPageOf(id){ let m=maps.get(id); for(let n=0; m&&isSubPage(m)&&n<50; n++) m=maps.get(m.parentId); return m?.id; }
function pageTree(m){ const out=[m], seen=new Set([m.id]); for(let i=0;i<out.length;i++) for(const id of boardRefs(out[i])){ const c=maps.get(id); if(c&&!seen.has(id)){ seen.add(id); out.push(c); } } return out; }
function createPage(){
  const parent=cur(); if(!parent||store.readOnly) return null;
  const m=makeMap(false); m.root=null; m.title='未命名頁面'; m.parentId=parent.id;
  const last=sortedMaps().pop(); if(last&&m.createdAt<=last.createdAt) m.createdAt=last.createdAt+1;
  maps.set(m.id,m); save(m.id,true); return m.id;
}
function pageInfo(id){ const m=maps.get(id); return m ? {title:m.title, count:(m.cards||[]).length+(m.images||[]).length+(m.strokes||[]).length+treesOf(m).length} : null; }
function renamePage(id,title){ const m=maps.get(id); if(!m||store.readOnly||!title||m.title===title) return; m.title=title; save(id); renderSidebar(); }
function sortedFolders(){ return [...folders].sort((a,b)=>a.createdAt-b.createdAt); }
const folderById=id=>id?folders.find(f=>f.id===id):undefined;
function childFolders(id){ return sortedFolders().filter(f=>(f.parentId||null)===(id||null)); }
// True when folder `id` is `ancestorId` itself or sits somewhere inside it.
function isFolderInside(id, ancestorId){ for(let f=folderById(id), n=0; f&&n<500; f=folderById(f.parentId), n++) if(f.id===ancestorId) return true; return false; }
function folderPath(f){ const names=[]; for(let x=f, n=0; x&&n<500; x=folderById(x.parentId), n++) names.unshift(x.name||'未命名資料夾'); return names.join(' / '); }
function folderTree(){ const out=[]; (function walk(id){ for(const f of childFolders(id)){ out.push(f); walk(f.id); } })(null); return out; }
function mapsUnder(id){ let n=0; for(const m of maps.values()) if(m.folderId&&isFolderInside(m.folderId,id)) n++; return n; }
function openAncestors(id){ let changed=false; for(let f=folderById(id), n=0; f&&n<500; f=folderById(f.parentId), n++) if(!f.open){ f.open=true; changed=true; } return changed; }
let renamingFolder=null, sidebarActive=null;
function moreButton(label, data){
  const mb=document.createElement('button'); mb.className='icon-btn more'; mb.title='更多'; mb.setAttribute('aria-label',label); Object.assign(mb.dataset,data);
  mb.innerHTML='<i class="bi bi-three-dots" aria-hidden="true"></i>'; return mb;
}
// A map holding independent pages shows as a folder in the sidebar, with its pages nested underneath.
const OPEN_PAGES_KEY='yozu-open-pages';
let openPages=new Set(); try{ openPages=new Set(JSON.parse(localStorage.getItem(OPEN_PAGES_KEY)||'[]')); }catch(e){}
function subPagesOf(m){ const refs=boardRefs(m); return sortedMaps().filter(c=>refs.has(c.id)&&c.parentId===m.id); }
function containsPage(m, id, seen=new Set()){ if(seen.has(m.id)) return false; seen.add(m.id); return subPagesOf(m).some(c=>c.id===id||containsPage(c,id,seen)); }
function togglePageOpen(id){ if(openPages.has(id)) openPages.delete(id); else openPages.add(id); try{ localStorage.setItem(OPEN_PAGES_KEY,JSON.stringify([...openPages])); }catch(e){} renderSidebar(); }
// Opening a page expands every map above it so its row is visible.
function revealPage(id){ let changed=false; for(let m=maps.get(id), n=0; m&&isSubPage(m)&&n<50; n++){ m=maps.get(m.parentId); if(m&&!openPages.has(m.id)){ openPages.add(m.id); changed=true; } } if(changed) try{ localStorage.setItem(OPEN_PAGES_KEY,JSON.stringify([...openPages])); }catch(e){} }
function pageRow(m, folderId, depth, out, seen=new Set()){
  const kids=out&&!seen.has(m.id) ? subPagesOf(m) : [], open=kids.length>0&&openPages.has(m.id);
  seen.add(m.id);
  const hiddenCurrent=kids.length&&!open&&containsPage(m,currentId);
  const row=document.createElement('div'); row.className='page'+(m.id===currentId||hiddenCurrent?' active':'')+(depth?' nested':'')+(isSubPage(m)?' subpage':'')+(kids.length?' has-pages':'')+(open?' open':''); row.dataset.id=m.id; row.tabIndex=0; row.setAttribute('role','button');
  if(folderId) row.dataset.folder=folderId;
  if(depth) row.style.setProperty('--depth',depth);
  row.draggable=!store.readOnly&&!isSubPage(m);
  if(kids.length){ const chev=document.createElement('i'); chev.className='bi bi-chevron-right pchev'; chev.dataset.expand=m.id; chev.title=open?'收合頁面':'展開頁面'; row.setAttribute('aria-expanded',String(open)); row.append(chev); }
  const i=document.createElement('span'); i.className='pi'; i.innerHTML=kids.length?folderIcon(null,18):stickyIcon(m.color,18);
  const t=document.createElement('span'); t.className='pt'; t.textContent=m.title||'未命名心智圖';
  row.append(i,t);
  if(kids.length){ const c=document.createElement('span'); c.className='fcount'; c.textContent=String(kids.length); row.append(c); }
  if(!store.readOnly) row.appendChild(moreButton('更多選項',{more:m.id}));
  if(!out) return row;
  out.appendChild(row);
  if(open) for(const c of kids) pageRow(c, null, depth+1, out, seen);
  return row;
}
function folderRow(f, count, open, depth){
  const row=document.createElement('div'); row.className='folder-row'+(open?' open':''); row.dataset.folder=f.id; row.tabIndex=0; row.setAttribute('role','button'); row.setAttribute('aria-expanded',String(open));
  row.style.setProperty('--depth',depth); row.draggable=!store.readOnly&&renamingFolder!==f.id;
  const chev=document.createElement('i'); chev.className='bi bi-chevron-right fchev'; chev.setAttribute('aria-hidden','true');
  const i=document.createElement('span'); i.className='pi'; i.innerHTML=folderIcon(f.color,18);
  row.append(chev,i);
  if(renamingFolder===f.id){
    const input=document.createElement('input'); input.className='folder-name-input'; input.value=f.name; input.setAttribute('aria-label','資料夾名稱'); input.dataset.rename=f.id; row.append(input);
  } else { const t=document.createElement('span'); t.className='pt'; t.textContent=f.name||'未命名資料夾'; row.append(t); }
  const c=document.createElement('span'); c.className='fcount'; c.textContent=String(count); row.append(c);
  if(!store.readOnly) row.appendChild(moreButton('資料夾選項',{folderMore:f.id}));
  return row;
}
function renderSidebar(){
  const q=$('search').value.trim().toLowerCase();
  const match=m=>!q||(m.title||'').toLowerCase().includes(q);
  const all=sortedMaps().filter(m=>!isSubPage(m)||(q&&match(m))), known=new Set(folders.map(f=>f.id));
  sidebarActive=topPageOf(currentId);
  const box=$('pages'); box.innerHTML=''; let shown=0;
  $('count').textContent=all.length?String(all.length):'';
  // Children are built first so a folder can be hidden when nothing inside matches the search.
  function addFolder(f, depth, out){
    const kids=document.createDocumentFragment(); let kidShown=0;
    for(const sub of childFolders(f.id)) if(addFolder(sub,depth+1,kids)) kidShown++;
    const inside=all.filter(m=>m.folderId===f.id), nameHit=!!q&&(f.name||'').toLowerCase().includes(q);
    const list=nameHit?inside:inside.filter(match);
    if(q&&!nameHit&&!kidShown&&!list.length) return false;
    const open=f.open||(!!q&&kidShown+list.length>0);
    out.appendChild(folderRow(f,mapsUnder(f.id),open,depth));
    if(!open) return true;
    out.appendChild(kids);
    list.forEach(m=>q?out.appendChild(pageRow(m,f.id,depth+1)):pageRow(m,f.id,depth+1,out));
    if(!inside.length&&!childFolders(f.id).length){ const d=document.createElement('div'); d.className='folder-empty'; d.dataset.folder=f.id; d.style.setProperty('--depth',depth+1); d.textContent='把心智圖或資料夾拖進這裡'; out.appendChild(d); }
    return true;
  }
  for(const f of childFolders(null)) if(addFolder(f,0,box)) shown++;
  for(const m of all){ if(!known.has(m.folderId)&&match(m)){ if(q) box.appendChild(pageRow(m,null,0)); else pageRow(m,null,0,box); shown++; } }
  if(!shown){
    const d=document.createElement('div'); d.className='no-pages';
    d.textContent = q ? '找不到符合的心智圖' : (ready ? '還沒有心智圖，按上方「新增心智圖」開始' : '');
    box.appendChild(d);
  }
  const input=box.querySelector('[data-rename]'); if(input){ input.focus(); input.select(); }
  $('newBtn').disabled=store.readOnly||!ready;
  $('newFolderBtn').disabled=store.readOnly||!ready;
  $('importBtn').disabled=store.readOnly||!ready;
  $('exportBtn').disabled=!cur();
  $('exportAllBtn').disabled=!maps.size;
}
listen($('pages'), 'click', e=>{
  const mb=e.target.closest('[data-more]');
  if(mb){ e.stopPropagation(); openPageMenu(mb.dataset.more, mb); return; }
  const fm=e.target.closest('[data-folder-more]');
  if(fm){ e.stopPropagation(); folderFor=fm.dataset.folderMore; folderAnchor=fm; showPop($('folderMenu'), fm); return; }
  if(e.target.closest('[data-rename]')) return;
  const ex=e.target.closest('[data-expand]'); if(ex){ e.stopPropagation(); togglePageOpen(ex.dataset.expand); return; }
  const fr=e.target.closest('.folder-row'); if(fr){ toggleFolder(fr.dataset.folder); return; }
  const row=e.target.closest('.page'); if(row) goto(row.dataset.id);
});
listen($('pages'), 'keydown', e=>{
  const input=e.target.closest('[data-rename]');
  if(input){ if(e.key==='Enter'){ e.preventDefault(); commitFolderName(input); } else if(e.key==='Escape'){ renamingFolder=null; renderSidebar(); } return; }
  if(e.key!=='Enter') return;
  if(e.target.classList.contains('page')) goto(e.target.dataset.id);
  if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&e.target.classList.contains('has-pages')&&e.target.classList.contains('open')!==(e.key==='ArrowRight')) togglePageOpen(e.target.dataset.id);
  else if(e.target.classList.contains('folder-row')) toggleFolder(e.target.dataset.folder);
});
listen($('pages'), 'focusout', e=>{ const input=e.target.closest?.('[data-rename]'); if(input) commitFolderName(input); });
listen($('search'), 'input', renderSidebar);
listen($('newBtn'), 'click', ()=>createMap(false));
listen($('newFolderBtn'), 'click', ()=>createFolder());

/* ---------------- folders ---------------- */
function createFolder(moveId, parentId){
  if(store.readOnly||!ready) return;
  const last=sortedFolders().pop(), f={id:uid('f'), name:'新資料夾', open:true, createdAt:Math.max(Date.now(), (last?last.createdAt:0)+1)};
  if(folderById(parentId)){ f.parentId=parentId; openAncestors(parentId); }
  folders.push(f); saveFolders();
  if(moveId) setFolder(moveId, f.id, true);
  renamingFolder=f.id; renderSidebar();
}
function commitFolderName(input){
  const f=folderById(input.dataset.rename); if(renamingFolder!==input.dataset.rename) return;
  renamingFolder=null;
  if(f){ const name=input.value.trim()||'未命名資料夾'; if(name!==f.name){ f.name=name; saveFolders(); } }
  renderSidebar();
}
function toggleFolder(id){ const f=folderById(id); if(!f) return; f.open=!f.open; saveFolders(); renderSidebar(); }
function setFolder(mapId, folderId, quiet){
  const m=maps.get(mapId), f=folderById(folderId); if(!m||store.readOnly) return;
  if((m.folderId||null)===(f?f.id:null)) return;
  if(f){ m.folderId=f.id; if(openAncestors(f.id)) saveFolders(); } else delete m.folderId;
  save(mapId,true); renderSidebar();
  if(!quiet) toast(f?`已移到「${f.name}」`:'已移出資料夾');
}
function setFolderParent(id, parentId, quiet){
  const f=folderById(id), p=folderById(parentId); if(!f||store.readOnly) return;
  if(p&&isFolderInside(p.id,f.id)){ toast('不能把資料夾放進它自己裡面'); return; }
  if((f.parentId||null)===(p?p.id:null)) return;
  if(p){ f.parentId=p.id; openAncestors(p.id); } else delete f.parentId;
  saveFolders(); renderSidebar();
  if(!quiet) toast(p?`已移到「${p.name}」`:'已移到最外層');
}
// Deleting a folder moves its maps and sub-folders up one level.
function deleteFolder(id){
  const f=folderById(id); if(!f) return; const parent=f.parentId;
  folders=folders.filter(x=>x!==f);
  for(const sub of folders) if(sub.parentId===id){ if(parent) sub.parentId=parent; else delete sub.parentId; }
  for(const m of maps.values()) if(m.folderId===id){ if(parent) m.folderId=parent; else delete m.folderId; save(m.id,true); }
  saveFolders(); renderSidebar(); toast('已刪除資料夾，裡面的內容移到上一層');
}
// Drag a mind map or folder row onto a folder (or onto loose space to take it out).
let dragItem=null;
function dropFolderAt(target){ const el=target.closest?.('[data-folder]'); return el?el.dataset.folder:null; }
// undefined means the drop is not allowed (a folder into itself or its descendants).
function dropTargetFor(target){ const fid=dropFolderAt(target); return dragItem?.kind==='folder'&&fid&&isFolderInside(fid,dragItem.id) ? undefined : fid; }
function clearDropMarks(){ $('pages').classList.remove('drop-root'); $('pages').querySelectorAll('.drop').forEach(el=>el.classList.remove('drop')); }
listen($('pages'), 'dragstart', e=>{
  const fr=e.target.closest?.('.folder-row'), row=e.target.closest?.('.page');
  if(store.readOnly||(!fr&&!row)){ e.preventDefault(); return; }
  dragItem=fr?{kind:'folder',id:fr.dataset.folder}:{kind:'map',id:row.dataset.id};
  e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',dragItem.id); (fr||row).classList.add('dragging');
});
listen($('pages'), 'dragover', e=>{
  if(!dragItem) return; clearDropMarks();
  const fid=dropTargetFor(e.target); if(fid===undefined) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  const parent=dragItem.kind==='map'?maps.get(dragItem.id)?.folderId:folderById(dragItem.id)?.parentId;
  if(fid) $('pages').querySelector(`.folder-row[data-folder="${CSS.escape(fid)}"]`)?.classList.add('drop');
  else if(parent) $('pages').classList.add('drop-root');
});
listen($('pages'), 'drop', e=>{
  if(!dragItem) return; e.preventDefault();
  const item=dragItem, fid=dropTargetFor(e.target); dragItem=null; clearDropMarks();
  if(fid===undefined) return;
  if(item.kind==='map') setFolder(item.id, fid); else setFolderParent(item.id, fid);
});
listen($('pages'), 'dragend', ()=>{ dragItem=null; clearDropMarks(); $('pages').querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging')); });

async function exportFile(all) {
  if(editingId) commitEdit();
  const selected = all ? sortedMaps() : (cur() ? pageTree(cur()) : []);
  if(!selected.length) return;
  const used=new Set(); for(const m of selected) for(let f=folderById(m.folderId), n=0; f&&n<500; f=folderById(f.parentId), n++) used.add(f.id);
  // Attached files travel inside the export so another browser can open them.
  const files={};
  for(const m of selected) (function walk(list){ for(const c of list||[]){ if(c.type==='file'&&c.fileId) files[c.fileId]=null; walk(c.cards); } })(m.cards);
  for(const id of Object.keys(files)){ const b=await getFile(id); if(b) files[id]=await blobToDataUrl(b); else delete files[id]; }
  const blob = new Blob([serializeMaps(selected, all ? folders : folders.filter(f=>used.has(f.id)), files)], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const name = all ? 'YoZuMind-全部備份' : (cur().title || '未命名心智圖');
  link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100) + '.json';
  link.href = url; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  toast('已匯出 JSON 存檔，可用「匯入」還原。');
}
listen($('exportBtn'), 'click', ()=>exportFile(false));
listen($('exportAllBtn'), 'click', ()=>exportFile(true));
listen($('importBtn'), 'click', ()=>{ $('importFile').value=''; $('importFile').click(); });
listen($('importFile'), 'change', async e=>{
  const file = e.target.files[0];
  if(!file || store.readOnly || !ready) return;
  $('importBtn').disabled=true;
  try {
    if(file.size > MAX_FILE_BYTES) throw new Error('存檔不可超過 300 MB。');
    const text = await file.text();
    const imported = parseMaps(text, uid);
    for(const [id,url] of parseAttachments(text)){ const b=dataUrlToBlob(url); if(b) await putFile(id,b).catch(()=>{}); }
    const known = new Set(folders.map(f=>f.id)), added = parseFolders(text).filter(f=>!known.has(f.id));
    if(editingId) commitEdit();
    folders=cleanFolders([...folders, ...added]);
    imported.forEach(map=>{ if(map.folderId && !folders.some(f=>f.id===map.folderId)) delete map.folderId; maps.set(map.id,map); });
    // Persist the complete batch before displaying it; roll back on quota errors.
    if(store.mode!=='cloud' && !lsSaveAll()) {
      imported.forEach(map=>maps.delete(map.id)); folders=folders.filter(f=>known.has(f.id));
      throw new Error('瀏覽器空間不足，匯入未完成；原有心智圖已保留。');
    }
    if(added.length) saveFolders();
    if(store.mode==='cloud') imported.forEach(map=>save(map.id,true));
    $('search').value=''; goto(imported[0].id);
    toast(`已匯入 ${imported.length} 張心智圖，原有資料已保留。`);
  } catch(error) {
    toast(error instanceof SyntaxError ? 'JSON 格式錯誤，請選擇完整的存檔。' : (error.message || '無法讀取存檔，請重試。'));
  } finally {
    $('importFile').value=''; renderSidebar();
  }
});

function createMap(sample){
  if(store.readOnly||!ready) return;
  const m=makeMap(sample);
  const last=sortedMaps().pop(); if(last && m.createdAt<=last.createdAt) m.createdAt=last.createdAt+1;
  maps.set(m.id,m); save(m.id,true);
  goto(m.id);
  if(!sample){ setTimeout(()=>{ $('title').focus(); $('title').select(); }, 50); }
}
function goto(id){
  if(openAncestors(maps.get(topPageOf(id))?.folderId)) saveFolders();
  revealPage(id);
  if(location.hash.slice(1)!==id) location.hash=id;
  openMap(id);
  if(isMobile()) app.classList.add('side-closed');
}
function openMap(id){
  if(editingId) commitEdit();
  if(!maps.has(id)) id=null;
  const changed=id!==currentId;
  currentId=id;
  if(changed){ for(const el of els.values()) el.remove(); els.clear(); group=null; }
  const m=cur();
  selectedId = m ? firstRootId(m) : null;
  syncHeader(); renderSidebar(); renderMap();
  if(changed && m) fit();
}
function syncHeader(){
  const m=cur();
  $('title').value = m ? (m.title||'') : '';
  $('title').disabled = !m || store.readOnly;
  $('crumbIcon').innerHTML = stickyIcon(m?.color,20);
  const trail=[]; for(let p=isSubPage(m)?maps.get(m.parentId):null, n=0; p&&n<50; p=isSubPage(p)?maps.get(p.parentId):null, n++) trail.unshift(p);
  $('crumbs').replaceChildren(...trail.flatMap(p=>{ const b=document.createElement('button'); b.className='crumb'; b.dataset.goto=p.id; b.textContent=p.title||'未命名心智圖'; b.title='回到「'+b.textContent+'」'; const sep=document.createElement('span'); sep.className='crumb-sep'; sep.textContent='/'; return [b,sep]; }));
  $('crumbs').hidden=!trail.length;
  $('crumbIcon').disabled = !m || store.readOnly;
  $('layDown').classList.toggle('on', !!m && m.layout!=='right');
  $('layRight').classList.toggle('on', !!m && m.layout==='right');
  document.title = m ? `${m.title||'未命名心智圖'} | YoZu 心智圖` : 'YoZu 心智圖';
}
listen($('title'), 'input', ()=>{ const m=cur(); if(!m||store.readOnly) return; m.title=$('title').value; document.title=`${m.title||'未命名心智圖'} | YoZu 心智圖`; renderSidebar(); save(m.id); });
listen($('crumbs'), 'click', e=>{ const b=e.target.closest('[data-goto]'); if(b) goto(b.dataset.goto); });
listen($('title'), 'keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); canvas.focus(); } });
function setLayout(l){ const m=cur(); if(!m||store.readOnly||m.layout===l) return; m.layout=l; syncHeader(); renderMap(); fit(); save(m.id); }
listen($('layDown'), 'click', ()=>setLayout('down'));
listen($('layRight'), 'click', ()=>setLayout('right'));

/* side toggling */
listen($('closeSide'), 'click', ()=>app.classList.add('side-closed'));
listen($('openSide'), 'click', ()=>app.classList.toggle('side-closed'));
listen($('scrim'), 'click', ()=>app.classList.add('side-closed'));
if(isMobile()) app.classList.add('side-closed');
listen(app, 'transitionend', e=>{ if(e.target===$('side')){ placeBar(); } });

/* theme */
function syncTheme(){
  const dark=document.documentElement.dataset.theme==='dark';
  $('themeBtn').innerHTML='<i class="bi bi-'+(dark?'sun':'moon-stars')+'" aria-hidden="true"></i>';
  $('themeBtn').title=dark?'切換為 Milanote 淺色':'切換為深色'; $('themeBtn').setAttribute('aria-label',$('themeBtn').title);
}
listen($('themeBtn'), 'click', ()=>{ applyTheme(document.documentElement.dataset.theme==='dark'?'milanote':'dark'); syncTheme(); });
syncTheme();

/* ---------------- popovers ---------------- */
let menuFor=null, folderFor=null, folderAnchor=null, moveFor=null, moveKind='map';
function closePops(){
  document.querySelectorAll('.pop.show').forEach(p=>p.classList.remove('show'));
  const d=$('pageMenu').querySelector('[data-m="del"]'); d.classList.remove('armed'); d.innerHTML='<i class="bi bi-trash" aria-hidden="true"></i>刪除';
  const fd=$('folderMenu').querySelector('[data-f="del"]'); fd.classList.remove('armed'); fd.innerHTML='<i class="bi bi-trash" aria-hidden="true"></i>刪除資料夾';
}
function showPop(p, anchor, align){
  closePops(); p.classList.add('show');
  const r=anchor.getBoundingClientRect(), w=p.offsetWidth, h=p.offsetHeight;
  let left = align==='right' ? r.right-w : r.left; let top=r.bottom+6;
  left=clamp(left,8,innerWidth-w-8); if(top+h>innerHeight-8) top=Math.max(8,r.top-h-6);
  p.style.left=left+'px'; p.style.top=top+'px';
}
let menuAnchor=null;
function openPageMenu(id, anchor){ menuFor=id; menuAnchor=anchor; showPop($('pageMenu'), anchor); }
function openMovePop(kind, id, anchor){
  const pop=$('movePop'); pop.innerHTML='';
  const current=kind==='map'?maps.get(id)?.folderId:folderById(id)?.parentId;
  const item=(to,html,label,on)=>{ const b=document.createElement('button'); b.className='mi'+(on?' on':''); b.dataset.to=to; b.innerHTML=html; b.append(label); pop.appendChild(b); };
  for(const f of folderTree()){ if(kind==='folder'&&isFolderInside(f.id,id)) continue; item(f.id, folderIcon(f.color), folderPath(f), current===f.id); }
  if(current) item('', '<i class="bi bi-box-arrow-up-left" aria-hidden="true"></i>', kind==='map'?'移出資料夾':'移到最外層', false);
  if(kind==='map') item('new', '<i class="bi bi-folder-plus" aria-hidden="true"></i>', '新增資料夾並移入', false);
  if(!pop.children.length) item('', '<i class="bi bi-info-circle" aria-hidden="true"></i>', '沒有其他資料夾', false);
  moveKind=kind; moveFor=id; showPop(pop, anchor);
}
listen($('movePop'), 'click', e=>{
  const b=e.target.closest('[data-to]'); if(!b||!moveFor) return; e.stopPropagation(); closePops();
  if(moveKind==='folder') setFolderParent(moveFor, b.dataset.to||null);
  else if(b.dataset.to==='new') createFolder(moveFor); else setFolder(moveFor, b.dataset.to||null);
});
(function buildFolderColors(){
  const g=$('folderColorGrid'); g.replaceChildren();
  for(const [key,name] of [['default','預設（跟隨主題）'],...Object.entries(FOLDER_COLORS).map(([k,[,n]])=>[k,n])]){
    const b=document.createElement('button'); b.innerHTML=folderIcon(key,24); b.title=name; b.setAttribute('aria-label','資料夾顏色 '+name); b.dataset.color=key; g.appendChild(b);
  }
})();
listen($('folderColorGrid'), 'click', e=>{
  const b=e.target.closest('[data-color]'), f=folderById(folderFor); if(!b||!f) return;
  if(b.dataset.color==='default') delete f.color; else f.color=b.dataset.color;
  saveFolders(); renderSidebar(); closePops();
});
listen($('folderMenu'), 'click', e=>{
  const b=e.target.closest('[data-f]'), f=folderById(folderFor); if(!b||!f) return; e.stopPropagation();
  const anchor=folderAnchor&&folderAnchor.isConnected?folderAnchor:$('folderMenu');
  if(b.dataset.f==='rename'){ closePops(); renamingFolder=f.id; openAncestors(f.parentId); renderSidebar(); }
  else if(b.dataset.f==='sub'){ closePops(); createFolder(null, f.id); }
  else if(b.dataset.f==='move') openMovePop('folder', f.id, anchor);
  else if(b.dataset.f==='color'){
    $('folderColorGrid').querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('on', x.dataset.color===(f.color||'default')));
    showPop($('folderColorPop'), anchor);
  }
  else if(b.dataset.f==='del'){
    if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='再按一次確定刪除'; return; }
    closePops(); deleteFolder(f.id);
  }
});
listen($('pageMenu'), 'click', e=>{
  const b=e.target.closest('[data-m]'); if(!b||!menuFor) return; e.stopPropagation();
  const m=maps.get(menuFor); if(!m) return closePops();
  if(b.dataset.m==='rename'){ closePops(); goto(m.id); setTimeout(()=>{ $('title').focus(); $('title').select(); },60); }
  else if(b.dataset.m==='move'){ openMovePop('map', m.id, menuAnchor&&menuAnchor.isConnected?menuAnchor:$('pageMenu')); }
  else if(b.dataset.m==='dup'){
    closePops(); const c=parseMaps(JSON.stringify(m),uid)[0]; c.title=(m.title||'未命名心智圖')+' 的副本';
    const last=sortedMaps().pop(); c.createdAt=Math.max(Date.now(), (last?last.createdAt:0)+1); c.rev='';
    maps.set(c.id,c); save(c.id,true); goto(c.id); toast('已建立副本');
  }
  else if(b.dataset.m==='del'){
    if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='再按一次確定刪除'; return; }
    closePops(); deleteMap(m.id);
  }
});
function deleteMap(id){
  const wasCur=id===currentId; maps.delete(id); undoS.delete(id); redoS.delete(id);
  removeRemote(id);
  if(wasCur){ const first=sortedMaps()[0]; if(first) goto(first.id); else { history.replaceState(null,'',location.pathname+location.search); openMap(null); } }
  else renderSidebar();
  toast('已刪除心智圖');
}
(function buildColors(){
  const g=$('iconGrid'); g.replaceChildren();
  for(const [key,name] of [['default','預設（跟隨主題）'],...Object.entries(NOTE_COLORS).map(([k,[,n]])=>[k,n])]){
    const b=document.createElement('button'); b.innerHTML=stickyIcon(key,24); b.title=name; b.setAttribute('aria-label','便利貼顏色 '+name); b.dataset.color=key; g.appendChild(b);
  }
})();
listen($('crumbIcon'), 'click', e=>{
  e.stopPropagation(); const m=cur(); if(!m||store.readOnly) return;
  $('iconGrid').querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('on', b.dataset.color===(m.color||'default')));
  showPop($('iconPop'), $('crumbIcon'));
});
listen($('iconGrid'), 'click', e=>{
  const b=e.target.closest('[data-color]'); const m=cur(); if(!b||!m) return;
  if(b.dataset.color==='default') delete m.color; else m.color=b.dataset.color;
  syncHeader(); renderSidebar(); save(m.id); closePops();
});
listen($('shareBtn'), 'click', e=>{
  e.stopPropagation();
  const t=$('shareText');
  if(store.mode==='cloud'){
    t.innerHTML='';
    const p1=document.createTextNode('用這個作品頁面上的「分享」功能複製連結。連結會記住目前打開的這張圖（網址結尾的 ');
    const c=document.createElement('code'); c.textContent='#'+(currentId||'');
    const p2=document.createTextNode('），對方打開就會直接看到它。有權限的人也能在左側看到其他心智圖。');
    t.append(p1,c,p2);
  } else {
    t.textContent='心智圖目前只儲存在這個瀏覽器。你可以分享網站網址讓朋友建立自己的心智圖；你的心智圖內容不會隨網址分享。';
  }
  showPop($('sharePop'), $('shareBtn'), 'right');
});
listen(document, 'pointerdown', e=>{ if(!e.target.closest('.pop') && !e.target.closest('[data-more],[data-folder-more]') && e.target!==$('crumbIcon') && !e.target.closest('#shareBtn')) closePops(); });

/* zoom bar */
listen($('zIn'), 'click', ()=>zoomCenter(1.2));
listen($('zOut'), 'click', ()=>zoomCenter(1/1.2));
listen($('zLabel'), 'click', ()=>zoomCenter(1/view.k));
listen($('zFit'), 'click', fit);

/* empty state */
function updateEmpty(){
  const box=$('empty'), has=!!cur();
  box.classList.toggle('show', !has);
  $('hint').style.visibility = has && !store.readOnly ? '' : 'hidden';
  document.querySelector('.zoombar').style.visibility = has ? '' : 'hidden';
  if(has) return;
  if(!ready){ $('emptyTitle').textContent='載入中…'; $('emptyText').textContent=''; $('emptyRow').hidden=true; return; }
  if(store.readOnly){ $('emptyTitle').textContent='目前沒有心智圖'; $('emptyText').textContent='這個工作區還沒有任何心智圖。'; $('emptyRow').hidden=true; return; }
  $('emptyTitle').textContent='還沒有心智圖';
  $('emptyText').textContent='每張心智圖都是左側的一個頁面。建立後用 Tab 長出子節點、Enter 新增同層，雙擊文字就能改。';
  $('emptyRow').hidden=false;
}
listen($('emptyNew'), 'click', ()=>createMap(false));
listen($('emptySample'), 'click', ()=>createMap(true));

function applyReadOnly(){
  $('roBadge').hidden=!store.readOnly; cards?.render(); syncHeader(); renderSidebar(); setStatus(); placeBar(); updateEmpty();
}

/* toast */
let toastT=null;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2400); }

/* hash routing */
listen(window, 'hashchange', ()=>{ const h=location.hash.slice(1); if(h && maps.has(h) && h!==currentId) openMap(h); });
listen(window, 'resize', ()=>{ placeBar(); });

/* ---------------- boot ---------------- */
function afterLoad(){
  ready=true;
  const h=location.hash.slice(1);
  const target = maps.has(h) ? h : (sortedMaps()[0]||{}).id || null;
  if(target && location.hash.slice(1)!==target && maps.has(h)===false && h) history.replaceState(null,'','#'+target);
  openMap(target); setStatus(); applyReadOnly();
}
let firstSnap=true;
function onSnap(snap){
  const seen=new Set(); let curChanged=false;
  for(const d of snap.docs){
    const data=d.data();
    if(d.id===FOLDER_DOC){ folders=cleanFolders(data&&data.folders); continue; }
    if(!data||!('root' in data)) continue; seen.add(d.id);
    const local=maps.get(d.id);
    if(local && data.rev && myRevs.has(data.rev)) continue;
    if(local && (isBusy(d.id) || (d.id===currentId && (editingId||drag)))) continue;
    if(local && local.rev===data.rev && data.rev) continue;
    const copy=sanitizeMap(JSON.parse(JSON.stringify(data))); copy.id=d.id;
    maps.set(d.id, copy);
    if(d.id===currentId) curChanged=true;
  }
  if(!firstSnap){
    for(const id of [...maps.keys()]) if(!seen.has(id) && !isBusy(id)) { maps.delete(id); if(id===currentId) curChanged=true; }
  }
  if(firstSnap){ firstSnap=false; afterLoad(); return; }
  renderSidebar();
  if(curChanged){
    if(!cur()){ const f=sortedMaps()[0]; openMap(f?f.id:null); }
    else { syncHeader(); renderMap(); if(!idx.has(selectedId)) selectedId=null; placeBar(); }
  }
}
async function init(){
  updateEmpty(); renderSidebar(); setStatus();
  let db=null, user=null;
  try{
    if(window.claude && typeof window.claude.use==='function'){
      [db,user]=await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    }
  }catch(e){ db=null; }
  if(db){
    store.mode='cloud'; store.db=db;
    if(user){ try{ const c=await user.can('data.write'); if(c===false) store.readOnly=true; }catch(e){} }
    db.collection('maps').onSnapshot(onSnap, err=>{
      if(err && err.code==='revoked'){ store.readOnly=true; applyReadOnly(); }
      else toast('同步中斷了，重新整理頁面就能恢復');
      if(firstSnap){ firstSnap=false; afterLoad(); }
    });
  } else {
    store.mode='local';
    lsLoad().forEach(m=>{ if(m&&m.id&&'root' in m){ maps.set(m.id,sanitizeMap(m)); } });
    try{ folders=cleanFolders(JSON.parse(localStorage.getItem(FOLDER_KEY)||'[]')); }catch(e){ folders=[]; }
    afterLoad();
  }
}
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(()=>{ mcache.clear(); if(cur()) renderMap(); }); }
// Images, top-level cards and drawings share one stacking order; the newest or last moved sits on top.
function nextZ(){ const m=cur(); let z=0; for(const o of [...(m?.images||[]),...(m?.cards||[]),...(m?.strokes||[])]) z=Math.max(z,o.z||0); return z+1; }
function clearNodeSelection(){ if(editingId) commitEdit(); selectedId=null; for(const el of els.values()) el.classList.remove('sel'); hideBar(); }
// Drawing goes first, then relations, so their capture-phase pointer handlers win over images and cards.
draw=setupDraw({nextZ,canvas,world,button:$('drawBtn'),rail:$('toolrail'),getMap:cur,getView:()=>view,uid,snapshot,save,toast,canEdit:()=>!store.readOnly,clearSelection:()=>{clearNodeSelection();cards?.deselect();assets?.deselect();relations?.deselect();}});
relations=setupRelations({canPin:r=>!!relationPin(r),pin:pinFromRelation,canvas,world,button:$('relationBtn'),getMap:cur,getView:()=>view,getBox:id=>pinHidden.has(id)?null:L.get(id)||(cur()?.images||[]).find(i=>i.id===id)||cards?.box(id),uid,snapshot,dropSnapshot,save,toast,canEdit:()=>!store.readOnly,clearSelection:()=>{clearNodeSelection();cards?.deselect();assets?.deselect();}});
assets=setupCanvasAssets({nextZ,canvas,world,getMap:cur,getView:()=>view,uid,snapshot,save,toast,canEdit:()=>!store.readOnly,clearNodeSelection:()=>{clearNodeSelection();cards?.deselect();relations?.deselect();},onChange:()=>{ relations?.render(); drawPinEdges(); },isHidden:id=>pinHidden.has(id),moved:objectMoved,pinStart,hoverDrop:(x,y)=>cards?.hoverDrop(x,y),dropImage:(x,y,image)=>!!cards?.dropImage(x,y,image)});
cards=setupCards({createPage,pageInfo,openPage:id=>goto(id),viewPage:id=>{ if(editingId) commitEdit(); openViewer(id); },renamePage,pagesChanged:()=>renderSidebar(),nextZ,canvas,world,rail:$('toolrail'),getMap:cur,getView:()=>view,uid,snapshot,dropSnapshot,save,toast,canEdit:()=>!store.readOnly,clearSelection:()=>{clearNodeSelection();assets?.deselect();relations?.deselect();},hasNodeSelection:()=>!!selectedId,createTree,isHidden:id=>pinHidden.has(id),moved:objectMoved,pinStart,hostOf:id=>hostOf(id),nodeAction,onChange:()=>{ relations?.render(); drawPinEdges(); if(!document.querySelector('.card.dragging')&&hostsResized()) renderMap(); }});
init();

// Remove everything this run drew so a hot reload or remount starts from a clean canvas.
return () => { for(const el of els.values()) el.remove(); els.clear(); edges.innerHTML=''; edgeLabels.remove(); groupLayer.remove(); pinEdges.remove(); nodeGrip.remove(); hideBar(); ghost?.remove(); draw?.destroy(); relations?.destroy(); cards?.destroy(); assets?.destroy(); disposers.forEach(dispose => dispose()); clearTimeout(toastT); pending.forEach(clearTimeout); };
}
