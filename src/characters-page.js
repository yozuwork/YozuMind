import {allCards,characterStages,characterStage,characterProgress,stageXp,characterSourceCards} from './character.js';
import {listStagePresets,saveStagePreset,removeStagePresets} from './stage-presets.js';
import {activeWorkspaceId} from './workspaces.js';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls) node.className=cls;if(text!==undefined) node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};
const button=(label,cls,action)=>{const node=el('button',cls,label);node.type='button';node.addEventListener('click',action);return node;};
function portrait(src,name,cls='') {const frame=el('div','characters-art '+cls);if(src){const image=el('img');image.src=src;image.alt=name||'角色圖片';image.loading='lazy';frame.append(image);}else frame.append(icon('person-badge'));return frame;}

export function setupCharactersPage({app,trigger,getMaps,uid,toast,canEdit,onEdit,onLocate,onCreate,toggleSidebar,beforeOpen}) {
  const page=el('section','characters-page');page.hidden=true;page.setAttribute('aria-label','角色專區');app.querySelector('.main').append(page);
  const top=el('div','characters-top'),side=button('','icon-btn',toggleSidebar);side.append(icon('list'));side.setAttribute('aria-label','打開側欄');
  const back=button('返回畫布','btn btn-ghost',()=>hide());back.prepend(icon('arrow-left'));top.append(side,el('span','characters-breadcrumb','收藏 / 角色專區'),back);
  const scroll=el('div','characters-scroll'),inner=el('div','characters-inner'),hero=el('header','characters-intro'),copy=el('div'),title=el('h1','','角色專區');title.tabIndex=-1;
  copy.append(el('span','characters-eyebrow','你的角色，持續成長'),title,el('p','','收藏每一次蛻變，讓喜歡的階段成為下一個角色的起點。'));
  const stats=el('div','characters-stats');hero.append(copy,stats);
  const toolbar=el('div','characters-toolbar'),tabs=el('div','characters-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','角色專區內容');
  let tab='characters',presets=[],generation=0,destroyed=false,workspaceKey=activeWorkspaceId();const expanded=new Set();
  const rosterTab=button('所有角色','characters-tab',()=>{tab='characters';render();}),presetTab=button('常用階段','characters-tab',()=>{tab='presets';render();});
  for(const [node,id] of [[rosterTab,'characters-roster-tab'],[presetTab,'characters-presets-tab']]) {node.id=id;node.setAttribute('role','tab');node.setAttribute('aria-controls','characters-results');}
  tabs.append(rosterTab,presetTab);
  function localKeyboard(event) {if(page.hidden||event.target.closest?.('dialog'))return;if(tabs.contains(event.target)&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();tab=event.key==='Home'?'characters':event.key==='End'?'presets':tab==='characters'?'presets':'characters';render();(tab==='characters'?rosterTab:presetTab).focus();}event.stopPropagation();}
  const searchLabel=el('label','characters-search');searchLabel.append(icon('search'));const search=el('input');search.type='search';search.placeholder='搜尋角色、階段或說明';search.setAttribute('aria-label','搜尋角色與階段');searchLabel.append(search);toolbar.append(tabs,searchLabel);
  const resultInfo=el('p','characters-result-info');resultInfo.setAttribute('role','status');
  const results=el('div','characters-results');results.id='characters-results';results.setAttribute('role','tabpanel');
  top.insertBefore(tabs,back);copy.replaceChildren(title);hero.append(searchLabel);
  inner.append(hero,resultInfo,results);scroll.append(inner);page.append(top,scroll);
  function roster() {return getMaps().flatMap(map=>allCards(map.cards).filter(card=>card.type==='character').map(card=>({map,card})));}
  function empty(heading,message) {const node=el('div','characters-empty');node.append(icon(tab==='characters'?'person-badge':'bookmark-star'),el('h2','',heading),el('p','',message));return node;}
  function render() {
    if(page.hidden||destroyed) return;
    if(workspaceKey!==activeWorkspaceId()){presets=[];workspaceKey=activeWorkspaceId();expanded.clear();}
    const entries=roster(),stageCount=entries.reduce((total,{card})=>total+characterStages(card).length,0),query=search.value.trim().toLocaleLowerCase();
    stats.replaceChildren();for(const [value,label] of [[entries.length,'位角色'],[stageCount,'個成長階段'],[presets.length,'個常用階段']]) {const item=el('div');item.append(el('strong','',String(value).padStart(2,'0')),el('span','',label));stats.append(item);}
    for(const [node,active] of [[rosterTab,tab==='characters'],[presetTab,tab==='presets']]) {node.classList.toggle('active',active);node.setAttribute('aria-selected',String(active));node.tabIndex=active?0:-1;}
    results.setAttribute('aria-labelledby',tab==='characters'?rosterTab.id:presetTab.id);results.replaceChildren();results.className='characters-results '+(tab==='characters'?'characters-roster':'characters-preset-grid');
    if(tab==='presets') {
      const filtered=presets.filter(item=>[item.name,item.stage.name,item.stage.description].some(value=>value.toLocaleLowerCase().includes(query)));
      resultInfo.textContent=`${filtered.length} 個常用階段 · 套用到其他角色時，會保留該角色的起始等級。`;
      if(!filtered.length) results.append(empty(query?'找不到常用階段':'讓喜歡的階段，隨時可用',query?'試試其他關鍵字。':'在角色階段旁點「存為常用」，建立可重複使用的成長收藏。'));
      for(const preset of filtered) {
        const card=el('article','characters-preset'),info=el('div','characters-preset-info');info.append(el('span','characters-eyebrow','常用階段'),el('h2','',preset.name),el('p','characters-stage-xp',`${stageXp(preset.stage)} XP / 級`));if(preset.stage.description) info.append(el('p','characters-description',preset.stage.description));
        const actions=el('div','characters-preset-actions');
        const use=button('建立角色','btn characters-primary',()=>onCreate(preset));use.prepend(icon('plus-lg'));use.disabled=!canEdit();
        const remove=button('','icon-btn',async()=>{remove.disabled=true;try{await removeStagePresets([preset.id]);toast('已移除常用階段，已套用的角色不受影響');}catch{toast('移除失敗，請重試');remove.disabled=false;}});remove.append(icon('bookmark-x'));remove.setAttribute('aria-label',`移除常用階段 ${preset.name}`);remove.title='移除常用階段';actions.append(use,remove);
        card.append(portrait(preset.stage.src,preset.name),info,actions);results.append(card);
      }
      return;
    }
    const filtered=entries.filter(({card})=>[card.title,...characterStages(card).flatMap(stage=>[stage.name,stage.description])].some(value=>(value||'').toLocaleLowerCase().includes(query)));
    resultInfo.textContent=`${filtered.length} 位角色 · 點選縮圖查看成長階段`;
    if(!filtered.length) results.append(empty(query?'找不到角色':'你的角色故事，從這裡開始',query?'試試角色名稱或階段說明。':'在畫布新增角色卡，這裡就會展示角色與所有成長階段。'));
    for(const {map,card} of filtered) {
      const progress=characterProgress(card,characterSourceCards(card,map,getMaps())),stage=characterStage(card,progress.level),article=el('article','characters-profile'),identity=el('div','characters-identity'),info=el('div','characters-identity-info');
      article.dataset.characterId=card.id;
      info.append(el('span','characters-source',map.title||'未命名心智圖'),el('h2','',stage.name||card.title||'我的角色'),el('span','characters-level',`Lv. ${progress.level}`));
      if(stage.description) info.append(el('p','characters-description',stage.description));
      const xp=el('div','characters-xp');const bar=el('progress');bar.max=progress.required;bar.value=progress.progress;bar.setAttribute('aria-label','距離下一級的經驗值');xp.append(el('span','',`${progress.progress} / ${progress.required} XP`),bar);info.append(xp);
      const actions=el('div','characters-profile-actions'),edit=button('編輯階段','btn btn-ghost',()=>onEdit(map.id,card.id)),locate=button('開啟畫布','btn btn-ghost',()=>onLocate(map.id,card.id));edit.disabled=!canEdit();actions.append(edit,locate);info.append(actions);identity.append(portrait(stage.src,stage.name,'characters-main-art'),info);
      const stageDetails=el('details','characters-stage-details');stageDetails.open=expanded.has(card.id);stageDetails.addEventListener('toggle',()=>{if(stageDetails.open)expanded.add(card.id);else expanded.delete(card.id);});
      const stageHeading=el('summary','characters-stage-heading');stageHeading.append(el('h3','','成長軌跡'),el('span','',`${characterStages(card).length} 個階段`),icon('chevron-down'));
      const peek=el('div','characters-stage-peek');peek.setAttribute('aria-label','角色階段縮圖');
      const stages=el('div','characters-stage-grid'+(characterStages(card).length===1?' single-stage':''));
      for(const item of characterStages(card)) {
        const active=item.level===stage.level,box=el('section','characters-stage'+(active?' current':'')),meta=el('div','characters-stage-meta');meta.append(el('span','characters-stage-threshold',`Lv. ${item.level} 起`));if(active) meta.append(el('span','characters-current','目前階段'));
        box.append(meta,portrait(item.src,item.name),el('h4','',item.name||'未命名階段'),el('p','characters-stage-xp',`${stageXp(item)} XP / 級`));if(item.description) box.append(el('p','characters-description',item.description));
        const exists=presets.some(({stage:s})=>stageXp(s)===stageXp(item)&&s.name===(item.name||'')&&s.src===(item.src||'')&&s.description===(item.description||''));
        const save=button(exists?'已存為常用':'存為常用','characters-save-stage',async()=>{save.disabled=true;try{await saveStagePreset(item,uid);await refresh();toast('已存為常用階段，可在其他角色的階段設定套用');}catch(error){toast(error.message||'收藏失敗');save.disabled=false;}});save.prepend(icon(exists?'bookmark-check-fill':'bookmark-plus'));save.disabled=exists;box.append(save);stages.append(box);
        const thumbnail=button('','characters-stage-thumb'+(active?' current':''),()=>{stageDetails.open=true;box.scrollIntoView({block:'nearest'});});thumbnail.title=`${item.name||'未命名階段'} · Lv. ${item.level}`;thumbnail.setAttribute('aria-label',`查看 ${item.name||'未命名階段'}，等級 ${item.level} 起`);thumbnail.append(portrait(item.src,item.name));peek.append(thumbnail);
      }
      stageDetails.append(stageHeading,stages);article.append(identity,peek,stageDetails);results.append(article);
    }
  }
  async function refresh() {if(page.hidden||destroyed) return;const token=++generation;try{const items=await listStagePresets();if(token!==generation||destroyed) return;presets=items.sort((a,b)=>b.createdAt-a.createdAt);render();}catch{toast('常用階段載入失敗，請重新開啟角色專區');render();}}
  function show() {beforeOpen?.();page.hidden=false;app.classList.add('characters-mode');trigger.classList.add('active');trigger.setAttribute('aria-current','page');if(matchMedia('(max-width:760px)').matches) app.classList.add('side-closed');render();refresh();title.focus({preventScroll:true});}
  function hide() {page.hidden=true;app.classList.remove('characters-mode');trigger.classList.remove('active');trigger.removeAttribute('aria-current');}
  const presetChanged=()=>refresh();trigger.addEventListener('click',show);search.addEventListener('input',render);window.addEventListener('yozu-presets-changed',presetChanged);
  window.addEventListener('keydown',localKeyboard,true);
  const localClipboard=event=>{if(!page.hidden&&!event.target.closest?.('dialog'))event.stopPropagation();};for(const type of ['copy','cut','paste'])window.addEventListener(type,localClipboard,true);
  return {show,hide,refresh,render,isOpen:()=>!page.hidden,destroy(){destroyed=true;page.remove();app.classList.remove('characters-mode');trigger.removeEventListener('click',show);window.removeEventListener('yozu-presets-changed',presetChanged);window.removeEventListener('keydown',localKeyboard,true);for(const type of ['copy','cut','paste'])window.removeEventListener(type,localClipboard,true);}};
}
