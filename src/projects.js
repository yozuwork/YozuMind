export const PROJECTS_KEY='yozu-projects-v1';
export const STATUSES=['未開始','進行中','完成'];
export const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function calendarDays(year,month){const start=new Date(year,month,1);start.setDate(1-start.getDay());return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));}
export function validateProjects(records){
  if(!Array.isArray(records)||records.length>10000)throw new Error('專案資料格式不正確。');
  const string=(v,max)=>typeof v==='string'&&v.length<=max;
  const ids=new Set();
  return records.map(r=>{
    if(!r||!string(r.id,100)||!r.id||ids.has(r.id)||!string(r.workspaceId,100)||!r.workspaceId||!Array.isArray(r.pages)||!Array.isArray(r.favorites)||r.favorites.some(i=>!string(i,64)))throw new Error('專案資料格式不正確。');
    ids.add(r.id);const seen=new Set();
    return {id:r.id,workspaceId:r.workspaceId,favorites:[...new Set(r.favorites)],pages:r.pages.map(p=>{
      if(!p||!string(p.id,100)||!p.id||seen.has(p.id)||!string(p.title,200)||!string(p.icon,64)||!['table','board','calendar'].includes(p.view)||!Array.isArray(p.items))throw new Error('專案頁面格式不正確。');
      seen.add(p.id);const items=new Set();
      return {id:p.id,title:p.title,icon:p.icon,view:p.view,items:p.items.map(t=>{
        if(!t||!string(t.id,100)||!t.id||items.has(t.id)||!string(t.title,200)||!STATUSES.includes(t.status)||!string(t.notes,100000)||!string(t.date,10)||(t.date&&!/^\d{4}-\d{2}-\d{2}$/.test(t.date)))throw new Error('專案項目格式不正確。');
        items.add(t.id);return {id:t.id,title:t.title,status:t.status,date:t.date,notes:t.notes};
      })};
    })};
  });
}
export const readProjects=()=>validateProjects(JSON.parse(localStorage.getItem(PROJECTS_KEY)||'[]'));
export const writeProjects=records=>{localStorage.setItem(PROJECTS_KEY,JSON.stringify(validateProjects(records)));if(typeof window!=='undefined')window.dispatchEvent(new Event('yozu-projects-changed'));};
export function saveProject(record){const all=readProjects();writeProjects([...all.filter(r=>r.id!==record.id),record]);}
export function importProjects(records,workspaceIds,uid){const imported=validateProjects(records).map(r=>({...r,id:uid('projects'),workspaceId:workspaceIds.get(r.workspaceId),pages:r.pages.map(p=>({...p,id:uid('project-page'),items:p.items.map(t=>({...t,id:uid('project-item')}))}))}));writeProjects([...readProjects(),...imported]);return imported.map(r=>r.id);}
export function removeProjects(ids){writeProjects(readProjects().filter(r=>!ids.includes(r.id)));}
