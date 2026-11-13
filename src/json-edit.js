import {parseJsonTree} from './json-tree.js';
export function stringifyJsonNode(node,depth=0){
  if(!node.children)return node.value;
  const array=node.type==='array',open=array?'[':'{',close=array?']':'}';
  if(!node.children.length)return open+close;
  const indent='  '.repeat(depth+1);
  return open+'\n'+node.children.map(entry=>indent+(array?'':JSON.stringify(entry.key)+': ')+stringifyJsonNode(entry.node,depth+1)).join(',\n')+'\n'+'  '.repeat(depth)+close;
}
export function nodeAtPath(root,path){
  if(!/^\$(\/\d+)*$/.test(path))throw new Error('找不到 JSON 欄位。');
  let node=root;
  for(const part of path.split('/').slice(1)){node=node.children?.[Number(part)]?.node;if(!node)throw new Error('欄位已變更，請重新選取。');}
  return node;
}
export function editJson(source,{path,value,key,remove=false}){
  const root=parseJsonTree(source,2000000);
  if(path==='$'){
    if(remove)throw new Error('根節點不能刪除，可編輯為空物件或陣列。');
    const replacement=parseJsonTree(value,2000000),text=stringifyJsonNode(replacement);return checked(text);
  }
  nodeAtPath(root,path);
  const parts=path.split('/'),index=Number(parts.pop()),parent=nodeAtPath(root,parts.join('/'));
  if(remove)parent.children.splice(index,1);
  else{
    // Wrapping supports scalar edits while keeping large integer tokens intact.
    const replacement=parseJsonTree('['+value+']',2000000);
    if(replacement.children.length!==1)throw new Error('請輸入單一 JSON 值。');
    if(key!==undefined&&parent.type==='object'){
      if(parent.children.some((entry,i)=>i!==index&&entry.key===key)&&key!==parent.children[index].key)throw new Error('已有同名欄位，請使用其他名稱。');
      parent.children[index].key=key;
    }
    parent.children[index].node=replacement.children[0].node;
  }
  return checked(stringifyJsonNode(root));
}
function checked(text){if(text.length>200000)throw new Error('修改後超過 200,000 字，原文已保留。');return text;}
export function copyJsonValue(node){return node.type==='string'?JSON.parse(node.value):stringifyJsonNode(node);}
