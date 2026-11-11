/* Profile workspace navigation. Presentation only: access checks remain on the Worker. */
'use strict';
(()=>{
  const groups=[
    {id:'overview',label:'Profile',parts:[['welcome','Ringkasan'],['achievements','Penghargaan'],['explore','Jelajahi']]},
    {id:'settings',label:'Pengaturan akun',parts:[['preferences','Pengaturan profil'],['security','Keamanan']]},
    {id:'minecraft',label:'Minecraft',parts:[['linking','Akun Minecraft'],['stats','Statistik']]},
    {id:'community',label:'Komunitas',parts:[['social','Member & Friends']]}
  ];
  const init=()=>{
    const nav=document.getElementById('player-workspace-nav');
    const dashboard=document.querySelector('#player-content .player-dashboard');
    if(!nav||!dashboard)return;
    const main=nav.querySelector('.player-workspace-main');
    const sub=nav.querySelector('.player-workspace-sub');
    if(!main||!sub)return;
    const sections=new Map([...dashboard.querySelectorAll('[data-profile-section]')]
      .map(el=>[el.dataset.profileSection,el]));
    let selected='welcome';
    const available=id=>sections.has(id)&&!sections.get(id).hidden;
    const groupFor=id=>groups.find(group=>group.parts.some(part=>part[0]===id));
    const pick=group=>group.parts.find(([id])=>available(id))?.[0];
    function navigate(id,scroll=false){
      if(!available(id))id=groups.map(pick).find(Boolean);
      if(!id)return;
      selected=id;
      for(const [key,section] of sections){
        section.dataset.workspaceActive=String(key===selected);
      }
      const active=groupFor(selected);
      for(const item of main.querySelectorAll('[data-workspace-group]')){
        const group=groups.find(g=>g.id===item.dataset.workspaceGroup);
        item.hidden=!group||!pick(group);
        item.setAttribute('aria-pressed',String(group===active));
      }
      sub.replaceChildren();
      // Respect Profile Studio's saved order within each category.
      const order=[...dashboard.querySelectorAll('[data-profile-section]')]
        .map(section=>section.dataset.profileSection);
      const parts=active.parts.filter(([key])=>available(key))
        .sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
      for(const [key,label] of parts){
        const button=document.createElement('button');
        button.type='button';button.className='player-workspace-button';
        button.textContent=label;button.setAttribute('aria-pressed',String(key===selected));
        const section=sections.get(key);
        section.id=section.id||'ssc-profile-panel-'+key;
        button.setAttribute('aria-controls',section.id);
        button.addEventListener('click',()=>navigate(key,true));
        sub.append(button);
      }
      dashboard.dataset.workspaceReady='true';
      if(scroll){
        nav.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      }
    }
    for(const group of groups){
      const button=document.createElement('button');
      button.type='button';button.className='player-workspace-button';
      button.textContent=group.label;button.dataset.workspaceGroup=group.id;
      button.addEventListener('click',()=>navigate(pick(group),true));
      main.append(button);
    }
    window.addEventListener('ssc-profile-layout-change',()=>navigate(selected,false));
    navigate(selected,false);
    window.SSCircleProfileWorkspace={open:id=>navigate(id,true)};
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
