import {formatJsonNote} from './json-format.js';
export function parseJsonTree(text,maxLength=10000){
  const source=formatJsonNote(text,maxLength).slice(8,-4),tokens=source.match(/"(?:[^"\\]|\\[\s\S])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g);let i=0;
  function read(depth=0){
    if(depth>100)throw new Error('JSON 超過 100 層，請拆分後查看；原文已保留。');
    const token=tokens[i++];
    if(token==='{'||token==='['){const children=[],end=token==='{'?'}':']';while(tokens[i]!==end){let key=String(children.length);if(token==='{'){key=JSON.parse(tokens[i++]);i++;}children.push({key,node:read(depth+1)});if(tokens[i]===',')i++;}i++;return {type:token==='{'?'object':'array',children};}
    return {type:token.startsWith('"')?'string':token==='null'?'null':/^(true|false)$/.test(token)?'boolean':'number',value:token};
  }
  return read();
}
export function renderJsonTree(text,onChange){
  const root=parseJsonTree(text),container=document.createElement('div');container.className='json-tree';container.setAttribute('aria-label','JSON 樹狀檢視');
  for(const event of ['pointerdown','dblclick'])container.addEventListener(event,e=>e.stopPropagation());
  function build(node,key,open=false){
    const label=document.createElement('span');label.className='json-key';label.textContent=key===null?'':key+': ';
    if(!node.children){const row=document.createElement('div');row.className='json-leaf';const value=document.createElement('span');value.className='json-value json-'+node.type;value.textContent=node.value;row.append(label,value);return row;}
    const branch=document.createElement('details'),summary=document.createElement('summary'),meta=document.createElement('span');meta.className='json-meta';meta.textContent=node.type==='array'?`[ ${node.children.length} 個項目 ]`:`{ ${node.children.length} 個屬性 }`;summary.append(label,meta);branch.append(summary);
    let loaded=false;function populate(){if(loaded)return;loaded=true;const children=document.createElement('div');children.className='json-children';for(const child of node.children)children.append(build(child.node,child.key));branch.append(children);}
    branch.open=open;if(open)populate();branch.addEventListener('toggle',()=>{if(branch.open)populate();onChange?.();});return branch;
  }
  container.append(build(root,null,true));return container;
}
