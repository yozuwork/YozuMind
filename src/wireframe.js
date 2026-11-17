// Wireframe mode: hand-drawn, low-fidelity UI components that live on the canvas as `wire` cards.
// Each card stores {type:'wire', kind, text, w, h, on?}; `text` is the component's editable copy.

const bi = name => `<i class="bi bi-${name}" aria-hidden="true"></i>`;

// [kind, label, icon, group, width, height, default text, options]
//   multi: the text editor takes several lines; frame: sits under other objects and carries them when dragged;
//   state: has an on/off state (primary button, checked box…).
export const WIRE_KINDS = [
  ['music-card','影音卡片',bi('music-note-beamed'),'cards',340,490,'',{frame:true}],
  ['manga-card','漫畫卡片',bi('book'),'cards',340,510,'',{frame:true}],
  ['basic-card','基本卡片',bi('card-heading'),'cards',340,450,'',{frame:true}],
  ['window','視窗',bi('window'),'layout',720,460,'https://yozu.app',{frame:true}],
  ['navbar','導覽列',bi('menu-button-wide'),'layout',640,56,'YoZu\n首頁\n產品\n價格\n聯絡我們',{multi:true}],
  ['panel','容器',bi('square'),'layout',300,220,'卡片標題',{frame:true}],
  ['tabs','分頁',bi('segmented-nav'),'layout',440,220,'分頁一\n分頁二\n分頁三',{multi:true}],
  ['heading','標題',bi('type-h1'),'content',320,48,'清楚有力的大標題'],
  ['text','段落',bi('text-paragraph'),'content',300,88,'這是一段說明文字，雙擊就能修改。用它示意頁面上的描述、內文與補充資訊。',{multi:true}],
  ['image','圖片',bi('image'),'content',220,150,''],
  ['list','清單',bi('list-ul'),'content',220,132,'選項一\n選項二\n選項三\n選項四',{multi:true}],
  ['table','表格',bi('table'),'content',440,168,'名稱 | 狀態 | 日期\n首頁改版 | 進行中 | 11/12\n會員系統 | 已完成 | 11/08\n金流串接 | 待開始 | 11/20',{multi:true}],
  ['avatar','頭像',bi('person-circle'),'content',64,64,''],
  ['button','主要按鈕',bi('hand-index'),'buttons',128,44,'立即開始',{state:true}],
  ['btn-outline','外框按鈕',bi('square'),'buttons',128,44,'了解更多'],
  ['btn-text','文字按鈕',bi('link-45deg'),'buttons',112,36,'查看全部'],
  ['btn-pill','膠囊按鈕',bi('capsule'),'buttons',168,48,'免費試用'],
  ['btn-icon','圖示按鈕',bi('plus-circle'),'buttons',48,48,'+'],
  ['btn-group','按鈕群組',bi('distribute-horizontal'),'buttons',288,44,'日\n週\n月',{multi:true}],
  ['btn-split','下拉按鈕',bi('caret-down-square'),'buttons',160,44,'匯出'],
  ['input','輸入框',bi('input-cursor-text'),'form',260,44,'請輸入電子郵件'],
  ['search','搜尋列',bi('search'),'form',280,44,'搜尋…'],
  ['dropdown','下拉選單',bi('menu-down'),'form',240,44,'選擇一個項目'],
  ['checkbox','核取方塊',bi('check2-square'),'form',170,30,'記住我的登入',{state:true}],
  ['radio','單選按鈕',bi('record-circle'),'form',170,30,'每月方案',{state:true}],
  ['toggle','開關',bi('toggle-on'),'form',170,30,'接收通知',{state:true}],
  ['slider','滑桿',bi('sliders2'),'form',240,30,''],
];
export const WIRE_GROUPS = [['cards','卡片'],['layout','版面'],['content','內容'],['buttons','按鈕'],['form','表單']];
const INFO = Object.fromEntries(WIRE_KINDS.map(([kind,label,icon,group,w,h,text,opts={}])=>[kind,{kind,label,icon,group,w,h,text,...opts}]));
export const wireInfo = kind => INFO[kind] || INFO.panel;
export const isWireKind = kind => Object.hasOwn(INFO, kind);
export const isWireFrame = card => card?.type==='wire' && !!INFO[card.kind]?.frame;
// Rail buttons carry `data-tool="wire:<kind>"`.
export const wireTool = type => typeof type==='string' && type.startsWith('wire:') && isWireKind(type.slice(5)) ? type.slice(5) : null;

