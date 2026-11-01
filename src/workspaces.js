export const DEFAULT_WORKSPACE='workspace-default';
export const WORKSPACES_KEY='yozu-workspaces-v1',ACTIVE_WORKSPACE_KEY='yozu-active-workspace-v1';
let active=DEFAULT_WORKSPACE;
export const activeWorkspaceId=()=>active;
export const workspaceOf=record=>typeof record?.workspaceId==='string'&&record.workspaceId?record.workspaceId:DEFAULT_WORKSPACE;
export const inWorkspace=(records,id=active)=>id===null?records:records.filter(record=>workspaceOf(record)===id);
export function uniqueWorkspaceName(name,list) {const base=name.trim()||'未命名工作區';let result=base,index=2;while(list.some(item=>item.name===result)){const suffix=` (${index++})`;result=base.slice(0,80-suffix.length)+suffix;}return result;}
export function validateWorkspaces(list) {
  if(!Array.isArray(list)||list.length>100) throw new Error('工作區格式不正確，最多可建立 100 個工作區。');
  const seen=new Set();
  return list.map(item=>{
    if(!item||typeof item.id!=='string'||!item.id||item.id.length>100||seen.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>80) throw new Error('工作區名稱或識別資料不正確。');
    seen.add(item.id);return {id:item.id,name:item.name.trim(),createdAt:Number.isFinite(item.createdAt)?item.createdAt:0};
  });
}
export function readWorkspaceState() {
  let list=[];try{list=validateWorkspaces(JSON.parse(localStorage.getItem(WORKSPACES_KEY)||'[]'));}catch{}
  if(!list.some(item=>item.id===DEFAULT_WORKSPACE)) list.unshift({id:DEFAULT_WORKSPACE,name:'我的工作區',createdAt:0});
  try {active=localStorage.getItem(ACTIVE_WORKSPACE_KEY)||DEFAULT_WORKSPACE;}catch{}
  if(!list.some(item=>item.id===active)) active=DEFAULT_WORKSPACE;
  return {workspaces:list,activeId:active};
}
export function persistWorkspaceState(list,id=active) {
  const valid=validateWorkspaces(list);if(!valid.some(item=>item.id===id)) throw new Error('找不到指定的工作區。');
  const previous=localStorage.getItem(WORKSPACES_KEY),previousActive=localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  try {localStorage.setItem(WORKSPACES_KEY,JSON.stringify(valid));localStorage.setItem(ACTIVE_WORKSPACE_KEY,id);}
  catch(error) {try{if(previous===null)localStorage.removeItem(WORKSPACES_KEY);else localStorage.setItem(WORKSPACES_KEY,previous);if(previousActive===null)localStorage.removeItem(ACTIVE_WORKSPACE_KEY);else localStorage.setItem(ACTIVE_WORKSPACE_KEY,previousActive);}catch{}throw error;}
  active=id;return valid;
}

