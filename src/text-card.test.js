import test from 'node:test';
import assert from 'node:assert/strict';
import { blankText, stepSize, textCss } from './text-card.js';

test('heading and body tools start in their paragraph style',()=>{
  assert.equal(blankText('c1','heading').style,'h1');
  assert.equal(blankText('c2','text').style,'body');
});
test('formatting turns into inline CSS',()=>{
  assert.deepEqual(textCss({style:'h1'}), {fontSize:'34px',fontWeight:'800',fontStyle:'',textDecoration:'',textAlign:'',color:''});
  const css=textCss({style:'body',bold:true,italic:true,underline:true,align:'center',color:'blue',fs:20});
  assert.equal(css.fontSize,'20px'); assert.equal(css.fontWeight,'700'); assert.equal(css.fontStyle,'italic');
  assert.equal(css.textDecoration,'underline'); assert.equal(css.textAlign,'center'); assert.equal(css.color,'#1a73e8');
});
test('size steps walk the size list and stop at its ends',()=>{
  assert.equal(stepSize({style:'body'},1),18);
  assert.equal(stepSize({style:'body'},-1),14);
  assert.equal(stepSize({style:'body',fs:64},1),64);
  assert.equal(stepSize({style:'body',fs:12},-1),12);
});
