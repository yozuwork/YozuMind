import {createFolderBackup,folderBackupSettings} from './folder-backup.js';
import './folder-backup.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
export function setupFolderBackup({trigger,summary,buildArchive,isReady}) {
  const supported=window.isSecureContext&&typeof window.showDirectoryPicker==='function';
  let dialog=null,ui=null;
  const service=createFolderBackup({...folderBackupSettings(),buildArchive,isReady,pickDirectory:()=>window.showDirectoryPicker({id:'yozumind-backup',mode:'readwrite'}),onChange:render});
  function render(){
    const state=service.state();
    const status=!supported?'此瀏覽器不支援資料夾備份':!state.loaded?'正在讀取備份設定…':state.busy?'正在建立完整備份…':state.error?state.error:!state.handle?'尚未設定備份資料夾':state.enabled?(state.dirty?'有變更，等待自動備份':'自動備份已開啟'):'自動備份已關閉';
    summary.textContent=status;summary.classList.toggle('fb-error',!!state.error);
    if(!ui)return;
    ui.status.textContent=status;ui.status.classList.toggle('fb-error',!!state.error);
    ui.folder.textContent=state.handle?.name||'尚未選擇';ui.enabled.checked=state.enabled;
    ui.enabled.disabled=!supported||!state.loaded||!state.handle||state.busy;
    ui.choose.disabled=!supported||!state.loaded||state.busy;ui.choose.textContent=state.handle?'更換資料夾':'選擇資料夾';
    ui.now.disabled=!supported||!state.loaded||!state.handle||state.busy;
    ui.authorize.hidden=!supported||!state.handle||state.permission;ui.authorize.disabled=state.busy;
    ui.last.textContent=state.lastSaved?new Date(state.lastSaved).toLocaleString('zh-TW'):'尚未完成備份';
    ui.file.textContent=state.lastFile||'完成備份後會顯示檔名';
  }
  const button=(text,action,cls='btn btn-ghost')=>{const node=el('button',cls,text);node.type='button';node.addEventListener('click',()=>{Promise.resolve(action()).catch(()=>{});});return node;};
  function show(){
    if(dialog?.open)return;
    const opener=document.activeElement;dialog=el('dialog','workspace-dialog folder-backup-dialog');dialog.setAttribute('aria-labelledby','fb-title');
    const content=el('div','fb-content'),title=el('h2','','資料夾自動備份');title.id='fb-title';
    const description=el('p','workspace-dialog-description','將所有工作區、角色、圖片、附件與筆記存成完整 ZIP。原本的瀏覽器暫存仍會繼續。');
    const folderLabel=el('div','fb-label','備份資料夾'),folder=el('strong','fb-folder'),choose=button('選擇資料夾',()=>service.choose()),authorize=button('重新授權',()=>service.authorize());
    const folderActions=el('div','fb-actions');folderActions.append(choose,authorize);
    const label=el('label','fb-toggle'),enabled=el('input');enabled.type='checkbox';enabled.addEventListener('change',()=>{void service.setEnabled(enabled.checked);});label.append(enabled,el('span','','開啟自動備份'));
    const hint=el('p','fb-hint','有變更時約每分鐘備份一次，網頁必須保持開啟。每次建立獨立 ZIP，不覆蓋舊檔；可自行清理不需要的歷史備份。');
    const status=el('p','fb-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const lastLabel=el('div','fb-label','最後備份時間'),last=el('div','fb-last'),file=el('p','fb-file');
    const note=el('p','fb-hint','選擇 OneDrive 等電腦同步資料夾，可交由同步程式上傳。其他裝置請使用「匯入存檔」還原；本功能不會自動合併多台裝置的修改。重新開啟網站後，可能需要再次授權。');
    if(!supported)content.append(el('p','fb-unsupported','目前瀏覽器不支援直接寫入資料夾。請使用桌面版 Chrome／Edge，並透過 HTTPS 或 localhost 開啟；也可繼續使用「匯出存檔」。'));
    const actions=el('div','workspace-dialog-actions'),dismiss=button('關閉',()=>dialog.close()),now=button('立即備份',()=>service.backupNow(),'btn workspace-primary');actions.append(dismiss,now);
    content.append(title,description,folderLabel,folder,folderActions,label,hint,status,lastLabel,last,file,note,actions);dialog.append(content);ui={folder,choose,authorize,enabled,status,last,file,now};
    const isolate=event=>{if(dialog?.contains(event.target))event.stopPropagation();};for(const type of ['keydown','copy','cut','paste'])window.addEventListener(type,isolate,true);
    dialog.addEventListener('close',()=>{dialog.remove();dialog=null;ui=null;for(const type of ['keydown','copy','cut','paste'])window.removeEventListener(type,isolate,true);if(opener?.isConnected)opener.focus({preventScroll:true});});
    document.body.append(dialog);render();dialog.showModal();
  }
  trigger.addEventListener('click',show);void service.init();
  const unload=event=>{const state=service.state();if(state.enabled&&state.handle&&(state.busy||state.dirty)){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  return {changed:()=>service.changed(),isBusy:()=>service.state().busy,destroy(){service.destroy();dialog?.close();trigger.removeEventListener('click',show);window.removeEventListener('beforeunload',unload);}};
}
