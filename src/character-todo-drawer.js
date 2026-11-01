import {characterSourceMaps,characterSourceCards,characterProgress,characterStage,todoEntries} from './character.js';
import './character-todo-drawer.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};
const button=(label,cls,action,ic)=>{const node=el('button',cls);node.type='button';node.setAttribute('aria-label',label);if(ic)node.append(icon(ic));node.append(el('span','',label));node.addEventListener('click',action);return node;};
const titleOf=todo=>todo.title||todo.items?.find(item=>item.text)?.text||'未命名清單';
const mapName=map=>map.title||'未命名心智圖';

export function setupCharacterTodoDrawer({getMap,getMaps,getCard,canEdit,onUpdate,onLocate,onOpenChange}) {
  let active=null,frame=0,destroyed=false;
  const mobile=matchMedia('(max-width:760px)');
  function context(){if(!active||getMap()?.id!==active.mapId)return null;const card=getCard(active.cardId);return card?.type==='character'?{card,map:getMap(),maps:getMaps()}:null;}
  function close(restore=true){if(active?.dialog.open){active.restore=restore;active.dialog.close();}}
  function refresh(){if(destroyed||!active?.dialog.open)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;if(!context())close();else render();});}
  function update(sources,ids,message){
    const ctx=context();if(!ctx||!canEdit())return refresh();
    const validSources=ctx.maps.filter(map=>sources.includes(map.id)).map(map=>map.id),allowed=new Set(todoEntries(characterSourceCards({todoMapIds:validSources},ctx.map,ctx.maps)).map(({todo})=>todo.id));
    onUpdate(ctx.card,{todoMapIds:validSources,todoIds:[...new Set(ids)].filter(id=>allowed.has(id))});
    if(active){active.announcement.textContent=message;render();}
  }
  function toggleSource(id,checked){const ctx=context();if(!ctx)return;const sources=new Set(characterSourceMaps(ctx.card,ctx.map,ctx.maps).map(map=>map.id));checked?sources.add(id):sources.delete(id);update([...sources],ctx.card.todoIds||[],checked?'已加入來源心智圖':'已取消來源及其中清單的連動');}
  function toggleTodos(ids,checked){const ctx=context();if(!ctx)return;const linked=new Set(ctx.card.todoIds||[]);ids.forEach(id=>checked?linked.add(id):linked.delete(id));update(characterSourceMaps(ctx.card,ctx.map,ctx.maps).map(map=>map.id),[...linked],checked?'已連動選取的清單':'已取消清單連動');}
  function render(){
    const ctx=context(),ui=active;if(!ctx||!ui?.dialog.open)return;
    const focused=document.activeElement?.dataset.drawerFocus,sourceScroll=ui.sourceOptions.scrollTop,listScroll=ui.results.scrollTop;
    const sources=characterSourceMaps(ctx.card,ctx.map,ctx.maps),selectedMaps=new Set(sources.map(map=>map.id)),linked=new Set(ctx.card.todoIds||[]),query=ui.search.value.trim().toLocaleLowerCase();
    const entries=sources.flatMap(map=>todoEntries(map.cards).map(entry=>({...entry,map}))),validLinked=entries.filter(({todo})=>linked.has(todo.id)),stats=characterProgress(ctx.card,characterSourceCards(ctx.card,ctx.map,ctx.maps));
    ui.identity.textContent=`${characterStage(ctx.card,stats.level).name||ctx.card.title||'我的角色'} · ${mapName(ctx.map)}`;
    ui.sourceCount.textContent=`${sources.length} 張已選`;ui.linkedCount.textContent=String(validLinked.length);ui.xp.textContent=String(stats.xp);ui.mapCount.textContent=String(sources.length);
    ui.footerCount.textContent=`已連動 ${validLinked.length} 份清單`;ui.footerHint.textContent=`${stats.completed} / ${stats.total} 項完成 · 變更即時儲存`;
    ui.sources.classList.toggle('expanded',!mobile.matches||ui.sourcesExpanded);ui.sourceToggle.setAttribute('aria-expanded',String(!mobile.matches||ui.sourcesExpanded));ui.sourceToggle.setAttribute('aria-disabled',String(!mobile.matches));ui.sourceToggle.tabIndex=mobile.matches?0:-1;
    ui.sourceOptions.replaceChildren();
    for(const map of ctx.maps){
      const label=el('label','ctd-source'),check=el('input'),copy=el('span','ctd-source-copy'),top=el('span','ctd-source-name');
      check.type='checkbox';check.checked=selectedMaps.has(map.id);check.disabled=!canEdit();check.dataset.drawerFocus='source:'+map.id;check.dataset.characterSource=map.id;check.setAttribute('aria-label',`連動心智圖：${mapName(map)}`);check.addEventListener('change',()=>toggleSource(map.id,check.checked));
      top.append(el('span','',mapName(map)));if(map.id===ctx.map.id)top.append(el('small','ctd-current','目前'));
      copy.append(top,el('small','ctd-source-meta',`${todoEntries(map.cards).length} 份待辦清單`));label.classList.toggle('selected',check.checked);label.append(check,copy);ui.sourceOptions.append(label);
    }
    const found=entries.filter(({map,todo,path})=>(!ui.onlyLinked||linked.has(todo.id))&&(!query||[mapName(map),titleOf(todo),path].join(' ').toLocaleLowerCase().includes(query)));
    ui.all.classList.toggle('active',!ui.onlyLinked);ui.linked.classList.toggle('active',ui.onlyLinked);ui.all.setAttribute('aria-pressed',String(!ui.onlyLinked));ui.linked.setAttribute('aria-pressed',String(ui.onlyLinked));
    ui.resultsCount.textContent=`${found.length} 份清單${query?'符合搜尋':''}`;
    const selectedResults=found.filter(({todo})=>linked.has(todo.id)).length;
    ui.selectAll.disabled=!canEdit()||!found.length||selectedResults===found.length;ui.clear.disabled=!canEdit()||!selectedResults;
    ui.selectAll.onclick=()=>toggleTodos(found.map(({todo})=>todo.id),true);ui.clear.onclick=()=>toggleTodos(found.map(({todo})=>todo.id),false);
    ui.results.replaceChildren();
    for(const map of sources){
      const groupEntries=found.filter(entry=>entry.map.id===map.id);if(!groupEntries.length)continue;
      const group=el('section','ctd-group'),heading=el('div','ctd-group-heading');heading.append(icon('folder2'),el('h3','',mapName(map)),el('span','',`${groupEntries.length}`));group.append(heading);
      for(const {todo,path} of groupEntries){
        const row=el('div','ctd-todo'),choice=el('label','ctd-todo-choice'),check=el('input'),name=titleOf(todo),tasks=(todo.items||[]).filter(item=>!item.displayOnly),completed=tasks.filter(item=>item.done).length;
        check.type='checkbox';check.checked=linked.has(todo.id);check.disabled=!canEdit();check.dataset.characterTodo=todo.id;check.dataset.drawerFocus='todo:'+todo.id;check.setAttribute('aria-label',`連動清單：${name}（${mapName(map)}）`);check.addEventListener('change',()=>toggleTodos([todo.id],check.checked));choice.append(check);choice.title=`連動清單：${name}`;
        const jump=button(`定位清單：${name}`,'ctd-todo-jump',()=>{close(false);onLocate(map.id,todo.id);});jump.dataset.drawerFocus='jump:'+todo.id;jump.dataset.locateTodo=todo.id;jump.replaceChildren();
        const copy=el('span','ctd-todo-copy'),meta=el('span','ctd-todo-meta');meta.append(el('span','',`${completed} / ${tasks.length} 項完成`));if(path)meta.append(el('span','ctd-todo-path',path));copy.append(el('strong','',name),meta);jump.append(copy,icon('arrow-up-right'));row.classList.toggle('selected',check.checked);row.append(choice,jump);group.append(row);
      }
      ui.results.append(group);
    }
    if(!found.length){const empty=el('div','ctd-empty');empty.append(icon(query?'search':!sources.length?'diagram-3':'list-check'),el('h3','',query?'找不到符合的清單':!sources.length?'先選擇來源心智圖':ui.onlyLinked?'還沒有連動清單':'這些心智圖還沒有待辦清單'),el('p','',query?'試試清單名稱、心智圖名稱或所在欄位。':!sources.length?`從${mobile.matches?'上方':'左側'}選擇一張或多張心智圖，開始連結角色的成長。`:ui.onlyLinked?'切換「全部清單」，勾選想連動的清單。':'先在畫布上新增待辦清單，就會顯示在這裡。'));ui.results.append(empty);}
    ui.sourceOptions.scrollTop=sourceScroll;ui.results.scrollTop=listScroll;
    if(focused){const target=ui.dialog.querySelector(`[data-drawer-focus="${CSS.escape(focused)}"]`);if(target)target.focus({preventScroll:true});else ui.search.focus({preventScroll:true});}
  }
  function open(cardId){
    if(destroyed||!canEdit())return;
    if(active?.dialog.open){if(active.cardId===cardId)return;close(false);}
    const map=getMap(),card=getCard(cardId);if(!map||card?.type!=='character')return;
    const opener=document.activeElement,dialog=el('dialog','character-todo-drawer');dialog.setAttribute('aria-labelledby','ctd-title');dialog.setAttribute('aria-describedby','ctd-description');
    const shell=el('div','ctd-shell'),header=el('header','ctd-header'),titleRow=el('div','ctd-title-row'),copy=el('div');copy.append(el('span','ctd-eyebrow','角色成長 / 清單連動'),el('h2','','連動待辦清單'));copy.querySelector('h2').id='ctd-title';
    const dismiss=button('關閉連動清單','ctd-icon-button',()=>close(),'x-lg');dismiss.querySelector('span').className='ctd-sr-only';dismiss.autofocus=true;titleRow.append(copy,dismiss);
    const identity=el('p','ctd-identity'),description=el('p','ctd-description','選擇來源、勾選清單，讓日常累積成為角色的經驗值。');description.id='ctd-description';
    const metrics=el('div','ctd-metrics'),mapCount=el('strong'),linkedCount=el('strong'),xp=el('strong');for(const [value,label] of [[mapCount,'來源心智圖'],[linkedCount,'連動清單'],[xp,'累積 XP']]){const item=el('div');item.append(value,el('span','',label));metrics.append(item);}header.append(titleRow,identity,description,metrics);
    const body=el('div','ctd-body'),sources=el('aside','ctd-sources'),sourceToggle=button('來源心智圖','ctd-source-toggle',()=>{if(!mobile.matches)return;active.sourcesExpanded=!active.sourcesExpanded;render();}),sourceCount=el('span','ctd-source-count'),sourceOptions=el('div','ctd-source-options');sourceOptions.id='ctd-source-options';sourceToggle.setAttribute('aria-controls',sourceOptions.id);sourceToggle.append(sourceCount,icon('chevron-down'));
    sources.append(sourceToggle,el('p','ctd-source-help','可選多張；取消來源也會取消其中清單的連動。'),sourceOptions);
    const main=el('div','ctd-main'),toolbar=el('div','ctd-toolbar'),searchLabel=el('label','ctd-search'),search=el('input');search.type='search';search.placeholder='搜尋清單、心智圖或所在欄位';search.setAttribute('aria-label','搜尋連動清單');searchLabel.append(icon('search'),search);
    const filterRow=el('div','ctd-filter-row'),filters=el('div','ctd-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','清單篩選');const all=button('全部清單','',()=>{active.onlyLinked=false;render();}),linked=button('已連動','',()=>{active.onlyLinked=true;render();});filters.append(all,linked);filterRow.append(filters);
    const resultsBar=el('div','ctd-results-bar'),resultsCount=el('span'),batch=el('div','ctd-batch'),selectAll=button('全選結果','',()=>{}),clear=button('取消選取','',()=>{});batch.append(selectAll,clear);resultsBar.append(resultsCount,batch);toolbar.append(searchLabel,filterRow,resultsBar);
    const results=el('div','ctd-results');results.setAttribute('aria-label','可連動的待辦清單');main.append(toolbar,results);body.append(sources,main);
    const footer=el('footer','ctd-footer'),footerCopy=el('div'),footerCount=el('strong'),footerHint=el('span'),done=button('完成','ctd-done',()=>close(),'check2');footerCopy.append(footerCount,footerHint);footer.append(footerCopy,done);
    const announcement=el('p','ctd-sr-only');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');shell.append(header,body,footer,announcement);dialog.append(shell);
    const ui={dialog,cardId,mapId:map.id,opener,restore:true,sourcesExpanded:false,onlyLinked:false,identity,mapCount,linkedCount,xp,sources,sourceToggle,sourceCount,sourceOptions,search,all,linked,resultsCount,selectAll,clear,results,footerCount,footerHint,announcement};active=ui;
    search.addEventListener('input',render);
    dialog.addEventListener('close',()=>{dialog.remove();if(active===ui){active=null;if(ui.restore)onOpenChange?.();}if(ui.restore&&!destroyed){const target=ui.opener?.isConnected?ui.opener:document.querySelector(`.card[data-id="${CSS.escape(cardId)}"] .character-more`);target?.focus({preventScroll:true});}});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
    document.body.append(dialog);dialog.showModal();render();onOpenChange?.();
  }
  const isolate=event=>{if(!active?.dialog.open||!active.dialog.contains(event.target))return;if(event.type==='keydown'&&event.target.closest('input,textarea'))return;event.stopPropagation();};
  for(const type of ['keydown','copy','cut','paste'])window.addEventListener(type,isolate,true);
  const breakpoint=()=>{if(active)render();};mobile.addEventListener('change',breakpoint);
  return {open,close,refresh,isOpen:cardId=>!!active?.dialog.open&&active.cardId===cardId,destroy(){destroyed=true;cancelAnimationFrame(frame);active?.dialog.remove();active=null;mobile.removeEventListener('change',breakpoint);for(const type of ['keydown','copy','cut','paste'])window.removeEventListener(type,isolate,true);}};
}
