import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStage,validatePresets,applyStagePreset,sameStageContent} from './stage-presets.js';
const stage={level:5,xpPerLevel:250,name:'勇者',src:'data:image/png;base64,AA==',description:'進階階段'};
test('stage presets copy content and XP while preserving the target starting level',()=>{
  const preset={name:'常用',stage};const result=applyStagePreset({level:1},preset);
  assert.deepEqual(result,{...stage,level:1});result.name='修改';assert.equal(stage.name,'勇者');
  assert.equal(validateStage({level:1}).xpPerLevel,100);
});
test('invalid presets are rejected before persistence or import',()=>{
  for(const item of [{...stage,level:0},{...stage,xpPerLevel:0},{...stage,src:'javascript:alert(1)'},{...stage,name:5}]) assert.throws(()=>validateStage(item));
  assert.throws(()=>validatePresets([null]));assert.throws(()=>validatePresets({}));
  assert.equal(validatePresets([{name:'常用',stage,createdAt:1}])[0].stage.description,'進階階段');
});
test('applied presets match content independently of starting level and reset when edited',()=>{
  assert.equal(sameStageContent(stage,{...stage,level:1}),true);
  assert.equal(sameStageContent({level:1},{level:10,name:'',src:'',description:'',xpPerLevel:100}),true);
  for(const change of [{name:'新名稱'},{description:'新說明'},{src:''},{xpPerLevel:100}])assert.equal(sameStageContent(stage,{...stage,...change}),false);
  assert.equal(sameStageContent(stage,null),false);
});
