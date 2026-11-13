import {jsonGraph,JSON_SOURCE_LIMIT} from './json-graph.js';
import {formatJsonNote} from './json-format.js';
import {editJson,stringifyJsonNode,copyJsonValue} from './json-edit.js';
import './json-page.css';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const btn=(text,fn)=>{const b=el('button','',text);b.type='button';b.addEventListener('click',fn);return b;};
export function setupJsonPage({app,getMap,save,canEdit,toast,copyPage,embedPage}){
  const page=el('section','json-page');page.hidden=true;page.setAttribute('aria-label','JSON 心智圖');app.querySelector('.main').append(page);
  const tools=el('header','json-tools'),status=el('span','json-status'),input=el('textarea','json-source');input.spellcheck=false;input.maxLength=JSON_SOURCE_LIMIT;input.setAttribute('aria-label','JSON 原始碼');input.placeholder='貼上 JSON，即時轉換成圖形…';
  const editor=el('div','json-editor'),editorHead=el('header','','JSON 原始碼'),lineNumbers=el('pre','json-lines'),code=el('div','json-code');code.append(lineNumbers,input);editor.append(editorHead,code,status);
  const graph=el('div','json-graph');graph.tabIndex=0;graph.setAttribute('aria-label','JSON 節點圖，可拖曳平移與縮放');const world=el('div','json-graph-world');graph.append(world);
  const layout=el('div','json-layout');layout.append(editor,graph);page.append(tools,layout);
  let id=null,timer=null,model=null,renderedSource=null,collapsed=new Set(),expanded=new Set(),selected=null,dialog=null,history=[],view={x:0,y:0,k:1},drag=null,disposed=false;
  const iconButton=(label,icon,action)=>{const b=btn('',e=>{e.stopPropagation();action();});b.title=label;b.setAttribute('aria-label',label);const i=el('i','bi bi-'+icon);i.setAttribute('aria-hidden','true');b.append(i);return b;};
  async function copy(text,label){if(input.value!==renderedSource){draw();toast('圖形已更新，請重新選取欄位。');return;}try{await navigator.clipboard.writeText(text);toast(`已複製${label}`);}catch{toast('複製失敗，請允許瀏覽器存取剪貼簿。');}}
  function selectCard(card,path){selected=path;world.querySelectorAll('.json-graph-node.selected').forEach(n=>n.classList.remove('selected'));card.classList.add('selected');}
  function commitSource(text){history.push(input.value);if(history.length>30)history.shift();input.value=text;collapsed.clear();expanded.clear();selected=null;update();clearTimeout(timer);draw();undo.disabled=false;}
  function edit(path,node,key,remove=false){
    if(!canEdit())return;if(input.value!==renderedSource){draw();toast('圖形已更新，請重新選取欄位。');return;}dialog?.close();
    const origin=id,source=input.value,opener=document.activeElement,d=el('dialog','json-edit-dialog');dialog=d;d.setAttribute('aria-label',remove?'刪除 JSON 內容':'編輯 JSON 內容');
    const form=el('form'),heading=el('h2','',remove?'刪除 JSON 內容':'編輯 JSON 內容'),error=el('p','json-edit-error');error.setAttribute('role','alert');form.append(heading);
    const name=el('input'),value=el('textarea');name.value=key??'';name.setAttribute('aria-label','欄位名稱');value.value=stringifyJsonNode(node);value.spellcheck=false;value.setAttribute('aria-label','JSON 值');value.rows=12;value.maxLength=JSON_SOURCE_LIMIT;
    if(remove)form.append(el('p','',`確定刪除「${key??'這張卡片'}」及其所有內容？`));
    else{if(key!==undefined){const label=el('label','','欄位名稱');label.append(name);form.append(label);}const label=el('label','','JSON 值（文字需保留雙引號）');label.append(value);form.append(label);}
    const footer=el('footer'),cancel=btn('取消',()=>d.close()),submit=el('button','',remove?'確認刪除':'儲存修改');submit.type='submit';footer.append(cancel,submit);form.append(error,footer);d.append(form);page.append(d);
    form.addEventListener('submit',e=>{e.preventDefault();if(!canEdit()||id!==origin){error.textContent='頁面或編輯權限已變更。';return;}if(input.value!==source){error.textContent='原文已變更，請關閉後重新選取。';return;}try{const next=editJson(source,{path,value:value.value,key:key===undefined?undefined:name.value,remove});jsonGraph(next);commitSource(next);d.close();toast(remove?'已刪除，可按「復原修改」還原。':'已更新 JSON 原文與圖形。');}catch(err){error.textContent=err.message;}});
    d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;if(opener?.isConnected)opener.focus();});d.showModal();
  }
  const zoomLabel=el('span','','100%');
  function apply(){world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.k})`;zoomLabel.textContent=Math.round(view.k*100)+'%';}
  function zoom(k,px=graph.clientWidth/2,py=graph.clientHeight/2){k=Math.max(.1,Math.min(3,k));const ratio=k/view.k;view={k,x:px-(px-view.x)*ratio,y:py-(py-view.y)*ratio};apply();}
  function fit(){if(!model||!graph.clientWidth)return;view.k=Math.min(1,(graph.clientWidth-48)/model.width,(graph.clientHeight-48)/model.height);view.k=Math.max(.1,view.k);view.x=(graph.clientWidth-model.width*view.k)/2;view.y=(graph.clientHeight-model.height*view.k)/2;apply();}
  function numbers(){lineNumbers.textContent=Array.from({length:input.value.split('\n').length},(_,i)=>i+1).join('\n');}
  function draw(){
    if(!id)return;
    try{model=jsonGraph(input.value,collapsed,expanded);renderedSource=input.value;graph.classList.remove('json-pending');world.replaceChildren();world.style.width=model.width+'px';world.style.height=model.height+'px';
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',model.width);svg.setAttribute('height',model.height);world.append(svg);const byId=new Map(model.nodes.map(n=>[n.id,n]));
      for(const edge of model.edges){const a=byId.get(edge.from),b=byId.get(edge.to),path=document.createElementNS(svg.namespaceURI,'path'),sx=a.x+a.w,sy=a.y+a.h/2,tx=b.x,ty=b.y+b.h/2;path.setAttribute('d',`M${sx},${sy} C${sx+40},${sy} ${tx-40},${ty} ${tx},${ty}`);svg.append(path);}
      for(const n of model.nodes){
        const card=el('section','json-graph-node'+(n.expanded?' expanded':'')+(selected===n.id?' selected':'')),head=el('header'),title=el('strong','',n.label),actions=el('div','json-node-actions');title.title=n.label;head.append(title,actions);
        const parentPath=n.id.slice(0,n.id.lastIndexOf('/')),parent=byId.get(parentPath),nodeKey=parent?.raw.type==='object'?n.label:undefined;
        actions.append(iconButton('複製整張卡片 JSON','copy',()=>copy(stringifyJsonNode(n.raw),'卡片 JSON')),iconButton(n.expanded?'還原精簡寬度':'展開完整欄位與 ID',n.expanded?'arrows-angle-contract':'arrows-angle-expand',()=>{if(expanded.has(n.id))expanded.delete(n.id);else expanded.add(n.id);draw();}));
        const modify=iconButton('編輯卡片 JSON','pencil',()=>edit(n.id,n.raw,nodeKey)),remove=iconButton('刪除卡片與內容','trash',()=>edit(n.id,n.raw,nodeKey??n.label,true));modify.disabled=!canEdit();remove.disabled=!canEdit()||n.id==='$';actions.append(modify,remove);
        if(n.expandable)actions.append(iconButton(n.collapsed?'展開卡片與分支':'收合卡片與分支',n.collapsed?'chevron-right':'chevron-down',()=>{if(collapsed.has(n.id))collapsed.delete(n.id);else collapsed.add(n.id);draw();}));
        card.append(head);Object.assign(card.style,{left:n.x+'px',top:n.y+'px',width:n.w+'px',height:n.h+'px'});
        const expandCard=()=>{selectCard(card,n.id);if(!expanded.has(n.id)||collapsed.has(n.id)){expanded.add(n.id);collapsed.delete(n.id);draw();world.querySelector(`[data-json-node="${CSS.escape(n.id)}"]`)?.focus({preventScroll:true});}};
        card.dataset.jsonNode=n.id;card.tabIndex=0;card.setAttribute('aria-label',`${n.label}，按 Enter 展開完整內容`);head.title='點擊卡片可展開完整內容';
        card.addEventListener('click',e=>{if(e.target.closest('button'))return;expandCard();});
        card.addEventListener('keydown',e=>{if(e.target!==card||!['Enter',' '].includes(e.key))return;e.preventDefault();expandCard();});
        if(!n.collapsed)for(const row of n.rows){
          const r=el('div','json-graph-row'),key=btn(row.key,()=>copy(row.key,'欄位名稱')),value=btn(row.value,()=>copy(copyJsonValue(row.raw),'欄位值')),rowActions=el('span','json-row-actions');r.style.height=row.height+'px';
          key.className='json-graph-key';key.title='複製名稱：'+row.key;key.setAttribute('aria-label','複製欄位名稱 '+row.key);value.className='json-field-value json-graph-'+row.type;value.title='複製完整值：'+row.value;value.setAttribute('aria-label','複製 '+row.key+' 的完整值');
          const fieldKey=n.raw.type==='object'?row.key:undefined,editField=iconButton('編輯 '+row.key,'pencil',()=>edit(row.path,row.raw,fieldKey)),deleteField=iconButton('刪除 '+row.key,'trash',()=>edit(row.path,row.raw,row.key,true));editField.disabled=deleteField.disabled=!canEdit();rowActions.append(editField,deleteField);
          r.append(key,el('span','json-colon',':'),value,rowActions);card.append(r);
        }world.append(card);
      }status.textContent=`有效 JSON · ${model.nodes.length} 個節點 · 自動儲存`;status.classList.remove('error');
    }catch(error){renderedSource=null;graph.classList.remove('json-pending');status.textContent=error.message;status.classList.add('error');world.replaceChildren(el('div','json-graph-error','JSON 格式有誤，修正左側內容後會重新顯示圖形。'));model=null;}
    apply();
  }
  function update(){if(!id||!canEdit())return;const map=getMap(id);if(!map)return;map.jsonSource=input.value;save(id);numbers();graph.classList.add('json-pending');clearTimeout(timer);timer=setTimeout(draw,250);}
  const format=btn('格式化',()=>{try{const text=formatJsonNote(input.value,2000000).slice(8,-4);if(text.length>JSON_SOURCE_LIMIT)throw new Error('格式化後超過 200,000 字，保留原文。');commitSource(text);}catch(error){toast(error.message);}});
  const undo=btn('復原修改',()=>{if(!canEdit()||!history.length)return;input.value=history.pop();collapsed.clear();expanded.clear();update();clearTimeout(timer);draw();undo.disabled=!history.length;});undo.disabled=true;
  const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
  const upload=btn('匯入 JSON',()=>file.click());file.addEventListener('change',async()=>{const selected=file.files[0],origin=id;file.value='';if(!selected||!canEdit())return;if(selected.size>1000000){toast('JSON 檔案不可超過 1 MB。');return;}try{const text=await selected.text();if(disposed||id!==origin||!canEdit())return;if(text.length>JSON_SOURCE_LIMIT)throw new Error('JSON 超過 200,000 字。');jsonGraph(text);input.value=text;update();}catch(error){toast(error.message);}});
  const download=btn('匯出 JSON',()=>{const blob=new Blob([input.value],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=(getMap(id)?.title||'JSON')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  tools.append(el('strong','','{ } JSON 心智圖'),format,undo,upload,download,btn('複製頁面卡片',()=>copyPage(id)),btn('放入一般心智圖',()=>embedPage(id)),file);
  const controls=el('div','json-graph-controls');controls.append(btn('−',()=>zoom(view.k/1.2)),zoomLabel,btn('＋',()=>zoom(view.k*1.2)),btn('100%',()=>{view={x:0,y:0,k:1};apply();}),btn('符合畫面',fit),btn('全部展開',()=>{collapsed.clear();draw();}));graph.append(controls);
  input.addEventListener('input',update);input.addEventListener('scroll',()=>{lineNumbers.scrollTop=input.scrollTop;});
  graph.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.json-graph-node,.json-graph-controls'))return;e.preventDefault();window.getSelection()?.removeAllRanges();drag={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};graph.setPointerCapture(e.pointerId);});graph.addEventListener('pointermove',e=>{if(!drag)return;view.x=drag.vx+e.clientX-drag.x;view.y=drag.vy+e.clientY-drag.y;apply();});for(const type of ['pointerup','pointercancel','lostpointercapture'])graph.addEventListener(type,()=>drag=null);
  graph.addEventListener('wheel',e=>{if(e.target.closest('.json-graph-controls'))return;e.preventDefault();if(e.ctrlKey||e.metaKey){const r=graph.getBoundingClientRect();zoom(view.k*Math.exp(-e.deltaY*.005),e.clientX-r.left,e.clientY-r.top);}else{view.x-=e.deltaX;view.y-=e.deltaY;apply();}},{passive:false});
  const isolate=e=>{if(!page.hidden&&page.contains(e.target)){if(e.type==='keydown'&&e.target.matches('.json-graph-node')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();}e.stopPropagation();}};for(const type of ['keydown','copy','cut','paste'])window.addEventListener(type,isolate,true);
  function hide(){clearTimeout(timer);dialog?.close();id=null;page.hidden=true;app.classList.remove('json-mode');}
  return {show(map){clearTimeout(timer);dialog?.close();id=map.id;collapsed=new Set();expanded=new Set();selected=null;history=[];undo.disabled=true;input.value=map.jsonSource||'{}';input.readOnly=!canEdit();format.disabled=upload.disabled=!canEdit();numbers();page.hidden=false;app.classList.add('json-mode');view={x:0,y:0,k:1};draw();},hide,isOpen:()=>!page.hidden,destroy(){disposed=true;hide();for(const type of ['keydown','copy','cut','paste'])window.removeEventListener(type,isolate,true);page.remove();}};
}
