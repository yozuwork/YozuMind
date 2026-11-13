// Reading layouts extend offscreen instead of shrinking text to fit their height.
export function readingViewport(box,padding=32){
  if(!box||![box.x,box.y].every(Number.isFinite))return null;
  return {k:1,x:padding-box.x,y:padding-box.y};
}
// Fit a reading target without changing the object's size or position.
export function focusViewport(box,width,height,{padding=56,maxScale=2,minScale=.2}={}) {
  if(!box||![box.x,box.y,box.w,box.h,width,height].every(Number.isFinite)||box.w<=0||box.h<=0||width<=0||height<=0)return null;
  const k=Math.max(minScale,Math.min(maxScale,Math.max(1,width-padding*2)/box.w,Math.max(1,height-padding*2)/box.h));
  return {k,x:width/2-(box.x+box.w/2)*k,y:height/2-(box.y+box.h/2)*k};
}
