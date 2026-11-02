const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
const icon=name=>{const n=el('i','bi bi-'+name);n.setAttribute('aria-hidden','true');return n;};
const button=(label,ic,action,cls='btn')=>{const n=el('button',cls,label);n.prepend(icon(ic));n.addEventListener('click',action);return n;};
export function setupSectionsPage({app,trigger,getSections,getSelected,select,getContent,getWorkspace,canEdit,create,rename,createMap,createFolder,openMap,openFolder,beforeOpen,onClose,onChange,toggleSidebar}){
  let opened=false,detail=false;
  const page=el('section','folder-page sections-page');page.hidden=true;page.setAttribute('aria-label','工作分區');app.querySelector('.main').append(page);
  function hide(){opened=false;page.hidden=true;app.classList.remove('sections-mode');trigger.classList.remove('active');}
  function show(showDetail=false){beforeOpen();opened=true;detail=showDetail;page.hidden=false;app.classList.add('sections-mode');trigger.classList.add('active');onChange();render();page.querySelector('h1')?.focus();}
  function nameForm(parent,initial,onSave){
    const form=el('form','section-name-form'),input=el('input');input.required=true;input.maxLength=200;input.value=initial;input.placeholder='例如：產品企劃、個人學習';input.setAttribute('aria-label','分區名稱');
    const save=el('button','folder-create-map','儲存');save.type='submit';
    const cancel=button('取消','x',()=>render(),'btn btn-ghost');cancel.type='button';form.append(input,save,cancel);parent.append(form);input.focus();input.select();
    form.addEventListener('submit',async e=>{e.preventDefault();const name=input.value.trim();if(!name)return;save.disabled=true;try{if(await onSave(name)!==false)render();else save.disabled=false;}catch{save.disabled=false;}});
  }
  function render(){
    if(!opened)return;
    page.replaceChildren();const selected=getSelected(),sections=getSections(),section=sections.find(s=>s.id===selected),name=section?.name||'一般分區';
    const top=el('div','folder-top'),menu=button('','list',toggleSidebar,'icon-btn');menu.setAttribute('aria-label','打開側欄');
    const crumbs=el('nav','folder-crumbs');crumbs.setAttribute('aria-label','分區路徑');crumbs.append(el('span','',getWorkspace()),el('span','','/'),button('工作分區','grid-1x2',()=>show(false),'folder-crumb'));
    if(detail)crumbs.append(el('span','','/'),el('span','',name));
    top.append(menu,crumbs,button('返回畫布','arrow-left',()=>{hide();onClose();},'btn btn-ghost'));
    const body=el('div','folder-body'),hero=el('header','folder-hero'),copy=el('div');copy.append(el('span','folder-eyebrow',detail?'工作區 / 分區 / 心智圖':'讓不同的工作，各有自己的空間'));
    const title=el('h1','',detail?name:'工作分區');title.tabIndex=-1;copy.append(title,el('p','folder-summary',detail?'這個分區的心智圖與資料夾':'依專案或主題分類，專注在眼前的工作。'));hero.append(copy);
    const actions=el('div','folder-create');body.append(hero,actions);
    if(!detail){
      const add=button('新增分區','plus-lg',()=>{add.disabled=true;nameForm(actions,'',async name=>{const id=await create(name);if(id===false)return false;select(id);detail=true;});},'folder-create-map');add.disabled=!canEdit();actions.append(add);
      const grid=el('div','folder-grid section-grid');
      for(const item of [{id:null,name:'一般分區'},...sections]){const content=getContent(item.id),card=button('','grid-1x2',()=>{select(item.id);show(true);},'folder-card section-card');card.append(el('strong','',item.name),el('span','',`${content.total} 張心智圖 · ${content.folders.length} 個資料夾`));if(item.id===selected)card.append(el('span','section-current','目前分區'));grid.append(card);}
      body.append(grid);
    }else{
      const add=button('新增心智圖','plus-lg',()=>createMap(),'folder-create-map'),sub=button('新增資料夾','folder-plus',()=>createFolder(),'folder-create-sub');add.disabled=sub.disabled=!canEdit();actions.append(add,sub);
      if(selected){const edit=button('重新命名','pencil',()=>{edit.disabled=true;nameForm(actions,name,n=>rename(selected,n));},'btn btn-ghost');edit.disabled=!canEdit();actions.append(edit);}
      const content=getContent(selected),grid=el('div','folder-grid');body.append(el('h2','folder-section-title','心智圖與資料夾'));
      for(const f of content.folders){const card=button('','folder2',()=>openFolder(f.id),'folder-card folder-card-folder');card.append(el('strong','',f.name),el('span','','資料夾'));grid.append(card);}
      for(const m of content.maps){const card=button('','diagram-3',()=>openMap(m.id),'folder-card');card.append(el('strong','',m.title||'未命名心智圖'),el('span','','心智圖'));grid.append(card);}
      if(!content.folders.length&&!content.maps.length){const empty=el('div','folder-empty-state');empty.append(icon('diagram-3'),el('h2','','從這個分區的第一張心智圖開始'),el('p','','在上方新增心智圖，或建立資料夾整理內容。'));body.append(empty);}else body.append(grid);
    }
    page.append(top,body);
  }
  const onClick=()=>show(false);trigger.addEventListener('click',onClick);
  return {show,hide,refresh:render,isOpen:()=>opened,destroy:()=>{trigger.removeEventListener('click',onClick);page.remove();}};
}
