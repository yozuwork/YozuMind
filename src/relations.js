// Whimsical-style connectors: drag from an object (or its side dots) to a target, snap to sides, style via a floating bar.
export const LINE_TYPES = { elbow:'轉折線', straight:'直線', curve:'曲線' };
const STYLES = { solid:'實線', dashed:'虛線', thick:'粗線' };
const COLORS = ['#e5484d','#f59e0b','#30a46c','#2f6fdb','#8e4ec6'];
const SIDES = { top:[0,-1], right:[1,0], bottom:[0,1], left:[-1,0] };
const TARGETS = '.node[data-id],.card[data-id],.canvas-image[data-id]';
const NS = 'http://www.w3.org/2000/svg', GAP = 5, STUB = 18, PREF_KEY = 'yozu-line-type';
const svgIcon = (paths, width=1.6) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  elbow: svgIcon('<path d="M3 13.5V8a3 3 0 0 1 3-3h7.5"/><path d="M10.5 2.5 13.5 5l-3 2.5"/>'),
  straight: svgIcon('<path d="M3 13 13 3"/><path d="M7.5 3H13v5.5"/>'),
  curve: svgIcon('<path d="M3 13.5C3 7 7.5 5 13.5 5"/><path d="M10.5 2.5 13.5 5l-3 2.5"/>'),
  solid: svgIcon('<path d="M2.5 13.5 13.5 2.5"/>'),
  dashed: svgIcon('<path d="M2.5 13.5 13.5 2.5" stroke-dasharray="2.6 2.4"/>'),
  thick: svgIcon('<path d="M3 13 13 3"/>', 3.2),
  start: svgIcon('<path d="M14 8H3"/><path d="M6.5 4.5 3 8l3.5 3.5"/>'),
  end: svgIcon('<path d="M2 8h11"/><path d="M9.5 4.5 13 8l-3.5 3.5"/>'),
};
const bi = name => `<i class="bi bi-${name}" aria-hidden="true"></i>`;

