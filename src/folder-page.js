const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
const icon=name=>{const n=el('i','bi bi-'+name);n.setAttribute('aria-hidden','true');return n;};
const button=(label,ic,action,cls='btn')=>{const n=el('button',cls,label);n.prepend(icon(ic));n.addEventListener('click',action);return n;};

export function setupFolderPage({app,getFolder,getFolders,getMaps,canEdit,beforeOpen,onClose,onCreateMap,onCreateFolder,onRename,onMenu,onOpenMap,onSection,toggleSidebar,onChange}){
  let current=null;
  const page=el('section','folder-page');page.hidden=true;page.setAttribute('aria-label','資料夾內容');app.querySelector('.main').append(page);
  function hide(){current=null;page.hidden=true;app.classList.remove('folder-mode');}
  function show(id){const f=getFolder(id);if(!f)return;if(f.kind==='section'){onSection(id);return;}beforeOpen();current=id;page.hidden=false;app.classList.add('folder-mode');onChange();render();page.querySelector('h1')?.focus();}
  function render(){
    if(!current)return;
    const folder=getFolder(current);if(!folder){hide();onChange();return;}
    page.replaceChildren();
    const top=el('div','folder-top');
    const menu=button('','list',toggleSidebar,'icon-btn');menu.setAttribute('aria-label','打開側欄');
    const back=button('返回畫布','arrow-left',()=>{hide();onClose();},'btn btn-ghost');
    const crumbs=el('nav','folder-crumbs');crumbs.setAttribute('aria-label','資料夾路徑');
    const chain=[];for(let f=folder;f&&chain.length<100;f=getFolder(f.parentId))chain.unshift(f);
    crumbs.append(el('span','','心智圖'));
    for(const f of chain){crumbs.append(el('span','folder-slash','/'));const b=button(f.name,'folder2',()=>show(f.id),'folder-crumb');if(f.id===current)b.setAttribute('aria-current','page');crumbs.append(b);}
    top.append(menu,crumbs,back);
    const body=el('div','folder-body'),hero=el('header','folder-hero'),copy=el('div');
    copy.append(el('span','folder-eyebrow','我的心智圖 / 資料夾'));
    const title=el('h1','',folder.name);title.tabIndex=-1;copy.append(title);
    const subs=getFolders(current),maps=getMaps(current);
    copy.append(el('p','folder-summary',`${maps.length} 張心智圖 · ${subs.length} 個子資料夾`));
    const actions=el('div','folder-actions');
    const rename=button('重新命名','pencil',()=>{
      if(!canEdit()||copy.querySelector('input'))return;
      const input=el('input','folder-title-edit');input.value=folder.name;input.setAttribute('aria-label','資料夾名稱');title.replaceWith(input);input.focus();input.select();
      let finished=false;
      const finish=cancel=>{if(finished)return;finished=true;if(cancel)render();else onRename(current,input.value.trim()||'未命名資料夾');page.querySelector('h1')?.focus();};
      input.addEventListener('blur',()=>finish(false));
      input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(false);}if(e.key==='Escape'){e.preventDefault();finish(true);}});
    },'btn btn-ghost');
    const more=button('資料夾選項','three-dots',e=>onMenu(current,e.currentTarget),'btn btn-ghost');
    more.dataset.folderMore=current;
    rename.disabled=more.disabled=!canEdit();actions.append(rename,more);hero.append(copy,actions);
    const create=el('div','folder-create');
    const mapButton=button('新增心智圖','plus-lg',()=>onCreateMap(current),'folder-create-map');
    const folderButton=button('新增子資料夾','folder-plus',()=>onCreateFolder(current),'folder-create-sub');
    mapButton.disabled=folderButton.disabled=!canEdit();create.append(mapButton,folderButton);
    const grid=el('div','folder-grid');
    for(const f of subs){const card=button('','folder2',()=>show(f.id),'folder-card folder-card-folder');card.append(el('strong','',f.name),el('span','','子資料夾'));grid.append(card);}
    for(const m of maps){const card=button('','diagram-3',()=>onOpenMap(m.id),'folder-card');card.append(el('strong','',m.title||'未命名心智圖'),el('span','','心智圖'));grid.append(card);}
    body.append(hero,create,el('h2','folder-section-title','資料夾內容'));
    if(!maps.length&&!subs.length){const empty=el('div','folder-empty-state');empty.append(icon('folder2-open'),el('h2','','從第一張心智圖開始'),el('p','','把相關想法放在一起，慢慢整理成你的思考空間。'));body.append(empty);}else body.append(grid);
    page.append(top,body);
  }
  return {show,hide,refresh:render,isOpen:()=>!!current,current:()=>current,destroy:()=>page.remove()};
}
