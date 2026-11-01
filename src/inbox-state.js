export function inboxEntries(map) {
  const groups=new Map();
  for(const [kind,list] of [['image',map?.images],['card',map?.cards],['node',map?.trees],['stroke',map?.strokes]])for(const value of list||[]){
    if(!value.inbox)continue;const id=value.inboxId||value.id;
    if(!groups.has(id))groups.set(id,{id,label:value.inboxLabel||'',createdAt:value.inboxAt||0,objects:[]});groups.get(id).objects.push({kind,value});
  }
  return [...groups.values()].sort((a,b)=>b.createdAt-a.createdAt);
}
export function markInbox(objects,id,label='') {
  const time=Date.now();for(const value of objects)Object.assign(value,{inbox:true,inboxId:id,inboxLabel:label.slice(0,1000),inboxAt:time});return objects;
}
export function clearInbox(value){delete value.inbox;delete value.inboxId;delete value.inboxLabel;delete value.inboxAt;return value;}
export function inboxMeta(value,ids=new Map(),uid=prefix=>prefix+'-'+Math.random().toString(36).slice(2,10)) {
  if(!value?.inbox)return {};
  if(value.inboxId!==undefined&&(typeof value.inboxId!=='string'||!value.inboxId||value.inboxId.length>100))throw new Error('暫存區識別資料不正確。');
  if(value.inboxLabel!==undefined&&(typeof value.inboxLabel!=='string'||value.inboxLabel.length>1000))throw new Error('暫存區標題格式不正確。');
  const key=value.inboxId||value.id;if(!ids.has(key))ids.set(key,uid('inbox'));
  return {inbox:true,inboxId:ids.get(key),inboxLabel:value.inboxLabel||'',inboxAt:Number.isFinite(value.inboxAt)?value.inboxAt:0};
}
