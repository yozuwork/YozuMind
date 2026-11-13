import test from 'node:test';
import assert from 'node:assert/strict';
import {formatJsonNote} from './json-format.js';
test('formats nested JSON into a readable JSON code block',()=>{
  assert.equal(formatJsonNote('[{"name":"文件","meta":{"ok":true},"empty":[]}]'),'```json\n[\n  {\n    "name": "文件",\n    "meta": {\n      "ok": true\n    },\n    "empty": []\n  }\n]\n```');
});
test('preserves property order, duplicate keys, precise numbers and string escapes',()=>{
  const result=formatJsonNote('{"9":9007199254740993,"2":1.2300e+40,"9":-0,"s":"a\\n\\\"b,:{}"}');
  assert.ok(result.indexOf('"9"')<result.indexOf('"2"'));assert.ok(result.includes('9007199254740993'));assert.ok(result.includes('1.2300e+40'));assert.ok(result.includes('"9": -0'));assert.ok(result.includes('a\\n\\\"b,:{}'));
});
test('formatting existing JSON fences is idempotent and invalid inputs fail safely',()=>{
  const once=formatJsonNote('{"a":1}');assert.equal(formatJsonNote(once),once);
  for(const text of ['', '{"a":}', '文字 {"a":1}', '{"a":1,}', 'null'])assert.throws(()=>formatJsonNote(text));
  assert.throws(()=>formatJsonNote(JSON.stringify({text:'x'.repeat(10000)})),/上限/);
});
