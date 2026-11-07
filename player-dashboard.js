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