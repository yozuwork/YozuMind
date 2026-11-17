// Plain text on the canvas (no card frame), formatted like a word processor: paragraph style, bold, italic,
// underline, alignment, size and colour. Stored as {type:'text', text, style, fs?, color?, bold?, italic?, underline?, align?, w?}.

// [key, label, font size px, weight]
export const TEXT_STYLES = [['h1','標題 1',34,800],['h2','標題 2',26,700],['h3','標題 3',20,700],['body','內文',16,400]];
const STYLE = Object.fromEntries(TEXT_STYLES.map(([key,label,fs,weight])=>[key,{key,label,fs,weight}]));
export const textStyle = key => STYLE[key] || STYLE.body;
// Rail tools that create text cards, with the paragraph style each one starts in.
export const TEXT_TOOLS = { heading:'h1', text:'body' };
export const isTextTool = type => Object.hasOwn(TEXT_TOOLS, type);

// Word-like colour palette; "default" follows the theme's ink colour.
export const TEXT_COLORS = {
  red:['#d9363e','紅色'], orange:['#e8710a','橘色'], amber:['#b8860b','金黃'], green:['#1e8e3e','綠色'],
  teal:['#00897b','青綠'], blue:['#1a73e8','藍色'], purple:['#8e24aa','紫色'], gray:['#6b7280','灰色'],
};
export const TEXT_SIZES = [12,14,16,18,20,24,28,32,40,48,64];
export const ALIGNS = ['left','center','right'];

export function blankText(id, tool='text') { return {id, type:'text', text:'', style:TEXT_TOOLS[tool]||'body', w:tool==='heading'?360:280}; }

// Inline CSS for a text card; the style's size applies unless the size was set by hand.
export function textCss(card) {
  const s=textStyle(card.style), color=TEXT_COLORS[card.color]?.[0];
  return {
    fontSize:(card.fs||s.fs)+'px', fontWeight:String(card.bold ? (s.weight>=700?900:700) : s.weight),
    fontStyle:card.italic?'italic':'', textDecoration:card.underline?'underline':'',
    textAlign:ALIGNS.includes(card.align)?card.align:'', color:color||'',
  };
}
// One step up or down the size list from the current size.
export function stepSize(card, dir) {
  const now=card.fs||textStyle(card.style).fs;
  const next = dir>0 ? TEXT_SIZES.find(s=>s>now) : [...TEXT_SIZES].reverse().find(s=>s<now);
  return next ?? now;
}

// Validates an imported text card's fields onto `result`.
export function readTextCard(value, result) {
  if (value.text !== undefined && (typeof value.text !== 'string' || value.text.length > 20000)) throw new Error('文字卡片格式不正確。');
  result.text = value.text || '';
  result.style = STYLE[value.style] ? value.style : 'body';
  if (Number.isFinite(value.fs)) result.fs = Math.min(200, Math.max(8, Math.round(value.fs)));
  if (TEXT_COLORS[value.color]) result.color = value.color;
  for (const k of ['bold','italic','underline']) if (value[k] === true) result[k] = true;
  if (ALIGNS.includes(value.align) && value.align !== 'left') result.align = value.align;
  if (Number.isFinite(value.w)) result.w = Math.min(4000, Math.max(40, value.w));
  if (Number.isFinite(value.h)) result.h = Math.min(4000, Math.max(20, value.h));
  return result;
}
