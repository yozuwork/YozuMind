import {defaultImageSize} from './canvas-assets.js';
export function setupImageTools({board,getTarget,resize,clear,canEdit,toast}){
  const rail=document.createElement('nav');rail.className='toolrail ctx-rail image-tools';rail.hidden=true;rail.setAttribute('aria-label','圖片工具');board.append(rail);
  let dialog=null;
  const action=(label,icon,fn)=>{const button=document.createElement('button');button.className='rail-tool';button.title=label;button.innerHTML=`<span class="rail-icon"><i class="bi bi-${icon}" aria-hidden="true"></i></span><span class="rail-label"></span>`;button.querySelector('.rail-label').textContent=label;button.addEventListener('click',fn);rail.append(button);return button;};
  const load=target=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('無法讀取原圖。'));img.src=target.src;});
  async function size(original){const target=getTarget();if(!target||!canEdit())return;try{const img=await load(target);if(getTarget()!==target)return;if(original&&Math.max(img.naturalWidth,img.naturalHeight)>10000){toast('圖片超過畫布尺寸上限，請使用放大鏡查看完整原圖。');return;}resize(target,original?{w:img.naturalWidth,h:img.naturalHeight}:defaultImageSize(img.naturalWidth,img.naturalHeight));}catch(error){toast(error.message);}}
  async function preview(){const target=getTarget();if(!target)return;try{
    const img=await load(target);if(!rail.isConnected||getTarget()!==target)return;dialog?.close();
    const opener=document.activeElement,d=document.createElement('dialog');dialog=d;d.className='image-preview';d.setAttribute('aria-label','原圖放大鏡');
    const top=document.createElement('header'),label=document.createElement('span');label.textContent=`原圖 ${img.naturalWidth} × ${img.naturalHeight}`;top.append(label);
    const area=document.createElement('div');area.className='image-preview-area';img.alt='原始圖片';area.append(img);
    const range=document.createElement('input');range.type='range';range.min='10';range.max='250';range.value='100';range.setAttribute('aria-label','原圖檢視比例');
    const percent=document.createElement('span');function scale(k){img.style.width=img.naturalWidth*k+'px';img.style.height=img.naturalHeight*k+'px';percent.textContent=Math.round(k*100)+'%';range.value=String(k*100);}
    range.addEventListener('input',()=>scale(Number(range.value)/100));top.append(range,percent);
    for(const [text,fn] of [['符合視窗',()=>scale(Math.min(1,(area.clientWidth-32)/img.naturalWidth,(area.clientHeight-32)/img.naturalHeight))],['原圖 100%',()=>scale(1)],['關閉',()=>d.close()]]){const b=document.createElement('button');b.textContent=text;b.addEventListener('click',fn);top.append(b);}
    const isolate=e=>{if(d.contains(e.target))e.stopPropagation();};
    for(const type of ['keydown','copy','cut','paste'])window.addEventListener(type,isolate,true);
    d.append(top,area);document.body.append(d);d.addEventListener('close',()=>{for(const type of ['keydown','copy','cut','paste'])window.removeEventListener(type,isolate,true);d.remove();if(dialog===d)dialog=null;opener?.focus();});d.showModal();scale(Math.min(1,(area.clientWidth-32)/img.naturalWidth,(area.clientHeight-32)/img.naturalHeight));
  }catch(error){toast(error.message);}}
  action('返回工具','arrow-left',clear);
  action('放大鏡','zoom-in',preview);
  const defaults=action('預設大小','bounding-box',()=>size(false));
  const original=action('原始尺寸','aspect-ratio',()=>size(true));
  const info=document.createElement('small');info.textContent='預設 360 × 280\n等比例縮放，保留原圖';rail.append(info);
  return {sync(){rail.hidden=!getTarget();defaults.disabled=original.disabled=!canEdit();},destroy(){dialog?.close();rail.remove();}};
}
