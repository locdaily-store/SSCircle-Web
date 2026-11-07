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
    lockPrivateControls(mode!=='active');
  }
  const securityMessage=(message)=>{$('player-security-message').textContent=message;};
  async function listDevices() {
    const result=await request('/api/player/security/sessions');
    const list=$('player-device-list');list.replaceChildren();
    const sessions=result.sessions||[];
    if(!sessions.length){const note=document.createElement('p');note.textContent='Belum ada perangkat aktif.';list.append(note);return;}
    for(const session of sessions){
      const card=document.createElement('div');card.className='player-device';
      const block=document.createElement('div');
      const name=document.createElement('strong');name.textContent=(session.current?'Perangkat ini · ':'')+(session.client||'Browser');
      const sub=document.createElement('small');
      sub.textContent='Masuk: '+new Date(session.createdAt).toLocaleString('id-ID');
      block.append(name,sub);
      const revoke=document.createElement('button');revoke.type='button';
      revoke.className='player-action player-action-secondary';revoke.textContent='Cabut sesi';
      revoke.addEventListener('click',async()=>{
        revoke.disabled=true;
        try{
          await request('/api/player/security/revoke',{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:session.id})
          });
          await loadSecurityState();
          if(session.current) securityMessage('Dashboard dikunci. Masuk kembali dengan password.');
        }catch(error){securityMessage(error.message);revoke.disabled=false;}
      });
      card.append(block,revoke);list.append(card);
    }
  }
  async function loadSecurityState(){
    try {
      const state=await request('/api/player/security/state');
      const mode=state.authenticated?'active':state.hasPassword?'login':'activate';
      showSecurityMode(mode);
      securityMessage(state.authenticated?'Akun aman aktif pada perangkat ini.':'');
      if(state.authenticated){await listDevices();await loadProfile();}
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
      // Direct the member to their own in-site mailbox after a successful request.
      location.assign('/mailbox?activation=requested');
    }catch(error){label.textContent='Permintaan tidak berhasil: '+error.message}
    finally{button.disabled=false;}
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