export function archiveWorkspaces(archive) {
  const raw=JSON.parse(archive.text);if(!raw||typeof raw!=='object')throw new Error('存檔內容格式不正確。');
  const maps=Array.isArray(raw)?raw:raw.maps||[raw];if(!Array.isArray(maps))throw new Error('存檔心智圖格式不正確。');
  const ids=new Set([...maps,...(raw.folders||[]),...(archive.gallery||[]),...(archive.stagePresets||[]),...(archive.notes||[])].map(workspaceOf));
  const definitions=validateWorkspaces(archive.workspaces||[]),known=new Map(definitions.map(item=>[item.id,item]));
  for(const id of ids) if(!known.has(id)) known.set(id,{id,name:id===DEFAULT_WORKSPACE?'存檔工作區':'未命名工作區',createdAt:0});
  return [...known.values()];
}
export function selectArchiveWorkspace(archive,id) {
  const raw=JSON.parse(archive.text),project=Array.isArray(raw)?{format:'yozumind',version:1,maps:raw}:raw.format?raw:{format:'yozumind',version:1,maps:[raw]};
  return {...archive,text:JSON.stringify({...project,maps:inWorkspace(project.maps,id),folders:inWorkspace(project.folders||[],id)}),gallery:inWorkspace(archive.gallery||[],id),stagePresets:inWorkspace(archive.stagePresets||[],id),notes:inWorkspace(archive.notes||[],id)};
}

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(label,cls,action)=>{const node=el('button',cls,label);node.type='button';node.addEventListener('click',action);return node;};
function shell(title,description) {
  const opener=document.activeElement,dialog=el('dialog','workspace-dialog'),form=el('form'),heading=el('h2','',title);heading.id='workspace-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);
  form.append(heading,el('p','workspace-dialog-description',description));dialog.append(form);
  const error=el('p','workspace-dialog-error');error.setAttribute('role','alert');
  const footer=el('div','workspace-dialog-actions'),cancel=button('取消','btn btn-ghost',()=>dialog.close());footer.append(cancel);
  const isolate=event=>{if(dialog.contains(event.target))event.stopPropagation();};for(const type of ['keydown','copy','cut','paste'])window.addEventListener(type,isolate,true);
  dialog.addEventListener('close',()=>{dialog.remove();for(const type of ['keydown','copy','cut','paste'])window.removeEventListener(type,isolate,true);if(opener?.isConnected)opener.focus({preventScroll:true});});
  return {dialog,form,error,footer,show(){form.append(error,footer);document.body.append(dialog);dialog.showModal();},field(labelText,input){const label=el('label','workspace-field',labelText);label.append(input);form.append(label);return label;}};
}
export function chooseExportWorkspace(workspaces,current,{all=false,hasMap=false}={}) {
  return new Promise(resolve=>{
    const ui=shell('匯出存檔','選擇工作區，將紀錄、圖片、文件與常用階段一起打包成 ZIP。'),select=el('select'),scope=el('select');select.setAttribute('aria-label','匯出工作區');
    select.append(...workspaces.map(item=>new Option(item.name,item.id)),new Option('所有工作區（完整備份）','__all__'));select.value=all?'__all__':current;
    ui.field('工作區',select);scope.append(new Option('整個工作區','workspace'),new Option('目前心智圖、子頁面與連動來源','current'));scope.setAttribute('aria-label','匯出內容');ui.field('匯出內容',scope);
    function update(){scope.options[1].disabled=select.value!==current||!hasMap;if(scope.options[1].disabled)scope.value='workspace';scope.disabled=select.value==='__all__';}select.addEventListener('change',update);update();
    const submit=el('button','btn workspace-primary','匯出 ZIP');submit.type='submit';ui.footer.append(submit);ui.form.addEventListener('submit',event=>{event.preventDefault();resolve({workspaceId:select.value==='__all__'?null:select.value,scope:select.value==='__all__'?'all':scope.value});ui.dialog.close();});ui.dialog.addEventListener('close',()=>resolve(null));ui.show();
  });
}
export function chooseImportWorkspace(sources,targets,current) {
  return new Promise(resolve=>{
    const ui=shell('匯入存檔','選擇存檔中的工作區與匯入位置，現有資料會保留。'),source=el('select'),target=el('select'),name=el('input');source.setAttribute('aria-label','存檔工作區');target.setAttribute('aria-label','匯入位置');name.type='text';name.maxLength=80;name.placeholder='新工作區名稱';name.setAttribute('aria-label','新工作區名稱');
    source.append(...sources.map(item=>new Option(item.name,item.id)));if(sources.length>1){source.append(new Option('所有工作區','__all__'));source.value='__all__';}
    target.append(new Option('建立新工作區','__new__'),...targets.map(item=>new Option(`加入「${item.name}」`,item.id)));target.value='__new__';ui.field('存檔工作區',source);ui.field('匯入位置',target);const nameField=ui.field('新工作區名稱',name),hint=el('p','workspace-dialog-description');ui.form.append(hint);
    function update(){const multiple=source.value==='__all__',fresh=target.value==='__new__';nameField.hidden=!fresh||multiple;name.required=fresh&&!multiple;name.value=sources.find(item=>item.id===source.value)?.name||'';hint.textContent=multiple&&fresh?'每個來源工作區會各自建立一個新工作區，保留原本分類。':multiple?'所選工作區的資料將合併到指定位置。':'圖庫、角色與常用階段也會一起放入選定的工作區。';}source.addEventListener('change',update);target.addEventListener('change',update);update();
    const submit=el('button','btn workspace-primary','匯入存檔');submit.type='submit';ui.footer.append(submit);ui.form.addEventListener('submit',event=>{event.preventDefault();if(name.required&&!name.value.trim()){ui.error.textContent='請輸入工作區名稱。';name.focus();return;}resolve({sourceId:source.value==='__all__'?null:source.value,targetId:target.value,name:name.value.trim()});ui.dialog.close();});ui.dialog.addEventListener('close',()=>resolve(null));ui.show();
  });
}
export function setupWorkspaceMenu({trigger,getWorkspaces,getActive,getCount,canEdit,onSwitch,onCreate,onRename,toast}) {
  let dialog;
  function open(){
    if(dialog?.open)return;
    const ui=shell('工作區','將不同計畫分開管理；心智圖、圖庫、角色與常用階段各自獨立。');dialog=ui.dialog;
    const list=el('div','workspace-list'),editor=el('div','workspace-editor'),name=el('input');name.type='text';name.maxLength=80;name.setAttribute('aria-label','工作區名稱');editor.hidden=true;
    const label=el('label','workspace-field','工作區名稱');label.append(name);editor.append(label);let renameId=null;
    for(const workspace of getWorkspaces()) {
      const row=el('div','workspace-option'),select=button('','workspace-select',()=>{try{onSwitch(workspace.id);ui.dialog.close();}catch(error){ui.error.textContent=error.message||'切換工作區失敗';}}),copy=el('span');copy.append(el('strong','',workspace.name),el('small','',`${getCount(workspace.id)} 張心智圖`));select.append(copy);if(workspace.id===getActive()){select.append(el('span','workspace-current','使用中'));select.setAttribute('aria-current','true');}
      const rename=button('重新命名','workspace-rename',()=>{renameId=workspace.id;editor.hidden=false;name.value=workspace.name;name.focus();name.select();submit.textContent='儲存名稱';});rename.disabled=!canEdit();row.append(select,rename);list.append(row);
    }
    const add=button('＋ 新增工作區','btn btn-ghost',()=>{renameId=null;editor.hidden=false;name.value='';name.focus();submit.textContent='建立並切換';});add.disabled=!canEdit();ui.form.append(list,add,editor);
    const submit=el('button','btn workspace-primary','建立並切換');submit.type='submit';editor.append(submit);
    ui.form.addEventListener('submit',async event=>{event.preventDefault();const value=name.value.trim();if(!value){ui.error.textContent='請輸入工作區名稱。';name.focus();return;}submit.disabled=true;try{if(renameId)await onRename(renameId,value);else await onCreate(value);ui.dialog.close();}catch(error){ui.error.textContent=error.message||'儲存工作區失敗';submit.disabled=false;}});
    ui.dialog.addEventListener('close',()=>{dialog=null;});ui.show();
  }
  trigger.addEventListener('click',open);
  return {destroy(){dialog?.remove();trigger.removeEventListener('click',open);}};
}