/* ---------- geometry ---------- */
const center = b => ({x:b.x+b.w/2, y:b.y+b.h/2});
function anchor(b, side) { const [dx,dy]=SIDES[side]; return {x:b.x+b.w/2*(1+dx)+dx*GAP, y:b.y+b.h/2*(1+dy)+dy*GAP, dx, dy}; }
function boundary(b, p) {
  const c=center(b), dx=p.x-c.x, dy=p.y-c.y, len=Math.hypot(dx,dy)||1;
  const t=1/Math.max(Math.abs(dx)/(b.w/2||1e-6), Math.abs(dy)/(b.h/2||1e-6), 1e-6);
  return {x:c.x+dx*t+dx/len*GAP, y:c.y+dy*t+dy/len*GAP, dx:0, dy:0};
}
function autoSides(a, b) {
  const ca=center(a), cb=center(b);
  const gapX=Math.max(b.x-(a.x+a.w), a.x-(b.x+b.w)), gapY=Math.max(b.y-(a.y+a.h), a.y-(b.y+b.h));
  if(gapX>=gapY) return cb.x>=ca.x ? ['right','left'] : ['left','right'];
  return cb.y>=ca.y ? ['bottom','top'] : ['top','bottom'];
}
// Pointer near an edge picks that side; near the middle leaves the side automatic.
function nearestSide(b, p) {
  const c=center(b), rx=(p.x-c.x)/(b.w/2||1), ry=(p.y-c.y)/(b.h/2||1);
  if(Math.max(Math.abs(rx),Math.abs(ry))<.5) return null;
  return Math.abs(rx)>Math.abs(ry) ? (rx>0?'right':'left') : (ry>0?'bottom':'top');
}
// Boxes flagged `point` are the free end of a connector being dragged.
function ends(type, a, as, b, bs) {
  const [sa,sb]=autoSides(a,b);
  const ref=(box,side)=>box.point ? box : side ? anchor(box,side) : center(box);
  const end=(box,side,auto,other)=>box.point ? {x:box.x,y:box.y,dx:0,dy:0} : type==='straight'&&!side ? boundary(box,other) : anchor(box,side||auto);
  return [end(a,as,sa,ref(b,bs)), end(b,bs,sb,ref(a,as))];
}
function simplify(pts) {
  const out=[];
  for(const p of pts) if(!out.length || Math.hypot(p.x-out.at(-1).x,p.y-out.at(-1).y)>.5) out.push(p);
  for(let i=out.length-2;i>0;i--) {
    const a=out[i-1], b=out[i], c=out[i+1];
    if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<.5 && (b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0) out.splice(i,1);
  }
  return out;
}
function elbowPoints(A, B) {
  const freeA=!A.dx&&!A.dy, freeB=!B.dx&&!B.dy;
  if(freeA) return freeB ? [A,B] : elbowPoints(B,A).reverse();
  const p1={x:A.x+A.dx*STUB, y:A.y+A.dy*STUB}, h0=A.dx!==0, pts=[A,p1];
  if(freeB) pts.push(h0?{x:B.x,y:p1.y}:{x:p1.x,y:B.y}, B);
  else {
    const p2={x:B.x+B.dx*STUB, y:B.y+B.dy*STUB}, h3=B.dx!==0;
    if(h0&&h3) { const mx=A.dx===B.dx ? (A.dx>0?Math.max(p1.x,p2.x):Math.min(p1.x,p2.x)) : (p1.x+p2.x)/2; pts.push({x:mx,y:p1.y},{x:mx,y:p2.y}); }
    else if(!h0&&!h3) { const my=A.dy===B.dy ? (A.dy>0?Math.max(p1.y,p2.y):Math.min(p1.y,p2.y)) : (p1.y+p2.y)/2; pts.push({x:p1.x,y:my},{x:p2.x,y:my}); }
    else pts.push(h0?{x:p2.x,y:p1.y}:{x:p1.x,y:p2.y});
    pts.push(p2,B);
  }
  return simplify(pts);
}
function roundedPath(pts) {
  let d=`M${pts[0].x} ${pts[0].y}`;
  for(let i=1;i<pts.length-1;i++) {
    const a=pts[i-1], b=pts[i], c=pts[i+1], l1=Math.hypot(b.x-a.x,b.y-a.y), l2=Math.hypot(c.x-b.x,c.y-b.y), r=Math.min(12,l1/2,l2/2);
    d+=` L${b.x+(a.x-b.x)*r/l1} ${b.y+(a.y-b.y)*r/l1} Q${b.x} ${b.y} ${b.x+(c.x-b.x)*r/l2} ${b.y+(c.y-b.y)*r/l2}`;
  }
  const z=pts.at(-1); return d+` L${z.x} ${z.y}`;
}
function midpoint(pts) {
  const lens=pts.slice(1).map((p,i)=>Math.hypot(p.x-pts[i].x,p.y-pts[i].y));
  let left=lens.reduce((s,l)=>s+l,0)/2;
  for(let i=0;i<lens.length;i++) { if(left<=lens[i]) { const t=lens[i]?left/lens[i]:0; return {x:pts[i].x+(pts[i+1].x-pts[i].x)*t, y:pts[i].y+(pts[i+1].y-pts[i].y)*t}; } left-=lens[i]; }
  return pts[0];
}
function geometry(type, A, B) {
  if(type==='curve') {
    const k=Math.min(160,Math.max(30,Math.hypot(B.x-A.x,B.y-A.y)*.4));
    const c1={x:A.x+A.dx*k, y:A.y+A.dy*k}, c2={x:B.x+B.dx*k, y:B.y+B.dy*k};
    const at=t=>{ const u=1-t; return {x:u*u*u*A.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*B.x, y:u*u*u*A.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*B.y}; };
    const ein=at(.97), sout=at(.03);
    return {d:`M${A.x} ${A.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${B.x} ${B.y}`, a:A, b:B, mid:at(.5),
      endAngle:Math.atan2(B.y-ein.y,B.x-ein.x), startAngle:Math.atan2(A.y-sout.y,A.x-sout.x)};
  }
  let pts=type==='elbow' ? elbowPoints(A,B) : [A,B];
  if(pts.length<2) pts=[A,B];
  const [p0,p1]=pts, [q1,q0]=pts.slice(-2);
  return {d:roundedPath(pts), a:A, b:B, mid:midpoint(pts), endAngle:Math.atan2(q0.y-q1.y,q0.x-q1.x), startAngle:Math.atan2(p0.y-p1.y,p0.x-p1.x)};
}
function heads(g, arrow, size) {
  const head=(p,a)=>`M${p.x} ${p.y} L${p.x-size*Math.cos(a-.42)} ${p.y-size*Math.sin(a-.42)} L${p.x-size*Math.cos(a+.42)} ${p.y-size*Math.sin(a+.42)} Z`;
  const out=[];
  if(arrow==='end'||arrow==='both') out.push(head(g.b,g.endAngle));
  if(arrow==='start'||arrow==='both') out.push(head(g.a,g.startAngle));
  return out;
}

