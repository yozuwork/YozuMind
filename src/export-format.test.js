import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { buildDocx, buildHtml, buildPdf, fitInto, mapOutline, outlineHtml, pageSize, safeFileName } from './export-format.js';

const map={title:'災演', root:{text:'災演準備流程', children:[{text:'先去抓\n檔案', children:[{text:'C:\\', children:[]}]},{text:'', children:[]}]}, trees:[{root:{text:'另一棵', children:[]}}]};

test('paper defaults to A4 and auto orientation follows the board shape',()=>{
  assert.deepEqual(pageSize('A4','auto',100,200), {w:210,h:297,landscape:false});
  assert.deepEqual(pageSize('A4','auto',300,200), {w:297,h:210,landscape:true});
  assert.deepEqual(pageSize('A3','portrait',300,200), {w:297,h:420,landscape:false});
  assert.deepEqual(pageSize('nope','landscape'), {w:297,h:210,landscape:true});
  assert.deepEqual(fitInto(200,100,100,100), {w:100,h:50});
});

test('outline lists every tree with depth and tidy text',()=>{
  assert.deepEqual(mapOutline(map), [
    {text:'災演準備流程',depth:0},{text:'先去抓 檔案',depth:1},{text:'C:\\',depth:2},{text:'（未命名）',depth:1},{text:'另一棵',depth:0},
  ]);
  assert.equal(outlineHtml(mapOutline(map)), '<ul><li>災演準備流程<ul><li>先去抓 檔案<ul><li>C:\\</li></ul></li><li>（未命名）</li></ul></li><li>另一棵</li></ul>');
  assert.equal(outlineHtml([]), '');
});

test('file names drop characters Windows refuses',()=>{
  assert.equal(safeFileName('a/b:c*?'), 'a b c');
  assert.equal(safeFileName('  '), '心智圖');
});

test('PDF has a valid xref table pointing at each object',()=>{
  const jpeg=new Uint8Array([0xff,0xd8,1,2,3,0xff,0xd9]);
  const pdf=buildPdf({jpeg, imgW:300, imgH:200, paper:'A4', orient:'auto', title:'災演'});
  const text=Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.endsWith('%%EOF\n'));
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  const xref=Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(xref).startsWith('xref'));
  const offsets=[...text.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map(m=>Number(m[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((o,i)=>assert.ok(text.slice(o).startsWith(`${i+1} 0 obj`)));
  assert.match(text, /\/Title <FEFF707D6F14>/i);
});

test('Word file carries the picture, page size and outline',()=>{
  const png=new Uint8Array([137,80,78,71]);
  const files=unzipSync(buildDocx({png, imgW:400, imgH:300, paper:'A4', orient:'portrait', title:'災演 <test>', outline:mapOutline(map)}));
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml','_rels/.rels','docProps/core.xml','word/_rels/document.xml.rels','word/document.xml','word/media/map.png']);
  const doc=strFromU8(files['word/document.xml']);
  assert.match(doc, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.match(doc, /災演 &lt;test&gt;/);
  assert.match(doc, /r:embed="rIdMap"/);
  assert.match(doc, /• 先去抓 檔案/);
  assert.deepEqual([...files['word/media/map.png']], [...png]);
  const landscape=strFromU8(unzipSync(buildDocx({png, imgW:400, imgH:300, paper:'A4', orient:'auto', outline:[]}))['word/document.xml']);
  assert.match(landscape, /w:w="16838" w:h="11906" w:orient="landscape"/);
});

test('HTML page sets the print paper and escapes text',()=>{
  const html=buildHtml({pngDataUrl:'data:image/png;base64,AA', imgW:10, imgH:20, paper:'A5', orient:'auto', title:'<b>', outline:[{text:'a&b',depth:0}]});
  assert.match(html, /@page\{size:148mm 210mm/);
  assert.match(html, /<title>&lt;b&gt;<\/title>/);
  assert.match(html, /<li>a&amp;b<\/li>/);
  assert.doesNotMatch(buildHtml({pngDataUrl:'x', imgW:1, imgH:1, outline:[]}), /大綱/);
});
