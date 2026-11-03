// Browser-independent backup queue. Automatic runs never request filesystem permission.
export function createFolderBackup({load,persist,buildArchive,pickDirectory,isReady=()=>true,onChange=()=>{},delay=60000,clock=()=>new Date(),makeId=()=>crypto.randomUUID()}) {
  let settings={enabled:false,handle:null,lastSaved:null,lastFile:''},loaded=false,disposed=false,timer=null,running=null,dirty=false,error='',permission=false;
  const state=()=>({...settings,loaded,busy:!!running,dirty,error,permission});
  const emit=()=>{if(!disposed)onChange(state());};
  const cancel=()=>{clearTimeout(timer);timer=null;};
  function schedule(){if(disposed||!loaded||!settings.enabled||!settings.handle||!dirty||timer||running||error)return;timer=setTimeout(()=>{timer=null;void run();},delay);}
  function changed(){if(disposed)return;dirty=true;emit();schedule();}
  async function init(){
    try{const saved=await load();if(disposed)return;if(saved)settings={...settings,...saved};if(settings.handle)permission=await settings.handle.queryPermission({mode:'readwrite'})==='granted';if(settings.enabled&&!permission)error='請點「重新授權」後繼續自動備份。';}
    catch{error='無法讀取備份設定，請重新選擇資料夾。';}
    finally{loaded=true;dirty=true;emit();schedule();}
  }
  async function choose(){
    if(!loaded||running)return;
    // Invoke picker directly from a user gesture, before any asynchronous work.
    let handle;try{handle=await pickDirectory();}catch(cause){if(cause.name!=='AbortError'){error='無法開啟資料夾，請確認瀏覽器支援並允許存取。';emit();}return;}
    if(disposed)return;
    try{const next={...settings,handle,lastSaved:null,lastFile:''};await persist(next);settings=next;permission=await handle.queryPermission({mode:'readwrite'})==='granted';error='';dirty=true;cancel();emit();schedule();}
    catch{error='無法記住資料夾設定，請確認瀏覽器儲存空間後重試。';emit();}
  }
  async function authorize(){
    if(!settings.handle)return false;
    try{permission=await settings.handle.requestPermission({mode:'readwrite'})==='granted';error=permission?'':'尚未取得寫入權限，請重新授權或更換資料夾。';}
    catch{permission=false;error='資料夾無法存取，請重新授權或更換資料夾。';}
    emit();schedule();return permission;
  }
  async function setEnabled(enabled){
    if(!loaded||running||!settings.handle)return;
    try{const next={...settings,enabled};await persist(next);settings=next;cancel();if(enabled){dirty=true;if(!permission)error='請點「重新授權」後繼續自動備份。';}emit();schedule();}
    catch{error='備份設定儲存失敗，請重試。';emit();}
  }
  async function run(manual=false){
    if(disposed||!loaded||!settings.handle||running||(!manual&&!settings.enabled))return running;
    if(!isReady()){if(manual){error='資料載入或匯入處理中，請稍候再備份。';emit();}else schedule();return;}
    cancel();error='';
    const handle=settings.handle;
    running=(async()=>{
      let writable;
      try{
        permission=await handle.queryPermission({mode:'readwrite'})==='granted';
        if(!permission)throw new Error('請點「重新授權」後繼續備份。');
        dirty=false;
        const archive=await buildArchive();if(disposed)return;
        const date=clock(),name=`YoZuMind-${date.toISOString().replace(/[:.]/g,'-')}-${makeId()}.zip`;
        const file=await handle.getFileHandle(name,{create:true});writable=await file.createWritable();
        await writable.write(archive);await writable.close();writable=null;
        settings={...settings,lastSaved:date.toISOString(),lastFile:name};
        await persist(settings);
      }catch(cause){dirty=true;error=cause.message||'備份失敗，請確認資料夾權限與磁碟空間後重試。';if(writable)try{await writable.abort();}catch{}}
      finally{running=null;emit();schedule();}
    })();emit();return running;
  }
  async function backupNow(){if(await authorize())return run(true);}
  return {init,state,changed,choose,authorize,setEnabled,backupNow,destroy(){disposed=true;cancel();}};
}

export function folderBackupSettings() {
  let database;
  function db(){return database||=new Promise((resolve,reject)=>{const request=indexedDB.open('yozu-folder-backup',1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};});}
  async function transaction(mode,value){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('settings',mode),store=tx.objectStore('settings'),request=mode==='readonly'?store.get('backup'):store.put(value,'backup');tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('設定儲存中斷'));});}
  return {load:()=>transaction('readonly'),persist:value=>transaction('readwrite',value)};
}
