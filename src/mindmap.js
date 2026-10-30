import { MAX_FILE_BYTES, parseFolders, parseMaps, serializeMaps } from './files.js';
import { setupCanvasAssets } from './canvas-assets.js';
import { setupCards, stickyIcon, NOTE_COLORS, FOLDER_ICON } from './cards.js';
import { setupRelations } from './relations.js';
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
let assets=null, cards=null, relations=null;

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

function cleanFolders(list){ return (Array.isArray(list)?list:[]).filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string').map(f=>({id:f.id,name:f.name,open:f.open!==false,createdAt:+f.createdAt||0})); }
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
function sanitize(n){ if(!n||typeof n!=='object') return mkNode(''); n.text=typeof n.text==='string'?n.text:''; n.children=Array.isArray(n.children)?n.children.map(sanitize):[]; if(!n.id) n.id=uid('n'); return n; }
function countDesc(n){ let c=0; (n.children||[]).forEach(ch=>{ c+=1+countDesc(ch); }); return c; }
function nextColor(root){
  const used=new Map(PALETTE.map(c=>[c,0]));
  root.children.forEach((c,i)=>{ const col=c.color||PALETTE[i%PALETTE.length]; if(used.has(col)) used.set(col,used.get(col)+1); });
  let best=PALETTE[0], min=Infinity; for(const [c,v] of used){ if(v<min){min=v;best=c;} } return best;
}
function isAncestor(aId, bId){ let i=idx.get(bId); while(i&&i.parent){ if(i.parent.id===aId) return true; i=idx.get(i.parent.id); } return false; }

/* ---------------- undo ---------------- */
function capture(m){ return JSON.stringify({root:m.root,trees:m.trees||[],rootX:m.rootX||0,rootY:m.rootY||0,images:m.images||[],relations:m.relations||[],cards:m.cards||[]}); }
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
  save(m.id);
}

/* ---------------- layout ---------------- */
const isDown = () => (cur()&&cur().layout)!=='right';
function lvl(d){ return d===0?'root':d===1?'l1':'l2'; }
function measure(n,d){
  const k=lvl(d)+'|'+(n.text||'輸入文字');
  let v=mcache.get(k); if(v) return v;
  measurer.className='node '+lvl(d); measurer.textContent=n.text||'輸入文字';
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
}

