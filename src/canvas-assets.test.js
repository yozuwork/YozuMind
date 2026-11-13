import test from 'node:test';
import assert from 'node:assert/strict';
import {imagePlacement,defaultImageSize,readImageFile} from './canvas-assets.js';
import {serializeMaps,parseMaps} from './files.js';

test('default image bounds constrain tall and wide originals without upscaling small images',()=>{
  for(const [w,h] of [[8000,12000],[12000,500],[100,16000],[40,20]]){
    const size=defaultImageSize(w,h);assert.ok(size.w<=360&&size.h<=280);assert.ok(size.w<=w&&size.h<=h);assert.ok(Math.abs(size.w/size.h-w/h)<1e-8);
  }
  assert.deepEqual(defaultImageSize(40,20),{w:40,h:20});
});
test('image import retains original source bytes and full decoded dimensions',async()=>{
  const previousBitmap=globalThis.createImageBitmap,previousReader=globalThis.FileReader;
  const src='data:image/png;base64,AABBCC==';let closed=false;
  globalThis.createImageBitmap=async()=>({width:4000,height:9000,close(){closed=true;}});
  globalThis.FileReader=class{readAsDataURL(){this.result=src;this.onload();}};
  try{assert.deepEqual(await readImageFile({type:'image/png'}),{src,width:4000,height:9000});assert.equal(closed,true);}
  finally{globalThis.createImageBitmap=previousBitmap;globalThis.FileReader=previousReader;}
});
test('image card display dimensions survive backup without reducing source data',()=>{
  const src='data:image/png;base64,AA==';let n=0;
  const [map]=parseMaps(serializeMaps([{id:'m',title:'圖片',root:null,cards:[{id:'i',type:'image',src,x:0,y:0,w:4000,h:9000}]}]),()=>String(++n));
  assert.equal(map.cards[0].src,src);assert.equal(map.cards[0].w,4000);assert.equal(map.cards[0].h,9000);
});

test('pasted images remain centered and fully visible through pan, zoom and extreme aspect ratios',()=>{
  for(const [width,height] of [[400,240],[100,1600],[1600,100],[1600,1600]])for(const k of [.2,1,2.5])for(const [cw,ch] of [[390,700],[1280,850]]){
    const view={x:-1234,y:567,k},image=imagePlacement(width,height,cw,ch,view),left=view.x+image.x*k,top=view.y+image.y*k;
    assert.ok(Math.abs((image.x+image.w/2)*k+view.x-cw/2)<1e-8);assert.ok(Math.abs((image.y+image.h/2)*k+view.y-ch/2)<1e-8);
    assert.ok(left>=32-1e-8&&top>=72-1e-8);assert.ok(left+image.w*k<=cw-32+1e-8&&top+image.h*k<=ch-72+1e-8);assert.ok(Math.abs(image.w/image.h-width/height)<1e-8);
  }
});
test('hidden canvases and invalid view dimensions cannot create invisible images',()=>{
  for(const [cw,ch,view] of [[0,800,{x:0,y:0,k:1}],[800,0,{x:0,y:0,k:1}],[800,800,{x:0,y:0,k:0}],[800,800,{x:NaN,y:0,k:1}]])assert.throws(()=>imagePlacement(400,300,cw,ch,view));
});
