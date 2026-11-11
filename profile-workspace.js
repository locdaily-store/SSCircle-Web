/* Profile workspace: three categories, with every available card shown together. */
'use strict';
(()=>{
  const groups=[
    {id:'overview',label:'Profile',parts:['welcome','achievements','stats']},
    {id:'settings',label:'Pengaturan Akun',parts:['linking','security','preferences']},
    {id:'community',label:'Komunitas',parts:['social','explore']}
  ];
  const standardOrders=[
    ['welcome','social','security','preferences','achievements','linking','stats','explore'],
    ['welcome','security','preferences','achievements','linking','stats','social','explore']
  ];
  const init=()=>{
    const nav=document.getElementById('player-workspace-nav');
    const dashboard=document.querySelector('#player-content .player-dashboard');
    const main=nav?.querySelector('.player-workspace-main');
    if(!nav||!dashboard||!main)return;
    const sections=new Map([...dashboard.querySelectorAll('[data-profile-section]')]
      .map(section=>[section.dataset.profileSection,section]));
    const available=id=>Boolean(sections.get(id)&&!sections.get(id).hidden);
    const hasContent=group=>group.parts.some(available);
    const findGroup=id=>groups.find(group=>group.id===id||group.parts.includes(id));
    let selected='overview';

    // Keep the requested card sequence for legacy layouts, but retain custom Profile Studio ordering.
    function syncOrder(){
      const current=[...dashboard.querySelectorAll('[data-profile-section]')]
        .map(section=>section.dataset.profileSection);
      const useDefault=standardOrders.some(order=>order.join('|')===current.join('|'));
      for(const group of groups){
        group.parts.forEach((id,index)=>{
          const section=sections.get(id);
          if(section)section.style.order=useDefault?String(index):'';
        });
      }
    }

    function navigate(target='overview',scroll=false){
      let active=findGroup(target);
      if(!active||!hasContent(active))active=groups.find(hasContent);
      syncOrder();
      if(!active){
        nav.hidden=true;
        return;
      }
      nav.hidden=false;
      selected=active.id;
      for(const [key,section] of sections){
        section.dataset.workspaceActive=String(active.parts.includes(key)&&available(key));
      }
      for(const button of main.querySelectorAll('[data-workspace-group]')){
        const group=groups.find(item=>item.id===button.dataset.workspaceGroup);
        button.hidden=!group||!hasContent(group);
        button.setAttribute('aria-pressed',String(group===active));
      }
      dashboard.dataset.workspaceReady='true';
      if(scroll){
        nav.scrollIntoView({
          behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',
          block:'start'
        });
      }
    }

    for(const group of groups){
      const button=document.createElement('button');
      button.type='button';
      button.className='player-workspace-button';
      button.textContent=group.label;
      button.dataset.workspaceGroup=group.id;
      const ids=group.parts.map(id=>{
        const section=sections.get(id);
        if(!section)return null;
        section.id=section.id||'ssc-profile-panel-'+id;
        return section.id;
      }).filter(Boolean);
      button.setAttribute('aria-controls',ids.join(' '));
      button.addEventListener('click',()=>navigate(group.id,true));
      main.append(button);
    }
    window.addEventListener('ssc-profile-layout-change',()=>navigate(selected,false));
    navigate(selected,false);
    // Older callers may still request a single section; they now open its parent category.
    window.SSCircleProfileWorkspace={open:id=>navigate(id,true)};
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
