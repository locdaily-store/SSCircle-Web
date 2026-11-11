/* SSCircle V10.43: validated Profile Studio presentation on member and preview. */
'use strict';
window.SSCircleProfileLayout=(()=>{
  const ids=['welcome','security','preferences','achievements','linking','stats','community','explore'];
  function apply(settings={}){
    const main=document.querySelector('.player-main');
    if(!main)return;
    const title=(typeof settings.profilePageTitle==='string'&&settings.profilePageTitle.trim()?
      settings.profilePageTitle.trim():'Profile').slice(0,90);
    const subtitle=(typeof settings.profilePageSubtitle==='string'&&settings.profilePageSubtitle.trim()?
      settings.profilePageSubtitle.trim():'Ruang pribadi anggota SSCircle.').slice(0,350);
    main.classList.toggle('is-profile-compact',settings.profilePageHeroStyle==='compact');
    main.classList.toggle('is-profile-outlined',settings.profilePageCardStyle==='outlined');
    const heading=document.getElementById('player-heading');
    if(heading){
      const accent=document.createElement('em');
      accent.textContent='.';
      heading.replaceChildren(document.createTextNode(title.replace(/[.!]+$/,'')||'Profile'),accent);
    }
    const description=document.getElementById('player-subtitle');
    if(description)description.textContent=subtitle;
    const layout=document.getElementById('player-content');
    layout?.classList.toggle('is-stacked',settings.profilePageLayout==='stacked');
    const dashboard=document.querySelector('.player-dashboard');
    if(!dashboard)return;
    const order=Array.isArray(settings.profilePageSections)?settings.profilePageSections:ids;
    const arranged=[...new Set(order)].filter(id=>ids.includes(id));
    for(const id of ids)if(!arranged.includes(id))arranged.push(id);
    const hidden=Array.isArray(settings.profilePageHidden)?settings.profilePageHidden:[];
    for(const id of arranged){
      const block=dashboard.querySelector('[data-profile-section="'+id+'"]');
      if(!block)continue;
      block.hidden=id!=='security'&&hidden.includes(id);
      dashboard.append(block);
    }
  }
  const preview=new URLSearchParams(location.search).has('ssc_theme_preview');
  if(preview){
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==parent||
         event.data?.type!=='ssc-profile-preview-settings')return;
      apply(event.data.settings);
    });
    document.addEventListener('DOMContentLoaded',()=>{
      if(parent!==window)parent.postMessage({type:'ssc-profile-preview-ready'},location.origin);
    });
  }else{
    fetch('/api/form',{credentials:'same-origin',cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(payload=>payload?.settings&&apply(payload.settings))
      .catch(()=>{});
  }
  return {apply};
})();