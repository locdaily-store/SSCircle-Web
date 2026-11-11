/* SSCircle V10.43: safe multi-select Notification Center. Server text is textContent only.
   V10.50: pesan status pendaftaran, filter Status, tombol aktivasi hanya untuk pendaftar yang diterima. */
'use strict';
(() => {
  if (window.SSCircleMailbox) return;
  const dialog=document.createElement('dialog');
  dialog.id='ssc-mailbox-dialog';
  dialog.className='mailbox-page ssc-mailbox-modal theme-v3';
  dialog.setAttribute('aria-labelledby','ssc-mailbox-title');
  dialog.innerHTML = [
    '<div class="ssc-mailbox-head"><div><span class="mailbox-eyebrow">SSCIRCLE / NOTIFIKASI</span><h2 id="ssc-mailbox-title">Mail Box</h2></div>',
    '<button type="button" class="ssc-mailbox-close" id="ssc-mailbox-close" aria-label="Tutup Mail Box">×</button></div>',
    '<div class="ssc-mailbox-content">',
    '<section class="mailbox-request mailbox-surface"><div class="mailbox-request-copy"><h3>Kode aktivasi akun</h3>',
    '<p>Minta kode aktivasi di sini. Setelah identitas diverifikasi pengurus, kode tersedia di kotak masuk.</p>',
    '<small id="ssc-mailbox-request-hint" hidden>Kode aktivasi baru tersedia setelah pendaftaranmu diterima.</small>',
    '</div><button type="button" id="ssc-mailbox-request" class="mailbox-primary" disabled>Minta kode</button></section>',
    '<div class="ssc-mailbox-feedback"><p class="mailbox-message" id="ssc-mailbox-message" role="status" aria-live="polite"></p>',
    '<a id="ssc-mailbox-signin" href="/status.html#kode-milikku" hidden>Masuk melalui Cek Status</a></div>',
    '<div class="mailbox-grid">',
    '<section class="mailbox-surface mailbox-inbox" aria-label="Pesan pribadi">',
    '<div class="mailbox-inbox-head"><h3>Notifikasi <span id="ssc-mailbox-unread" class="mailbox-count" hidden></span></h3>',
    '<button type="button" id="ssc-mailbox-refresh">Perbarui</button></div>',
    '<div role="group" class="mailbox-filters" aria-label="Filter pesan">',
    '<button type="button" class="mailbox-filter is-current" data-ssc-filter="all" aria-pressed="true">Semua</button>',
    '<button type="button" class="mailbox-filter" data-ssc-filter="unread" aria-pressed="false">Belum dibaca</button>',
    '<button type="button" class="mailbox-filter" data-ssc-filter="status" aria-pressed="false">Status</button>',
    '<button type="button" class="mailbox-filter" data-ssc-filter="activation" aria-pressed="false">Aktivasi</button></div>',
    '<div class="ssc-mailbox-selection-bar">',
    '<button type="button" class="mailbox-secondary" id="ssc-mailbox-select-mode" aria-pressed="false">Pilih pesan</button>',
    '<div id="ssc-mailbox-bulk-actions" class="ssc-mailbox-bulk-actions" hidden>',
    '<span id="ssc-mailbox-selected-count" aria-live="polite">0 dipilih</span>',
    '<button type="button" class="mailbox-secondary" id="ssc-mailbox-select-all">Pilih semua</button>',
    '<button type="button" class="mailbox-secondary" id="ssc-mailbox-mark-selected">Tandai dibaca</button>',
    '<button type="button" class="ssc-mailbox-delete" id="ssc-mailbox-delete-selected">Hapus terpilih</button>',
    '</div></div>',
    '<p class="ssc-mailbox-selection-hint" id="ssc-mailbox-select-hint" hidden>Kode aktivasi yang masih berlaku tidak dapat dipilih untuk penghapusan.</p>',
    '<div class="mailbox-list" id="ssc-mailbox-list" aria-live="polite"></div></section>',
    '<section class="mailbox-surface mailbox-detail" aria-label="Isi notifikasi">',
    '<div class="mailbox-detail-empty" id="ssc-mailbox-empty"><span aria-hidden="true">✉</span><h3>Pilih notifikasi</h3>',
    '<p>Tekan pesan untuk membaca isinya.</p></div>',
    '<div id="ssc-mailbox-detail" hidden><span class="mailbox-eyebrow" id="ssc-mailbox-category"></span>',
    '<h3 id="ssc-mailbox-subject"></h3><time id="ssc-mailbox-time"></time><p id="ssc-mailbox-body"></p>',
    '<div class="ssc-mailbox-friend-actions player-actions" id="ssc-mailbox-friend-actions" hidden>',
    '<button type="button" id="ssc-mailbox-friend-accept" class="mailbox-primary">Terima pertemanan</button>',
    '<button type="button" id="ssc-mailbox-friend-decline" class="mailbox-secondary">Tolak</button></div>',
    '<div class="mailbox-secret-panel" id="ssc-mailbox-secret" hidden><p>Kode bersifat pribadi, jangan dibagikan.</p>',
    '<button type="button" class="mailbox-secondary" id="ssc-mailbox-reveal">Tampilkan kode</button>',
    '<div class="mailbox-secret-row" id="ssc-mailbox-secret-row" hidden><code id="ssc-mailbox-code"></code>',
    '<button type="button" class="mailbox-primary" id="ssc-mailbox-copy">Salin kode</button></div>',
    '<small id="ssc-mailbox-secret-status" role="status"></small></div>',
    '<button type="button" id="ssc-mailbox-delete" class="ssc-mailbox-delete">Hapus notifikasi</button></div></section></div>',
    '<p class="mailbox-privacy">Kode pendaftaran tetap bersifat rahasia. Akun yang belum aktif memerlukan verifikasi pengurus untuk mendapatkan kode aktivasi.</p></div>'
  ].join('');
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let items=[],current=null,filter='all',lastTrigger=null,refreshTask=null,loaded=false,loadFailed=false,deleting=false,
    selecting=false,selected=new Set(),managing=false,appStatus='none';
  const kindLabel=type=>type==='activation'?'AKTIVASI AKUN':type==='status'?'STATUS PENDAFTARAN':'PEMBERITAHUAN';
  const kindIcon=type=>type==='activation'?'✦':type==='status'?'◆':'✉';
  // Kode aktivasi hanya untuk pendaftar yang diterima; selain itu tombolnya dikunci.
  function applyAccess(){
    const ok=appStatus==='accepted';
    $('ssc-mailbox-request').disabled=!ok;
    $('ssc-mailbox-request-hint').hidden=ok;
  }
  const fmt=date=>{
    const value=new Date(date);
    return Number.isFinite(value.getTime())?value.toLocaleString('id-ID',{
      dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'
    }):'Tanggal tidak tersedia';
  };
  async function api(path,method='GET',payload){
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const error=new Error(data?.error||'Layanan pesan belum tersedia.');
      error.status=response.status;
      throw error;
    }
    return data;
  }
  function notify(text,error=false){
    $('ssc-mailbox-message').textContent=text;
    $('ssc-mailbox-message').dataset.warning=String(error);
  }
  function updateCount(){
    const count=items.filter(item=>!item.read).length;
    $('ssc-mailbox-unread').hidden=count===0;
    $('ssc-mailbox-unread').textContent=String(count);
    document.querySelectorAll('[data-mailbox-count]').forEach(badge=>{
      badge.hidden=count===0;
      badge.textContent=count>99?'99+':String(count);
    });
  }
  function emptyDetail(){
    current=null;
    $('ssc-mailbox-empty').hidden=false;
    $('ssc-mailbox-detail').hidden=true;
    $('ssc-mailbox-code').textContent='';
    $('ssc-mailbox-secret-row').hidden=true;
  }
  function shownItems(){
    return items.filter(item=>filter==='all'||(filter==='unread'&&!item.read)||
      (filter==='status'&&item.type==='status')||
      (filter==='activation'&&['activation','information'].includes(item.type)));
  }
  function updateSelection(){
    $('ssc-mailbox-select-mode').textContent=selecting?'Batal pilih':'Pilih pesan';
    $('ssc-mailbox-select-mode').setAttribute('aria-pressed',String(selecting));
    $('ssc-mailbox-bulk-actions').hidden=!selecting;
    $('ssc-mailbox-select-hint').hidden=!selecting;
    $('ssc-mailbox-selected-count').textContent=selected.size+' dipilih';
    $('ssc-mailbox-mark-selected').disabled=managing||selected.size===0;
    $('ssc-mailbox-delete-selected').disabled=managing||selected.size===0;
    $('ssc-mailbox-select-all').disabled=managing||shownItems().every(item=>item.canReveal);
    $('ssc-mailbox-select-mode').disabled=managing;
  }
  function draw(){
    const root=$('ssc-mailbox-list');
    root.replaceChildren();
    updateCount();
    const shown=shownItems();
    if(!shown.length){
      const hint=document.createElement('p');hint.className='mailbox-empty';
      hint.textContent=loadFailed?'Gagal memuat pesan. Tekan Perbarui untuk mencoba lagi.':
        !loaded?'Memuat notifikasi...':
        items.length?'Tidak ada notifikasi pada filter ini.':'Belum ada notifikasi.';
      root.append(hint);
    }
    for(const item of shown){
      const button=document.createElement('button');
      button.type='button';button.className='mailbox-item'+(!item.read?' is-unread':'')+
        (current?.id===item.id?' is-selected':'');
      const glyph=document.createElement('span');
      glyph.className='mailbox-item-icon';glyph.textContent=kindIcon(item.type);
      const label=document.createElement('span');label.className='mailbox-item-text';
      const title=document.createElement('strong');title.textContent=item.title;
      const timestamp=document.createElement('small');timestamp.textContent=fmt(item.createdAt);
      label.append(title,timestamp);
      button.append(glyph,label);
      if(!item.read){
        const dot=document.createElement('span');dot.className='mailbox-unread-dot';
        dot.setAttribute('aria-label','Belum dibaca');button.append(dot);
      }
      button.addEventListener('click',()=>void read(item));
      if(selecting){
        const row=document.createElement('div');row.className='ssc-mailbox-select-entry';
        const label=document.createElement('label');label.className='ssc-mailbox-select-control';
        const checkbox=document.createElement('input');checkbox.type='checkbox';
        checkbox.checked=selected.has(item.id);
        checkbox.disabled=!!item.canReveal||managing;
        checkbox.setAttribute('aria-label','Pilih notifikasi '+item.title);
        checkbox.addEventListener('change',()=>{
          if(checkbox.checked)selected.add(item.id);else selected.delete(item.id);
          updateSelection();
        });
        const indicator=document.createElement('span');indicator.setAttribute('aria-hidden','true');
        label.append(checkbox,indicator);row.append(label,button);root.append(row);
      }else root.append(button);
    }
    updateSelection();
  }
  async function read(item){
    current=item;
    $('ssc-mailbox-empty').hidden=true;
    $('ssc-mailbox-detail').hidden=false;
    $('ssc-mailbox-category').textContent=kindLabel(item.type);
    $('ssc-mailbox-subject').textContent=item.title;
    $('ssc-mailbox-time').textContent=fmt(item.createdAt);
    $('ssc-mailbox-body').textContent=item.content;
    $('ssc-mailbox-friend-actions').hidden=!(item.type==='friend_request'&&item.friendSenderId);
    $('ssc-mailbox-secret').hidden=item.type!=='activation';
    $('ssc-mailbox-secret-row').hidden=true;
    $('ssc-mailbox-code').textContent='';
    $('ssc-mailbox-reveal').disabled=!item.canReveal;
    $('ssc-mailbox-secret-status').textContent=item.canReveal?
      'Kode dapat dibuka sampai masa berlakunya habis.':'Kode sudah dipakai atau kedaluwarsa.';
    $('ssc-mailbox-delete').disabled=item.canReveal===true;
    $('ssc-mailbox-delete').title=item.canReveal?'Kode aktif tidak boleh dihapus.':'Hapus notifikasi ini.';
    draw();
    if(!item.read){
      item.read=true;draw();
      try{await api('/api/player/mailbox/read','POST',{id:item.id});}
      catch(error){item.read=false;draw();notify(error.message,true);}
    }
  }
  async function refresh(silent=false){
    if(refreshTask){await refreshTask;return;}
    refreshTask=(async()=>{
      $('ssc-mailbox-refresh').disabled=true;
      $('ssc-mailbox-list').setAttribute('aria-busy','true');
      if(!silent)notify('Memuat notifikasi...');
      if(!loaded)draw();
      try{
        const value=await api('/api/player/mailbox');
        items=Array.isArray(value.items)?value.items:[];
        appStatus=['pending','accepted','rejected'].includes(value.applicationStatus)?value.applicationStatus:'none';applyAccess();
        selected.clear();loaded=true;loadFailed=false;
        $('ssc-mailbox-signin').hidden=true;
        if(current){
          const next=items.find(item=>item.id===current.id);
          if(next)await read(next);else emptyDetail();
        }
        draw();
        if(!silent)notify(appStatus==='pending'?'Pendaftaranmu masih menunggu pemeriksaan pengurus SSCircle.':
          appStatus==='rejected'?'Pendaftaranmu belum dapat diterima. Baca pesan terbaru di kotak masuk.':
          value.activationRequest==='pending'?
          'Permintaan kode menunggu verifikasi pengurus.':'Notifikasi sudah diperbarui.');
      }catch(error){
        // Never retain a previous account's messages after an auth or network failure.
        items=[];selected.clear();selecting=false;emptyDetail();loaded=true;loadFailed=true;draw();
        appStatus='none';applyAccess();
        $('ssc-mailbox-signin').hidden=![401,403].includes(error.status);
        if(!silent||dialog.open)notify([401,403].includes(error.status)?
          'Masuk dengan kode pendaftaranmu melalui Cek Status untuk membuka Mail Box.':
          'Notifikasi belum bisa dimuat. Periksa koneksi, lalu tekan Perbarui.',true);
      }finally{
        $('ssc-mailbox-list').removeAttribute('aria-busy');
        $('ssc-mailbox-refresh').disabled=false;
      }
    })();
    try{await refreshTask}finally{refreshTask=null;}
  }
  async function open(trigger){
    lastTrigger=trigger||document.activeElement;
    if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
    else if(!dialog.open)dialog.setAttribute('open','');
    $('ssc-mailbox-close').focus();
    await refresh();
  }
  $('ssc-mailbox-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    selected.clear();selecting=false;emptyDetail();draw();lastTrigger?.focus?.();
  });
  dialog.addEventListener('click',e=>{
    if(e.target===dialog)dialog.close();
  });
  $('ssc-mailbox-refresh').addEventListener('click',()=>void refresh());
  $('ssc-mailbox-select-mode').addEventListener('click',()=>{
    if(managing)return;
    selecting=!selecting;selected.clear();draw();
  });
  $('ssc-mailbox-select-all').addEventListener('click',()=>{
    if(managing)return;
    const visible=shownItems().filter(item=>!item.canReveal);
    const allSelected=visible.length>0&&visible.every(item=>selected.has(item.id));
    for(const item of visible){
      if(allSelected)selected.delete(item.id);else selected.add(item.id);
    }
    draw();
  });
  async function manageSelected(action){
    if(managing||!selected.size)return;
    const ids=Array.from(selected);
    if(action==='delete'&&!window.confirm('Hapus '+ids.length+' notifikasi terpilih? Tindakan ini tidak dapat dibatalkan.'))return;
    managing=true;updateSelection();
    try{
      const response=await api('/api/player/mailbox/manage','POST',{action,ids});
      if(action==='delete'){
        items=items.filter(item=>!selected.has(item.id));
        if(current&&selected.has(current.id))emptyDetail();
      }else{
        items.forEach(item=>{if(selected.has(item.id))item.read=true;});
      }
      selected.clear();selecting=false;draw();
      notify(action==='delete'?
        (response.deleted||0)+' notifikasi berhasil dihapus.':
        ids.length+' notifikasi ditandai sudah dibaca.');
    }catch(error){
      notify(error.message,true);
      if([401,403,404,409].includes(error.status)){
        await refresh(true);notify(error.message,true);
      }
    }finally{managing=false;draw();}
  }
  $('ssc-mailbox-mark-selected').addEventListener('click',()=>void manageSelected('read'));
  $('ssc-mailbox-delete-selected').addEventListener('click',()=>void manageSelected('delete'));
  dialog.querySelectorAll('[data-ssc-filter]').forEach(button=>button.addEventListener('click',()=>{
    filter=button.dataset.sscFilter;
    dialog.querySelectorAll('[data-ssc-filter]').forEach(b=>{
      b.classList.toggle('is-current',b===button);
      b.setAttribute('aria-pressed',String(b===button));
    });
    draw();
  }));
  $('ssc-mailbox-request').addEventListener('click',async()=>{
    const button=$('ssc-mailbox-request');
    button.disabled=true;notify('Memproses permintaan kode aktivasi...');
    try{
      const result=await api('/api/player/mailbox/request-activation','POST',{});
      await refresh(true);notify(result.message);
    }catch(error){notify(error.message,true)}
    finally{applyAccess();}
  });
  async function respondFriend(action){
    const id=current?.friendSenderId;
    if(!id||!['accept','decline'].includes(action))return;
    const buttons=[$('ssc-mailbox-friend-accept'),$('ssc-mailbox-friend-decline')];
    buttons.forEach(b=>b.disabled=true);
    try{
      await api('/api/player/social/action','POST',{id,action});
      notify(action==='accept'?'Permintaan teman diterima.':'Permintaan teman ditolak.');
      current.friendSenderId=null;
      $('ssc-mailbox-friend-actions').hidden=true;
      window.SSCircleSocial?.refresh?.();
      await refresh(true);
    }catch(error){notify(error.message,true)}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  $('ssc-mailbox-friend-accept').addEventListener('click',()=>void respondFriend('accept'));
  $('ssc-mailbox-friend-decline').addEventListener('click',()=>void respondFriend('decline'));
  $('ssc-mailbox-reveal').addEventListener('click',async()=>{
    if(!current?.canReveal)return;
    const id=current.id,button=$('ssc-mailbox-reveal');
    button.disabled=true;
    try{
      const result=await api('/api/player/mailbox/reveal','POST',{id});
      if(current?.id!==id)return;
      $('ssc-mailbox-code').textContent=result.code;
      $('ssc-mailbox-secret-row').hidden=false;
      $('ssc-mailbox-secret-status').textContent='Salin dan gunakan kode ini di Profile → Keamanan akun.';
    }catch(error){
      $('ssc-mailbox-secret-status').textContent=error.message;
      $('ssc-mailbox-secret-row').hidden=true;
    }finally{button.disabled=false;}
  });
  $('ssc-mailbox-copy').addEventListener('click',async()=>{
    const code=$('ssc-mailbox-code').textContent;
    if(!code)return;
    try{
      await navigator.clipboard.writeText(code);
      $('ssc-mailbox-secret-status').textContent='Kode disalin. Jangan bagikan kepada orang lain.';
    }catch{
      $('ssc-mailbox-secret-status').textContent='Pilih teks kode lalu salin secara manual.';
    }
  });
  $('ssc-mailbox-delete').addEventListener('click',async()=>{
    if(!current||current.canReveal)return;
    if(deleting)return;
    const id=current.id,button=$('ssc-mailbox-delete');
    if(!window.confirm('Hapus notifikasi ini dari Mail Box?'))return;
    deleting=true;button.disabled=true;
    try{
      await api('/api/player/mailbox/delete','POST',{id});
      items=items.filter(item=>item.id!==id);
      emptyDetail();draw();notify('Notifikasi berhasil dihapus.');
    }catch(error){notify(error.message,true)}
    finally{deleting=false;button.disabled=!current||current.canReveal===true;}
  });
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-open-mailbox],a[href="/mailbox"]');
    if(!trigger)return;
    event.preventDefault();
    void open(trigger);
  });
  window.SSCircleMailbox={open:()=>open(),refresh};
  if(document.body.classList.contains('player-page')&&
     !new URLSearchParams(location.search).has('ssc_theme_preview')){
    void refresh(true);
    if(new URLSearchParams(location.search).get('mailbox')==='1')
      void open();
  }
})();