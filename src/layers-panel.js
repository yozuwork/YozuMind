import {canvasLayers} from './layers.js';
import './layers.css';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
const icon=name=>{const n=el('i','bi bi-'+name);n.setAttribute('aria-hidden','true');return n;};
export function setupLayers({board,trigger,getMap,getSelected,canEdit,onSelect,onLocate,onOrder,beforeOpen,onHide}){
  const panel=el('aside','layers-panel');panel.id='layersPanel';panel.hidden=true;panel.setAttribute('aria-label','畫布圖層');
  const header=el('header','layers-header'),heading=el('h2','','圖層'),count=el('span','layers-count'),close=el('button','icon-btn');close.append(icon('x-lg'));close.title='關閉圖層';close.setAttribute('aria-label','關閉圖層');header.append(heading,count,close);
  const search=el('input','layers-search');search.type='search';search.placeholder='搜尋物件';search.setAttribute('aria-label','搜尋圖層');
  const hint=el('p','layers-hint','由上至下排列，直接點選被遮住的物件。'),list=el('div','layers-list');list.setAttribute('aria-label','畫布物件');
  const footer=el('footer','layers-footer'),buttons=[];
  for(const [name,ic,action] of [['定位物件','crosshair',()=>onLocate(selected)],['移到最上層','front',()=>onOrder(selected,'front')],['移到最下層','back',()=>onOrder(selected,'back')]]){
    const b=el('button','layers-action');b.append(icon(ic),el('span','',name));b.addEventListener('click',()=>{if(selected){action();render();}});buttons.push(b);footer.append(b);
  }
  panel.append(header,search,hint,list,footer);board.append(panel);trigger.setAttribute('aria-controls',panel.id);
  let selected=null,lastMap=null,signature='',lastSources=[],destroyed=false,queued=false;
  function hide(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.classList.remove('on');onHide();}
  function render(){
    if(destroyed)return;const map=getMap();trigger.disabled=!map;
    if(lastMap!==map?.id){selected=null;lastMap=map?.id;search.value='';signature='';}
    if(!map){hide();return;}if(panel.hidden)return;
    const entries=canvasLayers(map),external=getSelected();if(external)selected=external;
    if(!entries.some(e=>e.id===selected))selected=null;
    const active=entries.find(e=>e.id===selected);count.textContent=String(entries.length);
    buttons[0].disabled=!active;buttons[1].disabled=buttons[2].disabled=!active?.reorder||!canEdit();
    buttons[1].title=buttons[2].title=active&&!active.reorder?'容器內物件與心智圖節點由所屬結構管理層級':'';
    const query=search.value.trim().toLowerCase(),shown=entries.filter(e=>(e.name+' '+e.type).toLowerCase().includes(query));
    const sources=shown.map(e=>e.src),sameSources=sources.length===lastSources.length&&sources.every((src,i)=>src===lastSources[i]);
    const next=JSON.stringify([selected,query,shown.map(e=>[e.id,e.name,e.depth,e.value.z])]);if(next===signature&&sameSources)return;signature=next;lastSources=sources;
    const focusId=list.contains(document.activeElement)?document.activeElement.dataset.layerId:null,scroll=list.scrollTop;list.replaceChildren();
    for(const entry of shown){
      const row=el('button','layer-row'+(selected===entry.id?' selected':''));row.dataset.layerId=entry.id;row.setAttribute('aria-pressed',String(selected===entry.id));row.title=entry.name;row.style.setProperty('--layer-depth',Math.min(entry.depth,4));
      const thumb=el('span','layer-thumb');if(entry.src){const img=el('img');img.src=entry.src;img.alt='';img.loading='lazy';thumb.append(img);}else thumb.append(icon(entry.icon));
      const text=el('span','layer-copy');text.append(el('strong','',entry.name),el('small','',entry.depth&&entry.kind==='card'?`${entry.type} · 容器內` :entry.type));row.append(thumb,text);
      row.addEventListener('click',()=>{selected=entry.id;onSelect(entry.id);render();});row.addEventListener('dblclick',()=>onLocate(entry.id));list.append(row);
    }
    if(!shown.length)list.append(el('p','layers-empty',entries.length?'找不到符合的物件':'畫布還沒有物件'));
    list.scrollTop=scroll;if(focusId)list.querySelector(`[data-layer-id="${CSS.escape(focusId)}"]`)?.focus({preventScroll:true});
  }
  function refresh(){if(queued||destroyed)return;queued=true;queueMicrotask(()=>{queued=false;render();});}
  function toggle(){if(panel.hidden){beforeOpen();panel.hidden=false;trigger.setAttribute('aria-expanded','true');trigger.classList.add('on');signature='';render();search.focus();}else hide();}
  const dismiss=()=>{hide();trigger.focus();};close.addEventListener('click',dismiss);trigger.addEventListener('click',toggle);search.addEventListener('input',render);
  const isolate=e=>{if(panel.hidden||!panel.contains(e.target))return;if(e.type==='keydown'&&e.key==='Escape'){e.preventDefault();dismiss();}e.stopPropagation();};
  for(const type of ['keydown','copy','cut'])window.addEventListener(type,isolate,true);
  const syncSelection=event=>{if(!panel.contains(event.target)&&event.target!==trigger)selected=getSelected()||null;refresh();};
  document.addEventListener('pointerup',syncSelection);document.addEventListener('keyup',syncSelection);
  return {refresh,hide,isOpen:()=>!panel.hidden,destroy(){destroyed=true;panel.remove();trigger.removeEventListener('click',toggle);document.removeEventListener('pointerup',syncSelection);document.removeEventListener('keyup',syncSelection);for(const type of ['keydown','copy','cut'])window.removeEventListener(type,isolate,true);}};
}
