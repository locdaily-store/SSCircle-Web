/* SSCircle 10.38 - Private Mail Box, no HTML injection from messages.
   10.50 - pendaftar pending/ditolak ikut bisa membaca pemberitahuan status. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let items=[],current=null,filter='all',loading=false,appStatus='none';
  const kindLabel=type=>type==='activation'?'AKTIVASI AKUN':type==='status'?'STATUS PENDAFTARAN':'PEMBERITAHUAN';
  const kindIcon=type=>type==='activation'?'✦':type==='status'?'◆':'✉';
  // Kode aktivasi hanya untuk pendaftar yang diterima; selain itu tombolnya dikunci.
  function applyAccess(){
    const ok=appStatus==='accepted';
    $('mailbox-request-button').disabled=!ok;
    const hint=$('mailbox-request-hint');
    if(hint)hint.hidden=ok;
  }
  const fmt=date=>{
    const d=new Date(date);
    return Number.isFinite(d.getTime())?d.toLocaleString('id-ID',{
      dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'
    }):'Tanggal tidak tersedia';
  };
  async function call(path,method='GET',data){
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})});
    const value=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(value?.error||'Tidak dapat memuat pesan. Coba lagi.');
    return value;
  }
  function note(text,warning=false){
    $('mailbox-message').textContent=text;
    $('mailbox-message').dataset.warning=String(warning);
  }
  function renderList(){
    const root=$('mailbox-list');root.replaceChildren();
    const shown=items.filter(p=>filter==='all'||(filter==='unread'&&!p.read)||
      (filter==='status'&&p.type==='status')||
      (filter==='activation'&&(p.type==='activation'||p.type==='information')));
    const unread=items.filter(x=>!x.read).length;
    $('mailbox-unread').hidden=!unread;
    $('mailbox-unread').textContent=String(unread);
    if(!shown.length){
      const empty=document.createElement('p');empty.className='mailbox-empty';
      empty.textContent=items.length?'Tidak ada pesan dalam kategori ini.':'Belum ada pesan.'+(appStatus==='accepted'?' Kamu dapat meminta kode aktivasi dari bagian atas.':'');
      root.append(empty);return;
    }
    for(const item of shown){
      const button=document.createElement('button');button.type='button';
      button.className='mailbox-item'+(!item.read?' is-unread':'')+(item.id===current?.id?' is-selected':'');
      const icon=document.createElement('span');icon.className='mailbox-item-icon';icon.textContent=kindIcon(item.type);
      const body=document.createElement('span');body.className='mailbox-item-text';
      const title=document.createElement('strong');title.textContent=item.title;
      const date=document.createElement('small');date.textContent=fmt(item.createdAt);
      body.append(title,date);
      if(!item.read){const dot=document.createElement('span');dot.className='mailbox-unread-dot';dot.setAttribute('aria-label','Belum dibaca');button.append(dot);}
      button.append(icon,body);
      button.onclick=()=>void openMessage(item);
      root.append(button);
    }
  }
  async function openMessage(item){
    current=item;
    $('mailbox-detail-empty').hidden=true;
    $('mailbox-detail-content').hidden=false;
    $('mailbox-detail-category').textContent=kindLabel(item.type);
    $('mailbox-detail-title').textContent=item.title;
    $('mailbox-detail-time').textContent=fmt(item.createdAt);
    $('mailbox-detail-body').textContent=item.content;
    $('mailbox-secret-panel').hidden=item.type!=='activation';
    $('mailbox-secret-row').hidden=true;
    $('mailbox-secret-value').textContent='';
    $('mailbox-secret-status').textContent=item.canReveal?'Kode dapat ditampilkan sampai masa berlaku berakhir.':'Kode kedaluwarsa atau sudah digunakan.';
    $('mailbox-reveal').disabled=!item.canReveal;
    if(!item.read){
      item.read=true;renderList();
      try{await call('/api/player/mailbox/read','POST',{id:item.id});}
      catch(e){note('Pesan terbuka, tetapi status baca belum tersimpan. '+e.message,true)}
    }else renderList();
  }
  async function load(){
    if(loading)return;
    loading=true;$('mailbox-refresh').disabled=true;
    try{
      const data=await call('/api/player/mailbox');items=data.items||[];
      appStatus=['pending','accepted','rejected'].includes(data.applicationStatus)?data.applicationStatus:'none';applyAccess();
      note(appStatus==='pending'?'Pendaftaranmu masih menunggu pemeriksaan pengurus SSCircle.':
        appStatus==='rejected'?'Pendaftaranmu belum dapat diterima. Baca pesan terbaru di kotak masuk.':
        data.activationRequest==='pending'?'Permintaan kode sedang diperiksa oleh pengurus SSCircle.':
        'Pesanmu sudah diperbarui.');
      if(current){current=items.find(x=>x.id===current.id)||null;if(current)await openMessage(current);}
      renderList();
    }catch(error){
      // Never retain a different applicant's private message after logout or network failure.
      items=[];current=null;appStatus='none';applyAccess();
      $('mailbox-detail-content').hidden=true;
      $('mailbox-detail-empty').hidden=false;
      $('mailbox-secret-value').textContent='';
      $('mailbox-secret-row').hidden=true;
      renderList();
      note(error.message,true);
    }finally{$('mailbox-refresh').disabled=false;loading=false;}
  }
  $('mailbox-request-button').addEventListener('click',async()=>{
    const b=$('mailbox-request-button');b.disabled=true;note('Mengajukan permintaan aktivasi...');
    try{
      const response=await call('/api/player/mailbox/request-activation','POST',{});
      await load();note(response.message); // No automatic page redirect; already inside Mail Box.
    }catch(error){note(error.message,true)}finally{applyAccess();}
  });
  $('mailbox-refresh').addEventListener('click',()=>void load());
  document.querySelectorAll('.mailbox-filter').forEach(button=>button.addEventListener('click',()=>{
    filter=button.dataset.filter;
    for(const btn of document.querySelectorAll('.mailbox-filter')){
      const selected=btn===button;btn.classList.toggle('is-current',selected);btn.setAttribute('aria-pressed',String(selected));
    }
    renderList();
  }));
  $('mailbox-reveal').addEventListener('click',async()=>{
    if(!current || !current.canReveal)return;
    const button=$('mailbox-reveal');button.disabled=true;
    try{
      const data=await call('/api/player/mailbox/reveal','POST',{id:current.id});
      $('mailbox-secret-value').textContent=data.code;
      $('mailbox-secret-row').hidden=false;
      $('mailbox-secret-status').textContent='Kode telah ditampilkan. Salin lalu gunakan di Profile → Keamanan akun.';
    }catch(error){$('mailbox-secret-status').textContent=error.message;
      $('mailbox-secret-row').hidden=true;current.canReveal=false;
    }finally{button.disabled=false;}
  });
  $('mailbox-copy').addEventListener('click',async()=>{
    const code=$('mailbox-secret-value').textContent;
    try{await navigator.clipboard.writeText(code);$('mailbox-secret-status').textContent='Kode berhasil disalin. Simpan secara pribadi.';}
    catch{$('mailbox-secret-status').textContent='Tidak dapat menyalin otomatis. Pilih teks kode lalu salin secara manual.';}
  });
  fetch('/api/form',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null)
    .then(data=>data?.settings&&window.SSCircleTheme?.apply(data.settings)).catch(()=>{});
  void load();
})();
