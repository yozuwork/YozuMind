import {allCards,characterStages,characterStage,characterProgress,characterSourceCards} from './character.js';
import './character-picker.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text!==undefined)node.textContent=text;return node;};
const icon=name=>{const node=el('i','bi bi-'+name);node.setAttribute('aria-hidden','true');return node;};

export function setupCharacterPicker({getMap,getMaps,getCard,canEdit,onApply}) {
  let active=null;
  function close(){active?.dialog.close();}
  function valid(){return active&&canEdit()&&getMap()?.id===active.mapId&&getCard(active.cardId)?.type==='character';}
  function refresh(){if(active&&!valid())close();}
  function open(cardId){
    close();
    const map=getMap(),card=getCard(cardId);if(!map||card?.type!=='character'||!canEdit())return;
    const opener=document.activeElement,dialog=el('dialog','character-picker');dialog.setAttribute('aria-labelledby','character-picker-title');dialog.setAttribute('aria-describedby','character-picker-help');
    const header=el('header','cp-header'),top=el('div','cp-top'),title=el('h2','','選擇現有角色');title.id='character-picker-title';
    const dismiss=el('button','cp-close');dismiss.type='button';dismiss.title='關閉角色選擇';dismiss.setAttribute('aria-label',dismiss.title);dismiss.append(icon('x-lg'));dismiss.addEventListener('click',close);top.append(title,dismiss);
    const help=el('p','','套用角色的圖片與所有成長階段，保留目前卡片的待辦連動。');help.id='character-picker-help';
    const label=el('label','cp-search');label.append(icon('search'));const search=el('input');search.type='search';search.placeholder='搜尋角色、階段或來源心智圖';search.setAttribute('aria-label','搜尋現有角色');search.autofocus=true;label.append(search);header.append(top,help,label);
    const count=el('p','cp-count');count.setAttribute('role','status');const results=el('div','cp-results');
    dialog.append(header,count,results);
    const state={dialog,cardId,mapId:map.id};active=state;
    function render(){
      if(active!==state)return;if(!valid()){close();return;}
      const maps=getMaps(),query=search.value.trim().toLocaleLowerCase();
      const entries=maps.flatMap(sourceMap=>allCards(sourceMap.cards).filter(source=>source.type==='character'&&source!==card).map(source=>({source,sourceMap}))).filter(({source,sourceMap})=>[source.title,sourceMap.title,...characterStages(source).flatMap(stage=>[stage.name,stage.description])].some(value=>(value||'').toLocaleLowerCase().includes(query)));
      count.textContent=`${entries.length} 個可選角色`;results.replaceChildren();
      if(!entries.length){const empty=el('div','cp-empty');empty.append(icon('person-badge'),el('strong','',query?'找不到符合的角色':'還沒有其他角色卡'),el('p','',query?'試試其他角色名稱或心智圖名稱。':'在目前工作區建立其他角色卡後，就能從這裡選用。'));results.append(empty);}
      for(const {source,sourceMap} of entries){
        const progress=characterProgress(source,characterSourceCards(source,sourceMap,maps)),stage=characterStage(source,progress.level),name=stage.name||source.title||'未命名角色';
        const choice=el('button','cp-choice');choice.type='button';choice.setAttribute('aria-label',`套用角色：${name}，來源：${sourceMap.title||'未命名心智圖'}`);
        const portrait=el('div','cp-portrait');if(stage.src){const img=el('img');img.src=stage.src;img.alt='';img.loading='lazy';portrait.append(img);}else portrait.append(icon('person-badge'));
        const info=el('div','cp-info');info.append(el('strong','',name),el('span','cp-source',sourceMap.title||'未命名心智圖'),el('span','cp-meta',`${characterStages(source).length} 個成長階段 · Lv. ${progress.level}`));if(stage.description)info.append(el('p','cp-description',stage.description));
        choice.append(portrait,info,icon('arrow-right'));choice.addEventListener('click',()=>{if(active!==state||!valid())return close();if(!getMaps().some(map=>allCards(map.cards).includes(source)))return render();onApply(card,source);close();});results.append(choice);
      }
    }
    search.addEventListener('input',render);
    for(const type of ['keydown','copy','cut','paste'])dialog.addEventListener(type,event=>event.stopPropagation());
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();});
    dialog.addEventListener('close',()=>{dialog.remove();if(active===state)active=null;const target=opener?.isConnected?opener:document.querySelector(`.card[data-id="${CSS.escape(cardId)}"] [data-character-pick]`);target?.focus({preventScroll:true});});
    document.body.append(dialog);dialog.showModal();render();
  }
  return {open,refresh,destroy(){active?.dialog.remove();active=null;}};
}
