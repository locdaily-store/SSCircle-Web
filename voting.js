/* SSCircle Voting: one verified registration session per vote. */

// Halaman voting: pemeriksaan sesi, pilihan, dan hasil.

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const make = (tag, className = '', text) => {
    const element = document.createElement(tag);
    if (className)
      element.className = className;
    if (text !== undefined)
      element.textContent = text;
    return element;
  };
  let votingData = null;
  let account = null;
  const note = (text, kind = '') => {
    const element = $('vote-message');
    element.textContent = text || '';
    element.className = 'vote-message' + (kind ? ' is-' + kind : '');
  };
  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options,
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || 'Layanan sementara tidak tersedia.');
    return payload;
  }
  function renderAccount() {
    const login = $('vote-login');
    const owner = $('vote-current-player');
    if (!login || !owner)
      return;
    const accepted = account?.status === 'accepted';
    login.hidden = !!account;
    owner.hidden = !account;
    if (account) {
      $('vote-current-player-name').textContent = accepted ? 'Pendaftar diterima' : 'Belum mendapatkan akses voting';
      $('vote-current-player-code').textContent = account.code.replace(/.(?=.{4})/g, '•');
    }
    const active = votingData?.active === true;
    $('vote-form').hidden = !active || !accepted;
    $('vote-submit').disabled = !active || !accepted;
  }
  async function refreshAccount() {
    try {
      account = await request('/api/player/me');
      if (!account.authenticated)
        account = null;
      if (account && account.status !== 'accepted')
        location.replace('status.html?akses-voting=' + (account.status === 'rejected' ? 'ditolak' : 'menunggu') + '#kode-milikku');
    }
    catch {
      account = null;
    }
    renderAccount();
  }
  function renderResults(payload) {
    const container = $('vote-results');
    container.replaceChildren();
    $('vote-results-section').hidden = !payload.showResults;
    if (!payload.showResults)
      return;
    for (const item of payload.results || []) {
      const row = make('article', 'vote-result-card');
      const heading = make('div', 'vote-result-head');
      heading.append(make('strong', '', item.label), make('span', '', `${item.count} suara · ${item.percent}%`));
      const track = make('div', 'vote-result-bar');
      const fill = make('div', 'vote-result-fill');
      fill.style.width = `${item.percent}%`;
      track.append(fill);
      row.append(heading, track);
      container.append(row);
    }
    if (!container.childElementCount)
      container.append(make('p', 'vote-message', 'Belum ada hasil voting.'));
  }
  function imageGallery(sources, className) {
    const gallery = make('div', className);
    for (const [index, source] of sources.entries()) {
      const figure = make('figure', 'vote-image-frame');
      const image = make('img');
      image.src = source;
      image.alt = `Foto pilihan voting ${index + 1}`;
      image.loading = 'lazy';
      figure.append(image);
      gallery.append(figure);
    }
    return gallery;
  }
  function renderVoting(data) {
    votingData = data;
    $('vote-title').textContent = data.title || 'Voting Komunitas';
    $('vote-question').textContent = data.question || 'Pilih jawabanmu';
    $('vote-description').textContent = data.text || '';
    $('vote-status').textContent = !data.enabled
      ? 'Voting sedang tidak tersedia.'
      : data.active
        ? (data.endsAt ? 'Voting berakhir: ' + new Date(data.endsAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Voting sedang berlangsung.')
        : 'Sesi voting sudah berakhir.';
    const images = $('vote-images');
    images.replaceChildren();
    for (const [index, source] of (data.images || []).entries()) {
      const figure = make('figure', 'vote-image-frame');
      const image = make('img');
      image.src = source;
      image.alt = `Foto pertanyaan voting ${index + 1}`;
      image.loading = index < 2 ? 'eager' : 'lazy';
      figure.append(image);
      images.append(figure);
    }
    images.hidden = images.childElementCount === 0;
    const choices = $('vote-options');
    choices.replaceChildren();
    for (const [index, option] of (data.options || []).entries()) {
      const card = make('label', 'vote-option vote-option-rich');
      const titleRow = make('div', 'vote-option-top');
      const radio = make('input');
      radio.type = 'radio';
      radio.name = 'vote-option';
      radio.value = option.id;
      radio.required = true;
      if (index === 0)
        radio.checked = true;
      titleRow.append(radio, make('strong', '', option.label));
      card.append(titleRow);
      if (option.description)
        card.append(make('p', 'vote-option-description', option.description));
      if (Array.isArray(option.images) && option.images.length) {
        card.append(imageGallery(option.images, 'vote-choice-gallery'));
      }
      choices.append(card);
    }
    renderResults(data);
    renderAccount();
  }
  $('vote-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('vote-login-button');
    button.disabled = true;
    note('Memverifikasi kode pendaftaran...');
    try {
      account = await request('/api/player/login', {
        method: 'POST',
        body: JSON.stringify({ code: $('vote-account').value }),
      });
      $('vote-account').value = '';
      renderAccount();
      if (account.status !== 'accepted') {
        location.replace('status.html?akses-voting=' + (account.status === 'rejected' ? 'ditolak' : 'menunggu') + '#kode-milikku');
        return;
      }
      note('Berhasil masuk. Sekarang kamu dapat memberikan suara.', 'success');
    }
    catch (error) {
      note(error.message, 'error');
    }
    finally {
      button.disabled = false;
    }
  });
  $('vote-player-logout').addEventListener('click', async () => {
    await request('/api/player/logout', { method: 'POST' }).catch(() => { });
    account = null;
    renderAccount();
    note('Kamu sudah keluar.');
  });
  $('vote-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!account || account.status !== 'accepted')
      return note('Hanya pendaftar berstatus Diterima yang boleh voting.', 'error');
    const selected = document.querySelector('input[name="vote-option"]:checked');
    if (!selected)
      return note('Pilih jawaban terlebih dahulu.', 'error');
    const button = $('vote-submit');
    button.disabled = true;
    note('Mengirim suara...');
    try {
      const result = await request('/api/voting/vote', {
        method: 'POST',
        body: JSON.stringify({ optionId: selected.value }),
      });
      note(result.message || 'Suara berhasil dikirim.', 'success');
      const next = await request('/api/voting');
      renderVoting(next);
      $('vote-submit').disabled = true;
    }
    catch (error) {
      note(error.message, 'error');
      button.disabled = false;
    }
  });
  document.querySelectorAll('.home-reveal').forEach(item => item.classList.add('is-shown'));
  window.SSCircleTheme?.load();
  // Read only public display settings; does not bypass server-side voting access checks.
  fetch('/api/form', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(form => {
    const s = form?.settings || {};
    if ($('vote-footer-text'))
      $('vote-footer-text').textContent = s.homeFooterText || 'One circle. Endless stories.';
    if ($('vote-footer-logo'))
      $('vote-footer-logo').src = s.logoImageUrl || (s.logoMediaId ? '/api/media/' + s.logoMediaId : 'assets/sscircle-logo.png');
    if ($('ssc-footer-discord') && /^https:\/\/(?:discord\.gg|discord\.com)\//.test(s.homeDiscordUrl || ''))
      $('ssc-footer-discord').href = s.homeDiscordUrl;
  }).catch(() => { });
  Promise.all([request('/api/voting'), refreshAccount()])
    .then(([data]) => renderVoting(data))
    .catch(error => {
    $('vote-status').textContent = 'Voting belum dapat dimuat.';
    note(error.message, 'error');
  });
})();
