import test from 'node:test';
import assert from 'node:assert/strict';
import { setWireLine } from './wireframe.js';

test('an in-place edit rewrites only its own line or table cell',()=>{
  assert.equal(setWireLine('選項一\n選項二\n選項三',1,null,'新的'), '選項一\n新的\n選項三');
  assert.equal(setWireLine('a',2,null,'c'), 'a\n\nc');
  assert.equal(setWireLine('名稱 | 狀態\n首頁 | 進行中',1,1,'完成'), '名稱 | 狀態\n首頁 | 完成');
  assert.equal(setWireLine('a | b',0,1,'x|y\nz'), 'a | x/y z');
});
