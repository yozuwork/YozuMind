// Sections share the existing portable folder tree, but are always root containers.
export function sectionOfFolder(id,folders){
  const byId=new Map(folders.map(f=>[f.id,f])),seen=new Set();
  for(let f=byId.get(id);f&&!seen.has(f.id);f=byId.get(f.parentId)){
    seen.add(f.id);if(f.kind==='section')return f.id;
  }
  return null;
}
export function sectionFolders(folders,sectionId){
  return folders.filter(f=>f.kind!=='section'&&sectionOfFolder(f.id,folders)===(sectionId||null));
}
