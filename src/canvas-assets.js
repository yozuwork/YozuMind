export function setupCanvasAssets({ canvas, world, getMap, getLayout, getView, uid, snapshot, save, toast, canEdit, clearNodeSelection }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const layer = document.createElement('div'); layer.className = 'image-layer'; world.append(layer);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('relation-layer'); svg.setAttribute('width','1'); svg.setAttribute('height','1'); world.prepend(svg);
  const panel = document.createElement('div'); panel.className = 'asset-panel'; panel.hidden = true;
  const hint = document.createElement('span');
  const remove = document.createElement('button'); remove.className='btn btn-ghost'; remove.textContent='刪除選取物件';
  const cancel = document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='取消';
  panel.append(hint,remove,cancel); canvas.append(panel);
  let selected=null, linking=false, from=null, drag=null, mapId=null;
  const point = e => { const rect=canvas.getBoundingClientRect(), v=getView(); return {x:(e.clientX-rect.left-v.x)/v.k,y:(e.clientY-rect.top-v.y)/v.k}; };
  const target = e => e.target.closest('.canvas-image,.node[data-id]')?.dataset.id;
  function reset() { selected=null; from=null; linking=false; drag=null; }
  function box(id) { return (getMap()?.images||[]).find(image=>image.id===id) || getLayout().get(id); }
  function render() {
    const map=getMap();
    if(mapId!==map?.id) {reset();mapId=map?.id;}
    layer.replaceChildren(); svg.replaceChildren();
    document.getElementById('relationBtn').classList.toggle('on',linking);
    canvas.classList.toggle('linking',linking);
    if(!map) {panel.hidden=true;return;}
    if(selected && ![...(map.images||[]),...(map.relations||[])].some(item=>item.id===selected)) selected=null;
    world.querySelectorAll('.node').forEach(node=>node.classList.toggle('link-source',node.dataset.id===from));
    for(const image of map.images||[]) {
      const frame=document.createElement('div');frame.className='canvas-image'+(selected===image.id?' selected':'')+(from===image.id?' link-source':'');frame.dataset.id=image.id;
      Object.assign(frame.style,{left:image.x+'px',top:image.y+'px',width:image.w+'px',height:image.h+'px'});
      const img=document.createElement('img');img.src=image.src;img.alt='畫布圖片';img.draggable=false;frame.append(img);
      if(selected===image.id && !linking) for(const corner of ['nw','ne','sw','se']) {
        const handle=document.createElement('button');handle.className='image-handle '+corner;handle.dataset.corner=corner;handle.setAttribute('aria-label','等比例調整圖片大小');frame.append(handle);
      }
      layer.append(frame);
    }
    const ns='http://www.w3.org/2000/svg';
    for(const relation of map.relations||[]) {
      const a=box(relation.from), b=box(relation.to);if(!a||!b)continue;
      const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
      const boundary=(r,dx,dy)=>{const t=1/Math.max(Math.abs(dx)/(r.w/2),Math.abs(dy)/(r.h/2),0.001);return {x:r.x+r.w/2+dx*t,y:r.y+r.h/2+dy*t};};
      const start=boundary(a,bx-ax,by-ay),end=boundary(b,ax-bx,ay-by);
      const group=document.createElementNS(ns,'g');group.dataset.relation=relation.id;group.classList.add('relation');
      const line=document.createElementNS(ns,'path');line.setAttribute('d',`M${start.x} ${start.y} L${end.x} ${end.y}`);line.setAttribute('class','relation-stroke'+(selected===relation.id?' selected':''));
      const hit=line.cloneNode();hit.setAttribute('class','relation-hit');
      const angle=Math.atan2(end.y-start.y,end.x-start.x),size=11;
      const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d',`M${end.x-size*Math.cos(angle-.45)} ${end.y-size*Math.sin(angle-.45)} L${end.x} ${end.y} L${end.x-size*Math.cos(angle+.45)} ${end.y-size*Math.sin(angle+.45)}`);arrow.setAttribute('class','relation-arrow');
      group.append(line,arrow,hit);svg.append(group);
    }
    panel.hidden=!linking&&!selected;remove.hidden=linking||!selected;
    hint.textContent=linking?(from?'選擇終點節點或圖片（Esc 取消）':'選擇起點節點或圖片（Esc 取消）'):(map.images||[]).some(i=>i.id===selected)?'拖曳圖片移動 · 拖曳四角等比縮放':'已選取關聯線';
  }
  function deleteSelected() {
    const map=getMap();if(!map||!canEdit()||!selected)return;
    snapshot();map.images=(map.images||[]).filter(i=>i.id!==selected);map.relations=(map.relations||[]).filter(r=>r.id!==selected&&r.from!==selected&&r.to!==selected);
    selected=null;save(map.id);render();
  }
  on(remove,'click',deleteSelected);on(cancel,'click',()=>{reset();render();});
  on(document.getElementById('relationBtn'),'click',()=>{
    if(!getMap()||!canEdit()){toast('請先建立心智圖。');return;}
    clearNodeSelection();linking=!linking;from=null;selected=null;render();
  });
  on(canvas,'pointerdown',e=>{
    if(e.target.closest('.asset-panel')) {e.stopPropagation();return;}
    if(e.button!==0||!canEdit())return;
    const id=target(e),relation=e.target.closest('[data-relation]')?.dataset.relation;
    if(linking && id) {
      e.preventDefault();e.stopImmediatePropagation();
      if(!from)from=id;
      else if(from!==id) {
        const map=getMap();map.relations ||= [];
        if(map.relations.some(r=>r.from===from&&r.to===id)){toast('這兩個物件已經有關聯線。');return;}
        snapshot();map.relations.push({id:uid('r'),from,to:id});save(map.id);linking=false;from=null;
      }
      render();return;
    }
    const image=(getMap()?.images||[]).find(i=>i.id===id);
    if(image||relation) {
      e.preventDefault();e.stopImmediatePropagation();clearNodeSelection();canvas.focus();selected=image?.id||relation;
      if(image){const p=point(e);drag={id:image.id,map:getMap().id,pointer:e.pointerId,start:p,original:{...image},corner:e.target.dataset.corner,changed:false};}
      render();
    }else if(!e.target.closest('.zoombar,.nodebar')){selected=null;render();}
  },true);
  on(window,'pointermove',e=>{
    if(!drag||e.pointerId!==drag.pointer||getMap()?.id!==drag.map)return;
    const image=getMap().images.find(i=>i.id===drag.id);if(!image)return;
    const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y,o=drag.original;
    if(!drag.changed&&Math.hypot(dx,dy)<2)return;
    if(!drag.changed){snapshot();drag.changed=true;}
    if(drag.corner){
      const sx=drag.corner.includes('w')?-1:1,sy=drag.corner.includes('n')?-1:1;
      const scale=Math.max(48/Math.max(o.w,o.h),Math.min(4000/o.w,4000/o.h,1+(sx*dx*o.w+sy*dy*o.h)/(o.w*o.w+o.h*o.h)));
      image.w=o.w*scale;image.h=o.h*scale;image.x=o.x+(sx<0?o.w-image.w:0);image.y=o.y+(sy<0?o.h-image.h:0);
    }else{image.x=o.x+dx;image.y=o.y+dy;}
    render();
  });
  function end(e){if(drag&&e.pointerId===drag.pointer){if(drag.changed)save(drag.map);drag=null;}}
  on(window,'pointerup',end);on(window,'pointercancel',end);
  on(document,'keydown',e=>{
    if(e.target.closest('input,textarea,[contenteditable="true"]'))return;
    if(e.key==='Escape'&&(linking||selected)){e.stopImmediatePropagation();reset();render();}
    if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();e.stopImmediatePropagation();deleteSelected();}
  },true);
  async function addFiles(files) {
    const map=getMap();if(!map||!canEdit()){toast('請先建立心智圖，再貼上圖片。');return;}
    const mapId=map.id;
    for(const file of files){
      if((map.images||[]).length>=100){toast('每張心智圖最多可加入 100 張圖片。');break;}
      if(!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type)){toast('請使用 PNG、JPEG、WebP 或 GIF 圖片。');continue;}
      if(file.size>20*1024*1024){toast('單張圖片不可超過 20 MB。');continue;}
      try {
        const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
        const buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.round(bitmap.width*scale));buffer.height=Math.max(1,Math.round(bitmap.height*scale));buffer.getContext('2d').drawImage(bitmap,0,0,buffer.width,buffer.height);bitmap.close();
        if(getMap()?.id!==mapId)continue;
        const v=getView(),w=Math.min(360,buffer.width),h=w*buffer.height/buffer.width;
        const image={id:uid('img'),src:buffer.toDataURL('image/webp',.82),x:(canvas.clientWidth/2-v.x)/v.k-w/2,y:(canvas.clientHeight/2-v.y)/v.k-h/2,w,h};
        snapshot();map.images ||= [];map.images.push(image);clearNodeSelection();selected=image.id;save(map.id);render();
        toast('圖片已加入，可拖曳移動或拉動四角等比縮放。');
      }catch{toast('圖片讀取失敗，請換一張圖片。');}
    }
  }
  on(document,'paste',e=>{
    if(e.target.closest('input,textarea'))return;
    const files=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
    if(files.length){e.preventDefault();e.stopImmediatePropagation();addFiles(files);}
  },true);
  const input=document.getElementById('imageFile');
  on(document.getElementById('imageBtn'),'click',()=>{input.value='';input.click();});
  on(input,'change',()=>addFiles([...input.files]));
  return {render,boxes:()=>getMap()?.images||[],destroy:()=>{listeners.forEach(fn=>fn());layer.remove();svg.remove();panel.remove();}};
}
