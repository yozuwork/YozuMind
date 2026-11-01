import {inboxEntries} from './inbox-state.js';
import './inbox.css';
const TYPE='application/x-yozumind-inbox';
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};
const button=(label,cls,action,ic)=>{const node=el('button',cls);node.type='button';node.setAttribute('aria-label',label);node.title=label;if(ic)node.append(icon(ic));node.append(el('span','',label));node.addEventListener('click',action);return node;};
function previewOf(entry){const first=entry.objects[0],value=first.value,card=first.kind==='card'?value:null;return {name:entry.label||card?.title||card?.name||value.root?.text||card?.text||'圖片',src:first.kind==='image'?value.src:card?.src||card?.stages?.[0]?.src||'',text:card?.text||card?.url||card?.items?.slice(0,3).map(item=>item.text).join(' · ')||value.root?.text||'',icon:first.kind==='image'?'image':first.kind==='node'?'diagram-3':first.kind==='stroke'?'pencil':card?.type==='file'?'paperclip':card?.type==='todo'?'list-check':card?.type==='character'?'person-badge':card?.type==='link'?'link-45deg':'sticky'};}
export function setupInbox({board,canvas,trigger,getMap,getView,canEdit,onPlace,onRemove}) {
  const panel=el('aside','inbox-panel');panel.id='inbox-panel';panel.hidden=true;panel.setAttribute('aria-label','此心智圖的暫存區');trigger.setAttribute('aria-controls',panel.id);
  const header=el('header','inbox-header'),heading=el('div');heading.append(el('span','inbox-eyebrow','UNSORTED'),el('h2','','暫存區'));const dismiss=button('關閉暫存區','inbox-close',()=>close(),'x-lg');dismiss.querySelector('span').className='inbox-sr-only';header.append(heading,dismiss);
  const subtitle=el('p','inbox-subtitle'),list=el('div','inbox-list');list.setAttribute('aria-label','待整理的內容');const footer=el('p','inbox-footer','拖到畫布指定位置，或點「放到畫布」。\n內容會隨這張心智圖保存，並納入 ZIP 存檔。');panel.append(header,subtitle,list,footer);board.append(panel);
  const states=new Map();let currentId=null,dragging=null,destroyed=false,lastMap=null,lastEntries=[],lastEditable=null;
  function close(){if(currentId)states.set(currentId,false);panel.hidden=true;trigger.setAttribute('aria-expanded','false');const contextual=board.querySelector('.ctx-rail');(contextual&&!contextual.hidden?canvas:trigger).focus({preventScroll:true});}
  function show(){const map=getMap();if(!map)return;if(matchMedia('(max-width:760px)').matches)board.closest('.app')?.classList.add('side-closed');states.set(map.id,true);render();list.scrollTop=0;}
  function place(id,event){const map=getMap();if(!map||!canEdit())return;const rect=canvas.getBoundingClientRect(),view=getView(),at=event?{x:(event.clientX-rect.left-view.x)/view.k,y:(event.clientY-rect.top-view.y)/view.k}:{x:(rect.width/2-view.x)/view.k,y:(rect.height/2-view.y)/view.k};const placed=onPlace(id,at,event);if(placed!==false&&matchMedia('(max-width:900px)').matches)close();render();}
  function render(){
    if(destroyed)return;const map=getMap(),entries=inboxEntries(map);if(currentId!==map?.id){currentId=map?.id||null;if(currentId&&!states.has(currentId))states.set(currentId,entries.length>0);}
    trigger.disabled=!map;trigger.querySelector('.inbox-count').textContent=entries.length?String(entries.length):'';trigger.querySelector('.inbox-count').hidden=!entries.length;
    panel.hidden=!map||!states.get(map.id);trigger.setAttribute('aria-expanded',String(!panel.hidden));subtitle.textContent=map?`${map.title||'未命名心智圖'} · ${entries.length} 項待整理`:'';
    const editable=canEdit(),same=map===lastMap&&editable===lastEditable&&entries.length===lastEntries.length&&entries.every((entry,index)=>{const old=lastEntries[index];return old.id===entry.id&&old.label===entry.label&&old.objects.length===entry.objects.length&&entry.objects.every((item,i)=>item.value===old.objects[i].value);});
    if(same)return;lastMap=map;lastEntries=entries;lastEditable=editable;
    const scroll=list.scrollTop;list.replaceChildren();
    if(!entries.length){const empty=el('div','inbox-empty');empty.append(icon('inbox'),el('h3','','先收下，再慢慢整理'),el('p','','未指定目標的貼上內容會放在這裡。\n每張心智圖都有獨立的暫存區。'));list.append(empty);}
    for(const entry of entries){
      const preview=previewOf(entry),article=el('article','inbox-item');article.dataset.inboxEntry=entry.id;article.draggable=canEdit();article.setAttribute('aria-label',preview.name);article.tabIndex=0;
      if(preview.src){const frame=el('div','inbox-preview'),img=el('img');img.src=preview.src;img.alt=preview.name;img.draggable=false;img.addEventListener('error',()=>{frame.replaceChildren(icon('exclamation-circle'),el('span','','無法顯示預覽，原始內容仍已保存'));});frame.append(img);article.append(frame);}
      const copy=el('div','inbox-item-copy'),title=el('div','inbox-item-title');title.append(icon(preview.icon),el('strong','',preview.name));copy.append(title);if(preview.text&&preview.text!==preview.name)copy.append(el('p','inbox-item-text',preview.text));if(entry.objects.length>1)copy.append(el('small','',`${entry.objects.length} 個物件，將一起放入畫布`));
      const actions=el('div','inbox-item-actions'),insert=button('放到畫布','inbox-place',()=>place(entry.id),'box-arrow-in-left'),remove=button('刪除暫存項目','inbox-remove',()=>{onRemove(entry.id);render();},'trash');remove.querySelector('span').className='inbox-sr-only';insert.disabled=remove.disabled=!canEdit();actions.append(insert,remove);article.append(copy,actions);
      article.addEventListener('dragstart',event=>{if(event.target.closest('button')||!canEdit()){event.preventDefault();return;}dragging={mapId:map.id,id:entry.id};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(TYPE,JSON.stringify(dragging));event.dataTransfer.setData('text/plain',preview.name);article.classList.add('dragging');canvas.classList.add('inbox-drop-ready');});
      article.addEventListener('dragend',()=>{dragging=null;canvas.classList.remove('inbox-drop-ready');article.classList.remove('dragging');});list.append(article);
    }
    list.scrollTop=scroll;
  }
  const toggle=()=>panel.hidden?show():close();trigger.addEventListener('click',toggle);
  const over=event=>{if(!dragging||dragging.mapId!==getMap()?.id||!canEdit())return;event.preventDefault();event.dataTransfer.dropEffect='move';};
  const drop=event=>{let data;try{data=JSON.parse(event.dataTransfer.getData(TYPE));}catch{return;}if(data.mapId!==getMap()?.id||!inboxEntries(getMap()).some(entry=>entry.id===data.id))return;event.preventDefault();event.stopImmediatePropagation();place(data.id,event);dragging=null;canvas.classList.remove('inbox-drop-ready');};canvas.addEventListener('dragover',over);canvas.addEventListener('drop',drop,true);
  const isolate=event=>{if(panel.hidden||!panel.contains(event.target)||event.type==='paste')return;if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();close();}event.stopPropagation();};for(const type of ['keydown','copy','cut'])window.addEventListener(type,isolate,true);
  return {render,show,close,destroy(){destroyed=true;panel.remove();trigger.removeEventListener('click',toggle);canvas.removeEventListener('dragover',over);canvas.removeEventListener('drop',drop,true);for(const type of ['keydown','copy','cut'])window.removeEventListener(type,isolate,true);}};
}
