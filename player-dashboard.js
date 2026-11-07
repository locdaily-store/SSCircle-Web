/* SSCircle V10.35 — tahap 1 Player Dashboard.
   Read-only: no invented Minecraft identity, numbers, or write access.
   Data comes only from the existing signed player session on /api/player/me. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const pending = $('player-loading');
  const content = $('player-content');
  const errorPanel = $('player-error');
  let loading = false;

  function showError(message) {
    pending.hidden = true;
    content.hidden = true;
    $('player-error-message').textContent = message;
    errorPanel.hidden = false;
  }
  function formatJoined(value) {
    if (typeof value !== 'string') return 'Belum tercatat';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Belum tercatat';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar' }).format(date);
  }
  function memberLabel(code) {
    if (typeof code !== 'string' || !/^[0-9A-F]{8}(?:[0-9A-F]{12})?$/.test(code)) return 'Terdaftar';
    return 'SSC-••••' + code.slice(-4);
  }
  async function request(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options
    });
    let data = null;
    try { data = await response.json(); } catch { /* network/server failure */ }
    if (!response.ok) {
      const err = new Error(data?.error || (response.status === 401 ? 'Silakan masuk kembali.' : 'Koneksi ke server sedang bermasalah.'));
      err.status = response.status;
      err.remainingSeconds = Number(data?.remainingSeconds || response.headers.get('Retry-After') || 0);
      throw err;
    }
    return data;
  }
  function drawAwards(awards) {
    const list = $('player-achievements-list');
    if (!list) return;
    list.replaceChildren();
    if (!Array.isArray(awards) || !awards.length) {
      const empty=document.createElement('p');
      empty.className='player-helper';
      empty.textContent='Belum ada penghargaan yang terhubung ke keanggotaanmu.';
      list.append(empty);return;
    }
    for (const award of awards) {
      const row=document.createElement('div');row.className='player-award';
      const icon=document.createElement('span');icon.className='player-award-icon';icon.textContent='★';
      const text=document.createElement('div');
      const title=document.createElement('strong');title.textContent=award.title||'Penghargaan';
      const season=document.createElement('small');season.textContent=award.seasonTitle||'Season SSCircle';
      text.append(title,season);
      if(award.description) {
        const details=document.createElement('p');details.textContent=award.description;text.append(details);
      }
      row.append(icon,text);list.append(row);
    }
  }
  function applyProfile(payload) {
    const profile=payload.profile||{},policy=payload.policy||{};
    $('player-display-name').value=profile.displayName||'';
    $('player-bio').value=profile.bio||'';
    $('player-visibility').value=profile.visibility||'private';
    $('player-show-stats').checked=profile.showStats===true;
    $('player-event-alerts').checked=profile.eventAlerts!==false;
    $('player-bio').disabled=policy.allowBio===false;
    $('player-visibility').disabled=policy.allowPublic===false;
    $('player-show-stats').disabled=policy.allowStats===false;
    $('player-event-alerts').disabled=policy.allowEventAlerts===false;
    $('player-profile-title').textContent=profile.displayName||'Anggota SSCircle';
    $('player-edition').textContent=(payload.accounts||[]).map(a=>
      a.provider==='java_premium'?'Java Premium':a.provider==='java_offline'?'Java Non-Premium':
        a.provider==='bedrock'?'Bedrock':'Minecraft').join(', ')||'Belum terhubung';
    drawAwards(payload.achievements);
    const stats=(payload.statistics||[]).find(a=>!a.seasonId);
    if(stats) {
      const cells=document.querySelectorAll('.player-stat strong');
      const format=new Intl.NumberFormat('id-ID');
      if(cells.length>=4){
        cells[0].textContent=format.format(Math.floor((stats.playtimeSeconds||0)/3600))+' jam';
        cells[1].textContent=format.format(stats.deaths||0);
        cells[2].textContent=format.format(stats.mobKills||0);
        cells[3].textContent=String((payload.statistics||[]).filter(x=>x.seasonId).length);
      }
    }
  }
  async function loadProfile() {
    try {
      const profile=await request('/api/player/profile');
      applyProfile(profile);
      $('player-profile-message').textContent='';
    } catch(error) {
      $('player-profile-message').textContent='Pengaturan profil belum bisa dimuat: '+error.message;
    }
  }
  $('player-settings-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const button=$('player-save-profile');
    if(button.disabled)return;
    button.disabled=true;
    $('player-profile-message').textContent='Menyimpan profil...';
    try {
      const value={
        displayName:$('player-display-name').value,
        bio:$('player-bio').value,
        visibility:$('player-visibility').value,
        showStats:$('player-show-stats').checked,
        eventAlerts:$('player-event-alerts').checked
      };
      const result=await request('/api/player/profile',{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)
      });
      $('player-profile-title').textContent=result.profile?.displayName||'Anggota SSCircle';
      $('player-profile-message').textContent='Perubahan profil berhasil disimpan.';
    } catch(error) {
      $('player-profile-message').textContent='Tidak dapat menyimpan profil: '+error.message;
    } finally {
      button.disabled=false;
    }
  });
  // V10.37 member security. Never treat the registration-code cookie as proof
  // of ownership for private account changes.
  let playerCodeForSecureLogin = '';
  let strongAuthorized = false;
  function lockPrivateControls(locked) {
    strongAuthorized=!locked;
    for(const field of $('player-settings-form').querySelectorAll('input,textarea,select,button'))
      field.disabled=locked;
    $('player-edit-requirement').hidden=!locked;
  }
  function showSecurityMode(mode) {
    $('player-security-activate').hidden=mode!=='activate';
    $('player-security-login').hidden=mode!=='login';
    $('player-security-active').hidden=mode!=='active';
    $('player-security-state').textContent=mode==='active'?'Terlindungi':mode==='login'?'Terkunci':'Belum diaktifkan';
    $('player-link-locked').hidden=mode==='active';
    $('player-link-panel').hidden=mode!=='active';
    if(mode!=='active')$('player-link-notice').textContent='Masuk menggunakan password dashboard untuk menghubungkan Minecraft.';
    lockPrivateControls(mode!=='active');
  }
  const securityMessage=(message)=>{$('player-security-message').textContent=message;};
  async function listDevices() {
    const result=await request('/api/player/security/sessions');
    const list=$('player-device-list');list.replaceChildren();
    const sessions=result.sessions||[];
    if(!sessions.length){
      list.append(Object.assign(document.createElement('p'),{textContent:'Belum ada perangkat aktif.'}));return;
    }
    for(const session of sessions){
      const card=document.createElement('div');card.className='player-device';
      const block=document.createElement('div');
      const name=document.createElement('strong');
      name.textContent=(session.current?'Perangkat ini · ':'')+(session.client||'Browser');
      const sub=document.createElement('small');
      sub.textContent='Masuk: '+new Date(session.createdAt).toLocaleString('id-ID')+
        ' · Berakhir: '+new Date(session.expiresAt).toLocaleString('id-ID');
      block.append(name,sub);
      const actions=document.createElement('div');actions.className='player-device-actions';
      const rename=document.createElement('button');rename.type='button';
      rename.className='player-action player-action-secondary';rename.textContent='Ubah nama';
      rename.addEventListener('click',()=>{
        if(actions.querySelector('input'))return;
        const field=document.createElement('input');field.type='text';field.maxLength=40;
        field.className='player-device-label-input';field.value=session.client||'';
        field.placeholder='Contoh: HP saya';field.setAttribute('aria-label','Nama perangkat');
        const save=document.createElement('button');save.type='button';
        save.className='player-action player-action-primary';save.textContent='Simpan';
        const cancel=document.createElement('button');cancel.type='button';
        cancel.className='player-action player-action-secondary';cancel.textContent='Batal';
        const editor=document.createElement('div');editor.className='player-device-editor';
        editor.append(field,save,cancel);actions.append(editor);
        rename.disabled=true;field.focus();field.select();
        cancel.addEventListener('click',()=>{editor.remove();rename.disabled=false;rename.focus();});
        save.addEventListener('click',async()=>{
          const label=field.value.trim();
          if(label.length<2||label.length>40){securityMessage('Nama perangkat harus 2–40 karakter.');return;}
          save.disabled=true;
          try{
            await request('/api/player/security/device/rename',{method:'POST',
              headers:{'Content-Type':'application/json'},body:JSON.stringify({id:session.id,label})});
            await listDevices();await loadSecurityHistory();
            securityMessage('Nama perangkat diperbarui.');
          }catch(error){securityMessage(error.message);save.disabled=false;}
        });
      });
      const revoke=document.createElement('button');revoke.type='button';
      revoke.className='player-action player-action-secondary';revoke.textContent='Cabut sesi';
      revoke.addEventListener('click',async()=>{
        if(!window.confirm('Cabut akses dashboard pada perangkat ini?'))return;
        revoke.disabled=true;
        try{
          await request('/api/player/security/revoke',{method:'POST',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({id:session.id})});
          await loadSecurityState();
          if(session.current)securityMessage('Dashboard dikunci. Masuk kembali dengan password.');
          else securityMessage('Perangkat berhasil dikeluarkan.');
        }catch(error){securityMessage(error.message);revoke.disabled=false;}
      });
      actions.append(rename,revoke);card.append(block,actions);list.append(card);
    }
  }
  async function loadSecurityHistory(){
    const box=$('player-security-history');
    box.replaceChildren();
    const res=await request('/api/player/security/history');
    const events=Array.isArray(res.events)?res.events:[];
    const labels={
      login_success:'Login password berhasil',login_locked:'Akun terkunci sementara setelah percobaan login',
      password_activated:'Password dashboard diaktifkan',
      password_recovered:'Password dipulihkan melalui verifikasi admin',
      password_changed:'Password dashboard diganti',
      device_renamed:'Nama perangkat diperbarui',device_revoked:'Sesi perangkat dicabut',
      session_locked:'Dashboard dikunci pada perangkat',all_sessions_revoked:'Semua perangkat dikeluarkan'
    };
    if(!events.length){
      box.append(Object.assign(document.createElement('p'),{
        textContent:'Belum ada aktivitas keamanan yang tercatat.'}));return;
    }
    for(const event of events){
      const row=document.createElement('div');row.className='player-security-history-item';
      const main=document.createElement('strong');
      main.textContent=labels[event.type]||'Aktivitas keamanan akun';
      const meta=document.createElement('small');
      meta.textContent=new Date(event.at).toLocaleString('id-ID')+
        ' · '+String(event.client||'Perangkat tidak diketahui').slice(0,105);
      row.append(main,meta);box.append(row);
    }
  }
  async function loadSecurityState(){
    try {
      const state=await request('/api/player/security/state');
      const mode=state.authenticated?'active':state.hasPassword?'login':'activate';
      showSecurityMode(mode);
      securityMessage(state.authenticated?'Akun aman aktif pada perangkat ini.':'');
      $('player-recovery-back').hidden=!state.hasPassword;
      if(state.authenticated){
        await listDevices();await loadProfile();
        try{await loadSecurityHistory();}catch{securityMessage('Riwayat keamanan belum dapat dimuat. Coba Perbarui.');}
        try{await loadMinecraftLink();}catch(error){$('player-link-notice').textContent='Status Minecraft belum tersedia: '+error.message;}
      }
      return mode;
    }catch(error){
      showSecurityMode('login');
      securityMessage('Gagal memeriksa keamanan akun: '+error.message);
      return 'error';
    }
  }
  $('player-request-activation').addEventListener('click',async()=>{
    const button=$('player-request-activation');button.disabled=true;
    const label=$('player-activation-notice');label.textContent='Mengirim permintaan...';
    try{
      const response=await request('/api/player/mailbox/request-activation',{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
      });
      label.textContent=response.message;
      // Keep the member in Profile and open their private notifications.
      await window.SSCircleMailbox?.open();
    }catch(error){label.textContent='Permintaan tidak berhasil: '+error.message}
    finally{button.disabled=false;}
  });
  $('player-recovery-request').addEventListener('click',async()=>{
    const button=$('player-recovery-request');if(button.disabled)return;
    button.disabled=true;securityMessage('Mengajukan pemulihan akun...');
    try{
      const data=await request('/api/player/mailbox/request-activation',{method:'POST',
        headers:{'Content-Type':'application/json'},body:'{}'});
      securityMessage(data.delivered?
        'Kode pemulihan tersedia di Mail Box. Gunakan tombol Sudah punya kode untuk membuat password baru.':
        'Permintaan dicatat. Pengurus harus memverifikasi identitasmu sebelum kode dikirim ke Mail Box.');
      await window.SSCircleMailbox?.open();
    }catch(error){securityMessage('Pemulihan belum dapat diajukan: '+error.message);}
    finally{button.disabled=false;}
  });
  $('player-recovery-show').addEventListener('click',()=>{
    showSecurityMode('activate');
    $('player-security-state').textContent='Pemulihan';
    $('player-recovery-back').hidden=false;
    $('player-activate-submit').textContent='Simpan password baru';
    securityMessage('Masukkan kode pemulihan dari Mail Box. Setelah berhasil, seluruh sesi lama akan dicabut.');
  });
  $('player-recovery-back').addEventListener('click',()=>{
    $('player-activate-form').reset();
    $('player-activate-submit').textContent='Aktifkan akun aman';
    showSecurityMode('login');securityMessage('');
  });
  let activationCountdown=null;
  function activationCooldown(seconds){
    const button=$('player-activate-submit');
    const ends=Date.now()+Math.max(1,seconds)*1000;
    clearInterval(activationCountdown);
    const refresh=()=>{
      const remaining=Math.max(0,Math.ceil((ends-Date.now())/1000));
      if(remaining===0){
        clearInterval(activationCountdown);activationCountdown=null;
        button.disabled=false;button.textContent='Aktifkan akun aman';return;
      }
      button.disabled=true;
      button.textContent='Coba lagi dalam '+String(Math.floor(remaining/60)).padStart(2,'0')+
        ':'+String(remaining%60).padStart(2,'0');
    };
    refresh();activationCountdown=setInterval(refresh,1000);
  }
  $('player-activate-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=$('player-activate-submit');if(button.disabled)return;
    const password=$('player-activate-password').value;
    if(password.length<8||password!==$('player-activate-repeat').value){
      securityMessage('Password minimal 8 karakter dan kedua isian harus sama.');return;
    }
    button.disabled=true;securityMessage('Mengamankan password di perangkatmu...');
    try{
      const secureInput=await window.SSCirclePassword.create(password);
      securityMessage('Password aman. Menyimpan aktivasi akun...');
      const result=await request('/api/player/security/activate',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({
          invite:$('player-invite-secret').value.trim(),...secureInput
        })});
      $('player-activate-form').reset();
      await loadSecurityState();
      securityMessage(result.loginRequired
        ? 'Akun sudah berhasil diaktifkan. Masuk menggunakan password dashboard yang baru dibuat.'
        : 'Akun aman berhasil diaktifkan. Password tidak disimpan di browser.');
    }catch(error){
      if(error.status===429) {
        securityMessage(error.message);
        activationCooldown(error.remainingSeconds||300);
      } else if(error.status>=500 || !error.status) {
        // An interrupted request may have succeeded before the connection failed.
        // Recheck persisted account state rather than declaring a one-use code invalid.
        const mode=await loadSecurityState();
        if(mode==='login'||mode==='active')
          securityMessage('Akun telah dibuat. Masuk menggunakan password yang baru dibuat.');
        else
          securityMessage('Aktivasi belum dapat dipastikan. Kode mungkin masih berlaku. '+
            'Jangan minta kode baru sebelum memeriksa Mail Box. '+error.message);
      } else securityMessage('Aktivasi gagal: '+error.message);
    }finally{if(!activationCountdown)button.disabled=false;}
  });
  $('player-password-login-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=$('player-password-login-submit');if(button.disabled)return;
    button.disabled=true;securityMessage('Memeriksa password...');
    try{
      const payload=await window.SSCirclePassword.login(
        playerCodeForSecureLogin,$('player-dashboard-password').value);
      await request('/api/player/security/login',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      $('player-password-login-form').reset();
      await loadSecurityState();
    }catch(error){securityMessage('Tidak dapat masuk: '+error.message)}
    finally{button.disabled=false;}
  });
  $('player-change-password-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=$('player-change-password-submit');if(button.disabled)return;
    const oldPassword=$('player-current-password').value,
      newPassword=$('player-new-password').value,
      repeat=$('player-new-password-repeat').value;
    if(newPassword.length<8||newPassword.length>128||newPassword!==repeat){
      securityMessage('Password baru harus 8–128 karakter dan kedua isian harus sama.');return;
    }
    if(oldPassword===newPassword){
      securityMessage('Password baru harus berbeda dari password sebelumnya.');return;
    }
    if(!window.confirm('Ganti password dan keluarkan perangkat lain?'))return;
    button.disabled=true;securityMessage('Memverifikasi password lama pada perangkat ini...');
    try{
      const old=await window.SSCirclePassword.login(playerCodeForSecureLogin,oldPassword);
      const newer=await window.SSCirclePassword.create(newPassword);
      const result=await request('/api/player/security/password/change',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({currentProof:old.proof,...newer})});
      $('player-change-password-form').reset();
      const mode=await loadSecurityState();
      securityMessage(result.loginRequired||mode==='login'
        ?'Password berhasil diganti. Masuk kembali memakai password baru.'
        :'Password berhasil diganti. Perangkat lain sudah dikeluarkan.');
    }catch(error){
      securityMessage(error.status>=500?
        'Belum dapat memastikan penyimpanan. Coba masuk menggunakan password baru sebelum mengulangi perubahan.':
        'Gagal mengganti password: '+error.message);
    }finally{button.disabled=false;}
  });
  $('player-refresh-security-history').addEventListener('click',async()=>{
    const button=$('player-refresh-security-history');button.disabled=true;
    try{await loadSecurityHistory();securityMessage('Riwayat keamanan diperbarui.');}
    catch(error){securityMessage('Riwayat belum dapat dimuat: '+error.message);}
    finally{button.disabled=false;}
  });
  $('player-refresh-devices').addEventListener('click',async()=>{
    try{await listDevices();securityMessage('Daftar perangkat diperbarui.');}
    catch(error){securityMessage(error.message)}
  });
  $('player-signout-secure').addEventListener('click',async()=>{
    try{await request('/api/player/security/logout',{method:'POST',
      headers:{'Content-Type':'application/json'},body:'{}'});
      await loadSecurityState();securityMessage('Dashboard berhasil dikunci pada perangkat ini.');
    }catch(error){securityMessage(error.message)}
  });
  $('player-signout-all').addEventListener('click',async()=>{
    if(!confirm('Keluar dari semua perangkat, termasuk sesi kode pendaftaran?'))return;
    try{await request('/api/player/security/logout-all',{method:'POST',
      headers:{'Content-Type':'application/json'},body:'{}'});
      location.replace('/status.html#kode-milikku');
    }catch(error){securityMessage(error.message)}
  });


  // V10.45: account link stays private and must be confirmed after server attestation.
  let linkCommand='',linkExpires='',linkBusy=false;
  const mcProviderLabel=provider=>({
    java_premium:'Java Premium',java_offline:'Java Non-Premium',bedrock:'Bedrock'
  })[provider]||'Minecraft';
  const linkNotice=message=>{$('player-link-notice').textContent=message;};
  function renderMinecraftLink(data){
    const linked=data?.linked||null,pending=data?.pending||null;
    const ready=data?.serverReady===true;
    $('player-link-tag').textContent=linked?'Terverifikasi':
      pending?.status==='needs_confirmation'?'Perlu konfirmasi':
      pending?'Menunggu Minecraft':ready?'Belum terhubung':'Belum diaktifkan';
    $('player-link-connected').hidden=!linked;
    $('player-link-waiting').hidden=!!linked||!!pending||!ready;
    $('player-link-review').hidden=!!linked||pending?.status!=='needs_confirmation';
    $('player-link-code-wrap').hidden=!!linked||!pending||
      pending.status!=='waiting_in_game'||!linkCommand||!linkExpires||
      Date.parse(linkExpires)<=Date.now();
    $('player-link-cancel').hidden=!!linked||!pending;
    $('player-link-create').disabled=!ready||!!linked||!!pending||linkBusy;
    if(linked){
      linkCommand='';linkExpires='';
      $('player-link-connected-provider').textContent=mcProviderLabel(linked.provider);
      $('player-link-connected-name').textContent=linked.username;
      $('player-link-connected-date').textContent=
        'Terhubung: '+new Date(linked.verifiedAt).toLocaleString('id-ID');
      $('player-edition').textContent=mcProviderLabel(linked.provider);
      linkNotice('Identitas Minecraft sudah berhasil ditautkan.');
    }else if(pending?.status==='needs_confirmation'){
      linkCommand='';linkExpires='';
      $('player-link-review-provider').textContent=mcProviderLabel(pending.identity?.provider);
      $('player-link-review-name').textContent=pending.identity?.username||'Akun Minecraft';
      linkNotice('Konfirmasi hanya jika nama dan edisi yang ditampilkan benar.');
    }else if(pending?.status==='waiting_in_game'){
      if(linkCommand&&linkExpires&&Date.parse(linkExpires)>Date.now()){
        $('player-link-command').textContent=linkCommand;
        $('player-link-expires').textContent=
          'Berlaku sampai '+new Date(linkExpires).toLocaleTimeString('id-ID');
        linkNotice('Menunggu perintah dari server Minecraft. Halaman boleh diperbarui, tetapi kode hanya ditampilkan saat dibuat.');
      }else linkNotice('Ada kode yang masih aktif, tetapi tidak ditampilkan ulang demi keamanan. Batalkan kode untuk membuat yang baru.');
    }else if(!ready)linkNotice('Fitur linking belum diaktifkan oleh pengurus. Tidak ada akun Minecraft yang dihubungkan otomatis.');
    else linkNotice('Belum ada akun Minecraft yang terhubung.');
  }
  async function loadMinecraftLink(){
    if(!strongAuthorized)return;
    const data=await request('/api/player/minecraft/link/state');
    renderMinecraftLink(data);
  }
  $('player-link-create').addEventListener('click',async()=>{
    if(linkBusy||!strongAuthorized)return;
    linkBusy=true;$('player-link-create').disabled=true;linkNotice('Membuat kode aman...');
    try{
      const data=await request('/api/player/minecraft/link/create',{method:'POST',
        headers:{'Content-Type':'application/json'},body:'{}'});
      linkCommand=data.command;linkExpires=data.expiresAt;
      await loadMinecraftLink();
    }catch(error){linkNotice('Kode belum bisa dibuat: '+error.message);}
    finally{linkBusy=false;$('player-link-create').disabled=false;}
  });
  $('player-link-copy').addEventListener('click',async()=>{
    if(!linkCommand)return;
    try{
      await navigator.clipboard.writeText(linkCommand);
      linkNotice('Perintah disalin. Tempel di chat server Minecraft SSCircle.');
    }catch{linkNotice('Salin teks perintah secara manual dari kotak di atas.');}
  });
  $('player-link-refresh').addEventListener('click',async()=>{
    const button=$('player-link-refresh');button.disabled=true;
    try{await loadMinecraftLink();}catch(error){linkNotice('Tidak dapat memeriksa status: '+error.message);}
    finally{button.disabled=false;}
  });
  $('player-link-cancel').addEventListener('click',async()=>{
    if(!window.confirm('Batalkan kode penghubung Minecraft saat ini?'))return;
    const button=$('player-link-cancel');button.disabled=true;
    try{
      await request('/api/player/minecraft/link/cancel',{method:'POST',
        headers:{'Content-Type':'application/json'},body:'{}'});
      linkCommand='';linkExpires='';await loadMinecraftLink();
    }catch(error){linkNotice('Tidak dapat membatalkan kode: '+error.message);}
    finally{button.disabled=false;}
  });
  $('player-link-confirm').addEventListener('click',async()=>{
    if(!window.confirm('Identitas Minecraft di atas benar-benar milikmu?'))return;
    const button=$('player-link-confirm');button.disabled=true;
    try{
      await request('/api/player/minecraft/link/confirm',{method:'POST',
        headers:{'Content-Type':'application/json'},body:'{}'});
      await loadMinecraftLink();await loadProfile();
    }catch(error){linkNotice('Penautan belum berhasil: '+error.message);}
    finally{button.disabled=false;}
  });
  $('player-link-show-unlink').addEventListener('click',()=>{
    const form=$('player-link-unlink-form');
    form.hidden=!form.hidden;
    if(!form.hidden)$('player-link-unlink-password').focus();
  });
  $('player-link-unlink-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!window.confirm('Putuskan tautan Minecraft dari akun SSCircle ini?'))return;
    const button=$('player-link-unlink-submit');button.disabled=true;
    try{
      const payload=await window.SSCirclePassword.login(
        playerCodeForSecureLogin,$('player-link-unlink-password').value);
      await request('/api/player/minecraft/link/unlink',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({currentProof:payload.proof})});
      $('player-link-unlink-form').reset();$('player-link-unlink-form').hidden=true;
      await loadMinecraftLink();await loadProfile();
      linkNotice('Tautan Minecraft berhasil diputuskan. Data historis komunitas tidak otomatis dihapus.');
    }catch(error){linkNotice('Tidak dapat memutuskan tautan: '+error.message);}
    finally{button.disabled=false;}
  });
  // Only poll while the member is looking at an already initiated claim.
  setInterval(()=>{
    if(!strongAuthorized||document.hidden||$('player-link-panel').hidden)return;
    if(!$('player-link-cancel').hidden||!$('player-link-review').hidden)
      void loadMinecraftLink().catch(()=>{});
  },12000);

  async function load() {
    if (loading) return;
    loading = true;
    pending.hidden = false;
    errorPanel.hidden = true;
    content.hidden = true;
    try {
      const player = await request('/api/player/me');
      if (!player?.authenticated) {
        location.replace('/status.html?akses-dashboard=perlu-masuk#kode-milikku');
        return;
      }
      if (player.status !== 'accepted') {
        const reason = player.status === 'rejected' ? 'ditolak' : 'menunggu';
        location.replace('/status.html?akses-dashboard=' + reason + '#kode-milikku');
        return;
      }
      $('player-member-id').textContent = memberLabel(player.code);
      $('player-joined-at').textContent = formatJoined(player.submittedAt);
      playerCodeForSecureLogin = player.code || '';
      pending.hidden = true;
      content.hidden = false;
      await loadSecurityState();
    } catch (error) {
      if (error.status === 401) {
        location.replace('/status.html?akses-dashboard=perlu-masuk#kode-milikku');
        return;
      }
      showError('Gagal mengambil data keanggotaan. ' + error.message);
    } finally {
      loading = false;
    }
  }
  $('player-retry').addEventListener('click', load);
  $('player-logout').addEventListener('click', async () => {
    const button = $('player-logout');
    button.disabled = true;
    try {
      await request('/api/player/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      location.replace('/status.html#kode-milikku');
    } catch (error) {
      button.disabled = false;
      showError('Tidak bisa keluar dari akun saat ini. ' + error.message);
    }
  });
  // Retain all existing theme colors; the player page adds layout, not a new palette.
  fetch('/api/form', {credentials:'same-origin', cache:'no-store'})
    .then(r => r.ok ? r.json() : null)
    .then(x => { if (x?.settings) window.SSCircleTheme?.apply(x.settings); })
    .catch(() => {});
  void load();
})();