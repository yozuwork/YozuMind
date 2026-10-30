export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function serializeMaps(maps, folders = []) {
  return JSON.stringify({ format: 'yozumind', version: 1, exportedAt: new Date().toISOString(), maps, ...(folders.length ? { folders } : {}) }, null, 2);
}

// Folders keep their ids so imported maps can stay inside them.
export function parseFolders(text) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  return (Array.isArray(data?.folders) ? data.folders : []).slice(0, 200)
    .filter(f => f && typeof f.id === 'string' && f.id.length <= 100 && typeof f.name === 'string' && f.name.length <= 200)
    .map(f => ({ id: f.id, name: f.name, open: f.open !== false, createdAt: Number.isFinite(f.createdAt) ? f.createdAt : Date.now(),
      ...(typeof f.parentId === 'string' && f.parentId.length <= 100 ? { parentId: f.parentId } : {}),
      ...(FOLDER_COLORS.includes(f.color) ? { color: f.color } : {}) }));
}

// Construct fresh objects and IDs so an import never overwrites existing maps.
const SIDES = ['top','right','bottom','left'];
const NOTE_COLORS = ['yellow','orange','red','pink','purple','blue','teal','green','gray','white'];
const FOLDER_COLORS = ['orange','red','pink','purple','blue','teal','green','gray'];
const IMAGE_SRC = /^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=]+$/;
function relationStyle(relation) {
  const result = {};
  if (['elbow','straight','curve'].includes(relation.type)) result.type = relation.type;
  if (['solid','dashed','thick'].includes(relation.style)) result.style = relation.style;
  if (['start','end','both','none'].includes(relation.arrow)) result.arrow = relation.arrow;
  if (typeof relation.color === 'string' && /^#[\da-f]{6}$/i.test(relation.color)) result.color = relation.color;
  if (typeof relation.label === 'string' && relation.label && relation.label.length <= 500) result.label = relation.label;
  if (SIDES.includes(relation.fromSide)) result.fromSide = relation.fromSide;
  if (SIDES.includes(relation.toSide)) result.toSide = relation.toSide;
  return result;
}

// Freehand strokes and shapes from the drawing tool; points are [x, y] pairs in world coordinates.
const SHAPE_TOOLS = ['rect','ellipse','line','arrow'];
const zOf = value => (Number.isFinite(value?.z) ? { z: value.z } : {});
const inkColor = c => c === 'ink' || (typeof c === 'string' && /^#[\da-f]{6}$/i.test(c));
function parseStrokes(list, newId) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 5000) throw new Error('塗鴉格式不正確或超過 5,000 筆。');
  let points = 0;
  return list.map(stroke => {
    if (!stroke || !['pen','highlighter',...SHAPE_TOOLS].includes(stroke.tool) || !inkColor(stroke.color) ||
        (SHAPE_TOOLS.includes(stroke.tool) && stroke.points?.length !== 2) ||
        !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 100 ||
        !Array.isArray(stroke.points) || !stroke.points.length) throw new Error('塗鴉格式不正確。');
    return { id: newId('s'), ...zOf(stroke), tool: stroke.tool, color: stroke.color, width: stroke.width, points: stroke.points.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || ++points > 500000) throw new Error('塗鴉點位格式不正確或過多。');
      return [point[0], point[1]];
    }), ...(['rect','ellipse'].includes(stroke.tool) && inkColor(stroke.fill) ? { fill: stroke.fill } : {}) };
  });
}