export function blankWire(kind, id) {
  const i=wireInfo(kind);
  return {id, type:'wire', kind:i.kind, text:i.text, w:i.w, h:i.h, ...(['checkbox','radio','toggle'].includes(i.kind)?{on:true}:{})};
}
export const WIRE_EDIT_HINT = {
  navbar:'每行一項，第一行是品牌名稱', tabs:'每行一個分頁，第一個為目前分頁', list:'每行一個選項，第一個會標示為選取',
  table:'每行一列，用 | 分隔欄位；第一列是表頭（可直接貼上試算表）', image:'圖片說明，留空時顯示尺寸', window:'網址或視窗標題',
  'btn-group':'每行一個按鈕，第一個為目前選取', 'btn-icon':'圖示文字或符號，例如 + ✕ ☰ ♥',
};

const el = (tag, cls, text) => { const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; };
const svg = (cls, body, fit='none') => { const s=el('span',cls); s.innerHTML=`<svg viewBox="0 0 24 24" preserveAspectRatio="${fit}" aria-hidden="true">${body}</svg>`; return s; };
// Text sits in its own clipping span so the wobbly outline around it is never cut off.
const clip = (cls, text) => { const n=el('span',cls); n.append(el('span','wf-clip',text)); return n; };
const lines = text => String(text||'').split('\n').map(s=>s.trim()).filter(Boolean);
const toggleBtn = (cls, label, on) => { const b=el('button',cls+' wf-box'); b.type='button'; b.dataset.wireToggle=''; b.title=label; b.setAttribute('aria-label',label); b.setAttribute('aria-pressed',String(!!on)); return b; };

