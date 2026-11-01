import test from 'node:test';
import assert from 'node:assert/strict';
import {characterProgress,characterStages,characterStage,setCharacterImage,characterSourceMaps,characterSourceCards,todoEntries} from './character.js';

test('linked nested todos grant XP, exclude displays and unrelated cards, and undo completion',()=>{
  const items=Array.from({length:10},()=>({done:true}));
  const cards=[{id:'column',cards:[{id:'todo',type:'todo',items:[...items,{done:true,displayOnly:true}]}]},{id:'other',type:'todo',items:[{done:true}]}];
  const character={todoIds:['todo','todo','deleted']};
  assert.deepEqual(characterProgress(character,cards),{completed:10,total:10,xp:100,level:2,progress:0,required:100});
  items[0].done=false;
  assert.deepEqual(characterProgress(character,cards),{completed:9,total:10,xp:90,level:1,progress:90,required:100});
  assert.equal(characterProgress({todoIds:[]},cards).xp,0);
});

test('each stage uses its own XP rate, carries excess XP and recalculates on undo',()=>{
  const character={todoIds:['todo'],stages:[{level:1,xpPerLevel:50},{level:3,xpPerLevel:200},{level:4,xpPerLevel:30}]};
  function progress(completed) {const result=characterProgress(character,[{id:'todo',type:'todo',items:Array.from({length:completed},()=>({done:true}))}]);return [result.level,result.progress,result.required];}
  assert.deepEqual(progress(9),[2,40,50]);
  assert.deepEqual(progress(10),[3,0,200]);
  assert.deepEqual(progress(29),[3,190,200]);
  assert.deepEqual(progress(30),[4,0,30]);
  assert.deepEqual(progress(34),[5,10,30]);
  assert.deepEqual(progress(29),[3,190,200]);
  character.stages[0].xpPerLevel=15;
  assert.deepEqual(progress(2),[2,5,15]);
});

test('stages without custom XP retain the original 100 XP level thresholds',()=>{
  const character={todoIds:['todo'],stages:[{level:1},{level:2}]};
  const result=characterProgress(character,[{id:'todo',type:'todo',items:Array.from({length:12},()=>({done:true}))}]);
  assert.deepEqual([result.xp,result.level,result.progress,result.required],[120,2,20,100]);
});

test('legacy characters have one stage and stage transitions follow levels in both directions',()=>{
  const legacy={title:'初始',src:'old'};
  assert.deepEqual(characterStages(legacy),[{level:1,name:'初始',src:'old',description:''}]);
  const character={stages:[{level:1,name:'新手',src:'a'},{level:3,name:'勇者',src:'b'},{level:10,name:'傳說',src:'c'}]};
  assert.equal(characterStage(character,2).name,'新手');
  assert.equal(characterStage(character,3).name,'勇者');
  assert.equal(characterStage(character,20).name,'傳說');
  assert.equal(characterStage(character,1).name,'新手');
  setCharacterImage(character,3,'new');
  assert.equal(character.stages[1].src,'new');
  assert.equal(character.stages[0].src,'a');
  setCharacterImage(character,3,'');
  assert.equal(character.stages[1].src,'');
});
test('selected source maps combine XP, retain nested todo paths and stay inside the workspace',()=>{
  const maps=[{id:'home',cards:[{id:'local',type:'todo',items:[{done:true}]}]},{id:'other',cards:[{type:'folder',title:'收藏',cards:[{id:'game',type:'todo',items:[{done:false},{done:true},{done:true,displayOnly:true}]}]}]},{id:'private',workspaceId:'another-workspace',cards:[{id:'hidden',type:'todo',items:[{done:true}]}]}];
  const character={todoIds:['local','game','hidden'],todoMapIds:['home','other','private']};
  assert.deepEqual(characterSourceMaps(character,maps[0],maps).map(map=>map.id),['home','other']);
  const stats=()=>characterProgress(character,characterSourceCards(character,maps[0],maps));assert.equal(stats().xp,20);assert.equal(stats().total,3);
  maps[1].cards[0].cards[0].items[0].done=true;assert.equal(stats().xp,30);
  character.todoMapIds=['home'];assert.equal(stats().xp,10);character.todoMapIds=[];assert.equal(stats().total,0);
  assert.equal(characterProgress({todoIds:['local','game']},characterSourceCards({},maps[0],maps)).xp,10);
  assert.equal(todoEntries(maps[1].cards)[0].path,'收藏');
});
