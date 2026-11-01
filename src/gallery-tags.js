export function normalizeTags(value=[]) {
  const tags=Array.isArray(value)?value:String(value).split(/[,，\n]+/),seen=new Set();
  return tags.map(tag=>String(tag).trim().replace(/^#+/,'').trim()).filter(tag=>{
    const key=tag.toLocaleLowerCase();if(!tag||seen.has(key)) return false;seen.add(key);return true;
  });
}

export function updateImageTags(image,value,remove=false) {
  const tags=normalizeTags(value),keys=new Set(tags.map(tag=>tag.toLocaleLowerCase()));
  const result=remove?normalizeTags(image.tags).filter(tag=>!keys.has(tag.toLocaleLowerCase())):normalizeTags([...normalizeTags(image.tags),...tags]);
  if(result.length>30||result.some(tag=>tag.length>40)) throw new Error('每張圖片最多 30 個標籤，每個標籤最多 40 字。');
  return {...image,tags:result};
}

export function matchesGalleryImage(image,query='',tag='') {
  const tags=normalizeTags(image.tags),key=query.trim().toLocaleLowerCase();
  return (!key||[image.name,image.description||'',image.sourceUrl||'',...tags].some(value=>value.toLocaleLowerCase().includes(key)))&&(!tag||tags.some(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase()));
}

export function libraryImages(images,{query='',category='all',tag='',sort='newest'}={}) {
  const filtered=images.filter(image=>matchesGalleryImage(image,query,tag)&&(category!=='favorites'||image.favorite===true)&&(category!=='untagged'||!normalizeTags(image.tags).length));
  return filtered.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='oldest'?(a.createdAt||0)-(b.createdAt||0):(b.createdAt||0)-(a.createdAt||0));
}
