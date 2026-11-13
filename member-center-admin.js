/* SSCircle V10.36 - Kelola Pemain. Source of awards: Season Archive only. */
'use strict';
window.SSCircleMemberCenterAdmin = (() => {
  const root = document.getElementById('members-admin-root');
  const el=(tag,cls='',value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
  const button=(label,action,cls='button secondary')=>{const b=el('button',cls,label);b.type='button';b.onclick=action;return b;};
  const tabs=[
    ['roster','Daftar Anggota'],['verify','Verifikasi Akun'],
    ['stats','Player Statistics'],['awards','Achievement Manager'],
    ['policy','Profile Settings'],['security','Login & Security'],
    ['seasons','Season Statistics']
  ];
  let snapshot={items:[],awards:[],policy:{}},current='roster',busy=false,search='',statusFilter='all';
  const api=async(path,options={})=>{
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Permintaan tidak berhasil.');
    return result;
  };
  const empty=(message)=>el('p','member-admin-empty',message);
  const heading=(title,description='')=>{
    const box=el('div','member-admin-section-heading');
    box.append(el('h2','',title));
    if(description)box.append(el('p','',description));
    return box;
  };
  const memberName=m=>m.displayName||'Anggota '+String(m.id||'').slice(0,8).toUpperCase();
  const message=(value,error=false)=>{const node=document.getElementById('member-admin-message');if(node){node.textContent=value;node.dataset.error=String(error);}};
  async function refreshData(){
    const items=[];let offset=0,first=null;
    for(let page=0;page<50;page++){
      const result=await api('/api/admin/member-center?offset='+offset);
      if(!first)first=result;
      items.push(...(result.items||[]));
      if(!result.hasMore)break;
      offset+=result.items.length;
      if(!result.items.length)break;
    }
    snapshot={items,awards:first?.awards||[],policy:first?.policy||{},total:first?.total||0};
  }
  function switchTab(id){current=id;draw();}
  function renderTable(parent,rows,actions=false){
    if(!rows.length){parent.append(empty('Belum ada anggota yang cocok dengan filter.'));return;}
    const list=el('div','member-admin-list');
    for(const m of rows){
      const card=el('article','member-admin-member');
      const info=el('div','member-admin-member-info');
      info.append(el('strong','',memberName(m)),el('small','',String(m.id).slice(0,8).toUpperCase()));
      const meta=el('div','member-admin-member-meta');
      const status={accepted:'Diterima',pending:'Menunggu',rejected:'Ditolak'}[m.status]||m.status;
      meta.append(el('span','member-admin-chip',status),el('span','',m.linkedCount+' akun Minecraft'));
      if(actions)meta.append(el('span','member-admin-chip',m.secureActive?'Password aktif':'Belum aktivasi'),el('span','',String(m.secureSessions||0)+' sesi aman'));
      if(actions&&m.activationRequest==='pending')meta.append(el('span','member-admin-chip','Menunggu verifikasi aktivasi'));
      if(m.lastSync)meta.append(el('small','','Sync: '+new Date(m.lastSync).toLocaleString('id-ID')));
      else meta.append(el('small','','Statistik: belum tersedia'));
      card.append(info,meta);
      if(actions){
        const actions=el('div','member-admin-actions');
        actions.append(button('Verifikasi & kirim kode ke Mail Box',()=>issueInvite(m),'button secondary'),
          button('Cabut sesi',()=>revoke(m),'button secondary member-admin-danger'));
        card.append(actions);
      }
      list.append(card);
    }
    parent.append(list);
  }
  function draw(){
    root.replaceChildren();
    const nav=el('div','member-admin-tabs');
    for(const [id,label] of tabs){
      const b=button(label,()=>switchTab(id),'member-admin-tab'+(current===id?' is-active':''));
      b.setAttribute('aria-pressed',String(current===id));
      nav.append(b);
    }
    root.append(nav);
    const content=el('section','panel member-admin-panel');
    const note=el('p','member-admin-message');note.id='member-admin-message';note.setAttribute('role','status');
    if(current==='roster'){
      content.append(heading('Daftar anggota','Cari pendaftar berdasarkan nama profil, ID anggota, atau status. Identitas Minecraft akan muncul setelah verifikasi resmi.'));
      const tools=el('div','member-admin-filters');
      const input=el('input');input.type='search';input.placeholder='Cari nama atau ID anggota...';input.value=search;input.setAttribute('aria-label','Cari anggota');
      const statuses=el('select');statuses.setAttribute('aria-label','Filter status');
      for(const [value,label] of [['all','Semua status'],['accepted','Diterima'],['pending','Menunggu'],['rejected','Ditolak']]){
        const o=el('option','',label);o.value=value;statuses.append(o);
      }
      statuses.value=statusFilter;
      const list=el('div');
      const drawList=()=>{list.replaceChildren();const q=search.toLowerCase().trim();const rows=snapshot.items.filter(m=>
        (statusFilter==='all'||m.status===statusFilter)&&(!q||memberName(m).toLowerCase().includes(q)||m.id.toLowerCase().includes(q)));
        renderTable(list,rows);
      };
      input.oninput=()=>{search=input.value;drawList();};
      statuses.onchange=()=>{statusFilter=statuses.value;drawList();};
      tools.append(input,statuses);
      content.append(tools,list);drawList();
    }else if(current==='verify'){
      content.append(heading('Verifikasi akun Minecraft',
        'Identitas berasal dari plugin server terautentikasi dan dikonfirmasi oleh anggota. Tidak dapat dibuat dengan mengganti nama pemain.'));
      const verified=snapshot.items.filter(m=>m.linkedCount>0);
      renderTable(content,verified);
      if(!verified.length)content.append(empty('Belum ada akun Minecraft yang terverifikasi.'));
      const details=el('div','member-admin-list');
      const show=button('Lihat identitas yang tertaut',async()=>{
        show.disabled=true;details.replaceChildren();
        try{
          const data=await api('/api/admin/minecraft/links');
          if(!data.links?.length){details.append(empty('Belum ada akun tertaut.'));return;}
          const label={java_premium:'Java Premium',java_offline:'Java Non-Premium',bedrock:'Bedrock'};
          for(const linked of data.links){
            const card=el('article','member-admin-member');
            const owner=snapshot.items.find(member=>member.id===linked.memberId);
            const info=el('div','member-admin-member-info');
            info.append(el('strong','',linked.username),
              el('small','',(label[linked.provider]||'Minecraft')+' · '+(owner?memberName(owner):String(linked.memberId).slice(0,8).toUpperCase())));
            const meta=el('div','member-admin-member-meta');
            meta.append(el('span','member-admin-chip','Terverifikasi'),
              el('small','','Sejak: '+new Date(linked.linkedAt).toLocaleString('id-ID')));
            card.append(info,meta);details.append(card);
          }
        }catch(error){details.append(empty('Identitas belum dapat dimuat: '+error.message));}
        finally{show.disabled=false;}
      },'button secondary');
      content.append(show,details);
    }else if(current==='stats'){
      content.append(heading('Player Statistics','Memantau status sinkronisasi. Statistik tidak dibuat secara manual di website.'));
      renderTable(content,snapshot.items.filter(m=>m.lastSync));
      if(!snapshot.items.some(m=>m.lastSync)) content.append(empty('Belum ada statistik resmi yang dikirim oleh plugin SSCircle Player Sync.'));
    }else if(current==='awards'){
      content.append(heading('Achievement Manager','Penghargaan hanya dicatat di Season Archive dan dipetakan ke ID anggota, sehingga tidak perlu diinput ulang.'));
      const list=el('div','member-admin-list');
      for(const a of snapshot.awards){
        const card=el('article','member-admin-member');
        const name=snapshot.items.find(m=>m.id===a.memberId);
        const info=el('div','member-admin-member-info');
        info.append(el('strong','',a.title),el('small','',a.seasonTitle+' · '+(name?memberName(name):a.player||'Belum ditautkan')));
        card.append(info,el('span','member-admin-chip',a.memberId?'Anggota dipilih':'Belum dipilih'));
        list.append(card);
      }
      content.append(list.childElementCount?list:empty('Belum ada penghargaan pada Season Archive.'));
      content.append(button('Buka editor Season & Sejarah',()=>{
        document.querySelector('[data-tab="seasons-admin"]')?.click();
      },'button primary'));
    }else if(current==='policy'){
      content.append(heading('Profile Settings','Izin pencarian antaranggota dan profil publik diatur terpisah. Profil baru tetap Pribadi sampai pemilik mengubahnya.'));
      const form=el('form','member-admin-policy');
      const fields=[['allowBio','Izinkan pemain mengedit bio'],['allowMembers','Izinkan profil ditemukan sesama anggota'],['allowPublic','Izinkan opsi profil publik'],['allowStats','Izinkan statistik ditampilkan'],['allowEventAlerts','Izinkan pengingat event']];
      const controls={};
      for(const [key,label] of fields){
        const row=el('label','member-admin-switch'),input=el('input');
        input.type='checkbox';input.checked=snapshot.policy[key]===true;controls[key]=input;
        row.append(input,el('span','',label));form.append(row);
      }
      const save=button('Simpan pengaturan',async()=>{
        save.disabled=true;message('Menyimpan kebijakan...');
        try{
          const value=Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,v.checked]));
          const r=await api('/api/admin/member-policy',{method:'PUT',body:JSON.stringify(value)});
          snapshot.policy=r.policy;message('Pengaturan profil berhasil disimpan.');
        }catch(error){message(error.message,true)}
        finally{save.disabled=false}
      },'button primary');
      form.append(save);content.append(form);
    }else if(current==='security'){
      content.append(heading('Login & Security','Periksa kepemilikan akun melalui jalur terpisah, lalu kirim kode secara otomatis ke Mail Box anggota.'));
      const inviteResult=el('div','member-admin-invite-result');inviteResult.id='member-admin-invite-result';
      inviteResult.hidden=true;content.append(inviteResult);
      content.append(el('p','member-admin-advisory','Status Diterima saja bukan bukti kepemilikan akun. Pastikan pemohon telah membuktikan identitas melalui kontak resmi komunitas. Kode akan diterbitkan otomatis di Mail Box setelah verifikasi, tanpa admin menyalin atau mengirim kode secara manual.'));
      renderTable(content,snapshot.items.filter(m=>m.status==='accepted'),true);
    }else if(current==='seasons'){
      content.append(heading('Season Statistics','Penghargaan dari Season Archive ditampilkan tanpa duplikasi. Statistik permainan per season akan aktif ketika plugin sync siap.'));
      const groups=new Map();
      for(const a of snapshot.awards){
        const key=a.seasonTitle||a.seasonId;
        groups.set(key,(groups.get(key)||0)+1);
      }
      for(const [season,count] of groups)
        content.append(el('div','member-admin-season-line',season+' · '+count+' penghargaan'));
      if(!groups.size)content.append(empty('Belum ada riwayat penghargaan season.'));
      content.append(el('p','member-admin-advisory','Statistik per season akan ditampilkan setelah data pemain tersedia.'));
    }
    content.append(note);root.append(content);
    if(current==='policy'||current==='awards')
      void window.SSCircleCommunityAdmin?.render(current,content,snapshot,message);
  }
  async function issueInvite(member){
    if(member.status!=='accepted')return;
    const confirmed=await window.SSCircleDialog.confirm('Sudah memverifikasi identitas '+memberName(member)+' melalui kontak resmi yang berbeda dari kode pendaftaran? Jika yakin, sistem akan mengirim kode secara otomatis ke Mail Box.');
    if(!confirmed)return;
    message('Memproses verifikasi anggota...');
    try{
      const result=await api('/api/admin/mailbox/approve',{method:'POST',body:JSON.stringify({
        id:member.id,verification:'identity-confirmed'
      })});
      const panel=document.getElementById('member-admin-invite-result');
      if(panel){
        panel.replaceChildren();panel.hidden=false;
        panel.append(el('strong','',result.delivered?'Kode otomatis dikirim':'Permintaan berikutnya otomatis diproses'));
        panel.append(el('p','',result.message));
      }
      message(result.message);
      await refreshData();
    }catch(error){message('Gagal memverifikasi akun: '+error.message,true)}
  }
  async function revoke(member){
    const confirm=window.SSCNotice?.confirm
      ? await window.SSCNotice.confirm('Cabut semua sesi login milik '+memberName(member)+'?',{danger:true,confirmText:'Cabut sesi'})
      : await window.SSCircleDialog.confirm('Cabut semua sesi login milik '+memberName(member)+'?');
    if(!confirm)return;
    try{
      await api('/api/admin/member-revoke',{method:'POST',body:JSON.stringify({id:member.id})});
      await load(true);message('Semua sesi lama anggota berhasil dicabut.');
    }catch(error){message(error.message,true)}
  }
  async function load(force=false){
    if(busy)return;
    if(snapshot.items.length&&!force){draw();return;}
    busy=true;root.replaceChildren(el('p','field-help','Memuat data anggota...'));
    try{await refreshData();draw()}
    catch(error){root.replaceChildren(empty('Gagal memuat Kelola Pemain: '+error.message))}
    finally{busy=false}
  }
  return {load, getMembers:()=>snapshot.items};
})();