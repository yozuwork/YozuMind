// Builds export files (PDF, Word, HTML) from a rendered picture of the board plus its text outline.
// Pure functions: no DOM, so they run in tests too.
import { strToU8, zipSync } from 'fflate';

// Paper sizes in millimetres, portrait.
export const PAPERS = { A4:[210,297], A3:[297,420], A5:[148,210], Letter:[215.9,279.4] };
export const PAPER_NAMES = { A4:'A4', A3:'A3', A5:'A5', Letter:'Letter（美規）' };
const MARGIN_MM = 10;
const MM_PT = 72/25.4, MM_TWIP = 1440/25.4, TWIP_EMU = 635;

// Paper size {w,h} in mm; 'auto' turns the sheet to match the board's shape.
export function pageSize(paper, orient, boxW=1, boxH=1) {
  const [a,b]=PAPERS[paper]||PAPERS.A4;
  const landscape = orient==='landscape' || (orient!=='portrait' && boxW>boxH);
  return landscape ? {w:b,h:a,landscape} : {w:a,h:b,landscape};
}
// Largest w×h that keeps the aspect ratio inside maxW×maxH.
export function fitInto(w, h, maxW, maxH) { const k=Math.min(maxW/w, maxH/h); return {w:w*k, h:h*k}; }

// Every mind map tree as an indented list: [{text, depth}].
export function mapOutline(map) {
  const out=[], walk=(n,depth)=>{ if(!n) return; const text=String(n.text||'').replace(/\s+/g,' ').trim(); out.push({text:text||'（未命名）', depth}); (n.children||[]).forEach(c=>walk(c,depth+1)); };
  walk(map?.root,0); for(const t of map?.trees||[]) walk(t.root,0);
  return out;
}
export const safeFileName = name => (String(name||'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').trim() || '心智圖').slice(0,80);

const enc = new TextEncoder();
const xmlEscape = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
const htmlEscape = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const pdfText = s => '<FEFF'+[...String(s)].map(ch=>{ const c=ch.codePointAt(0); return c>0xffff ? [0xd800+((c-0x10000)>>10), 0xdc00+((c-0x10000)&0x3ff)] : [c]; }).flat().map(c=>c.toString(16).padStart(4,'0')).join('')+'>';
const num = n => (Math.round(n*100)/100).toString();

// One-page PDF holding a JPEG of the board, centred inside the margins.
export function buildPdf({jpeg, imgW, imgH, paper='A4', orient='auto', title=''}) {
  const page=pageSize(paper, orient, imgW, imgH), pw=page.w*MM_PT, ph=page.h*MM_PT, m=MARGIN_MM*MM_PT;
  const fit=fitInto(imgW, imgH, pw-2*m, ph-2*m), x=(pw-fit.w)/2, y=(ph-fit.h)/2;
  const draw=`q ${num(fit.w)} 0 0 ${num(fit.h)} ${num(x)} ${num(y)} cm /Im0 Do Q`;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream'],
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
    `<< /Title ${pdfText(title)} /Producer (YoZu Mind) >>`,
  ];
  const parts=[enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')], offsets=[]; let size=parts[0].length;
  const push=chunk=>{ const bytes=typeof chunk==='string'?enc.encode(chunk):chunk; parts.push(bytes); size+=bytes.length; };
  objects.forEach((body,i)=>{ offsets.push(size); push(`${i+1} 0 obj\n`); (Array.isArray(body)?body:[body]).forEach(push); push('\nendobj\n'); });
  const xref=size;
  push(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out=new Uint8Array(size); let at=0; for(const p of parts){ out.set(p,at); at+=p.length; }
  return out;
}

// Word document: title, the board picture fitted to the page, then the outline on the next page.
export function buildDocx({png, imgW, imgH, paper='A4', orient='auto', title='', outline=[]}) {
  const page=pageSize(paper, orient, imgW, imgH), pw=Math.round(page.w*MM_TWIP), ph=Math.round(page.h*MM_TWIP), m=Math.round(MARGIN_MM*MM_TWIP*1.27);
  const fit=fitInto(imgW, imgH, pw-2*m, ph-2*m-900), cx=Math.round(fit.w*TWIP_EMU), cy=Math.round(fit.h*TWIP_EMU);
  const run=(text,props='')=>`<w:r>${props?`<w:rPr>${props}</w:rPr>`:''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  const font='<w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:eastAsia="Microsoft JhengHei"/>';
  const para=(inner,pPr='')=>`<w:p>${pPr?`<w:pPr>${pPr}</w:pPr>`:''}${inner}</w:p>`;
  const picture=`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="心智圖"/>`+
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`+
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="map.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMap"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`+
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const body=[
    para(run(title||'心智圖',`${font}<w:b/><w:sz w:val="36"/>`),'<w:spacing w:after="200"/>'),
    para(picture,'<w:jc w:val="center"/>'),
  ];
  if(outline.length) {
    body.push(para('<w:r><w:br w:type="page"/></w:r>'), para(run('大綱',`${font}<w:b/><w:sz w:val="30"/>`),'<w:spacing w:after="160"/>'));
    for(const {text,depth} of outline) body.push(para(run((depth?'• ':'')+text,`${font}${depth?'':'<w:b/>'}<w:sz w:val="${depth?22:26}"/>`),`<w:spacing w:after="60"/><w:ind w:left="${depth*400}"/>`));
  }
  const sect=`<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"${page.landscape?' w:orient="landscape"':''}/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}${sect}</w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>YoZu Mind</dc:creator></cp:coreProperties>`),
    'word/document.xml': strToU8(doc),
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMap" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/map.png"/></Relationships>'),
    'word/media/map.png': png,
  });
}

