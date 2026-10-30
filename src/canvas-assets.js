// Validates and downsizes an image file into a WebP data URL.
export async function readImageFile(file) {
  if(!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type)) throw new Error('請使用 PNG、JPEG、WebP 或 GIF 圖片。');
  if(file.size>20*1024*1024) throw new Error('單張圖片不可超過 20 MB。');
  let bitmap;
  try { bitmap=await createImageBitmap(file); } catch { throw new Error('圖片讀取失敗，請換一張圖片。'); }
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.round(bitmap.width*scale));buffer.height=Math.max(1,Math.round(bitmap.height*scale));buffer.getContext('2d').drawImage(bitmap,0,0,buffer.width,buffer.height);bitmap.close();
  return {src:buffer.toDataURL('image/webp',.82),width:buffer.width,height:buffer.height};
}

export function setupCanvasAssets({ canvas, world, getMap, getView, uid, snapshot, save, toast, canEdit, clearNodeSelection, onChange, hoverDrop, dropImage, nextZ, isHidden, moved, pinStart }) {
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const layer = document.createElement('div'); layer.className = 'image-layer'; world.append(layer);
  const panel = document.createElement('div'); panel.className = 'asset-panel'; panel.hidden = true;
  const hint = document.createElement('span');
  const remove = document.createElement('button'); remove.className='btn btn-ghost'; remove.textContent='刪除選取物件';
  const detach = document.createElement('button'); detach.className='btn btn-ghost'; detach.textContent='取消掛載'; detach.hidden=true;
  const pin = document.createElement('button'); pin.className='btn btn-ghost'; pin.textContent='掛到節點'; pin.hidden=true;
  panel.append(hint,pin,detach,remove); canvas.append(panel);
  let selected=null, drag=null, mapId=null;
  const point = e => { const rect=canvas.getBoundingClientRect(), v=getView(); return {x:(e.clientX-rect.left-v.x)/v.k,y:(e.clientY-rect.top-v.y)/v.k}; };
  function reset() { selected=null; drag=null; }
  function render() {
    const map=getMap();
    if(mapId!==map?.id) {reset();mapId=map?.id;}
    layer.replaceChildren();
    if(!map) {panel.hidden=true;return;}
    if(selected && !(map.images||[]).some(item=>item.id===selected)) selected=null;
    for(const image of map.images||[]) {
      if(isHidden?.(image.id)) continue;
      const frame=document.createElement('div');frame.className='canvas-image'+(selected===image.id?' selected':'')+(drag?.changed&&!drag.corner&&drag.id===image.id?' dragging':'');frame.dataset.id=image.id;
      Object.assign(frame.style,{left:image.x+'px',top:image.y+'px',width:image.w+'px',height:image.h+'px',zIndex:1+(image.z||0)});
      const img=document.createElement('img');img.src=image.src;img.alt='畫布圖片';img.draggable=false;frame.append(img);
      if(image.anchor){const pin=document.createElement('span');pin.className='pin-badge';pin.title='已掛在心智圖節點上';pin.innerHTML='<i class="bi bi-pin-angle-fill" aria-hidden="true"></i>';frame.append(pin);}
      if(selected===image.id) for(const corner of ['nw','ne','sw','se']) {
        const handle=document.createElement('button');handle.className='image-handle '+corner;handle.dataset.corner=corner;handle.setAttribute('aria-label','等比例調整圖片大小');frame.append(handle);
      }
      layer.append(frame);
    }
    panel.hidden=!selected;
    detach.hidden=!(map.images||[]).find(i=>i.id===selected)?.anchor; pin.hidden=!detach.hidden||!pinStart;
    hint.textContent='拖曳圖片移動 · 拖曳四角等比縮放 · 拖進欄位或資料夾收納';
  }
  function deleteSelected() {
    const map=getMap();if(!map||!canEdit()||!selected)return;
    snapshot();map.images=(map.images||[]).filter(i=>i.id!==selected);map.relations=(map.relations||[]).filter(r=>r.from!==selected&&r.to!==selected);
    selected=null;save(map.id);render();onChange();
  }
  on(remove,'click',deleteSelected);
  on(canvas,'pointerdown',e=>{
    if(e.target.closest('.asset-panel')) {e.stopPropagation();return;}
    if(e.button!==0||!canEdit())return;
    const id=e.target.closest('.canvas-image')?.dataset.id;
    const image=(getMap()?.images||[]).find(i=>i.id===id);
    if(image) {
      e.preventDefault();e.stopImmediatePropagation();clearNodeSelection();canvas.focus();selected=image.id;
      const p=point(e);drag={id:image.id,map:getMap().id,pointer:e.pointerId,start:p,original:{...image},corner:e.target.dataset.corner,changed:false};
      render();
    }else if(!e.target.closest('.zoombar,.nodebar')){selected=null;render();}
  },true);
  on(window,'pointermove',e=>{
    if(!drag||e.pointerId!==drag.pointer||getMap()?.id!==drag.map)return;
    const image=getMap().images.find(i=>i.id===drag.id);if(!image)return;
    const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y,o=drag.original;
    if(!drag.changed&&Math.hypot(dx,dy)<2)return;
    if(!drag.changed){snapshot();drag.changed=true;image.z=nextZ();}
    if(drag.corner){
      const sx=drag.corner.includes('w')?-1:1,sy=drag.corner.includes('n')?-1:1;
      const scale=Math.max(48/Math.max(o.w,o.h),Math.min(4000/o.w,4000/o.h,1+(sx*dx*o.w+sy*dy*o.h)/(o.w*o.w+o.h*o.h)));
      image.w=o.w*scale;image.h=o.h*scale;image.x=o.x+(sx<0?o.w-image.w:0);image.y=o.y+(sy<0?o.h-image.h:0);
    }else{image.x=o.x+dx;image.y=o.y+dy;hoverDrop(e.clientX,e.clientY);}
    render();onChange();
  });
  function end(e){
    if(!drag||e.pointerId!==drag.pointer)return;
    const d=drag;drag=null;hoverDrop(null);
    if(!d.changed){render();return;}
    const map=getMap(),image=map?.id===d.map&&(map.images||[]).find(i=>i.id===d.id);
    // Dropping a moved image onto a column or folder turns it into an image card there.
    const boxed=image&&!d.corner&&e.type==='pointerup'&&dropImage(e.clientX,e.clientY,image);
    if(boxed){map.images=map.images.filter(i=>i!==image);selected=null;toast('圖片已放進卡片。');}
    save(d.map);render();onChange();
    if(image&&!boxed&&e.type==='pointerup') moved?.(image.id, d.corner?null:e.clientX, d.corner?null:e.clientY);
  }
  on(window,'pointerup',end);on(window,'pointercancel',end);
  on(document,'keydown',e=>{
    if(e.target.closest('input,textarea,[contenteditable="true"]'))return;
    if(e.key==='Escape'&&selected){e.stopImmediatePropagation();reset();render();}
    if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();e.stopImmediatePropagation();deleteSelected();}
  },true);
  async function addFiles(files) {
    const map=getMap();if(!map||!canEdit()){toast('請先建立心智圖，再貼上圖片。');return;}
    const mapId=map.id;
    for(const file of files){
      if((map.images||[]).length>=100){toast('每張心智圖最多可加入 100 張圖片。');break;}
      try {
        const {src,width,height}=await readImageFile(file);
        if(getMap()?.id!==mapId)continue;
        const v=getView(),w=Math.min(360,width),h=w*height/width;
        const image={id:uid('img'),src,x:(canvas.clientWidth/2-v.x)/v.k-w/2,y:(canvas.clientHeight/2-v.y)/v.k-h/2,w,h};
        snapshot();image.z=nextZ();map.images ||= [];map.images.push(image);clearNodeSelection();selected=image.id;save(map.id);render();
        toast('圖片已加入，可拖曳移動、拉動四角縮放，或拖進欄位。');
      }catch(error){toast(error.message);}
    }
  }
  on(document,'paste',e=>{
    if(e.target.closest('input,textarea'))return;
    const files=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
    if(files.length){e.preventDefault();e.stopImmediatePropagation();addFiles(files);}
  },true);
  on(pin,'click',()=>{ if(selected) pinStart(selected); });
  on(detach,'click',()=>{ const map=getMap(),image=(map?.images||[]).find(i=>i.id===selected); if(!image?.anchor)return; snapshot(); delete image.anchor; save(map.id); render(); onChange(); toast('已取消掛載'); });
  const input=document.getElementById('imageFile');
  on(document.getElementById('imageBtn'),'click',()=>{input.value='';input.click();});
  on(input,'change',()=>addFiles([...input.files]));
  function paste(image, at) {
    const map=getMap();if(!map||!canEdit())return;
    snapshot();Object.assign(image,{x:at.x-image.w/2,y:at.y-image.h/2,z:nextZ()});(map.images ||= []).push(image);
    clearNodeSelection();selected=image.id;save(map.id);render();onChange();
  }
  return {render,paste,addFiles,selection:()=>selected&&(getMap()?.images||[]).find(i=>i.id===selected)||null,cut:deleteSelected,deselect:()=>{if(selected){selected=null;render();}},boxes:()=>getMap()?.images||[],destroy:()=>{listeners.forEach(fn=>fn());layer.remove();panel.remove();}};
}
