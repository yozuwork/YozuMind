import { validDailyDate } from './daily.js';
import {inboxMeta} from './inbox-state.js';

export const MAX_FILE_BYTES = 300 * 1024 * 1024;

export function serializeMaps(maps, folders = [], files = {}) {
  return JSON.stringify({ format: 'yozumind', version: 1, exportedAt: new Date().toISOString(), maps, ...(folders.length ? { folders } : {}), ...(Object.keys(files).length ? { files } : {}) }, null, 2);
}

// Attached file bodies keyed by fileId, as data URLs.
export function parseAttachments(text) {
  const files = JSON.parse(text.replace(/^\uFEFF/, ''))?.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return [];
  return Object.entries(files).filter(([id, url]) => /^f-[\w]{1,40}$/.test(id) && typeof url === 'string' && url.startsWith('data:')).slice(0, 20000);
}

// Folders keep their ids so imported maps can stay inside them.
export function parseFolders(text) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  return (Array.isArray(data?.folders) ? data.folders : []).slice(0, 20000)
    .filter(f => f && typeof f.id === 'string' && f.id.length <= 100 && typeof f.name === 'string' && f.name.length <= 200)
    .map(f => ({ id: f.id, name: f.name, open: f.open !== false, createdAt: Number.isFinite(f.createdAt) ? f.createdAt : Date.now(),
      ...(typeof f.workspaceId==='string'&&f.workspaceId.length<=100?{workspaceId:f.workspaceId}:{}),
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
function parseStrokes(list, newId,meta=()=>({})) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 5000) throw new Error('塗鴉格式不正確或超過 5,000 筆。');
  let points = 0;
  return list.map(stroke => {
    if (!stroke || !['pen','highlighter',...SHAPE_TOOLS].includes(stroke.tool) || !inkColor(stroke.color) ||
        (SHAPE_TOOLS.includes(stroke.tool) && stroke.points?.length !== 2) ||
        !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 100 ||
        !Array.isArray(stroke.points) || !stroke.points.length) throw new Error('塗鴉格式不正確。');
    return { id: newId('s'), ...zOf(stroke),...meta(stroke), tool: stroke.tool, color: stroke.color, width: stroke.width, points: stroke.points.map(point => {
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
  if (!Array.isArray(source) || !source.length || source.length > 10000) {
    throw new Error('存檔需包含 1 至 10,000 張心智圖。');
  }
  let count = 0;
  let cardCount = 0;
  let ids;
  let inboxIds=new Map();const readInbox=value=>inboxMeta(value,inboxIds,newId);
  const todoCopies=new Map(),localCopies=new Map();let sourceWorkspace='';
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
    if (value.note === true) result.note = true;
    if (typeof value.titled === 'boolean') result.titled = value.titled;
    else if (value.column === true) { result.column = true; if (typeof value.colCard === 'string') result.colCard = value.colCard; }
    if (value.off && Number.isFinite(value.off.x) && Number.isFinite(value.off.y)) result.off = { x: value.off.x, y: value.off.y };
    if (Number.isFinite(value.w)) result.w = Math.min(900, Math.max(60, value.w));
    if (Number.isFinite(value.h)) result.h = Math.min(900, Math.max(24, value.h));
    if (typeof value.edgeLabel === 'string' && value.edgeLabel.trim() && value.edgeLabel.length <= 500) result.edgeLabel = value.edgeLabel;
    if (typeof value.page === 'string' && value.page.length <= 100) result.page = mapIds.get(value.page) || value.page;
    return result;
  }
  // Cards and images pinned to a node keep the pin when that node is part of the same import.
  function anchorOf(value) {
    const a = value.anchor, node = a && typeof a.node === 'string' && ids.get(a.node);
    return node && Number.isFinite(a.dx) && Number.isFinite(a.dy) ? { anchor: { node, dx: a.dx, dy: a.dy } } : {};
  }
  function cardText(value, max) {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > max) throw new Error('卡片文字格式不正確。');
    return value;
  }
  function card(value, nested) {
    if (!value || typeof value !== 'object' || !['note','link','todo','column','folder','image','board','file','character'].includes(value.type) ||
        (nested && ['column','folder'].includes(value.type)) || ++cardCount > 2000) {
      throw new Error('卡片格式不正確，或超過 2,000 張卡片。');
    }
    const result = { id: newId('c'), type: value.type,...readInbox(value) };
    if (typeof value.id === 'string') ids.set(value.id, result.id);
    if(value.type==='todo'&&typeof value.id==='string'){let copies=todoCopies.get(sourceWorkspace);if(!copies){copies=new Map();todoCopies.set(sourceWorkspace,copies);}copies.set(value.id,result.id);}
    if(['note','character'].includes(value.type)&&value.noteIds!==undefined){
      if(!Array.isArray(value.noteIds)||value.noteIds.length>100||value.noteIds.some(id=>typeof id!=='string'||!id||id.length>100))throw new Error('關聯筆記格式不正確。');
      result.noteIds=[...new Set(value.noteIds)];
      if(value.type==='note'&&value.linkedOnly===true)result.linkedOnly=true;
    }
    if (!nested) {
      if (![value.x, value.y].every(Number.isFinite)) throw new Error('卡片位置格式不正確。');
      Object.assign(result, { x: value.x, y: value.y }, zOf(value), anchorOf(value));
    }
    if (value.type === 'note') {
      result.text = cardText(value.text, 10000);
      if (value.title) result.title = cardText(value.title, 1000);
      if (Number.isFinite(value.fs) && value.fs >= 11 && value.fs <= 22) result.fs = value.fs;
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
      if (['row','icon'].includes(value.view)) result.view = value.view;
      if (FOLDER_COLORS.includes(value.color)) result.color = value.color;
    }
    else if (value.type === 'file') {
      if (typeof value.fileId !== 'string' || !/^f-[\w]{1,40}$/.test(value.fileId) || !['pdf','word','excel'].includes(value.kind)) throw new Error('檔案卡片格式不正確。');
      Object.assign(result, { fileId: value.fileId, kind: value.kind, name: cardText(value.name, 500), size: Number.isFinite(value.size) && value.size >= 0 ? value.size : 0 });
    }
    else if (value.type === 'character') {
      result.title=cardText(value.title,1000);
      if(value.stages!==undefined) {
        if(!Array.isArray(value.stages)||!value.stages.length||value.stages.length>100) throw new Error('角色階段格式不正確。');
        result.stages=value.stages.map((stage,index)=>{
          if(!stage || !Number.isInteger(stage.level) || stage.level<1 || stage.level>100000 || (index===0 ? stage.level!==1 : stage.level<=value.stages[index-1].level)) throw new Error('角色階段等級必須從 1 開始並依序遞增。');
          if(stage.src && (typeof stage.src!=='string'||!IMAGE_SRC.test(stage.src))) throw new Error('角色階段圖片格式不正確。');
          if(stage.xpPerLevel!==undefined && (!Number.isInteger(stage.xpPerLevel)||stage.xpPerLevel<1||stage.xpPerLevel>1000000)) throw new Error('角色階段升級 XP 格式不正確。');
          return {level:stage.level,name:cardText(stage.name,1000),description:cardText(stage.description,10000),src:stage.src||'',...(stage.xpPerLevel!==undefined?{xpPerLevel:stage.xpPerLevel}:{})};
        });
      }
      if(value.todoIds!==undefined && (!Array.isArray(value.todoIds) || value.todoIds.length>2000 || value.todoIds.some(id=>typeof id!=='string'))) throw new Error('角色連動清單格式不正確。');
      result.todoIds=[...new Set(value.todoIds||[])];
      if(value.todoMapIds!==undefined){if(!Array.isArray(value.todoMapIds)||value.todoMapIds.length>10000||value.todoMapIds.some(id=>typeof id!=='string'||!id||id.length>100))throw new Error('連動來源心智圖格式不正確。');result.todoMapIds=[...new Set(value.todoMapIds.map(id=>mapIds.get(id)).filter(Boolean))];}
      if(value.src!==undefined) {
        if(typeof value.src!=='string' || !IMAGE_SRC.test(value.src)) throw new Error('角色圖片格式不正確。');
        result.src=value.src;
      }
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
      if (value.type === 'todo') result.items = (list || []).map(item => {
        const task = { id: newId('i'), text: cardText(item?.text, 1000), done: item?.done === true };
        if (item?.src !== undefined) {
          if (typeof item.src !== 'string' || !IMAGE_SRC.test(item.src)) throw new Error('待辦圖片格式不正確。');
          task.src = item.src;
          if (item.displayOnly === true) { task.displayOnly = true; task.done = false; }
        }
        return task;
      });
      else {
        result.cards = (list || []).map(child => card(child, true));
        if (value.type === 'folder') result.open = value.open === true;
      }
    }
    if (value.collapsed === true && ['note','column'].includes(value.type)) result.collapsed = true;
    if (['note','column','character'].includes(value.type)) {
      if (Number.isFinite(value.w)) result.w = Math.min(1200, Math.max(140, value.w));
      if (Number.isFinite(value.h)) result.h = Math.min(1200, Math.max(48, value.h));
    }
    return result;
  }
  const imported=source.map((map, i) => {
    if (!map || typeof map.title !== 'string' || map.title.length > 1000) throw new Error('心智圖名稱格式不正確。');
    ids = new Map();
    inboxIds=new Map();
    sourceWorkspace=map.workspaceId||'workspace-default';
    cardCount = 0;
    const root = map.root === null ? null : node(map.root);
    if (map.trees !== undefined && (!Array.isArray(map.trees) || map.trees.length > 100)) throw new Error('心智圖數量格式不正確或超過 100 個。');
    const trees = (map.trees || []).map(tree => {
      if (!tree || ![tree.x, tree.y].every(Number.isFinite)) throw new Error('心智圖位置格式不正確。');
      return { id: newId('t'), x: tree.x, y: tree.y, root: node(tree.root),...readInbox(tree) };
    });
    if(map.images !== undefined && (!Array.isArray(map.images) || map.images.length > 100)) throw new Error('圖片格式不正確或超過 100 張。');
    const images = (map.images || []).map(image => {
      if(!image || typeof image.id !== 'string' || typeof image.src !== 'string' ||
         !IMAGE_SRC.test(image.src) ||
         ![image.x,image.y,image.w,image.h].every(Number.isFinite) || image.w<=0 || image.h<=0 || image.w>10000 || image.h>10000) throw new Error('圖片資料或尺寸格式不正確。');
      const id=newId('img');ids.set(image.id,id);
      return {id,src:image.src,x:image.x,y:image.y,w:image.w,h:image.h,...zOf(image),...anchorOf(image),...readInbox(image)};
    });
    if(map.cards !== undefined && !Array.isArray(map.cards)) throw new Error('卡片格式不正確。');
    const cards = (map.cards || []).map(value => card(value, false));
    // Column-style nodes point at their column card, whose id was just renewed.
    for (const t of [root, ...trees.map(x => x.root)]) (function walk(n) { if (!n) return; if (n.colCard) { const c = ids.get(n.colCard); if (c) n.colCard = c; else delete n.colCard; } n.children.forEach(walk); })(t);
    if(map.relations !== undefined && (!Array.isArray(map.relations) || map.relations.length > 10000)) throw new Error('關聯線格式不正確。');
    const relations = (map.relations || []).flatMap(relation => {
      if(!relation || typeof relation.from !== 'string' || typeof relation.to !== 'string') throw new Error('關聯線端點格式不正確。');
      const from=ids.get(relation.from),to=ids.get(relation.to);
      return from && to && from!==to ? [{id:newId('r'),from,to,...relationStyle(relation)}] : [];
    });
    localCopies.set(newMapIds[i],new Map(ids));
    return {
      id: newMapIds[i], title: map.title, icon: typeof map.icon === 'string' ? map.icon : 'diagram-3',
      ...(typeof map.workspaceId==='string'&&map.workspaceId.length<=100?{workspaceId:map.workspaceId}:{}),
      ...(validDailyDate(map.dailyDate) ? { dailyDate: map.dailyDate } : {}),
      ...(Array.isArray(map.relatedDates) ? {relatedDates:[...new Set(map.relatedDates.filter(validDailyDate))]} : {}),
      ...(NOTE_COLORS.includes(map.color) ? { color: map.color } : {}),
      ...(typeof map.folderId === 'string' && map.folderId.length <= 100 ? { folderId: map.folderId } : {}),
      ...(typeof map.parentId === 'string' && map.parentId.length <= 100 ? { parentId: mapIds.get(map.parentId) || map.parentId } : {}),
      layout: map.layout === 'right' ? 'right' : 'down', root, trees, images, relations, cards, strokes: parseStrokes(map.strokes, newId,readInbox),
      rootX: Number.isFinite(map.rootX) ? map.rootX : 0, rootY: Number.isFinite(map.rootY) ? map.rootY : 0,
      createdAt: Date.now() + i, updatedAt: Date.now(), rev: '',
    };
  });
  const importedById=new Map(imported.map(map=>[map.id,map]));
  for(const map of imported){
    const copies=todoCopies.get(map.workspaceId||'workspace-default')||new Map();
    (function remapLinks(list){for(const card of list){if(card.type==='character'){
      if(card.todoMapIds)card.todoMapIds=card.todoMapIds.filter(id=>{const target=importedById.get(id);return target&&(target.workspaceId||'workspace-default')===(map.workspaceId||'workspace-default');});
      const sourceIds=new Set(card.todoMapIds??[map.id]),allowed=new Set();
      for(const id of sourceIds){const target=importedById.get(id);if(!target||(target.workspaceId||'workspace-default')!==(map.workspaceId||'workspace-default'))continue;(function collect(cards){for(const item of cards){if(item.type==='todo')allowed.add(item.id);if(item.cards)collect(item.cards);}})(target.cards);}
      card.todoIds=card.todoIds.map(id=>{const local=localCopies.get(map.id)?.get(id);return allowed.has(local)?local:copies.get(id);}).filter(id=>allowed.has(id));
    }if(card.cards)remapLinks(card.cards);}})(map.cards);
  }
  return imported;
}
