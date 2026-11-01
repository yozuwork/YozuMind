// Place measured objects in reading order, keeping their sizes and a consistent gutter.
export function arrangeRectangles(objects,{width=1000,padding=32,gap=28}={}) {
  if(!objects.length)return [];
  const measured=objects.map((item,index)=>({...item,index,w:Math.max(1,Math.ceil(item.w-.001)),h:Math.max(1,Math.ceil(item.h-.001))}));
  const limit=padding+Math.max(width,...measured.map(item=>item.w));
  measured.sort((a,b)=>a.y-b.y||a.x-b.x||a.index-b.index);
  let x=padding,y=padding,rowHeight=0;
  return measured.map(item=>{
    if(x>padding&&x+item.w>limit){x=padding;y+=rowHeight+gap;rowHeight=0;}
    const result={id:item.id,x,y,dx:x-item.x,dy:y-item.y,w:item.w,h:item.h};x+=item.w+gap;rowHeight=Math.max(rowHeight,item.h);return result;
  });
}

export function unionRectangles(boxes) {
  if(!boxes.length)return null;
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const box of boxes){x=Math.min(x,box.x);y=Math.min(y,box.y);right=Math.max(right,box.x+box.w);bottom=Math.max(bottom,box.y+box.h);}
  return {x,y,w:right-x,h:bottom-y};
}
