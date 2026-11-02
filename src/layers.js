const cardTypes={note:['筆記','sticky'],image:['圖片卡','image'],character:['角色卡','person-badge'],todo:['待辦清單','list-check'],column:['欄位','layout-three-columns'],folder:['獨立頁面','folder2'],link:['連結','link-45deg'],file:['附件','paperclip']};
export function canvasLayers(map){
  if(!map)return [];
  const result=[],stack=[];
  for(const [kind,items] of [['stroke',map.strokes],['image',map.images],['card',map.cards]])for(const value of items||[]){
    if(!value.inbox)stack.push({kind,value,order:stack.length});
  }
  stack.sort((a,b)=>(b.value.z||0)-(a.value.z||0)||b.order-a.order);
  function card(value,depth=0){
    if(value.inbox)return;
    const [type,icon]=cardTypes[value.type]||['卡片','card-text'];
    result.push({id:value.id,kind:'card',name:value.title||value.name||value.text?.split('\n')[0]||value.url||type,type,icon,src:value.src,depth,reorder:depth===0,value});
    for(const child of value.cards||[])card(child,depth+1);
  }
  for(const {kind,value} of stack){
    if(kind==='card')card(value);
    else result.push({id:value.id,kind,name:kind==='image'?(value.name||value.inboxLabel||'圖片'):({rect:'矩形',ellipse:'橢圓',arrow:'箭頭',line:'直線',pen:'手繪線條',highlighter:'螢光筆'}[value.tool]||'塗鴉'),type:kind==='image'?'圖片':'塗鴉',icon:kind==='image'?'image':'pencil',src:kind==='image'?value.src:null,depth:0,reorder:true,value});
  }
  function node(value,depth=0){if(!value)return;result.push({id:value.id,kind:'node',name:value.text?.split('\n')[0]||'未命名節點',type:'心智圖節點',icon:'diagram-3',depth,reorder:false,value});for(const child of value.children||[])node(child,depth+1);}
  node(map.root);for(const tree of map.trees||[])if(!tree.inbox)node(tree.root);
  return result;
}
export function reorderLayer(map,id,direction){
  const entries=canvasLayers(map).filter(e=>e.reorder).reverse(),index=entries.findIndex(e=>e.id===id);
  if(index<0||!['front','back'].includes(direction))return false;
  const [entry]=entries.splice(index,1);if(direction==='front')entries.push(entry);else entries.unshift(entry);
  entries.forEach((e,i)=>{e.value.z=i+1;});return true;
}