/* ---------------- render ---------------- */
function renderMap(){
  const m=cur();
  updateEmpty();
  if(!m){ for(const el of els.values()) el.remove(); els.clear(); edges.innerHTML=''; hideBar(); cards?.render(); assets?.render(); relations?.render(); return; }
  buildIndex(); doLayout();
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
    if(el.className!==cls) el.className=cls;
    if(id!==editingId && el.textContent!==info.node.text) el.textContent=info.node.text;
    el.style.transform=`translate(${o.x}px,${o.y}px)`;
    el.style.setProperty('--c', info.color||'var(--accent)');
  }
  for(const [id,el] of els){ if(!alive.has(id)){ el.remove(); els.delete(id); } }
  cards?.render(); drawEdges(); applyView(); placeBar();
}
function drawEdges(){
  const down=isDown(); let out='';
  for(const [id,info] of idx){
    const n=info.node, o=L.get(id); if(!o) continue;
    if(n.collapsed && n.children.length){
      const cx= down? o.x+o.w/2 : o.x+o.w+14, cy= down? o.y+o.h+14 : o.y+o.h/2;
      const col = info.depth===0 ? 'var(--ink-2)' : info.color;
      out+=`<g class="chip" data-toggle="${id}"><circle cx="${cx}" cy="${cy}" r="11" fill="${col}"/><text x="${cx}" y="${cy}">${countDesc(n)}</text></g>`;
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
    });
  }
  edges.innerHTML=out;
  assets?.render(); relations?.render();
}
function applyView(){
  world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.k})`;
  const g=24*view.k;
  canvas.style.backgroundSize=`${g}px ${g}px`;
  canvas.style.backgroundPosition=`${view.x}px ${view.y}px`;
  $('zLabel').textContent=Math.round(view.k*100)+'%';
  relations?.place();
}
function bbox(){ let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity; for(const o of [...L.values(),...(assets?.boxes()||[]),...(cards?.boxes()||[])]){ a=Math.min(a,o.x); b=Math.min(b,o.y); c=Math.max(c,o.x+o.w); d=Math.max(d,o.y+o.h);} return {x0:a,y0:b,x1:c,y1:d}; }
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
function hideBar(){ nodebar.classList.remove('show','colors'); }
function placeBar(){
  const info=idx.get(selectedId), o=L.get(selectedId);
  if(!info||!o||editingId||store.readOnly||drag){ hideBar(); return; }
  const showColor=info.depth>0;
  nodebar.querySelector('[data-act="color"]').style.display=showColor?'':'none';
  nodebar.querySelector('[data-for="color"]').style.display=showColor?'':'none';
  nodebar.querySelector('[data-act="collapse"]').style.display=info.node.children.length?'':'none';
  nodebar.querySelector('[data-act="collapse"]').firstElementChild.style.transform=info.node.collapsed?'rotate(-90deg)':'';
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
  const sw=e.target.closest('[data-color]');
  if(sw){ setBranchColor(sw.dataset.color); nodebar.classList.remove('colors'); return; }
  const b=e.target.closest('[data-act]'); if(!b) return;
  const a=b.dataset.act;
  if(a==='edit') startEdit(selectedId);
  else if(a==='child') addChild();
  else if(a==='sibling') addSibling();
  else if(a==='delete') deleteSel();
  else if(a==='collapse') toggleCollapse(selectedId);
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
    selectedId=null; renderMap(); save(currentId);
    if(!m.root) toast('已刪除心智圖，可用左側「心智圖」工具再新增');
    return;
  }
  const p=info.parent, i=p.children.indexOf(info.node);
  const removed=new Set();
  (function collect(node){removed.add(node.id);node.children.forEach(collect);})(info.node);
  cur().relations=(cur().relations||[]).filter(line=>!removed.has(line.from)&&!removed.has(line.to));
  p.children.splice(i,1);
  selectedId = (p.children[i]||p.children[i-1]||p).id;
  renderMap(); save(currentId);
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
function moveNode(id, targetId){
  if(!guard()) return; const a=idx.get(id), t=idx.get(targetId); if(!a||!t||!a.parent) return;
  if(id===targetId || isAncestor(id,targetId) || a.parent.id===targetId) return;
  snapshot();
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
    const t=(el?el.textContent:info.node.text).replace(/\s+/g,' ').trim();
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
  else if(e.key==='Enter' && e.shiftKey){ e.preventDefault(); }
  else if(e.key==='Tab'){ e.preventDefault(); commitEdit(); addChild(); }
  else if(e.key==='Escape'){ e.preventDefault(); commitEdit(); }
  e.stopPropagation();
});
listen(world, 'focusout', e=>{ if(editingId && e.target===els.get(editingId)) commitEdit(); });
listen(world, 'paste', e=>{
  if(!editingId) return; e.preventDefault();
  const t=(e.clipboardData||window.clipboardData).getData('text').replace(/\s+/g,' ');
  document.execCommand('insertText', false, t);
});

/* ---------------- pointer: select / pan / drag / pinch ---------------- */
const ptrs=new Map(); let gesture=null, drag=null, ghost=null;
listen(canvas, 'pointerdown', e=>{
  if(e.pointerType==='mouse' && e.button!==0) return;
  if(e.target.closest('.zoombar,.empty-state,.nodebar,.card')) return;
  closePops();
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){ endDrag(false); const p=[...ptrs.values()]; gesture={type:'pinch', d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y), mx:(p[0].x+p[1].x)/2, my:(p[0].y+p[1].y)/2}; return; }
  if(ptrs.size>2) return;
  const chip=e.target.closest('.chip');
  if(chip){ toggleCollapse(chip.dataset.toggle); gesture=null; return; }
  const nodeEl=e.target.closest('.node');
  if(nodeEl){
    const id=nodeEl.dataset.id;
    if(id===editingId) return;
    if(editingId) commitEdit();
    if(selectedId!==id){ selectedId=id; renderMap(); }
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
      if(!store.readOnly && info && info.depth>0){ startDrag(gesture.id, e); gesture.type='drag'; }
      else if(!store.readOnly && info){ snapshot(); Object.assign(gesture,{type:'tree', tree:info.tree, ox:info.tree.x, oy:info.tree.y}); hideBar(); }
      else { gesture.type='pan'; canvas.classList.add('panning'); }
    }
  } else if(gesture.type==='drag'){ moveDrag(e); }
  else if(gesture.type==='tree'){ setTreePos(gesture.tree, Math.round(gesture.ox+(e.clientX-gesture.sx)/view.k), Math.round(gesture.oy+(e.clientY-gesture.sy)/view.k)); renderMap(); }
});
function upHandler(e){
  if(!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if(gesture && gesture.type==='drag') endDrag(e.type==='pointerup');
  if(gesture && gesture.type==='tree') save(currentId);
  if(ptrs.size===0 || (gesture && gesture.type==='pinch')){ gesture=null; }
  canvas.classList.remove('panning');
}
listen(window, 'pointerup', upHandler);
listen(window, 'pointercancel', upHandler);

function startDrag(id, e){
  drag={id, target:null};
  ghost=document.createElement('div'); ghost.className='ghost';
  ghost.textContent=(idx.get(id).node.text||'輸入文字'); document.body.appendChild(ghost);
  hideBar(); moveDrag(e); renderMap();
}
function moveDrag(e){
  if(!drag) return;
  ghost.style.transform=`translate(${e.clientX+12}px,${e.clientY+12}px)`;
  const el=document.elementFromPoint(e.clientX,e.clientY);
  const n=el&&el.closest&&el.closest('.node');
  let t=n&&n.dataset.id||null;
  if(t && (t===drag.id || isAncestor(drag.id,t))) t=null;
  if(t!==drag.target){ drag.target=t; renderMap(); }
}
function endDrag(drop){
  if(!drag) return; const d=drag; drag=null;
  if(ghost){ ghost.remove(); ghost=null; }
  if(drop && d.target) moveNode(d.id, d.target); else renderMap();
}

listen(canvas, 'dblclick', e=>{
  const n=e.target.closest('.node');
  if(n && n.dataset.id!==editingId){ e.preventDefault(); startEdit(n.dataset.id); }
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
function sortedFolders(){ return [...folders].sort((a,b)=>a.createdAt-b.createdAt); }
let renamingFolder=null;
function moreButton(label, data){
  const mb=document.createElement('button'); mb.className='icon-btn more'; mb.title='更多'; mb.setAttribute('aria-label',label); Object.assign(mb.dataset,data);
  mb.innerHTML='<i class="bi bi-three-dots" aria-hidden="true"></i>'; return mb;
}
function pageRow(m, folderId){
  const row=document.createElement('div'); row.className='page'+(m.id===currentId?' active':'')+(folderId?' nested':''); row.dataset.id=m.id; row.tabIndex=0; row.setAttribute('role','button');
  if(folderId) row.dataset.folder=folderId;
  row.draggable=!store.readOnly;
  const i=document.createElement('span'); i.className='pi'; i.innerHTML=stickyIcon(m.color,18);
  const t=document.createElement('span'); t.className='pt'; t.textContent=m.title||'未命名心智圖';
  row.append(i,t);
  if(!store.readOnly) row.appendChild(moreButton('更多選項',{more:m.id}));
  return row;
}
function folderRow(f, count, open){
  const row=document.createElement('div'); row.className='folder-row'+(open?' open':''); row.dataset.folder=f.id; row.tabIndex=0; row.setAttribute('role','button'); row.setAttribute('aria-expanded',String(open));
  const chev=document.createElement('i'); chev.className='bi bi-chevron-right fchev'; chev.setAttribute('aria-hidden','true');
  const i=document.createElement('span'); i.className='pi'; i.innerHTML=FOLDER_ICON;
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
  const all=sortedMaps(), known=new Set(folders.map(f=>f.id));
  const box=$('pages'); box.innerHTML=''; let shown=0;
  $('count').textContent=all.length?String(all.length):'';
  for(const f of sortedFolders()){
    const inside=all.filter(m=>m.folderId===f.id), nameHit=!!q&&(f.name||'').toLowerCase().includes(q);
    const list=nameHit?inside:inside.filter(match);
    if(q&&!list.length&&!nameHit) continue;
    const open=f.open||(!!q&&list.length>0);
    box.appendChild(folderRow(f,inside.length,open)); shown++;
    if(!open) continue;
    list.forEach(m=>box.appendChild(pageRow(m,f.id)));
    if(!inside.length){ const d=document.createElement('div'); d.className='folder-empty'; d.dataset.folder=f.id; d.textContent='把心智圖拖進這裡'; box.appendChild(d); }
  }
  for(const m of all){ if(!known.has(m.folderId)&&match(m)){ box.appendChild(pageRow(m,null)); shown++; } }
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
  if(fm){ e.stopPropagation(); folderFor=fm.dataset.folderMore; showPop($('folderMenu'), fm); return; }
  if(e.target.closest('[data-rename]')) return;
  const fr=e.target.closest('.folder-row'); if(fr){ toggleFolder(fr.dataset.folder); return; }
  const row=e.target.closest('.page'); if(row) goto(row.dataset.id);
});
listen($('pages'), 'keydown', e=>{
  const input=e.target.closest('[data-rename]');
  if(input){ if(e.key==='Enter'){ e.preventDefault(); commitFolderName(input); } else if(e.key==='Escape'){ renamingFolder=null; renderSidebar(); } return; }
  if(e.key!=='Enter') return;
  if(e.target.classList.contains('page')) goto(e.target.dataset.id);
  else if(e.target.classList.contains('folder-row')) toggleFolder(e.target.dataset.folder);
});
listen($('pages'), 'focusout', e=>{ const input=e.target.closest?.('[data-rename]'); if(input) commitFolderName(input); });
listen($('search'), 'input', renderSidebar);
listen($('newBtn'), 'click', ()=>createMap(false));
listen($('newFolderBtn'), 'click', ()=>createFolder());

/* ---------------- folders ---------------- */
function createFolder(moveId){
  if(store.readOnly||!ready) return;
  const last=sortedFolders().pop(), f={id:uid('f'), name:'新資料夾', open:true, createdAt:Math.max(Date.now(), (last?last.createdAt:0)+1)};
  folders.push(f); saveFolders();
  if(moveId) setFolder(moveId, f.id, true);
  renamingFolder=f.id; renderSidebar();
}
function commitFolderName(input){
  const f=folders.find(x=>x.id===input.dataset.rename); if(renamingFolder!==input.dataset.rename) return;
  renamingFolder=null;
  if(f){ const name=input.value.trim()||'未命名資料夾'; if(name!==f.name){ f.name=name; saveFolders(); } }
  renderSidebar();
}
function toggleFolder(id){ const f=folders.find(x=>x.id===id); if(!f) return; f.open=!f.open; saveFolders(); renderSidebar(); }
function setFolder(mapId, folderId, quiet){
  const m=maps.get(mapId), f=folders.find(x=>x.id===folderId); if(!m||store.readOnly) return;
  if((m.folderId||null)===(f?f.id:null)) return;
  if(f){ m.folderId=f.id; if(!f.open){ f.open=true; saveFolders(); } } else delete m.folderId;
  save(mapId,true); renderSidebar();
  if(!quiet) toast(f?`已移到「${f.name}」`:'已移出資料夾');
}
function deleteFolder(id){
  folders=folders.filter(f=>f.id!==id);
  for(const m of maps.values()) if(m.folderId===id){ delete m.folderId; save(m.id,true); }
  saveFolders(); renderSidebar(); toast('已刪除資料夾，裡面的心智圖移到外層');
}
// Drag a mind map row onto a folder (or onto loose space to take it out).
let dragMap=null;
function dropFolderAt(target){ const el=target.closest?.('[data-folder]'); return el?el.dataset.folder:null; }
function clearDropMarks(){ $('pages').classList.remove('drop-root'); $('pages').querySelectorAll('.drop').forEach(el=>el.classList.remove('drop')); }
listen($('pages'), 'dragstart', e=>{
  const row=e.target.closest?.('.page'); if(!row||store.readOnly){ e.preventDefault(); return; }
  dragMap=row.dataset.id; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',dragMap); row.classList.add('dragging');
});
listen($('pages'), 'dragover', e=>{
  if(!dragMap) return; e.preventDefault(); e.dataTransfer.dropEffect='move';
  const fid=dropFolderAt(e.target); clearDropMarks();
  if(fid) $('pages').querySelector(`.folder-row[data-folder="${CSS.escape(fid)}"]`)?.classList.add('drop');
  else if(maps.get(dragMap)?.folderId) $('pages').classList.add('drop-root');
});
listen($('pages'), 'drop', e=>{ if(!dragMap) return; e.preventDefault(); const id=dragMap; dragMap=null; clearDropMarks(); setFolder(id, dropFolderAt(e.target)); });
listen($('pages'), 'dragend', ()=>{ dragMap=null; clearDropMarks(); $('pages').querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging')); });

function exportFile(all) {
  if(editingId) commitEdit();
  const selected = all ? sortedMaps() : (cur() ? [cur()] : []);
  if(!selected.length) return;
  const used=new Set(selected.map(m=>m.folderId));
  const blob = new Blob([serializeMaps(selected, folders.filter(f=>used.has(f.id)))], {type:'application/json;charset=utf-8'});
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
    if(file.size > MAX_FILE_BYTES) throw new Error('存檔不可超過 25 MB。');
    const text = await file.text();
    const imported = parseMaps(text, uid);
    const known = new Set(folders.map(f=>f.id)), added = parseFolders(text).filter(f=>!known.has(f.id));
    if(editingId) commitEdit();
    folders.push(...added);
    imported.forEach(map=>{ if(map.folderId && !folders.some(f=>f.id===map.folderId)) delete map.folderId; maps.set(map.id,map); });
    // Persist the complete batch before displaying it; roll back on quota errors.
    if(store.mode!=='cloud' && !lsSaveAll()) {
      imported.forEach(map=>maps.delete(map.id)); folders=folders.filter(f=>!added.includes(f));
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
  const f=folders.find(x=>x.id===maps.get(id)?.folderId); if(f&&!f.open){ f.open=true; saveFolders(); }
  if(location.hash.slice(1)!==id) location.hash=id;
  openMap(id);
  if(isMobile()) app.classList.add('side-closed');
}
function openMap(id){
  if(editingId) commitEdit();
  if(!maps.has(id)) id=null;
  const changed=id!==currentId;
  currentId=id;
  if(changed){ for(const el of els.values()) el.remove(); els.clear(); }
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
  $('crumbIcon').disabled = !m || store.readOnly;
  $('layDown').classList.toggle('on', !!m && m.layout!=='right');
  $('layRight').classList.toggle('on', !!m && m.layout==='right');
  document.title = m ? `${m.title||'未命名心智圖'} | YoZu 心智圖` : 'YoZu 心智圖';
}
listen($('title'), 'input', ()=>{ const m=cur(); if(!m||store.readOnly) return; m.title=$('title').value; document.title=`${m.title||'未命名心智圖'} | YoZu 心智圖`; renderSidebar(); save(m.id); });
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
let menuFor=null, folderFor=null;
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
function openMovePop(id, anchor){
  const pop=$('movePop'), m=maps.get(id); pop.innerHTML='';
  const item=(to,html,label,on)=>{ const b=document.createElement('button'); b.className='mi'+(on?' on':''); b.dataset.to=to; b.innerHTML=html; b.append(label); pop.appendChild(b); };
  for(const f of sortedFolders()) item(f.id, FOLDER_ICON, f.name||'未命名資料夾', m.folderId===f.id);
  if(m.folderId) item('', '<i class="bi bi-box-arrow-up-left" aria-hidden="true"></i>', '移出資料夾', false);
  item('new', '<i class="bi bi-folder-plus" aria-hidden="true"></i>', '新增資料夾並移入', false);
  menuFor=id; showPop(pop, anchor);
}
listen($('movePop'), 'click', e=>{
  const b=e.target.closest('[data-to]'); if(!b||!menuFor) return; e.stopPropagation(); closePops();
  if(b.dataset.to==='new') createFolder(menuFor); else setFolder(menuFor, b.dataset.to||null);
});
listen($('folderMenu'), 'click', e=>{
  const b=e.target.closest('[data-f]'); if(!b||!folderFor) return; e.stopPropagation();
  if(b.dataset.f==='rename'){ closePops(); renamingFolder=folderFor; const f=folders.find(x=>x.id===folderFor); if(f) f.open=true; renderSidebar(); }
  else if(b.dataset.f==='del'){
    if(!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='再按一次確定刪除'; return; }
    closePops(); deleteFolder(folderFor);
  }
});
listen($('pageMenu'), 'click', e=>{
  const b=e.target.closest('[data-m]'); if(!b||!menuFor) return; e.stopPropagation();
  const m=maps.get(menuFor); if(!m) return closePops();
  if(b.dataset.m==='rename'){ closePops(); goto(m.id); setTimeout(()=>{ $('title').focus(); $('title').select(); },60); }
  else if(b.dataset.m==='move'){ openMovePop(m.id, menuAnchor&&menuAnchor.isConnected?menuAnchor:$('pageMenu')); }
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
function clearNodeSelection(){ if(editingId) commitEdit(); selectedId=null; for(const el of els.values()) el.classList.remove('sel'); hideBar(); }
// Relations go first so their capture-phase pointer handler wins over images and cards.
relations=setupRelations({canvas,world,button:$('relationBtn'),getMap:cur,getView:()=>view,getBox:id=>L.get(id)||(cur()?.images||[]).find(i=>i.id===id)||cards?.box(id),uid,snapshot,dropSnapshot,save,toast,canEdit:()=>!store.readOnly,clearSelection:()=>{clearNodeSelection();cards?.deselect();assets?.deselect();}});
assets=setupCanvasAssets({canvas,world,getMap:cur,getView:()=>view,uid,snapshot,save,toast,canEdit:()=>!store.readOnly,clearNodeSelection:()=>{clearNodeSelection();cards?.deselect();relations?.deselect();},onChange:()=>relations?.render(),hoverDrop:(x,y)=>cards?.hoverDrop(x,y),dropImage:(x,y,image)=>!!cards?.dropImage(x,y,image)});
cards=setupCards({canvas,world,rail:$('toolrail'),getMap:cur,getView:()=>view,uid,snapshot,dropSnapshot,save,toast,canEdit:()=>!store.readOnly,clearSelection:()=>{clearNodeSelection();assets?.deselect();relations?.deselect();},hasNodeSelection:()=>!!selectedId,createTree,onChange:()=>relations?.render()});
init();

// Remove everything this run drew so a hot reload or remount starts from a clean canvas.
return () => { for(const el of els.values()) el.remove(); els.clear(); edges.innerHTML=''; hideBar(); ghost?.remove(); relations?.destroy(); cards?.destroy(); assets?.destroy(); disposers.forEach(dispose => dispose()); clearTimeout(toastT); pending.forEach(clearTimeout); };
}
