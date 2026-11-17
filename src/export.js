// Export the current board as PDF, Word or HTML from the share popover. Paper defaults to A4.
import { PAPERS, PAPER_NAMES, buildDocx, buildHtml, buildPdf, mapOutline, pageSize, safeFileName } from './export-format.js';

const PREFS_KEY='yozumind.exportPrefs';
const FORMATS=[['pdf','PDF','file-earmark-pdf'],['docx','Word','file-earmark-word'],['html','HTML','filetype-html']];
// Editing aids that never belong in an exported picture.
const SKIP='.node-add,.node-grip,.relation-ui,.nodebar,.group-layer,.card-actions,.image-handle,.layer-outline';
const PAD=32, DPI=220;

function readPrefs() {
  const base={format:'pdf', paper:'A4', orient:'auto', outline:true};
  try { const p=JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'); return {...base, ...p, paper:PAPERS[p.paper]?p.paper:'A4'}; } catch { return base; }
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {} }

function download(blob, name) {
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
const blobToDataUrl = blob => new Promise((ok,fail)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>fail(r.error); r.readAsDataURL(blob); });

// Fonts travel inside the picture, or text measured in the page's fonts would wrap differently.
// Only the families the board uses, and only the unicode-range slices covering its characters, are embedded.
const fontData=new Map();
const fetchData=url=>{ if(!fontData.has(url)) fontData.set(url, fetch(url).then(r=>r.ok?r.blob():Promise.reject(new Error(r.status))).then(blobToDataUrl).catch(()=>null)); return fontData.get(url); };
let googleCss=null;
const inRange=(range, codes)=>range.split(',').some(part=>{
  const m=part.trim().replace(/^U\+/i,'').match(/^([0-9a-f?]+)(?:-([0-9a-f]+))?$/i); if(!m) return true;
  const lo=parseInt(m[1].replace(/\?/g,'0'),16), hi=parseInt((m[2]||m[1]).replace(/\?/g,'f'),16);
  for(const c of codes) if(c>=lo&&c<=hi) return true; return false;
});
async function fontCss(world) {
  const families=new Set(), text=world.textContent||'';
  for(const el of [world,...world.querySelectorAll('*')]) for(const f of getComputedStyle(el).fontFamily.split(',')) families.add(f.trim().replace(/^["']|["']$/g,'').toLowerCase());
  const codes=new Set([...text].map(ch=>ch.codePointAt(0)));
  const rules=[];
  try {
    const {default:url}=await import('bootstrap-icons/font/fonts/bootstrap-icons.woff2?url');
    const data=await fetchData(url); if(data) rules.push(`@font-face{font-family:"bootstrap-icons";src:url(${data}) format("woff2");font-display:block}`);
  } catch {}
  const link=document.querySelector('link[href*="fonts.googleapis.com/css"]');
  if(link) {
    googleCss??=fetch(link.href).then(r=>r.text()).catch(()=>'');
    const faces=((await googleCss).match(/@font-face\s*{[^}]*}/g)||[]).filter(face=>{
      const family=(face.match(/font-family:\s*['"]?([^;'"]+)/)||[])[1]?.toLowerCase(), range=(face.match(/unicode-range:\s*([^;]+)/)||[])[1];
      return family && families.has(family) && (!range || inRange(range, codes));
    });
    rules.push(...await Promise.all(faces.map(async face=>{
      const url=(face.match(/url\((['"]?)([^)'"]+)\1\)/)||[])[2], data=url&&await fetchData(url);
      return data ? face.replace(url, data) : '';
    })));
  }
  return rules.filter(Boolean).join('\n');
}
// SVG shapes are styled from the stylesheet (fill:none…); copy that onto each shape so the picture keeps it.
const SVG_PROPS=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','opacity','visibility','display'];
function inlineSvgStyles(world) {
  const saved=[];
  for(const el of world.querySelectorAll('svg *')) {
    if(!(el instanceof SVGGraphicsElement)) continue;
    const cs=getComputedStyle(el); saved.push([el, el.getAttribute('style')]);
    for(const p of SVG_PROPS) el.style.setProperty(p, cs.getPropertyValue(p));
  }
  return ()=>{ for(const [el,style] of saved) style===null ? el.removeAttribute('style') : el.setAttribute('style',style); };
}

// Draws everything on the board (nodes, lines, cards, images, drawings) onto a canvas, cropped to its contents.
async function renderBoard({world, canvas, box, paper, orient}) {
  const {toCanvas}=await import('html-to-image');
  const w=Math.ceil(box.x1-box.x0)+PAD*2, h=Math.ceil(box.y1-box.y0)+PAD*2;
  const page=pageSize(paper, orient, w, h), longPx=Math.max(page.w,page.h)/25.4*DPI;
  const ratio=Math.max(.25, Math.min(3, longPx/Math.max(w,h), 8000/Math.max(w,h)));
  let background=getComputedStyle(canvas).backgroundColor;
  if(!background || background==='rgba(0, 0, 0, 0)') background='#ffffff';
  const fonts=await fontCss(world);
  world.classList.add('exporting');
  const restore=inlineSvgStyles(world);
  try {
    return await toCanvas(world, {
      width:w, height:h, pixelRatio:ratio, backgroundColor:background, cacheBust:false,
      fontEmbedCSS:fonts,
      style:{transform:`translate(${PAD-box.x0}px, ${PAD-box.y0}px)`, transformOrigin:'0 0', left:'0', top:'0'},
      filter:node=>!(node instanceof Element && node.matches(SKIP)),
    });
  } finally { restore(); world.classList.remove('exporting'); }
}

export function setupExport({pop, world, canvas, getMap, getBox, toast}) {
  const prefs=readPrefs();
  const section=document.createElement('div');
  section.className='export-box';
  section.innerHTML=`<h3>匯出</h3>
    <div class="export-formats" role="radiogroup" aria-label="匯出格式">${FORMATS.map(([k,name,icon])=>`<button type="button" role="radio" data-export-format="${k}"><i class="bi bi-${icon}" aria-hidden="true"></i>${name}</button>`).join('')}</div>
    <div class="export-row">
      <label>紙張<select data-export="paper">${Object.keys(PAPERS).map(k=>`<option value="${k}">${PAPER_NAMES[k]}</option>`).join('')}</select></label>
      <label>方向<select data-export="orient"><option value="auto">自動</option><option value="portrait">直向</option><option value="landscape">橫向</option></select></label>
    </div>
    <label class="export-check"><input type="checkbox" data-export="outline">附上文字大綱<span class="export-note">（Word、HTML）</span></label>
    <button type="button" class="btn btn-primary export-go"><i class="bi bi-download" aria-hidden="true"></i><span>匯出 PDF</span></button>`;
  pop.append(section);
  const paperSel=section.querySelector('[data-export="paper"]'), orientSel=section.querySelector('[data-export="orient"]');
  const outlineBox=section.querySelector('[data-export="outline"]'), go=section.querySelector('.export-go');
  const sync=()=>{
    for(const b of section.querySelectorAll('[data-export-format]')) { const on=b.dataset.exportFormat===prefs.format; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); }
    paperSel.value=prefs.paper; orientSel.value=prefs.orient; outlineBox.checked=prefs.outline;
    outlineBox.closest('label').classList.toggle('off', prefs.format==='pdf');
    go.querySelector('span').textContent='匯出 '+FORMATS.find(f=>f[0]===prefs.format)[1];
  };
  sync();
  section.addEventListener('click',e=>{ const b=e.target.closest('[data-export-format]'); if(!b) return; prefs.format=b.dataset.exportFormat; savePrefs(prefs); sync(); });
  section.addEventListener('change',()=>{ prefs.paper=paperSel.value; prefs.orient=orientSel.value; prefs.outline=outlineBox.checked; savePrefs(prefs); sync(); });

  let busy=false;
  go.addEventListener('click', async()=>{
    const map=getMap(), box=getBox();
    if(!map || !Number.isFinite(box?.x0)) { toast('畫布上還沒有內容可以匯出'); return; }
    if(busy) return; busy=true; go.disabled=true; go.querySelector('span').textContent='匯出中…';
    try {
      const {format, paper, orient}=prefs, title=map.title||'未命名心智圖', name=safeFileName(title);
      const outline=prefs.outline ? mapOutline(map) : [];
      const pic=await renderBoard({world, canvas, box, paper, orient});
      const imgW=pic.width, imgH=pic.height;
      if(format==='pdf') {
        const jpeg=new Uint8Array(await (await new Promise(ok=>pic.toBlob(ok,'image/jpeg',.92))).arrayBuffer());
        download(new Blob([buildPdf({jpeg, imgW, imgH, paper, orient, title})],{type:'application/pdf'}), name+'.pdf');
      } else if(format==='docx') {
        const png=new Uint8Array(await (await new Promise(ok=>pic.toBlob(ok,'image/png'))).arrayBuffer());
        download(new Blob([buildDocx({png, imgW, imgH, paper, orient, title, outline})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), name+'.docx');
      } else {
        download(new Blob([buildHtml({pngDataUrl:pic.toDataURL('image/png'), imgW, imgH, paper, orient, title, outline})],{type:'text/html;charset=utf-8'}), name+'.html');
      }
      toast(`已匯出 ${PAPER_NAMES[paper]} ${FORMATS.find(f=>f[0]===format)[1]}`);
    } catch(error) {
      console.error(error); toast('匯出失敗，請再試一次');
    } finally { busy=false; go.disabled=false; sync(); }
  });
  return { destroy() { section.remove(); } };
}