// Nested <ul> lists from the flat [{text, depth}] outline.
export function outlineHtml(outline) {
  if(!outline.length) return '';
  let html='', depth=-1;
  for(const item of outline) {
    if(item.depth>depth) { while(depth<item.depth) { html+='<ul>'; depth++; if(depth<item.depth) html+='<li>'; } }
    else { html+='</li>'; while(depth>item.depth) { html+='</ul></li>'; depth--; } }
    html+=`<li>${htmlEscape(item.text)}`;
  }
  html+='</li>'; while(depth>0) { html+='</ul></li>'; depth--; }
  return html+'</ul>';
}

// Stand-alone web page sized for printing on the chosen paper: title, board picture, outline.
export function buildHtml({pngDataUrl, imgW, imgH, paper='A4', orient='auto', title='', outline=[]}) {
  const page=pageSize(paper, orient, imgW, imgH), contentH=page.h-2*MARGIN_MM-14;
  const list=outlineHtml(outline);
  const name=htmlEscape(title||'心智圖');
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
@page{size:${page.w}mm ${page.h}mm;margin:${MARGIN_MM}mm}
*{box-sizing:border-box}
body{margin:0;background:#e9eaee;color:#1f2329;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.6}
.sheet{width:${page.w}mm;min-height:${page.h}mm;margin:16px auto;padding:${MARGIN_MM}mm;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.12)}
h1{margin:0 0 4mm;font-size:20pt}
h2{margin:0 0 3mm;font-size:16pt}
.map{display:block;max-width:100%;max-height:${contentH}mm;margin:0 auto;object-fit:contain}
ul{margin:0;padding-left:1.4em}
body>.sheet>ul{padding-left:0;list-style:none}
body>.sheet>ul>li{font-weight:700;margin-top:2mm}
li li{font-weight:400}
@media (max-width:${Math.ceil(page.w*3.78)+32}px){.sheet{width:auto;min-height:0;margin:0;padding:16px}}
@media print{body{background:none}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.sheet+.sheet{break-before:page}}
</style>
</head>
<body>
<section class="sheet"><h1>${name}</h1><img class="map" src="${pngDataUrl}" width="${imgW}" height="${imgH}" alt="${name}"></section>
${outline.length?`<section class="sheet"><h2>大綱</h2>${list}</section>`:''}
</body>
</html>
`;
}