export function parseMaps(text, newId) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  let source;
  if (Array.isArray(data)) source = data;
  else if (data?.format === 'yozumind' && data.version === 1) source = data.maps;
  else if (data?.root) source = [data];
  else throw new Error('請選擇 YoZuMind JSON 存檔（版本 1）。');
  if (!Array.isArray(source) || !source.length || source.length > 100) {
    throw new Error('存檔需包含 1 至 100 張心智圖。');
  }
  let count = 0;
  let cardCount = 0;
  let ids;
  // New map ids are fixed up front so page cards and parent links inside the batch point at the copies.
  const mapIds = new Map();
  const newMapIds = source.map(map => { const id = newId('m'); if (typeof map?.id === 'string') mapIds.set(map.id, id); return id; });
  function node(value, depth = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.text !== 'string' || value.text.length > 10000 ||
        (value.children !== undefined && !Array.isArray(value.children)) ||
        depth > 100 || ++count > 10000) {
      throw new Error('節點格式不正確，或超過 10,000 個節點／100 層的限制。');
    }
    const result = { id: newId('n'), text: value.text, children: (value.children || []).map(child => node(child, depth + 1)) };
    if(typeof value.id === 'string') ids.set(value.id,result.id);
    if (typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color)) result.color = value.color;
    if (typeof value.collapsed === 'boolean') result.collapsed = value.collapsed;
    if (typeof value.page === 'string' && value.page.length <= 100) result.page = mapIds.get(value.page) || value.page;
    return result;
  }
  function cardText(value, max) {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > max) throw new Error('卡片文字格式不正確。');
    return value;
  }
  function card(value, nested) {
    if (!value || typeof value !== 'object' || !['note','link','todo','column','folder','image','board'].includes(value.type) ||
        (nested && ['column','folder'].includes(value.type)) || ++cardCount > 2000) {
      throw new Error('卡片格式不正確，或超過 2,000 張卡片。');
    }
    const result = { id: newId('c'), type: value.type };
    if (typeof value.id === 'string') ids.set(value.id, result.id);
    if (!nested) {
      if (![value.x, value.y].every(Number.isFinite)) throw new Error('卡片位置格式不正確。');
      Object.assign(result, { x: value.x, y: value.y }, zOf(value));
    }
    if (value.type === 'note') {
      result.text = cardText(value.text, 10000);
      if (NOTE_COLORS.includes(value.color)) result.color = value.color;
      if (value.cards !== undefined) {
        if (!Array.isArray(value.cards) || value.cards.length > 100) throw new Error('筆記內嵌內容格式不正確。');
        result.cards = value.cards.map(child => { const embed = card(child, true); if (embed.type !== 'board') throw new Error('筆記只能內嵌獨立頁面。'); return embed; });
      }
    }
    else if (value.type === 'board') {
      if (typeof value.mapId !== 'string' || value.mapId.length > 100) throw new Error('獨立頁面格式不正確。');
      Object.assign(result, { mapId: mapIds.get(value.mapId) || value.mapId, title: cardText(value.title, 1000) });
      if (Number.isFinite(value.w)) result.w = Math.min(1200, Math.max(100, value.w));
      if (Number.isFinite(value.h)) result.h = Math.min(1200, Math.max(90, value.h));
      if (value.frame === false) result.frame = false;
      if (FOLDER_COLORS.includes(value.color)) result.color = value.color;
    }
    else if (value.type === 'image') {
      if (typeof value.src !== 'string' || !IMAGE_SRC.test(value.src)) throw new Error('圖片卡片格式不正確。');
      result.src = value.src;
    }
    else if (value.type === 'link') Object.assign(result, { url: cardText(value.url, 2000), title: cardText(value.title, 1000) });
    else {
      const list = value.type === 'todo' ? value.items : value.cards;
      if (list !== undefined && (!Array.isArray(list) || list.length > 500)) throw new Error('卡片內容格式不正確或超過 500 項。');
      result.title = cardText(value.title, 1000);
      if (value.type === 'todo') result.items = (list || []).map(item => ({ id: newId('i'), text: cardText(item?.text, 1000), done: item?.done === true }));
      else {
        result.cards = (list || []).map(child => card(child, true));
        if (value.type === 'folder') result.open = value.open === true;
      }
    }
    if (value.collapsed === true && ['note','column'].includes(value.type)) result.collapsed = true;
    if (['note','column'].includes(value.type)) {
      if (Number.isFinite(value.w)) result.w = Math.min(1200, Math.max(140, value.w));
      if (Number.isFinite(value.h)) result.h = Math.min(1200, Math.max(48, value.h));
    }
    return result;
  }
  return source.map((map, i) => {
    if (!map || typeof map.title !== 'string' || map.title.length > 1000) throw new Error('心智圖名稱格式不正確。');
    ids = new Map();
    cardCount = 0;
    const root = map.root === null ? null : node(map.root);
    if (map.trees !== undefined && (!Array.isArray(map.trees) || map.trees.length > 100)) throw new Error('心智圖數量格式不正確或超過 100 個。');
    const trees = (map.trees || []).map(tree => {
      if (!tree || ![tree.x, tree.y].every(Number.isFinite)) throw new Error('心智圖位置格式不正確。');
      return { id: newId('t'), x: tree.x, y: tree.y, root: node(tree.root) };
    });
    if(map.images !== undefined && (!Array.isArray(map.images) || map.images.length > 100)) throw new Error('圖片格式不正確或超過 100 張。');
    const images = (map.images || []).map(image => {
      if(!image || typeof image.id !== 'string' || typeof image.src !== 'string' ||
         !IMAGE_SRC.test(image.src) ||
         ![image.x,image.y,image.w,image.h].every(Number.isFinite) || image.w<=0 || image.h<=0 || image.w>10000 || image.h>10000) throw new Error('圖片資料或尺寸格式不正確。');
      const id=newId('img');ids.set(image.id,id);
      return {id,src:image.src,x:image.x,y:image.y,w:image.w,h:image.h,...zOf(image)};
    });
    if(map.cards !== undefined && !Array.isArray(map.cards)) throw new Error('卡片格式不正確。');
    const cards = (map.cards || []).map(value => card(value, false));
    if(map.relations !== undefined && (!Array.isArray(map.relations) || map.relations.length > 10000)) throw new Error('關聯線格式不正確。');
    const relations = (map.relations || []).flatMap(relation => {
      if(!relation || typeof relation.from !== 'string' || typeof relation.to !== 'string') throw new Error('關聯線端點格式不正確。');
      const from=ids.get(relation.from),to=ids.get(relation.to);
      return from && to && from!==to ? [{id:newId('r'),from,to,...relationStyle(relation)}] : [];
    });
    return {
      id: newMapIds[i], title: map.title, icon: typeof map.icon === 'string' ? map.icon : 'diagram-3',
      ...(NOTE_COLORS.includes(map.color) ? { color: map.color } : {}),
      ...(typeof map.folderId === 'string' && map.folderId.length <= 100 ? { folderId: map.folderId } : {}),
      ...(typeof map.parentId === 'string' && map.parentId.length <= 100 ? { parentId: mapIds.get(map.parentId) || map.parentId } : {}),
      layout: map.layout === 'right' ? 'right' : 'down', root, trees, images, relations, cards, strokes: parseStrokes(map.strokes, newId),
      rootX: Number.isFinite(map.rootX) ? map.rootX : 0, rootY: Number.isFinite(map.rootY) ? map.rootY : 0,
      createdAt: Date.now() + i, updatedAt: Date.now(), rev: '',
    };
  });
}
