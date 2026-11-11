/* SSCircle V10.43: Profile Studio with pointer reorder, keyboard access and device preview. */
'use strict';
window.SSCircleProfileAdmin=(()=>{
  const labels=[['welcome','Sambutan anggota'],['security','Keamanan akun'],
    ['preferences','Pengaturan profil'],['achievements','Penghargaan'],
    ['linking','Akun Minecraft'],['stats','Statistik permainan'],['community','Cari Member & Teman'],['explore','Jelajahi komunitas']];
  const known=labels.map(row=>row[0]);
  const root=document.getElementById('profile-admin-root');
  const frame=document.getElementById('profile-admin-preview-frame');
  const deviceBox=document.getElementById('profile-preview-devices');
  const create=(tag,cls='',text)=>{
    const el=document.createElement(tag);if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  let state=null,changed=()=>{},timer=null,previewDevice='desktop';
  function defaults(){
    const s=state.settings;
    // Existing 7-section saved layouts must retain their custom order on upgrade.
    if(Array.isArray(s.profilePageSections)&&s.profilePageSections.length===known.length-1&&
      !s.profilePageSections.includes('community')&&new Set(s.profilePageSections).size===known.length-1&&
      s.profilePageSections.every(id=>known.includes(id))){
      const i=s.profilePageSections.indexOf('explore');
      s.profilePageSections.splice(i<0?s.profilePageSections.length:i,0,'community');
    }
    if(!Array.isArray(s.profilePageSections)||s.profilePageSections.length!==known.length||
      new Set(s.profilePageSections).size!==known.length ||
      s.profilePageSections.some(id=>!known.includes(id)))s.profilePageSections=known.slice();
    if(!Array.isArray(s.profilePageHidden))s.profilePageHidden=[];
    s.profilePageHidden=s.profilePageHidden.filter(id=>id!=='security'&&known.includes(id));
  }
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(!state||!frame?.contentWindow)return;
      frame.contentWindow.postMessage({type:'ssc-profile-preview-settings',
        settings:structuredClone(state.settings)},location.origin);
      frame.contentWindow.postMessage({type:'ssc-theme-preview-settings',
        settings:structuredClone(state.settings)},location.origin);
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
  function choice(label,values,selected,change){
    const wrap=create('label','ssc-profile-admin-field');
    wrap.append(create('span','',label));
    const select=create('select');
    for(const [value,text] of values){
      const option=create('option','',text);option.value=value;select.append(option);
    }
    select.value=values.some(row=>row[0]===selected)?selected:values[0][0];
    select.addEventListener('change',()=>{change(select.value);mark();});
    wrap.append(select);return wrap;
  }
  function move(id,to){
    const previous=state.settings.profilePageSections;
    const from=previous.indexOf(id);
    if(from<0||to<0||to>=previous.length||from===to)return;
    const order=previous.slice();
    order.splice(from,1);order.splice(to,0,id);
    state.settings.profilePageSections=order;
    draw();mark();
    root.querySelector('[data-section-id="'+id+'"] .ssc-profile-drag-handle')?.focus();
    const announce=document.getElementById('profile-sort-status');
    if(announce)announce.textContent=(labels.find(row=>row[0]===id)?.[1]||id)+
      ' dipindahkan ke urutan '+(to+1)+'.';
  }
  function draw(){
    if(!root||!state)return;
    defaults();root.replaceChildren();
    const fields=create('section','panel ssc-profile-admin-fields');
    fields.append(create('h2','','Identitas & tampilan halaman'));
    fields.append(create('p','field-help','Pengaturan ini hanya mengubah tampilan Profile, bukan data pribadi anggota.'));
    fields.append(field('Judul halaman',state.settings.profilePageTitle||'Profile',90,
      value=>state.settings.profilePageTitle=value));
    fields.append(field('Deskripsi pembuka',state.settings.profilePageSubtitle||'',350,
      value=>state.settings.profilePageSubtitle=value));
    fields.append(choice('Tata letak',[
      ['sidebar','Sidebar dan konten'],['stacked','Lebar penuh / bertumpuk']],
      state.settings.profilePageLayout,value=>state.settings.profilePageLayout=value));
    fields.append(choice('Ukuran bagian pembuka',[
      ['default','Pembuka luas'],['compact','Ringkas']],
      state.settings.profilePageHeroStyle,value=>state.settings.profilePageHeroStyle=value));
    fields.append(choice('Gaya kartu',[
      ['soft','Kartu lembut'],['outlined','Garis tepi lebih tegas']],
      state.settings.profilePageCardStyle,value=>state.settings.profilePageCardStyle=value));
    const section=create('section','panel ssc-profile-admin-fields');
    section.append(create('h2','','Urutan kartu Profile'));
    section.append(create('p','field-help','Geser ikon pegangan untuk memindahkan kartu, atau gunakan tombol panah. Berfungsi juga dengan layar sentuh. Keamanan akun selalu tampil.'));
    const list=create('div','ssc-profile-admin-list');
    list.id='profile-sort-list';
    state.settings.profilePageSections.forEach((id,index)=>{
      const label=labels.find(row=>row[0]===id)?.[1]||id;
      const card=create('div','ssc-profile-admin-card');card.dataset.sectionId=id;
      const handle=create('button','ssc-profile-drag-handle','⠿');
      handle.type='button';handle.setAttribute('aria-label','Geser '+label+'. Gunakan tombol panah untuk mengubah urutan.');
      handle.title='Geser kartu';handle.setAttribute('aria-roledescription','pegangan kartu');
      const toggle=create('label','ssc-profile-admin-switch');
      const check=create('input');check.type='checkbox';
      check.checked=!state.settings.profilePageHidden.includes(id);
      check.disabled=id==='security';
      check.addEventListener('change',()=>{
        const hidden=state.settings.profilePageHidden.filter(item=>item!==id);
        if(!check.checked)hidden.push(id);
        state.settings.profilePageHidden=hidden;mark();
      });
      toggle.append(check,create('span','',label));
      const arrows=create('div','ssc-profile-admin-arrows');
      for(const [icon,dir,word] of [['↑',-1,'Naik'],['↓',1,'Turun']]){
        const button=create('button','button secondary',icon);
        button.type='button';button.disabled=index+dir<0||index+dir>=known.length;
        button.setAttribute('aria-label',word+' '+label);
        button.addEventListener('click',()=>move(id,index+dir));
        arrows.append(button);
      }
      handle.addEventListener('keydown',event=>{
        if(event.key==='ArrowUp'||event.key==='ArrowDown'){
          event.preventDefault();move(id,index+(event.key==='ArrowUp'?-1:1));
        }
      });
      let drag=null;
      const clear=()=>{
        if(!drag)return;
        card.classList.remove('is-dragging');card.style.removeProperty('transform');
        list.querySelectorAll('.ssc-profile-admin-card').forEach(row=>{
          row.classList.remove('is-drop-before','is-drop-after');
        });
        drag=null;
      };
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0||drag)return;
        drag={pointerId:event.pointerId,startY:event.clientY,dropIndex:index};
        handle.setPointerCapture(event.pointerId);
        card.classList.add('is-dragging');event.preventDefault();
      });
      handle.addEventListener('pointermove',event=>{
        if(!drag||drag.pointerId!==event.pointerId)return;
        card.style.transform='translateY('+(event.clientY-drag.startY)+'px)';
        const others=Array.from(list.querySelectorAll('.ssc-profile-admin-card')).filter(row=>row!==card);
        let target=others.findIndex(row=>{
          const rect=row.getBoundingClientRect();
          return event.clientY<rect.top+rect.height/2;
        });
        if(target<0)target=others.length;
        drag.dropIndex=target;
        others.forEach((row,i)=>{
          row.classList.toggle('is-drop-before',i===target);
          row.classList.toggle('is-drop-after',target===others.length&&i===others.length-1);
        });
      });
      handle.addEventListener('pointerup',event=>{
        if(!drag||drag.pointerId!==event.pointerId)return;
        const target=drag.dropIndex;clear();move(id,target);
      });
      handle.addEventListener('pointercancel',clear);
      handle.addEventListener('lostpointercapture',clear);
      card.append(handle,toggle,arrows);list.append(card);
    });
    section.append(list);
    const status=create('p','ssc-profile-sort-status');
    status.id='profile-sort-status';status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');section.append(status);
    const reset=create('button','button secondary','Kembalikan tampilan bawaan');
    reset.type='button';reset.addEventListener('click',()=>{
      if(!window.confirm('Kembalikan susunan, gaya kartu dan teks Profile ke tampilan awal?'))return;
      Object.assign(state.settings,{profilePageTitle:'Profile',
        profilePageSubtitle:'Ruang pribadimu untuk melihat keanggotaan, aktivitas, dan perjalanan bersama komunitas SSCircle.',
        profilePageLayout:'sidebar',profilePageHeroStyle:'default',profilePageCardStyle:'soft',
        profilePageSections:known.slice(),profilePageHidden:[]});
      draw();mark();
    });
    section.append(reset);
    root.append(fields,section);schedule();
  }
  function showDevice(name){
    previewDevice=name==='mobile'?'mobile':'desktop';
    const stage=document.getElementById('profile-preview-stage');
    if(stage)stage.dataset.device=previewDevice;
    deviceBox?.querySelectorAll('[data-profile-device]').forEach(button=>{
      const active=button.dataset.profileDevice===previewDevice;
      button.setAttribute('aria-pressed',String(active));
      button.classList.toggle('is-current',active);
    });
    schedule();
  }
  deviceBox?.addEventListener('click',event=>{
    const button=event.target.closest('[data-profile-device]');
    if(button)showDevice(button.dataset.profileDevice);
  });
  function render(data,notify){state=data;changed=notify;draw();showDevice(previewDevice);}
  frame?.addEventListener('load',schedule);
  window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===frame?.contentWindow&&
       event.data?.type==='ssc-profile-preview-ready')schedule();
  });
  return {render,schedule};
})();