// Whimsical-style freehand drawing plus Snipping-Tool-style shapes, stored as map.strokes in world coordinates.
// Shapes keep two points (drag start and end) so lasso, move and erase treat them like strokes.
export const INK_COLORS = ['ink','#e5484d','#f59e0b','#eab308','#30a46c','#0ea5e9','#2f6fdb','#8e4ec6','#ec4899','#8b95a1'];
const SIZES = [2, 4, 8];
const NS = 'http://www.w3.org/2000/svg';
const LASSO_ICON = '<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 2.2" aria-hidden="true"><circle cx="8" cy="8" r="6"/></svg>';
const icon16 = paths => `<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const TOOLS = { pen:['筆 (P)','<i class="bi bi-pencil" aria-hidden="true"></i>'], highlighter:['螢光筆 (H)','<i class="bi bi-highlighter" aria-hidden="true"></i>'], shape:['形狀 (S)',icon16('<circle cx="6" cy="6" r="4.2"/><rect x="6.5" y="6.5" width="7.5" height="7.5" rx="1"/>')], eraser:['橡皮擦 (E)','<i class="bi bi-eraser" aria-hidden="true"></i>'], lasso:['套索選取 (L)',LASSO_ICON] };
const KEYS = { p:'pen', h:'highlighter', s:'shape', e:'eraser', l:'lasso' };
export const SHAPES = { rect:['矩形（Shift 畫正方形）',icon16('<rect x="2.5" y="3.5" width="11" height="9" rx="1"/>')], ellipse:['橢圓（Shift 畫正圓）',icon16('<ellipse cx="8" cy="8" rx="5.8" ry="5"/>')], line:['直線（Shift 鎖定角度）',icon16('<path d="M3 13 13 3"/>')], arrow:['箭頭（Shift 鎖定角度）',icon16('<path d="M13 13 3 3"/><path d="M3 8.5V3h5.5"/>')] };
const NO_FILL_ICON = icon16('<circle cx="8" cy="8" r="5.5"/><path d="m4.2 11.8 7.6-7.6"/>');
const isShape = s => s.tool in SHAPES;
const arrowSize = s => Math.max(10, s.width*3);
// Outline used for hit-testing, lasso and bounds; freehand strokes use their own points.
function outline(s) {
  if(!isShape(s)) return s.points;
  const [[x1,y1],[x2,y2]]=s.points;
  if(s.tool==='rect') return [[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]];
  if(s.tool==='ellipse') {
    const cx=(x1+x2)/2, cy=(y1+y2)/2, rx=Math.abs(x2-x1)/2, ry=Math.abs(y2-y1)/2;
    return Array.from({length:33},(_,i)=>[cx+rx*Math.cos(i/16*Math.PI), cy+ry*Math.sin(i/16*Math.PI)]);
  }
  return s.points;
}
const colorOf = c => c==='ink' ? 'var(--ink)' : c;
const round = n => Math.round(n*10)/10;

export function strokePath(pts) {
  const [x0,y0]=pts[0];
  if(pts.length===1) return `M${x0} ${y0} L${x0+.01} ${y0}`;
  let d=`M${x0} ${y0}`;
  for(let i=1;i<pts.length-1;i++) { const [x,y]=pts[i], [nx,ny]=pts[i+1]; d+=` Q${x} ${y} ${(x+nx)/2} ${(y+ny)/2}`; }
  const [lx,ly]=pts.at(-1); return d+` L${lx} ${ly}`;
}
function segDist(p, a, b) {
  const dx=b[0]-a[0], dy=b[1]-a[1], len=dx*dx+dy*dy;
  const t=len ? Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/len)) : 0;
  return Math.hypot(p.x-(a[0]+dx*t), p.y-(a[1]+dy*t));
}
function touches(stroke, p, r) {
  const pts=outline(stroke);
  if(stroke.fill && pts.length>3 && insidePolygon(p.x,p.y,pts)) return true;
  if(pts.length===1) return Math.hypot(p.x-pts[0][0],p.y-pts[0][1])<=r;
  for(let i=1;i<pts.length;i++) if(segDist(p,pts[i-1],pts[i])<=r) return true;
  return false;
}
function insidePolygon(x, y, poly) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const [xi,yi]=poly[i], [xj,yj]=poly[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function strokeBox(s) {
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const [x,y] of outline(s)) { x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y); }
  const h=s.tool==='arrow' ? arrowSize(s) : s.width/2; return {x:x0-h, y:y0-h, w:x1-x0+h*2, h:y1-y0+h*2};
}
// Shift keeps rectangles/ellipses square and snaps lines to 45° steps.
function constrain(tool, [x1,y1], x, y) {
  const dx=x-x1, dy=y-y1;
  if(tool==='rect' || tool==='ellipse') { const m=Math.max(Math.abs(dx),Math.abs(dy)); return [x1+Math.sign(dx||1)*m, y1+Math.sign(dy||1)*m]; }
  const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4), len=Math.hypot(dx,dy);
  return [x1+Math.cos(a)*len, y1+Math.sin(a)*len];
}

export function setupDraw({ canvas, world, button, rail, getMap, getView, uid, snapshot, save, toast, canEdit, clearSelection, nextZ }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const svgEl = (name, attrs={}) => { const el=document.createElementNS(NS,name); for(const k in attrs) el.setAttribute(k,attrs[k]); return el; };
  // Each stroke gets its own <svg> with a z-index; live previews, selection and the eraser cursor sit in an overlay on top.
  const layer=document.createElement('div'); layer.className='draw-layer'; world.append(layer);
  const overlay=svgEl('svg',{class:'ink-overlay',width:1,height:1}); world.append(overlay);
  const panel=document.createElement('div'); panel.className='draw-panel'; panel.hidden=true;
  const btn=(data,title,html)=>`<button ${data} title="${title}" aria-label="${title}">${html}</button>`;
  const shapeBar=document.createElement('div'); shapeBar.className='shape-bar'; shapeBar.hidden=true;
  shapeBar.innerHTML=Object.entries(SHAPES).map(([k,[n,i]])=>btn(`data-shape="${k}"`,n,i)).join('')
    +'<span class="dsep"></span><span class="sb-label">填滿</span>'+btn('data-fill="none"','不填滿',NO_FILL_ICON)
    +INK_COLORS.map(c=>btn(`data-fill="${c}" class="fill-swatch" style="--c:${colorOf(c)}"`,c==='ink'?'填滿預設墨色':'填滿 '+c,'')).join('')
    +'<span class="sb-hint">外框顏色與粗細用左側面板</span>';
  canvas.append(shapeBar);
  panel.innerHTML=Object.entries(TOOLS).map(([t,[n,i]])=>btn(`data-dtool="${t}"`,n,i)).join('')
    +'<span class="dsep"></span>'+SIZES.map((w,i)=>btn(`data-size="${i}"`,['細','中','粗'][i],`<span class="size-dot" style="--s:${w*1.5+4}px"></span>`)).join('')
    +'<span class="dsep"></span><div class="dcolors">'+INK_COLORS.map(c=>btn(`data-color="${c}" style="--c:${colorOf(c)}"`,c==='ink'?'預設墨色':c,'')).join('')+'</div>'
    +'<span class="dsep"></span>'+btn('data-dact="done"','完成塗鴉 (Esc)','<i class="bi bi-check2" aria-hidden="true"></i>');
  canvas.append(panel);
  const selbar=document.createElement('div'); selbar.className='nodebar draw-selbar';
  selbar.innerHTML=btn('data-sact="delete" class="del"','刪除選取的塗鴉 (Delete)','<i class="bi bi-trash" aria-hidden="true"></i>');
  canvas.append(selbar);

  let active=false, tool='pen', shapeKind='rect', fill=null, color='ink', size=1, gesture=null, lastMap=null, lastStrokes=null, cursor=null;
  const selected=new Set();
  const pointAt=(x,y)=>{ const r=canvas.getBoundingClientRect(), v=getView(); return {x:(x-r.left-v.x)/v.k, y:(y-r.top-v.y)/v.k}; };
  const strokes=()=>getMap()?.strokes||[];
  function pathFor(s) {
    if(isShape(s)) return shapeFor(s);
    const p=svgEl('path',{d:strokePath(s.points), class:'ink-stroke'+(s.tool==='highlighter'?' hl':'')+(selected.has(s.id)?' sel':'')});
    p.style.stroke=colorOf(s.color); p.style.strokeWidth=s.width; return p;
  }
  function shapeFor(s) {
    const [[x1,y1],[x2,y2]]=s.points; let el;
    if(s.tool==='rect') el=svgEl('rect',{x:Math.min(x1,x2), y:Math.min(y1,y2), width:Math.abs(x2-x1), height:Math.abs(y2-y1), rx:3});
    else if(s.tool==='ellipse') el=svgEl('ellipse',{cx:(x1+x2)/2, cy:(y1+y2)/2, rx:Math.abs(x2-x1)/2, ry:Math.abs(y2-y1)/2});
    else {
      let d=`M${x1} ${y1} L${x2} ${y2}`;
      if(s.tool==='arrow' && (x1!==x2 || y1!==y2)) {
        const a=Math.atan2(y2-y1,x2-x1), n=arrowSize(s);
        d+=` M${x2-n*Math.cos(a-.5)} ${y2-n*Math.sin(a-.5)} L${x2} ${y2} L${x2-n*Math.cos(a+.5)} ${y2-n*Math.sin(a+.5)}`;
      }
      el=svgEl('path',{d});
    }
    el.setAttribute('class','ink-stroke ink-shape'+(selected.has(s.id)?' sel':''));
    el.style.stroke=colorOf(s.color); el.style.strokeWidth=s.width; el.style.fill=s.fill?colorOf(s.fill):'none';
    return el;
  }
  function selectionBox() {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const s of strokes()) if(selected.has(s.id)) { const b=strokeBox(s); x0=Math.min(x0,b.x); y0=Math.min(y0,b.y); x1=Math.max(x1,b.x+b.w); y1=Math.max(y1,b.y+b.h); }
    return Number.isFinite(x0) ? {x:x0-6, y:y0-6, w:x1-x0+12, h:y1-y0+12} : null;
  }

  /* ---------- render ---------- */
  // Skips work unless the map or its strokes array changed; in-place edits pass force.
  function render(force) {
    const map=getMap();
    if(map!==lastMap) { lastMap=map; selected.clear(); gesture=null; force=true; }
    if(!force && map?.strokes===lastStrokes) return;
    lastStrokes=map?.strokes;
    for(const id of [...selected]) if(!strokes().some(s=>s.id===id)) selected.delete(id);
    layer.replaceChildren(...strokes().map(s=>{ const wrap=svgEl('svg',{class:'ink-item',width:1,height:1}); wrap.style.zIndex=1+(s.z||0); wrap.append(pathFor(s)); return wrap; }));
    overlay.replaceChildren();
    const box=selectionBox(), k=getView().k;
    if(box) overlay.append(svgEl('rect',{x:box.x,y:box.y,width:box.w,height:box.h,rx:4,class:'ink-selection','stroke-width':1.5/k}));
    if(gesture?.live) overlay.append(gesture.live);
    if(cursor) overlay.append(cursor);
    place();
  }
  function place() {
    const box=active && !gesture && selectionBox(), v=getView();
    shapeBar.hidden=!(active && tool==='shape');
    if(!shapeBar.hidden) {
      const b=panel.querySelector('[data-dtool="shape"]');
      shapeBar.style.left=panel.offsetLeft+panel.offsetWidth+8+'px';
      shapeBar.style.top=Math.max(8,panel.offsetTop+b.offsetTop-panel.scrollTop-6)+'px';
    }
    selbar.classList.toggle('show',!!box);
    if(!box) return;
    selbar.style.left=Math.max(8,v.x+(box.x+box.w)*v.k-selbar.offsetWidth)+'px';
    selbar.style.top=Math.max(8,v.y+box.y*v.k-selbar.offsetHeight-8)+'px';
  }
  function sync() {
    panel.hidden=!active; button.classList.toggle('on',active);
    canvas.classList.toggle('drawing',active);
    for(const t in TOOLS) canvas.classList.toggle('draw-'+t, active && tool===t);
    panel.querySelectorAll('[data-dtool]').forEach(b=>b.classList.toggle('on',b.dataset.dtool===tool));
    panel.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('on',+b.dataset.size===size));
    panel.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('on',b.dataset.color===color));
    panel.style.setProperty('--ink-cur',colorOf(color));
    shapeBar.querySelectorAll('[data-shape]').forEach(b=>b.classList.toggle('on',b.dataset.shape===shapeKind));
    shapeBar.querySelectorAll('[data-fill]').forEach(b=>b.classList.toggle('on',b.dataset.fill===(fill||'none')));
    place();
  }
  function enter() {
    if(!getMap() || !canEdit()) { toast(getMap()?'目前是唯讀檢視。':'請先建立心智圖。'); return; }
    clearSelection(); active=true; sync(); render(true);
  }
  function exit() { if(!active) return; active=false; selected.clear(); gesture=null; cursor=null; sync(); render(true); }
  function setTool(t) { tool=t; if(t!=='lasso') selected.clear(); cursor=null; sync(); render(true); }
  function editSelection(fn) {
    const map=getMap(); if(!selected.size || !map) return;
    snapshot(); for(const s of map.strokes) if(selected.has(s.id)) fn(s); save(map.id); render(true);
  }
  function deleteSelection() {
    const map=getMap(); if(!selected.size || !map) return;
    snapshot(); map.strokes=map.strokes.filter(s=>!selected.has(s.id)); selected.clear(); save(map.id); render(true);
  }
  function eraseAt(p) {
    const map=getMap(), r=8/getView().k, hit=strokes().filter(s=>touches(s,p,r+s.width/2));
    if(!hit.length) return;
    if(!gesture.erased) { snapshot(); gesture.erased=true; }
    map.strokes=map.strokes.filter(s=>!hit.includes(s)); render(true);
  }
  function showEraser(p) {
    const r=8/getView().k+SIZES[size]/2;
    cursor ||= svgEl('circle',{class:'ink-eraser'});
    cursor.setAttribute('cx',p.x); cursor.setAttribute('cy',p.y); cursor.setAttribute('r',r); cursor.setAttribute('stroke-width',1.5/getView().k);
    if(!cursor.isConnected) overlay.append(cursor);
  }

  /* ---------- pointer ---------- */
  on(canvas,'pointerdown',e=>{
    if(!active || e.target.closest('.draw-panel,.draw-selbar,.shape-bar,.zoombar')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if((e.pointerType==='mouse' && e.button!==0) || gesture || !canEdit()) return;
    const p=pointAt(e.clientX,e.clientY), base={pointer:e.pointerId};
    if(tool==='lasso') {
      const box=selectionBox();
      if(box && p.x>=box.x && p.x<=box.x+box.w && p.y>=box.y && p.y<=box.y+box.h) { gesture={...base,type:'move',last:p,moved:false}; place(); return; }
      selected.clear(); gesture={...base,type:'lasso',pts:[[p.x,p.y]],live:svgEl('path',{class:'ink-lasso','stroke-width':1.5/getView().k})};
      render(true); return;
    }
    if(tool==='eraser') { gesture={...base,type:'erase',erased:false}; eraseAt(p); return; }
    if(tool==='shape') {
      const shape={id:uid('s'), tool:shapeKind, color, width:SIZES[size], points:[[round(p.x),round(p.y)],[round(p.x),round(p.y)]]};
      if(fill && (shapeKind==='rect' || shapeKind==='ellipse')) shape.fill=fill;
      gesture={...base,type:'shape',stroke:shape,live:shapeFor(shape)}; overlay.append(gesture.live); return;
    }
    const stroke={id:uid('s'), tool, color, width:tool==='highlighter'?SIZES[size]*4:SIZES[size], points:[[round(p.x),round(p.y)]]};
    gesture={...base,type:'draw',stroke,live:pathFor(stroke)}; overlay.append(gesture.live);
  },true);
  on(window,'pointermove',e=>{
    if(!active) return;
    if(!gesture) { if(tool==='eraser' && canvas.contains(e.target) && !e.target.closest('.draw-panel,.zoombar')) showEraser(pointAt(e.clientX,e.clientY)); else if(cursor) { cursor.remove(); cursor=null; } return; }
    if(e.pointerId!==gesture.pointer) return;
    const k=getView().k, events=e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e];
    for(const ev of events) {
      const p=pointAt(ev.clientX,ev.clientY);
      if(gesture.type==='draw') {
        const pts=gesture.stroke.points, [lx,ly]=pts.at(-1);
        if(Math.hypot(p.x-lx,p.y-ly)>=1.5/k) pts.push([round(p.x),round(p.y)]);
      }
      else if(gesture.type==='shape') { const pts=gesture.stroke.points, end=e.shiftKey?constrain(shapeKind,pts[0],p.x,p.y):[p.x,p.y]; pts[1]=end.map(round); }
      else if(gesture.type==='erase') { showEraser(p); eraseAt(p); }
      else if(gesture.type==='lasso') gesture.pts.push([p.x,p.y]);
      else if(gesture.type==='move') {
        const dx=p.x-gesture.last.x, dy=p.y-gesture.last.y; if(!dx && !dy) continue;
        if(!gesture.moved) { snapshot(); gesture.moved=true; let z=nextZ(); for(const s of strokes()) if(selected.has(s.id)) s.z=z++; }
        for(const s of strokes()) if(selected.has(s.id)) s.points=s.points.map(([x,y])=>[round(x+dx),round(y+dy)]);
        gesture.last=p;
      }
    }
    if(gesture.type==='draw') gesture.live.setAttribute('d',strokePath(gesture.stroke.points));
    else if(gesture.type==='shape') { const el=shapeFor(gesture.stroke); gesture.live.replaceWith(el); gesture.live=el; }
    else if(gesture.type==='lasso') gesture.live.setAttribute('d','M'+gesture.pts.map(([x,y])=>`${x} ${y}`).join(' L')+' Z');
    else if(gesture.type==='move') render(true);
  });
  function end(e) {
    if(!gesture || e.pointerId!==gesture.pointer) return;
    const g=gesture, map=getMap(); gesture=null;
    if(!map) return render(true);
    if(g.type==='draw' && e.type==='pointerup') { snapshot(); g.stroke.z=nextZ(); map.strokes ||= []; map.strokes.push(g.stroke); save(map.id); }
    else if(g.type==='shape' && e.type==='pointerup') {
      // A plain click (no drag) does not leave a zero-size shape behind.
      const [[x1,y1],[x2,y2]]=g.stroke.points;
      if(Math.hypot(x2-x1,y2-y1)*getView().k>=4) { snapshot(); g.stroke.z=nextZ(); map.strokes ||= []; map.strokes.push(g.stroke); save(map.id); }
    }
    else if(g.type==='erase' && g.erased) save(map.id);
    else if(g.type==='move' && g.moved) save(map.id);
    else if(g.type==='lasso' && g.pts.length>2) {
      // A stroke is picked when at least half of its points fall inside the lasso.
      for(const s of map.strokes||[]) { const pts=outline(s); if(pts.filter(([x,y])=>insidePolygon(x,y,g.pts)).length*2>=pts.length) selected.add(s.id); }
    }
    render(true);
  }
  on(window,'pointerup',end); on(window,'pointercancel',end);

  /* ---------- panel, rail and keyboard ---------- */
  on(panel,'click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.dtool) setTool(b.dataset.dtool);
    else if(b.dataset.size) { size=+b.dataset.size; editSelection(s=>{ s.width=s.tool==='highlighter'?SIZES[size]*4:SIZES[size]; }); sync(); }
    else if(b.dataset.color) { color=b.dataset.color; editSelection(s=>{ s.color=color; }); sync(); }
    else if(b.dataset.dact==='done') exit();
  });
  on(shapeBar,'pointerdown',e=>e.stopPropagation());
  on(shapeBar,'click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.shape) { shapeKind=b.dataset.shape; sync(); }
    else if(b.dataset.fill) {
      fill=b.dataset.fill==='none'?null:b.dataset.fill;
      editSelection(s=>{ if(s.tool==='rect' || s.tool==='ellipse') { if(fill) s.fill=fill; else delete s.fill; } }); sync();
    }
  });
  on(selbar,'pointerdown',e=>e.stopPropagation());
  on(selbar,'click',e=>{ if(e.target.closest('[data-sact="delete"]')) deleteSelection(); });
  on(button,'click',()=>active?exit():enter());
  on(rail,'pointerdown',e=>{ if(active && e.target.closest('[data-tool],#relationBtn')) exit(); });
  on(document,'keydown',e=>{
    if(!active || e.target.isContentEditable || e.target.closest?.('input,textarea')) return;
    const key=e.key.toLowerCase(), mod=e.ctrlKey||e.metaKey||e.altKey;
    if(e.key==='Escape') { e.stopImmediatePropagation(); if(selected.size) { selected.clear(); render(true); } else exit(); }
    else if((e.key==='Delete'||e.key==='Backspace') && selected.size) { e.preventDefault(); e.stopImmediatePropagation(); deleteSelection(); }
    else if(!mod && KEYS[key]) { e.preventDefault(); e.stopImmediatePropagation(); setTool(KEYS[key]); }
  },true);

  sync();
  return {
    render, place, exit,
    boxes() { return strokes().map(strokeBox); },
    destroy() { listeners.forEach(fn=>fn()); layer.remove(); overlay.remove(); panel.remove(); shapeBar.remove(); selbar.remove(); canvas.classList.remove('drawing'); },
  };
}
