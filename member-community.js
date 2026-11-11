/* SSCircle V10.49.3 • Member discovery and friends, password-session only. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const root=$('ssc-member-community');
  if(!root)return;
  let enabled=false,selected=null,items=[],connections=[],busy=false;
  const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,28}$/;
  async function api(path,method='GET',body){
    const response=await fetch(path,{method,cache:'no-store',credentials:'same-origin',
      headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw Error(data?.error||'Tidak bisa menghubungi server.');
    return data;
  }
  const note=(message,warning=false)=>{
    $('ssc-community-notice').textContent=message;
    $('ssc-community-notice').dataset.warning=String(warning);
  };
  const el=(tag,className,text)=>{
    const e=document.createElement(tag);
    if(className)e.className=className;
    if(text!==undefined)e.textContent=String(text);
    return e;
  };
  const action=(label,handler,secondary=false)=>{
    const b=el('button','player-action '+(secondary?'player-action-secondary':'player-action-primary'),label);
    b.type='button';
    b.addEventListener('click',async()=>{
      if(b.disabled)return;
      b.disabled=true;
      try{await handler();}catch(error){note(error.message,true)}
      finally{b.disabled=false;}
    });
    return b;
  };
  const date=value=>{
    if(!value)return 'Belum diketahui';
    const n=new Date(value);
    return Number.isFinite(n.getTime())
      ?n.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):'Belum diketahui';
  };
  function renderSearch(){
    const list=$('ssc-community-results');list.replaceChildren();
    if(!items.length){list.append(el('p','player-helper','Belum ada profil yang cocok atau diizinkan untuk dilihat.'));return;}
    for(const m of items){
      const card=el('div','ssc-member-result');
      const name=el('strong','',m.displayName);
      const detail=el('small','',m.visibility==='members'?'Profil anggota':'Profil publik');
      const texts=el('div','ssc-member-result-info');texts.append(name,detail);
      card.append(texts,action('Lihat profil',()=>showProfile(m.id),true));
      list.append(card);
    }
  }
  function renderConnections(){
    const buckets={received:$('ssc-community-incoming'),sent:$('ssc-community-outgoing'),friends:$('ssc-community-friends')};
    for(const part of Object.values(buckets))part.replaceChildren();
    for(const c of connections){
      if(!buckets[c.state])continue;
      const card=el('div','ssc-member-result');
      const name=el('strong','',c.displayName);
      const text=el('small','',c.state==='received'?'Mengirim permintaan pertemanan':
        c.state==='sent'?'Menunggu jawaban':'Teman SSCircle');
      const intro=el('div','ssc-member-result-info');intro.append(name,text);
      const acts=el('div','ssc-member-actions');
      if(c.state==='received'){
        acts.append(action('Terima',()=>respond(c.id,'accept')),
          action('Tolak',()=>respond(c.id,'decline'),true));
      }else if(c.state==='sent'){
        acts.append(action('Batalkan',()=>remove(c.memberId),true));
      }else{
        acts.append(action('Lihat',()=>showProfile(c.memberId),true),
          action('Hapus teman',async()=>{
            if(!confirm('Hapus hubungan pertemanan ini?'))return;
            await remove(c.memberId);
          },true));
      }
      card.append(intro,acts);buckets[c.state].append(card);
    }
    for(const [name,part] of Object.entries(buckets)){
      if(!part.children.length)part.append(el('p','player-helper',
        name==='received'?'Belum ada permintaan masuk.':
        name==='sent'?'Belum ada permintaan terkirim.':'Belum ada teman yang terhubung.'));
    }
    $('ssc-community-friends-count').textContent=String(connections.filter(c=>c.state==='friends').length);
    $('ssc-community-incoming-count').textContent=String(connections.filter(c=>c.state==='received').length);
  }
  async function reloadConnections(){
    if(!enabled)return;
    const payload=await api('/api/player/community/connections');
    connections=payload.items||[];
    renderConnections();
  }
  async function search(){
    if(!enabled)return;
    $('ssc-community-search').disabled=true;
    try{
      const q=$('ssc-community-query').value.trim();
      const payload=await api('/api/player/community/search?q='+encodeURIComponent(q));
      items=payload.items||[];renderSearch();
      if(!q)note('Menampilkan hingga 25 profil anggota yang mengizinkan pencarian.');
      else note('Hasil untuk “'+q+'”: '+items.length+' member.');
    }catch(error){items=[];renderSearch();note(error.message,true)}
    finally{$('ssc-community-search').disabled=false;}
  }
  const refresh=async()=>{
    await Promise.allSettled([search(),reloadConnections()]);
  };
  async function respond(id,kind){
    await api('/api/player/community/respond','POST',{id,action:kind});
    note(kind==='accept'?'Permintaan pertemanan diterima.':'Permintaan ditolak.');
    await reloadConnections();
    if(selected)await showProfile(selected);
  }
  async function remove(memberId){
    await api('/api/player/community/remove','POST',{memberId});
    note('Hubungan pertemanan atau permintaan berhasil dibatalkan.');
    await reloadConnections();
    if(selected)await showProfile(selected);
  }
  async function add(memberId){
    await api('/api/player/community/request','POST',{memberId});
    note('Permintaan pertemanan dikirim ke Mail Box member.');
    await reloadConnections();
    if(selected)await showProfile(selected);
  }
  function statValue(value){
    return typeof value==='number'&&Number.isFinite(value)?Math.max(0,value).toLocaleString('id-ID'):'–';
  }
  async function showProfile(id){
    if(!enabled)return;
    const panel=$('ssc-community-profile');
    panel.replaceChildren(el('p','player-helper','Memuat profil member...'));
    selected=id;
    try{
      const x=await api('/api/player/community/profile/'+encodeURIComponent(id));
      if(selected!==id)return;
      panel.replaceChildren();
      const head=el('div','ssc-member-profile-head');
      const names=el('div','');
      names.append(el('h3','',x.profile.displayName),el('small','',
        'Bergabung sejak '+date(x.profile.joinedAt)));
      if(x.accounts?.length){
        const main=x.accounts[0];
        names.append(el('small','','Minecraft: '+main.username));
        if(main.skinImageStored){
          const avatar=window.SSCircleMinecraftAvatars?.cardAvatar(main);
          if(avatar)head.append(avatar);
        }
      }
      head.append(names);panel.append(head);
      if(x.profile.bio)panel.append(el('p','ssc-member-bio',x.profile.bio));
      const controls=el('div','ssc-member-actions');
      if(x.friendship==='none'||x.friendship==='declined')
        controls.append(action('Tambah teman',()=>add(id)));
      if(x.friendship==='received'){
        const c=connections.find(v=>v.memberId===id&&v.state==='received');
        if(c)controls.append(action('Terima permintaan',()=>respond(c.id,'accept')),
          action('Tolak',()=>respond(c.id,'decline'),true));
      }
      if(x.friendship==='sent')controls.append(el('span','player-tag','Permintaan terkirim'));
      if(x.friendship==='friends')controls.append(el('span','player-tag','✓ Sudah berteman'));
      panel.append(controls);
      const skinWrap=el('div','ssc-member-skins');
      for(const a of x.accounts||[]){
        const card=el('div','ssc-member-skin');
        card.append(el('strong','',a.username),el('small','',a.edition||'Minecraft'));
        if(a.skinImageStored){
          card.append(action('Lihat skin 3D',()=>{
            window.SSCircleMinecraftAvatars?.openPreview(a);
          },true));
        }else card.append(el('small','','Skin belum tersimpan di website.'));
        skinWrap.append(card);
      }
      if(x.accounts?.length){panel.append(el('h4','','Skin dan akun Minecraft'),skinWrap);}
      if(x.profile.showStats&&x.statistics?.length){
        const stats=el('div','ssc-member-stats');
        for(const r of x.statistics.slice(0,30)){
          const row=el('div','ssc-member-stat-row');
          const label=r.seasonId?.startsWith('season:')?'Season '+r.seasonId.split(':')[1]:
            'Sepanjang masa';
          row.append(el('strong','',label),
            el('span','','⏱ '+statValue(Math.floor((r.playtimeSeconds||0)/3600))+' jam'),
            el('span','','☠ '+statValue(r.deaths)+' deaths'),
            el('span','','⚔ '+statValue(r.mobKills)+' mob kills'),
            el('span','','⛏ '+statValue(r.blocksMined)+' blocks'));
          stats.append(row);
        }
        panel.append(el('h4','','Statistik permainan'),stats);
      }else panel.append(el('p','player-helper','Statistik disembunyikan oleh pemilik profil atau belum tersinkron.'));
      if(x.achievements?.length){
        panel.append(el('h4','','Penghargaan SSCircle'));
        for(const a of x.achievements.slice(0,12))
          panel.append(el('p','ssc-member-award','★ '+a.title+' · '+a.seasonTitle));
      }
    }catch(error){
      if(selected===id)panel.replaceChildren(el('p','player-helper',
        error.message||'Profil tidak dapat ditampilkan.'));
    }
  }
  function setAvailable(value){
    enabled=value===true;
    for(const field of [$('ssc-community-query'),$('ssc-community-search'),$('ssc-community-reload')])
      field.disabled=!enabled;
    if(!enabled){
      selected=null;items=[];connections=[];
      $('ssc-community-results').replaceChildren();
      $('ssc-community-profile').replaceChildren();
      for(const id of ['ssc-community-incoming','ssc-community-outgoing','ssc-community-friends'])
        $(id).replaceChildren();
      note('Masuk dengan password Dashboard untuk mencari member dan mengelola teman.');
    }else{
      note('Cari nama tampilan atau username Minecraft member yang membagikan profil.');
      void refresh();
    }
  }
  $('ssc-community-search-form').addEventListener('submit',event=>{
    event.preventDefault();void search();
  });
  $('ssc-community-reload').addEventListener('click',()=>{void refresh();});
  window.SSCircleMemberSocial=Object.freeze({setAvailable,refresh});
  setAvailable(false);
})();