// The component's drawing; it fills the card, so width and height come from the card.
export function renderWire(card) {
  const body=el('div',`wf-body wf-${card.kind}`+(card.on?' on':'')), t=card.text||'';
  switch(card.kind) {
    case 'music-card': case 'manga-card': case 'basic-card': {
      const box=el('div','wf-template '+card.kind);
      const add=(cls,text)=>box.append(el('div',cls,text));
      add('wf-cover',card.kind==='music-card'?'♫  Video / Image':card.kind==='manga-card'?'書籍封面':'Image cap');
      if(card.kind==='music-card') {
        add('wf-card-title','ハッピーシンセサイザ'); add('wf-card-heart','♡');
        add('wf-card-subtitle','Remix 中谷'); add('wf-card-tags','#エモい   #CHILL   #專注');
        add('wf-card-action','▣  超時空輝耀姬！'); add('wf-card-meta','● 作業用  ● BGM');
        add('wf-card-note','沒有備註'); add('wf-card-more','•••');
      } else if(card.kind==='manga-card') {
        add('wf-card-badge','追漫中'); add('wf-card-title','深夜心頻率');
        add('wf-card-subtitle','日常療癒・戀愛・成長'); add('wf-card-link','↗  實體書傳送門');
        add('wf-card-action','▷  閱讀漫畫'); add('wf-card-meta','已讀 1 話                 連載中・共 49 話');
        add('wf-card-progress','');
      } else {
        add('wf-card-title','卡片標題');
        add('wf-card-description','以下是一些簡短的範例文本，用於補充卡片標題並構成卡片的大部分內容。');
        add('wf-card-action','去某個地方');
      }
      body.append(box); break;
    }
    case 'window': {
      const frame=el('div','wf-window wf-box'), chrome=el('div','wf-chrome'), dots=el('span','wf-dots');
      dots.append(el('i','wf-box'),el('i','wf-box'),el('i','wf-box'));
      chrome.append(dots, clip('wf-url wf-box',t||'未命名視窗'), el('span','wf-menu'));
      frame.append(chrome, el('div','wf-rule'));
      body.append(frame); break;
    }
    case 'navbar': {
      const bar=el('div','wf-nav wf-box'), [brand='Logo',...links]=lines(t), logo=el('span','wf-brand');
      logo.append(el('i','wf-logo wf-box'), el('b','',brand));
      const nav=el('span','wf-links'); links.forEach((link,i)=>nav.append(i===links.length-1&&links.length>1 ? clip('wf-cta wf-box',link) : el('span','wf-clip',link)));
      bar.append(logo,nav); body.append(bar); break;
    }
    case 'panel': {
      const box=el('div','wf-panel wf-box');
      if(t.trim()) box.append(el('div','wf-panel-head',t.trim()), el('div','wf-rule'));
      body.append(box); break;
    }
    case 'tabs': {
      const row=el('div','wf-tabrow'), list=lines(t);
      (list.length?list:['分頁']).forEach((name,i)=>row.append(clip('wf-tab wf-box'+(i===0?' on':''),name)));
      body.append(row, el('div','wf-tabpanel wf-box')); break;
    }
    case 'heading': body.append(el('div','wf-heading',t||'標題')); break;
    case 'text': body.append(el('p','wf-text',t)); break;
    case 'image': {
      const box=el('div','wf-image wf-box');
      box.append(svg('wf-ink wf-cross','<path d="M0 0L24 24M24 0L0 24"/>'), el('span','wf-cap',t.trim()||`${Math.round(card.w)} × ${Math.round(card.h)}`));
      body.append(box); break;
    }
    case 'list': {
      const box=el('div','wf-list wf-box'), rows=el('div','wf-rows');
      lines(t).forEach((item,i)=>rows.append(el('div','wf-row wf-clip'+(i===0?' on':''),item)));
      const bar=el('div','wf-scroll'); bar.append(el('i','wf-thumb wf-box'));
      box.append(rows,bar); body.append(box); break;
    }
    case 'table': {
      const rows=lines(t).map(r=>r.split(/\t|\|/).map(c=>c.trim())), cols=Math.max(1,...rows.map(r=>r.length));
      const grid=`grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${Math.max(1,rows.length)},minmax(0,1fr))`;
      const ink=el('div','wf-grid wf-gridlines'), text=el('div','wf-grid wf-cells');
      ink.style.cssText=text.style.cssText=grid;
      (rows.length?rows:[['']]).forEach((r,ri)=>{ for(let c=0;c<cols;c++) {
        ink.append(el('i',ri===0?'head':''));
        text.append(el('span','wf-clip'+(ri===0?' head':''),r[c]??''));
      }});
      const box=el('div','wf-table wf-box'); box.append(ink,text); body.append(box); break;
    }
    case 'avatar': body.append(svg('wf-ink wf-avatar','<circle cx="12" cy="12" r="11"/><circle cx="12" cy="9.5" r="3.6"/><path d="M5.2 19.4c1.4-3 4-4.4 6.8-4.4s5.4 1.4 6.8 4.4"/>','xMidYMid meet')); break;
    case 'button': body.append(clip('wf-button wf-box',t||'按鈕')); break;
    case 'btn-outline': body.append(clip('wf-button wf-btn-outline wf-box',t||'按鈕')); break;
    case 'btn-text': body.append(el('span','wf-btn-text wf-clip',t||'文字按鈕')); break;
    case 'btn-pill': {
      const pill=clip('wf-button wf-btn-pill wf-box',t||'按鈕');
      pill.append(svg('wf-ink wf-arrow','<path d="M4 12h15M13.5 6.5L19 12l-5.5 5.5"/>','xMidYMid meet'));
      body.append(pill); break;
    }
    case 'btn-icon': body.append(clip('wf-button wf-btn-icon wf-box',t.trim()||'+')); break;
    case 'btn-group': {
      const row=el('div','wf-btn-group'), list=lines(t);
      (list.length?list:['按鈕']).forEach((name,i)=>row.append(clip('wf-seg wf-box'+(i===0?' on':''),name)));
      body.append(row); break;
    }
    case 'btn-split': {
      const box=el('div','wf-button wf-btn-split wf-box'), arrow=el('span','wf-dd');
      arrow.append(svg('wf-ink wf-caret-down','<path d="M6 9.5l6 6 6-6"/>'));
      box.append(el('span','wf-value wf-clip',t||'按鈕'), arrow); body.append(box); break;
    }
    case 'input': { const box=el('div','wf-input wf-box'); box.append(el('i','wf-caret'), el('span','wf-ph wf-clip',t)); body.append(box); break; }
    case 'search': { const box=el('div','wf-input wf-search wf-box'); box.append(svg('wf-ink wf-glass','<circle cx="10" cy="10" r="6.5"/><path d="M15 15l5.5 5.5"/>'), el('span','wf-ph wf-clip',t)); body.append(box); break; }
    case 'dropdown': {
      const box=el('div','wf-input wf-dropdown wf-box'), arrow=el('span','wf-dd');
      arrow.append(svg('wf-ink wf-caret-down','<path d="M6 9.5l6 6 6-6"/>'));
      box.append(el('span','wf-value wf-clip',t), arrow); body.append(box); break;
    }
    case 'checkbox': case 'radio': case 'toggle': {
      const label=t||({checkbox:'核取方塊',radio:'單選按鈕',toggle:'開關'})[card.kind];
      const mark=toggleBtn('wf-mark wf-'+card.kind+'-mark',card.on?'取消勾選':'勾選',card.on);
      if(card.kind==='checkbox') mark.append(svg('wf-ink wf-tick','<path pathLength="1" d="M5 12.5l4.5 4.5L19.5 6.5"/>'));
      else mark.append(el('i','wf-knob wf-box'));
      body.append(mark, el('span','wf-label wf-clip',label)); break;
    }
    case 'slider': {
      const track=el('div','wf-track');
      track.append(el('i','wf-rule'), el('i','wf-fill'), el('i','wf-knob wf-box'));
      body.append(track); break;
    }
    default: body.append(el('div','wf-panel wf-box'));
  }
  // Stable part keys keep edits and positions through redraws and persistence.
  const selector='.wf-template > div,.wf-clip,.wf-heading,.wf-text,.wf-panel-head,.wf-brand b,.wf-cap,.wf-label,.wf-mark,.wf-avatar,.wf-track,.wf-logo,.wf-menu,.wf-dots,.wf-cells > span';
  [...body.querySelectorAll(selector)].filter(n=>!n.querySelector(selector)).forEach((node,index)=>{
    const key=String(index), part=card.parts?.[key];
    node.dataset.wirePart=key;
    node.title='拖曳移動 · 點兩下編輯';
    if(part?.text!==undefined) node.textContent=part.text;
    if(part) node.style.translate=`${part.x||0}px ${part.y||0}px`;
  });
  return body;
}

