/* SSCircle V10.41: compact Profile design editor with read-only preview. */
'use strict';
window.SSCircleProfileAdmin=(()=>{
  const ids=[['welcome','Sambutan anggota'],['security','Keamanan akun'],['preferences','Pengaturan profil'],
    ['achievements','Penghargaan'],['linking','Akun Minecraft'],['stats','Statistik permainan'],['explore','Jelajahi komunitas']];
  const known=ids.map(x=>x[0]);
  const root=document.getElementById('profile-admin-root');
  const frame=document.getElementById('profile-admin-preview-frame');
  const create=(tag,cls='',text)=>{
    const el=document.createElement(tag);if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  let state=null,changed=()=>{},timer;
  function defaults(){
    const s=state.settings;
    if(!Array.isArray(s.profilePageSections)||s.profilePageSections.length!==known.length)
      s.profilePageSections=known.slice();
    if(!Array.isArray(s.profilePageHidden))s.profilePageHidden=[];
  }
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(!state||!frame?.contentWindow)return;
      frame.contentWindow.postMessage({type:'ssc-profile-preview-settings',settings:
        structuredClone(state.settings)},location.origin);
      frame.contentWindow.postMessage({type:'ssc-theme-preview-settings',settings:
        structuredClone(state.settings)},location.origin);
    },120);
  }
  const mark=()=>{changed();schedule();};
  function field(label,value,max,change){
    const wrap=create('label','ssc-profile-admin-field');
    wrap.append(create('span','',label));
    const control=max>120?create('textarea'):create('input');
    control.maxLength=max;control.value=value||'';
    if(max>120)control.rows=3;
    control.addEventListener('input',()=>{change(control.value);mark();});
    wrap.append(control);return wrap;
  }
  function draw(){
    if(!root||!state)return;
    defaults();root.replaceChildren();
    const fields=create('section','panel ssc-profile-admin-fields');
    fields.append(create('h2','','Identitas halaman'));
    fields.append(create('p','field-help','Atur judul dan deskripsi. Teks hanya tampil di halaman Profile, bukan nama akun pemain.'));
    fields.append(field('Judul halaman',state.settings.profilePageTitle||'Profile',90,
      v=>state.settings.profilePageTitle=v));
    fields.append(field('Deskripsi pembuka',state.settings.profilePageSubtitle||'',350,
      v=>state.settings.profilePageSubtitle=v));
    const layout=create('label','ssc-profile-admin-field');
    layout.append(create('span','','Tata letak'));
    const select=create('select');
    for(const [val,label] of [['sidebar','Sidebar & konten (default)'],['stacked','Lebar penuh / bertumpuk']]){
      const option=create('option','',label);option.value=val;select.append(option);
    }
    select.value=state.settings.profilePageLayout==='stacked'?'stacked':'sidebar';
    select.onchange=()=>{state.settings.profilePageLayout=select.value;mark();};
    layout.append(select);fields.append(layout);
    const sections=create('section','panel ssc-profile-admin-fields');
    sections.append(create('h2','','Susunan dan visibilitas kartu'));
    sections.append(create('p','field-help','Gunakan panah untuk mengurutkan, dan centang untuk menampilkan. Keamanan akun selalu terlihat.'));
    const list=create('div','ssc-profile-admin-list');
    state.settings.profilePageSections.forEach((id,index)=>{
      const label=ids.find(x=>x[0]===id)?.[1]||id;
      const card=create('div','ssc-profile-admin-card');
      const toggle=create('label','ssc-profile-admin-switch');
      const check=create('input');check.type='checkbox';
      check.checked=!state.settings.profilePageHidden.includes(id);
      check.disabled=id==='security';
      check.onchange=()=>{
        const hidden=state.settings.profilePageHidden.filter(v=>v!==id);
        if(!check.checked)hidden.push(id);
        state.settings.profilePageHidden=hidden;
        mark();
      };
      toggle.append(check,create('span','',label));
      const actions=create('div','ssc-profile-admin-arrows');
      for(const [icon,dir,description] of [['↑',-1,'Naik'],['↓',1,'Turun']]){
        const button=create('button','button secondary',icon);button.type='button';
        button.disabled=index+dir<0||index+dir>=state.settings.profilePageSections.length;
        button.setAttribute('aria-label',description+' '+label);
        button.onclick=()=>{
          const order=state.settings.profilePageSections;
          [order[index],order[index+dir]]=[order[index+dir],order[index]];
          draw();mark();
        };
        actions.append(button);
      }
      card.append(toggle,actions);list.append(card);
    });
    sections.append(list);
    root.append(fields,sections);
    schedule();
  }
  function render(data,notify){state=data;changed=notify;draw();}
  frame?.addEventListener('load',schedule);
  window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===frame?.contentWindow&&
       event.data?.type==='ssc-profile-preview-ready')schedule();
  });
  return {render,schedule};
})();