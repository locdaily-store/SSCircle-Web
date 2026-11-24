/* SSCircle 10.38 - Private Mail Box, no HTML injection from messages.
   10.50 - pendaftar pending/ditolak ikut bisa membaca pemberitahuan status. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let items=[],current=null,filter='all',loading=false,appStatus='none',hasPassword=false;
  const kindLabel=type=>({registration_code:'KODE PENDAFTARAN',activation:'AKTIVASI AKUN',status:'STATUS PENDAFTARAN',announcement:'PENGUMUMAN RESMI',event:'EVENT SSCIRCLE',friend_request:'KOMUNITAS',friend_response:'KOMUNITAS',badge:'PENGHARGAAN'})[type]||'PEMBERITAHUAN';
  const kindIcon=type=>({registration_code:'🔑',activation:'✦',status:'◆',announcement:'◈',event:'▦',friend_request:'♙',friend_response:'♙',badge:'★'})[type]||'✉';
  // Kode aktivasi hanya untuk pendaftar yang diterima; selain itu tombolnya dikunci.
  function applyAccess(){
    const ok=appStatus==='accepted';
    $('mailbox-request-button').disabled=!ok;
    $('mailbox-request-button').hidden=false;
    const hint=$('mailbox-request-hint');
    if(hint)hint.hidden=ok;
    $('mailbox-request-heading').textContent=hasPassword?'Kode verifikasi akun':'Kode aktivasi akun';
    const message=$('mailbox-request-description');
    if(message)message.textContent=hasPassword
      ?'Tekan Minta kode untuk menerima kode verifikasi otomatis setelah login dengan password Dashboard. Tidak memerlukan admin jika sesi login aman sudah aktif.'
      :'Kode aktivasi pertama otomatis dikirim setelah status Diterima. Tekan Minta kode untuk memeriksa kode aktif atau menerbitkan kode baru.';
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
      (filter==='activation'&&(['registration_code','activation','information'].includes(p.type)))||
      (filter==='announcement'&&p.type==='announcement')||
      (filter==='event'&&p.type==='event')||
      (filter==='community'&&['friend_request','friend_response','badge'].includes(p.type)));
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
    const registrationCode=item.type==='registration_code'
      &&typeof item.registrationCode==='string'
      &&/^(?:[A-F0-9]{20}|[A-F0-9]{8})$/.test(item.registrationCode)
      ?item.registrationCode:'';
    $('mailbox-registration-panel').hidden=!registrationCode;
    $('mailbox-registration-code').textContent=registrationCode;
    $('mailbox-registration-status').textContent='';
    const cta=item.discordCTA;
    const validDiscord=typeof cta?.url==='string' && /^https:\/\/(?:discord\.gg\/[A-Za-z0-9-]{3,}|discord\.com\/invite\/[A-Za-z0-9-]{3,})\/?$/.test(cta.url);
    $('mailbox-accepted-discord').hidden=!validDiscord;
    if(validDiscord){
      $('mailbox-accepted-discord-note').textContent=String(cta.note||'');
      const join=$('mailbox-accepted-discord-button');
      join.textContent=String(cta.label||'Gabung SSCircle Community')+' ↗';
      join.href=cta.url;
    }
    const link=$('mailbox-detail-link');
    const allowed=new Set(['/','/events.html','/events','/rules.html','/rules','/seasons','/seasons.html','/mailbox','/my-sscircle']);
    link.hidden=!allowed.has(item.link);
    if(!link.hidden)link.href=item.link;
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
      appStatus=['pending','accepted','rejected'].includes(data.applicationStatus)?data.applicationStatus:'none';
      hasPassword=data.hasPassword===true;applyAccess();
      note(appStatus==='pending'?'Pendaftaranmu masih menunggu pemeriksaan pengurus SSCircle.':
        appStatus==='rejected'?'Pendaftaranmu belum dapat diterima. Baca pesan terbaru di kotak masuk.':
        data.activationRequest==='pending'?'Permintaan pemulihan password sedang diperiksa pengurus SSCircle.':
        hasPassword?'Akun aktif. Kode verifikasi dapat diminta setelah login Dashboard.':'Pesanmu sudah diperbarui.');
      if(current){current=items.find(x=>x.id===current.id)||null;if(current)await openMessage(current);}
      renderList();
    }catch(error){
      // Never retain a different applicant's private message after logout or network failure.
      items=[];current=null;appStatus='none';hasPassword=false;applyAccess();
      $('mailbox-detail-content').hidden=true;
      $('mailbox-detail-empty').hidden=false;
      $('mailbox-secret-value').textContent='';
      $('mailbox-secret-row').hidden=true;
      $('mailbox-registration-code').textContent='';
      $('mailbox-registration-status').textContent='';
      $('mailbox-registration-panel').hidden=true;
      renderList();
      note(error.message,true);
    }finally{$('mailbox-refresh').disabled=false;loading=false;}
  }
  $('mailbox-request-button').addEventListener('click',async()=>{
    const b=$('mailbox-request-button');b.disabled=true;note('Memproses permintaan kode aktivasi atau verifikasi...');
    try{
      const response=await call('/api/player/mailbox/request-activation','POST',{});
      await load();note(response.message); // No automatic page redirect; already inside Mail Box.
    }catch(error){note(error.message,true)}finally{applyAccess();}
  });
  $('mailbox-refresh').addEventListener('click',()=>void load());
  $('mailbox-mark-all').addEventListener('click',async()=>{
    const ids=items.filter(item=>!item.read).map(item=>item.id);
    const button=$('mailbox-mark-all');button.disabled=true;
    try{
      for(let i=0;i<ids.length;i+=60)
        await call('/api/player/mailbox/manage','POST',{action:'read',ids:ids.slice(i,i+60)});
      items.forEach(item=>item.read=true);renderList();
      note(ids.length?'Semua notifikasi ditandai sudah dibaca.':'Semua notifikasi sudah dibaca.');
    }catch(error){note(error.message,true);await load()}
    finally{button.disabled=false}
  });
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
  $('mailbox-registration-copy').addEventListener('click',async()=>{
    const id=current?.id;
    if(current?.type!=='registration_code'||!id)return;
    const code=$('mailbox-registration-code').textContent;
    if(!/^(?:[A-F0-9]{20}|[A-F0-9]{8})$/.test(code))return;
    try{
      await navigator.clipboard.writeText(code);
      if(current?.id===id)$('mailbox-registration-status').textContent='Kode pendaftaran berhasil disalin.';
    }catch{
      if(current?.id!==id)return;
      const range=document.createRange();
      range.selectNodeContents($('mailbox-registration-code'));
      const selection=window.getSelection();
      selection?.removeAllRanges();selection?.addRange(range);
      $('mailbox-registration-status').textContent='Kode telah dipilih. Salin manual dengan Ctrl+C atau gunakan tombol salin di perangkatmu.';
    }
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
