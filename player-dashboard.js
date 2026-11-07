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
      pending.hidden = true;
      content.hidden = false;
      await loadProfile();
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