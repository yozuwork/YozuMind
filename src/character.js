import {workspaceOf} from './workspaces.js';

export function allCards(cards=[]) {
  return cards.filter(card=>!card.inbox).flatMap(card=>[card,...allCards(card.cards)]);
}

export function characterSourceMaps(character,currentMap,maps=[]) {
  if(!currentMap)return [];
  const ids=new Set(character.todoMapIds??[currentMap.id]);
  return maps.filter(map=>workspaceOf(map)===workspaceOf(currentMap)&&ids.has(map.id));
}

export function characterSourceCards(character,currentMap,maps) {
  return characterSourceMaps(character,currentMap,maps).flatMap(map=>map.cards||[]);
}

export function todoEntries(cards=[],parents=[]) {
  return cards.filter(card=>!card.inbox).flatMap(card=>[
    ...(card.type==='todo'?[{todo:card,path:parents.filter(Boolean).join(' / ')}]:[]),
    ...todoEntries(card.cards,[...parents,card.title||(card.type==='folder'?'資料夾':card.type==='column'?'欄位':'')])
  ]);
}

export function characterProgress(character, cards) {
  const linked=new Set(character.todoIds||[]);
  const tasks=allCards(cards).filter(c=>c.type==='todo' && linked.has(c.id)).flatMap(c=>c.items||[]).filter(item=>!item.displayOnly);
  const completed=tasks.filter(item=>item.done).length, xp=completed*10;
  const stages=[...characterStages(character)].sort((a,b)=>a.level-b.level);
  let remaining=xp;
  for(let index=0;index<stages.length;index++) {
    const stage=stages[index],required=stageXp(stage),next=stages[index+1];
    const cost=next?(next.level-stage.level)*required:Infinity;
    if(remaining>=cost) {remaining-=cost;continue;}
    return {completed,total:tasks.length,xp,level:stage.level+Math.floor(remaining/required),progress:remaining%required,required};
  }
}

export function stageXp(stage) {
  return Number.isInteger(stage.xpPerLevel)&&stage.xpPerLevel>0&&stage.xpPerLevel<=1000000?stage.xpPerLevel:100;
}

export function characterStages(character) {
  return character.stages?.length ? character.stages : [{level:1,name:character.title||'',src:character.src||'',description:''}];
}

export function characterStage(character, level=1) {
  return [...characterStages(character)].sort((a,b)=>a.level-b.level).filter(s=>s.level<=level).at(-1) || characterStages(character)[0];
}

export function setCharacterImage(character, level, src) {
  if(character.stages?.length) characterStage(character,level).src=src||'';
  else if(src) character.src=src;
  else delete character.src;
}
