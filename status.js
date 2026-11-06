/* Standalone secure status lookup. Only the code is submitted. */

// Cek status pendaftaran dan akses kode milik pendaftar.

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const defaults = {
    statusEyebrow: 'APPLICATION TRACKER',
    statusOldHint: 'Gunakan kode pendaftaran yang didapat setelah mengirim formulir.',
    statusHeading: 'Cek status pendaftaran.',
    statusDescription: 'Masukkan kode pendaftaran untuk melihat apakah kamu sedang menunggu, diterima, atau ditolak beserta alasannya.',
    statusButtonText: 'Periksa status',
    statusOwnCodeEnabled: true,
    statusOwnCodeTitle: 'Lihat kode pendaftaran saya',
    statusOwnCodeDescription: 'Jika sesi akun masih aktif, kode pendaftaranmu bisa dilihat dan disalin tanpa masuk ulang.',
    statusOwnCodeHelp: 'Jika sudah keluar, masuk satu kali dengan kode asli atau hubungi admin untuk verifikasi.',
    statusOwnCodeLoginText: 'Masuk & lihat kode',
    statusOwnCodeCopyText: 'Salin kode',
    statusOwnCodeCheckText: 'Cek status saya',
    statusOwnCodeLogoutText: 'Keluar akun',
    homeDiscordUrl: 'https://discord.gg/vQQSgY2GRS'
  };
  const text = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls)
      n.className = cls;
    n.textContent = String(value ?? '');
    return n;
  };
  function theme(settings) {
    const map = {
      accentColor: '--ssc-primary',
      secondaryColor: '--ssc-secondary',
      backgroundColor: '--ssc-bg',
      backgroundEndColor: '--ssc-bg-end',
      textColor: '--ssc-text',
      mutedColor: '--ssc-muted',
      panelColor: '--ssc-panel',
      borderColor: '--ssc-border',
      highlightColor: '--ssc-highlight'
    };
    for (const [k, v] of Object.entries(map))
      if (/^#[0-9a-f]{6}$/i.test(settings[k] || ''))
        document.documentElement.style.setProperty(v, settings[k]);
  }
  let settings = { ...defaults };
  SSCircle.getForm().then(form => {
    settings = { ...defaults, ...form.settings };
    theme(settings);
    window.SSCircleTheme?.apply(settings);
    $('status-eyebrow').textContent = settings.statusEyebrow;
    const oldHint = String(settings.statusOldHint ?? '')
      .replace(/USERNAME\s+MINECRAFT\s*\(\s*HANYA\s+UNTUK\s+KODE\s+LAMA\s+8\s+KARAKTER\s*\)/gi, '')
      .trim();
    $('status-old-hint').textContent = oldHint;
    $('status-old-hint').hidden = !oldHint;
    $('status-heading').textContent = settings.statusHeading;
    $('status-description').textContent = settings.statusDescription;
    $('status-check-button').textContent = settings.statusButtonText + ' ↗';
    $('kode-milikku').hidden = settings.statusOwnCodeEnabled === false;
    $('status-my-code-title').textContent = settings.statusOwnCodeTitle;
    $('status-my-code-description').textContent = settings.statusOwnCodeDescription;
    $('status-my-code-help').textContent = settings.statusOwnCodeHelp;
    $('status-my-code-login').querySelector('button').textContent = settings.statusOwnCodeLoginText;
    $('status-own-copy').textContent = settings.statusOwnCodeCopyText;
    $('status-check-own').textContent = settings.statusOwnCodeCheckText + ' ↗';
    $('status-own-logout').textContent = settings.statusOwnCodeLogoutText;
    if (settings.statusOwnCodeEnabled === false)
      $('status-code').value = '';
    const logo = settings.logoImageUrl || (settings.logoMediaId ? '/api/media/' + settings.logoMediaId : 'assets/sscircle-logo.png');
    $('status-logo').src = logo;
    $('status-footer-logo').src = logo;
    if ($('status-footer-text'))
      $('status-footer-text').textContent = settings.homeFooterText || 'One circle. Endless stories.';
    const footerDiscord = $('ssc-footer-discord');
    if (footerDiscord && /^https:\/\/(discord\.gg|discord\.com)\//.test(settings.homeDiscordUrl || ''))
      footerDiscord.href = settings.homeDiscordUrl;
    if (/^https:\/\/(discord\.gg|discord\.com)\//.test(settings.homeDiscordUrl))
      $('status-discord-link').href = settings.homeDiscordUrl;
  }).catch(() => { });
  const playerRequest = async (path, payload) => {
    const response = await fetch(path, {
      method: payload ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || 'Tidak dapat masuk.');
    return result;
  };
  const votingAccess = new URLSearchParams(location.search).get('akses-voting');
  if (votingAccess) {
    const notices = {
      'perlu-masuk': 'Untuk membuka voting, masuk menggunakan kode pendaftaran berstatus Diterima. Kode Menunggu dan Ditolak tidak mempunyai akses.',
      menunggu: 'Pendaftaranmu masih Menunggu. Voting hanya dapat dibuka setelah admin menerima pendaftaranmu.',
      ditolak: 'Pendaftaranmu Ditolak, jadi kamu belum dapat masuk ke voting.',
      'belum-tersedia': 'Layanan voting belum tersedia. Silakan coba lagi nanti.'
    };
    $('status-voting-notice').textContent = notices[votingAccess] || notices['perlu-masuk'];
    $('status-voting-notice').hidden = false;
    $('kode-milikku').open = true;
  }
  function showOwnCode(account) {
    const active = !!account?.authenticated;
    $('status-my-code-logged').hidden = !active;
    $('status-my-code-login').hidden = active;
    const accepted = active && account.status === 'accepted';
    $('status-voting-entry').hidden = !accepted;
    if (active && !accepted) {
      $('status-voting-notice').hidden = false;
      $('status-voting-notice').textContent = account.status === 'rejected'
        ? 'Status Ditolak. Akses voting tidak tersedia untuk kode ini.'
        : 'Status Menunggu. Kamu bisa masuk voting setelah admin menerima pendaftaranmu.';
    }
    else if (accepted) {
      $('status-voting-notice').hidden = true;
    }
    if (!active) {
      $('status-own-code').textContent = '';
      $('status-code').value = '';
    }
    if (active) {
      $('status-own-code').textContent = account.code;
      if (settings.statusOwnCodeEnabled !== false)
        $('status-code').value = account.code;
      $('status-my-code-help').textContent = 'Sesi akun aktif. Kode bisa dilihat dan disalin berkali-kali pada perangkat ini tanpa login ulang.';
    }
  }
  async function refreshOwnCode() {
    try {
      showOwnCode(await playerRequest('/api/player/me'));
    }
    catch {
      showOwnCode(null);
    }
  }
  $('status-my-code-login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const help = $('status-my-code-help');
    help.textContent = 'Memeriksa kode...';
    try {
      const account = await playerRequest('/api/player/login', { code: $('status-own-login-code').value });
      $('status-own-login-code').value = '';
      showOwnCode(account);
    }
    catch (error) {
      help.textContent = error.message;
    }
  });
  $('status-own-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('status-own-code').textContent);
      $('status-my-code-help').textContent = 'Kode berhasil disalin.';
    }
    catch {
      $('status-my-code-help').textContent = 'Salin kode secara manual dari kotak di atas.';
    }
  });
  $('status-own-logout').addEventListener('click', async () => {
    try {
      await playerRequest('/api/player/logout', {});
    }
    catch { }
    showOwnCode(null);
    $('status-my-code-help').textContent = 'Kamu sudah keluar. Masuk kembali untuk melihat kode milikmu.';
  });
  void refreshOwnCode();
  async function checkStatus(code) {
    const root = $('status-result'), btn = $('status-check-button');
    root.replaceChildren();
    if (!code) {
      $('status-code').focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Memeriksa...';
    try {
      const result = await SSCircle.checkStatus(code);
      // Pulihkan sesi pendaftar setelah pengecekan kode; tautan voting menunggu verifikasi sesi selesai.
      const loginPromise = playerRequest('/api/player/login', { code });
      loginPromise.then(showOwnCode).catch(() => { });
      const card = text('div', 'status-result-card ' + result.status);
      const visual = text('div', 'status-visual status-visual-' + result.status);
      visual.setAttribute('aria-hidden', 'true');
      const aura = text('span', 'status-visual-aura'), glyph = text('span', 'status-visual-glyph', result.status === 'accepted' ? '✓' : result.status === 'rejected' ? '×' : '◷');
      visual.append(aura, glyph);
      if (result.status === 'accepted') {
        for (let i = 0; i < 6; i++) {
          const spark = text('span', 'status-celebration-particle');
          spark.style.setProperty('--p', i);
          visual.append(spark);
        }
      }
      card.append(visual);
      const names = { pending: 'Pendaftaran sedang menunggu', accepted: 'Pendaftaran diterima', rejected: 'Pendaftaran ditolak' };
      card.append(text('h2', 'status-result-badge', names[result.status] || 'Status Pendaftaran'));
      const messages = {
        pending: 'Jawabanmu sudah masuk dan masih dalam proses seleksi.',
        accepted: 'Selamat! Pendaftaranmu telah disetujui oleh admin SSCircle Server. Silahkan cek server Discord SSCircle Community untuk informasi lebih lanjut.',
        rejected: 'Admin telah memeriksa pendaftaranmu.'
      };
      card.append(text('p', '', messages[result.status] || ''));
      if (result.status === 'rejected') {
        card.append(text('strong', 'rejection-label', 'Alasan penolakan:'), text('p', 'rejection-text', result.reason || 'Tidak ada alasan tambahan.'));
      }
      if (result.submittedAt)
        card.append(text('small', '', 'Dikirim: ' + new Date(result.submittedAt).toLocaleString('id-ID')));
      if (result.status === 'accepted') {
        const link = text('a', 'button primary status-voting-result-link', 'Masuk ke Voting ↗');
        link.href = '/voting';
        let redirecting = false;
        const openVoting = async () => {
          if (redirecting)
            return;
          redirecting = true;
          link.textContent = 'Memeriksa akses Voting...';
          try {
            const account = await loginPromise;
            if (account.status !== 'accepted')
              throw Error('Hanya kode berstatus Diterima yang bisa membuka voting.');
            // Pastikan browser telah menerima sesi sebelum meminta dokumen yang dilindungi.
            const session = await playerRequest('/api/player/me');
            if (!session.authenticated || session.status !== 'accepted')
              throw Error('Sesi Voting belum aktif. Silakan masuk kembali.');
            window.location.assign(link.href);
          }
          catch (error) {
            link.textContent = 'Masuk ke Voting ↗';
            $('status-voting-notice').textContent = 'Status Diterima, tetapi sesi Voting belum berhasil: ' + error.message;
            $('status-voting-notice').hidden = false;
            redirecting = false;
          }
        };
        link.addEventListener('click', event => {
          event.preventDefault();
          void openVoting();
        });
        card.append(link);
        root.append(card);
        // Sesuai alur pendaftaran: kode Diterima langsung masuk ke Voting.
        // Jika autentikasi gagal, tetap tampilkan hasil status dan tombol untuk mencoba lagi.
        void openVoting();
      }
      else {
        root.append(card);
      }
    }
    catch (error) {
      root.append(text('div', 'message message-error', error.message));
    }
    finally {
      btn.disabled = false;
      btn.textContent = (settings.statusButtonText || 'Periksa status') + ' ↗';
    }
  }
  $('status-check-form').addEventListener('submit', event => {
    event.preventDefault();
    void checkStatus($('status-code').value.trim());
  });
  $('status-check-own').addEventListener('click', () => {
    const code = $('status-own-code').textContent.trim();
    if (!code)
      return;
    void checkStatus(code);
    $('status-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
})();