export function setupRelations({ canvas, world, button, getMap, getView, getBox, uid, snapshot, dropSnapshot, save, toast, canEdit, clearSelection }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const svgEl = (name, attrs={}) => { const el=document.createElementNS(NS,name); for(const k in attrs) el.setAttribute(k,attrs[k]); return el; };
  const layer=svgEl('svg',{class:'relation-layer',width:1,height:1}); world.prepend(layer);
  const ui=svgEl('svg',{class:'relation-ui',width:1,height:1}); world.append(ui);
  const labels=document.createElement('div'); labels.className='rel-labels'; world.append(labels);
  const editor=document.createElement('input'); editor.className='rel-editor'; editor.placeholder='輸入文字'; editor.hidden=true; canvas.append(editor);
  const bar=document.createElement('div'); bar.className='nodebar rel-bar';
  const btn=(rb,title,html,cls='')=>`<button data-rb="${rb}" class="${cls}" title="${title}" aria-label="${title}">${html}</button>`;
  bar.innerHTML=`<div class="tools">${btn('label','加入文字 (Enter)',bi('fonts'))}<span class="sep"></span>${btn('color','線條顏色','<span class="swatch-dot rel-color-dot"></span>')}<span class="sep"></span>`
    +Object.entries(STYLES).map(([s,n])=>btn('style:'+s,n,ICONS[s])).join('')+'<span class="sep"></span>'
    +btn('arrow:start','起點箭頭',ICONS.start)+btn('arrow:end','終點箭頭',ICONS.end)+'<span class="sep"></span>'
    +Object.entries(LINE_TYPES).map(([t,n])=>btn('type:'+t,n,ICONS[t])).join('')+'<span class="sep"></span>'
    +btn('delete','刪除 (Delete)',bi('trash'),'del')+'</div><div class="swatches">'
    +[['default','var(--rel)','預設顏色'],...COLORS.map(c=>[c,c,'線條顏色 '+c])].map(([v,c,n])=>`<button data-rb="swatch:${v}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')+'</div>';
  canvas.append(bar);
  const flyout=document.createElement('div'); flyout.className='line-pop';
  flyout.innerHTML='<div class="line-types">'+Object.entries(LINE_TYPES).map(([t,n])=>`<button data-line="${t}" title="${n}" aria-label="${n}">${ICONS[t]}</button>`).join('')+'</div><p class="line-hint"></p>';
  document.body.append(flyout);

  let lineType='elbow'; try { const saved=localStorage.getItem(PREF_KEY); if(saved in LINE_TYPES) lineType=saved; } catch {}
  const defaults={style:'solid', arrow:'end', color:null};
  let linking=false, link=null, hover=null, selected=null, editing=null, editBefore='', mapId=null, lastK=1;
  const geoms=new Map();
  const pointAt=(x,y)=>{ const r=canvas.getBoundingClientRect(), v=getView(); return {x:(x-r.left-v.x)/v.k, y:(y-r.top-v.y)/v.k}; };
  const rel=id=>(getMap()?.relations||[]).find(r=>r.id===id);
  const typeOf=r=>r.type||'straight', styleOf=r=>r.style||'dashed', arrowOf=r=>r.arrow||'end';
  function targetAt(x, y) { const el=document.elementFromPoint(x,y); return el && canvas.contains(el) && !el.closest('.editing') ? el.closest(TARGETS)?.dataset.id || null : null; }

  /* ---------- render ---------- */
  function render() {
    const map=getMap();
    if(mapId!==map?.id) { mapId=map?.id; selected=null; link=null; hover=null; linking=false; editing=null; editor.hidden=true; }
    if(selected && !rel(selected)) selected=null;
    geoms.clear(); layer.replaceChildren(); labels.replaceChildren();
    for(const r of map?.relations||[]) {
      const a=getBox(r.from), b=getBox(r.to); if(!a||!b) continue;
      const g=geometry(typeOf(r), ...ends(typeOf(r),a,r.fromSide,b,r.toSide)); geoms.set(r.id,g);
      const color=r.color||'var(--rel)', style=styleOf(r), group=svgEl('g',{'data-relation':r.id});
      if(r.id===selected) group.append(svgEl('path',{d:g.d,class:'rel-halo'}));
      const line=svgEl('path',{d:g.d,class:'rel-line '+style}); line.style.stroke=color; group.append(line);
      for(const d of heads(g,arrowOf(r),style==='thick'?14:11)) { const head=svgEl('path',{d,class:'rel-head '+style}); head.style.fill=color; head.style.stroke=color; group.append(head); }
      group.append(svgEl('path',{d:g.d,class:'relation-hit'}));
      layer.append(group);
      if(editing!==r.id && (r.label || (r.id===selected && canEdit()))) {
        const label=document.createElement('div'); label.className='rel-label'+(r.label?'':' ph'); label.dataset.relation=r.id;
        label.textContent=r.label||'新增文字'; label.style.left=g.mid.x+'px'; label.style.top=g.mid.y+'px'; labels.append(label);
      }
    }
    syncTool(); renderUi(); place();
  }
  function renderUi() {
    ui.replaceChildren(); const k=lastK=getView().k;
    if(!getMap()) return;
    const dot=(p,attrs)=>svgEl('circle',{cx:p.x,cy:p.y,...attrs});
    const outline=b=>svgEl('rect',{x:b.x-4,y:b.y-4,width:b.w+8,height:b.h+8,rx:8,class:'rel-target','stroke-width':2/k});
    if(link) {
      const fixed=getBox(link.fixed); if(!fixed) return;
      const target=link.target && getBox(link.target), moving=target || {x:link.p.x,y:link.p.y,w:0,h:0,point:true};
      const r=link.relation && rel(link.relation), type=r ? typeOf(r) : lineType;
      const [A,B]=link.mode==='from' ? ends(type,moving,link.targetSide,fixed,link.fixedSide) : ends(type,fixed,link.fixedSide,moving,link.targetSide);
      if(target) {
        ui.append(outline(target));
        for(const side in SIDES) ui.append(dot(anchor(target,side),{r:(side===link.targetSide?5.5:3.5)/k,class:side===link.targetSide?'rel-snap':'rel-anchor','stroke-width':1.5/k}));
      }
      const g=geometry(type,A,B);
      ui.append(svgEl('path',{d:g.d,class:'rel-preview'}), ...heads(g,r?arrowOf(r):defaults.arrow,11).map(d=>svgEl('path',{d,class:'rel-preview-head'})));
      return;
    }
    const box=hover && canEdit() && getBox(hover);
    if(box) {
      if(linking) ui.append(outline(box));
      for(const [side,[dx,dy]] of Object.entries(SIDES)) {
        const p={x:box.x+box.w/2*(1+dx)+dx*14/k, y:box.y+box.h/2*(1+dy)+dy*14/k};
        ui.append(dot(p,{r:5/k,'stroke-width':1.5/k,class:'rel-dot','data-anchor':side,'data-id':hover}));
      }
    }
    const g=selected && canEdit() && geoms.get(selected);
    if(g) for(const [end,p] of [['from',g.a],['to',g.b]]) ui.append(dot(p,{r:5/k,'stroke-width':2/k,class:'rel-end','data-end':end}));
  }
  function place() {
    const v=getView(), g=selected && geoms.get(selected), show=!!g && !link && !editing && canEdit();
    if(v.k!==lastK) renderUi();
    const ge=editing && geoms.get(editing);
    if(ge) { editor.style.left=v.x+ge.mid.x*v.k+'px'; editor.style.top=v.y+ge.mid.y*v.k+'px'; }
    bar.classList.toggle('show',show);
    if(!show) { bar.classList.remove('colors'); return; }
    const r=rel(selected), arrow=arrowOf(r);
    bar.querySelectorAll('[data-rb]').forEach(b=>{
      const [k,val]=b.dataset.rb.split(':');
      b.classList.toggle('on', k==='style'?val===styleOf(r) : k==='type'?val===typeOf(r) : k==='arrow'?(arrow==='both'||arrow===val) : k==='swatch'?val===(r.color||'default') : false);
    });
    bar.querySelector('.rel-color-dot').style.setProperty('--c', r.color||'var(--rel)');
    const bw=bar.offsetWidth, bh=bar.offsetHeight, x=v.x+g.mid.x*v.k, y=v.y+g.mid.y*v.k;
    let top=y-bh-28; if(top<8) top=y+28;
    bar.style.left=Math.min(Math.max(8,x-bw/2),Math.max(8,canvas.clientWidth-bw-8))+'px'; bar.style.top=top+'px';
  }
  function syncTool() {
    (button.querySelector('.rail-icon')||button).innerHTML=ICONS[lineType]; button.classList.toggle('on',linking); canvas.classList.toggle('linking',linking);
    flyout.classList.toggle('show',linking);
    flyout.querySelectorAll('[data-line]').forEach(b=>b.classList.toggle('on',b.dataset.line===lineType));
    flyout.querySelector('.line-hint').textContent=link?.sticky ? '點選終點物件（Esc 取消）' : '從物件按住拖到目標，或依序點選兩個物件';
    if(!linking) return;
    const r=button.getBoundingClientRect();
    flyout.style.left=r.right+10+'px'; flyout.style.top=Math.max(8,Math.min(innerHeight-flyout.offsetHeight-8,r.top-4))+'px';
  }

  /* ---------- edits ---------- */
  function startLink(e, opts) { link={...opts, pointer:e.pointerId, sx:e.clientX, sy:e.clientY, moved:false, target:null, targetSide:null, p:pointAt(e.clientX,e.clientY)}; hover=null; render(); }
  function finish(l) {
    const map=getMap(); link=null;
    if(!map || !canEdit()) return render();
    if(l.mode==='new') {
      map.relations ||= [];
      if(map.relations.some(r=>r.from===l.fixed && r.to===l.target)) { toast('這兩個物件已經有關聯線。'); return render(); }
      const r={id:uid('r'), from:l.fixed, to:l.target, type:lineType, style:defaults.style, arrow:defaults.arrow};
      if(defaults.color) r.color=defaults.color;
      if(l.fixedSide) r.fromSide=l.fixedSide;
      if(l.targetSide) r.toSide=l.targetSide;
      snapshot(); map.relations.push(r); selected=r.id; linking=false;
    } else {
      const r=rel(l.relation); if(!r) return render();
      snapshot(); r[l.mode]=l.target;
      if(l.targetSide) r[l.mode+'Side']=l.targetSide; else delete r[l.mode+'Side'];
      selected=r.id;
    }
    save(map.id); render();
  }
  function exitLinking() { linking=false; if(link?.sticky) link=null; }
  function remove() {
    const map=getMap(); if(!map || !selected || !canEdit()) return;
    snapshot(); map.relations=(map.relations||[]).filter(r=>r.id!==selected); selected=null; save(map.id); render();
  }
  function editLabel() {
    const r=rel(selected); if(!r || !canEdit()) return;
    editing=r.id; editBefore=r.label||''; snapshot();
    editor.value=editBefore; editor.hidden=false; render(); editor.focus(); editor.select();
  }
  function closeEditor(keep) {
    if(!editing) return;
    const r=rel(editing); editing=null; editor.hidden=true;
    if(r) {
      const value=keep ? editor.value.trim() : editBefore;
      if(value) r.label=value; else delete r.label;
      if(value===editBefore) dropSnapshot(); else save(getMap().id);
    }
    render();
  }

  /* ---------- pointer ---------- */
  on(canvas,'pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    if(e.target.closest('.rel-bar,.rel-editor')) { e.stopImmediatePropagation(); return; }
    if(e.target.closest('.zoombar')) return;
    const dot=e.target.closest('[data-anchor]'), handle=e.target.closest('[data-end]');
    if((dot||handle) && canEdit()) {
      e.preventDefault(); e.stopImmediatePropagation();
      if(dot) { clearSelection(); selected=null; startLink(e,{mode:'new', fixed:dot.dataset.id, fixedSide:dot.dataset.anchor}); }
      else {
        const r=rel(selected), from=handle.dataset.end==='from';
        startLink(e,{mode:handle.dataset.end, relation:r.id, fixed:from?r.to:r.from, fixedSide:from?r.toSide:r.fromSide});
      }
      return;
    }
    if(linking) {
      e.preventDefault(); e.stopImmediatePropagation();
      const id=targetAt(e.clientX,e.clientY);
      if(link?.sticky) {
        if(id && id!==link.fixed) finish({...link, target:id, targetSide:nearestSide(getBox(id),pointAt(e.clientX,e.clientY))});
        else { exitLinking(); render(); }
        return;
      }
      if(!id) { exitLinking(); render(); return; }
      clearSelection(); startLink(e,{mode:'new', fixed:id, fixedSide:null});
      return;
    }
    const relEl=e.target.closest('[data-relation]');
    if(relEl) {
      e.preventDefault(); e.stopImmediatePropagation(); clearSelection();
      if(selected!==relEl.dataset.relation) { selected=relEl.dataset.relation; render(); }
      return;
    }
    if(selected) { selected=null; render(); }
  },true);
  on(window,'pointermove',e=>{
    if(link && (link.sticky || e.pointerId===link.pointer)) {
      link.p=pointAt(e.clientX,e.clientY);
      if(Math.hypot(e.clientX-link.sx,e.clientY-link.sy)>4) link.moved=true;
      const id=targetAt(e.clientX,e.clientY);
      link.target=id && id!==link.fixed ? id : null;
      link.targetSide=link.target ? nearestSide(getBox(link.target),link.p) : null;
      renderUi(); return;
    }
    if(e.buttons || !getMap() || !canEdit()) { if(hover) { hover=null; renderUi(); } return; }
    if(document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-anchor]')) return;
    let id=targetAt(e.clientX,e.clientY);
    if(!id && hover) {
      const b=getBox(hover), p=pointAt(e.clientX,e.clientY), m=26/getView().k;
      if(b && p.x>b.x-m && p.x<b.x+b.w+m && p.y>b.y-m && p.y<b.y+b.h+m) id=hover;
    }
    if(id!==hover) { hover=id; renderUi(); }
  });
  function end(e) {
    if(!link || link.sticky || e.pointerId!==link.pointer) return;
    const l=link; link=null;
    if(e.type==='pointerup' && l.target) return finish(l);
    if(e.type==='pointerup' && l.mode==='new' && !l.moved && linking) link={...l, sticky:true};
    render();
  }
  on(window,'pointerup',end); on(window,'pointercancel',end);
  on(canvas,'dblclick',e=>{ const el=e.target.closest('[data-relation]'); if(el && canEdit()) { e.preventDefault(); selected=el.dataset.relation; editLabel(); } });
  on(canvas,'click',e=>{ if(e.target.closest('.rel-label.ph')) editLabel(); });

  /* ---------- toolbar, tool button, keyboard ---------- */
  on(bar,'click',e=>{
    const b=e.target.closest('[data-rb]'), r=rel(selected), map=getMap(); if(!b || !r || !canEdit()) return;
    const [k,val]=b.dataset.rb.split(':');
    if(k==='color') { bar.classList.toggle('colors'); place(); return; }
    if(k==='label') return editLabel();
    if(k==='delete') return remove();
    snapshot();
    if(k==='swatch') { if(val==='default') delete r.color; else r.color=val; defaults.color=r.color||null; }
    else if(k==='style') defaults.style=r.style=val;
    else if(k==='type') r.type=val;
    else if(k==='arrow') {
      const a=arrowOf(r), start=(a==='start'||a==='both')!==(val==='start'), endOn=(a==='end'||a==='both')!==(val==='end');
      defaults.arrow=r.arrow=start&&endOn?'both':start?'start':endOn?'end':'none';
    }
    bar.classList.remove('colors'); save(map.id); render();
  });
  on(button,'click',()=>{
    if(!getMap() || !canEdit()) { toast('請先建立心智圖。'); return; }
    if(linking) exitLinking(); else { clearSelection(); selected=null; linking=true; }
    render();
  });
  on(flyout,'click',e=>{
    const b=e.target.closest('[data-line]'); if(!b) return;
    lineType=b.dataset.line; try { localStorage.setItem(PREF_KEY,lineType); } catch {}
    render();
  });
  on(editor,'keydown',e=>{
    if(e.isComposing || e.keyCode===229) return;
    if(e.key==='Enter' || e.key==='Escape') { e.preventDefault(); e.stopPropagation(); closeEditor(e.key==='Enter'); canvas.focus({preventScroll:true}); }
  });
  on(editor,'blur',()=>closeEditor(true));
  on(document,'keydown',e=>{
    if(e.target.isContentEditable || e.target.closest?.('input,textarea')) return;
    if(e.key==='Escape' && (linking || link || selected)) { e.stopImmediatePropagation(); exitLinking(); link=null; selected=null; render(); return; }
    if(!selected || !canEdit()) return;
    if(e.key==='Delete' || e.key==='Backspace') { e.preventDefault(); e.stopImmediatePropagation(); remove(); }
    else if(e.key==='Enter' || e.key==='F2') { e.preventDefault(); e.stopImmediatePropagation(); editLabel(); }
  },true);
  on(window,'resize',syncTool);

  return {
    render, place,
    deselect() { if(selected) { selected=null; render(); } },
    destroy() { listeners.forEach(fn=>fn()); layer.remove(); ui.remove(); labels.remove(); editor.remove(); bar.remove(); flyout.remove(); },
  };
}
