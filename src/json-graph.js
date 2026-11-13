import {parseJsonTree} from './json-tree.js';
export const JSON_SOURCE_LIMIT=200000;
export const JSON_SAMPLE='{"name":"我的 JSON 心智圖","items":[{"title":"第一個項目","done":false}]}';
export function jsonGraph(source,collapsed=new Set(),expanded=new Set()){
  if(source.length>JSON_SOURCE_LIMIT)throw new Error('JSON 超過 200,000 字上限。');
  const root=parseJsonTree(source,2000000),nodes=[],edges=[];
  function build(value,label,path,depth){
    if(nodes.length>=1500)throw new Error('圖形超過 1,500 個節點，請拆分 JSON。');
    const node={id:path,label,depth,raw:value,rows:[],children:[],x:0,y:0,w:expanded.has(path)?600:360,h:64,expanded:expanded.has(path)};nodes.push(node);
    if(value.children){
      node.expandable=value.children.length>0;
      node.collapsed=collapsed.has(path);
      value.children.forEach((entry,index)=>{
        const rowPath=`${path}/${index}`;
        if(entry.node.children){node.rows.push({key:entry.key,path:rowPath,raw:entry.node,value:entry.node.type==='array'?`[${entry.node.children.length} 個項目]`:`{${entry.node.children.length} 個屬性}`,type:'container'});
          if(!node.collapsed){const child=build(entry.node,entry.key,`${path}/${index}`,depth+1);node.children.push(child);edges.push({from:node.id,to:child.id,label:entry.key});}
        }else node.rows.push({key:entry.key,path:rowPath,raw:entry.node,value:entry.node.value,type:entry.node.type});
      });
    }else node.rows.push({key:'',value:value.value,type:value.type});
    const columns=text=>Array.from(text).reduce((sum,c)=>sum+(c.codePointAt(0)>255?2:1),0);
    for(const row of node.rows)row.height=node.expanded?Math.max(1,Math.ceil(columns(row.key)/22),Math.ceil(columns(row.value)/38))*22+14:34;
    node.h=node.collapsed?44:44+(node.rows.length?node.rows.reduce((sum,r)=>sum+r.height,0):34);
    node.span=Math.max(node.h,node.children.reduce((sum,c)=>sum+c.span+28,0)-28);
    return node;
  }
  const tree=build(root,'JSON','$',0);
  const widths=[];for(const n of nodes)widths[n.depth]=Math.max(widths[n.depth]||0,n.w);
  const offsets=[32];for(let i=1;i<widths.length;i++)offsets[i]=offsets[i-1]+widths[i-1]+90;
  function place(node,top){node.y=top+(node.span-node.h)/2;let y=top;for(const child of node.children){place(child,y);y+=child.span+28;}}
  place(tree,32);nodes.forEach(n=>n.x=offsets[n.depth]);
  return {nodes,edges,width:Math.max(...nodes.map(n=>n.x+n.w))+32,height:tree.span+64};
}