// One shared set of SVG filters gives every stroke a slightly wobbly, hand-inked edge.
export function installWireFilters() {
  if(document.getElementById('wf-filters')) return;
  const host=document.createElementNS('http://www.w3.org/2000/svg','svg');
  host.id='wf-filters'; host.setAttribute('aria-hidden','true'); host.setAttribute('width','0'); host.setAttribute('height','0');
  host.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
  const filter=(id,seed,freq,scale)=>`<filter id="${id}" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  host.innerHTML=filter('wf-rough',3,0.03,2.6)+filter('wf-rough-2',11,0.045,3.4);
  document.body.append(host);
}

// Remembers which tool set the rail shows; switching modes never changes the page itself.
const MODE_KEY='yozumind.railMode';
export function setupRailMode({board, rail, toast}) {
  const buttons=[...rail.querySelectorAll('[data-rail-mode-btn]')];
  let mode='map'; try { if(localStorage.getItem(MODE_KEY)==='wire') mode='wire'; } catch {}
  const apply=(next, announce)=>{
    mode=next; board.dataset.railMode=mode; rail.dataset.mode=mode;
    for(const b of buttons) { const on=b.dataset.railModeBtn===mode; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); }
    try { localStorage.setItem(MODE_KEY,mode); } catch {}
    if(announce) { rail.scrollTop=0; toast?.(mode==='wire'?'線框模式：把元件拖到畫布，雙擊修改文字':'心智圖模式'); }
  };
  const onClick=e=>{ const b=e.target.closest('[data-rail-mode-btn]'); if(b && b.dataset.railModeBtn!==mode) apply(b.dataset.railModeBtn,true); };
  rail.addEventListener('click',onClick);
  apply(mode,false);
  return { mode:()=>mode, destroy() { rail.removeEventListener('click',onClick); } };
}
