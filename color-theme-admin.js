/* SSCircle Color Studio V10.18: palette, live preview and per-selector overrides. */

// Editor warna, gradasi, dan pratinjau di Admin Control.

'use strict';
window.SSCircleThemeEditor = (() => {
  let state = null, changed = () => { }, timer = 0, frameReady = false, phone = false, initialized = false;
  const $ = id => document.getElementById(id);
  const HEX = /^#[0-9a-f]{6}$/i;
  const targets = [
    ['.home-page', 'Seluruh Homepage'], ['.public-page', 'Seluruh Registration'],
    ['.status-standalone', 'Halaman Cek Status'], ['.voting-page', 'Halaman Voting'],
    ['.rules-page', 'Seluruh Server Rules'], ['.rules-hero', 'Header Server Rules'],
    ['.rules-heading', 'Judul Server Rules'], ['.rules-lead', 'Deskripsi pembuka Rules'],
    ['.rules-section', 'Panel kategori Rules'], ['.rules-section h2', 'Judul kategori Rules'],
    ['.rules-item', 'Kartu peraturan'], ['.rules-item-number', 'Nomor peraturan'],
    ['.rules-item p', 'Penjelasan peraturan'], ['.rules-consent', 'Panel persetujuan'],
    ['.rules-continue', 'Tombol lanjut Registration'],
    ['.events-page', 'Seluruh Event Calendar'], ['.events-hero', 'Pembuka Event'],
    ['.events-card', 'Kartu event'], ['.events-card h2', 'Judul event'],
    ['.events-calendar', 'Kalender bulanan'], ['.events-status', 'Label status event'],
    ['.events-countdown', 'Hitung mundur'],
    ['.season-page', 'Seluruh halaman Season Archive'],
    ['.season-archive-hero', 'Pembuka arsip season'],
    ['.season-archive-card', 'Kartu riwayat season'],
    ['.season-archive-state', 'Status season'],
    ['.season-archive-group', 'Bagian kenangan dan prestasi'],
    ['.season-archive-photo', 'Foto kenangan'],
    ['.season-archive-award', 'Kartu Hall of Fame'],
    ['.season-archive-ranking', 'Peringkat pemain'],
    ['.player-page', 'Profile: seluruh halaman'],
    ['.player-hero', 'Profile: pembuka'],
    ['.player-card', 'Profile: seluruh kartu'],
    ['.player-profile', 'Profile: identitas anggota'],
    ['.player-welcome', 'Profile: sambutan'],
    ['.player-security', 'Profile: keamanan akun'],
    ['.player-preferences', 'Profile: pengaturan pribadi'],
    ['.player-achievements', 'Profile: penghargaan'],
    ['.player-linking', 'Profile: akun Minecraft'],
    ['.player-stats', 'Profile: statistik'],
    ['.player-explore', 'Profile: pintasan komunitas'],
    ['.ssc-mailbox-modal', 'Mail Box: pop-up'],
    ['.mailbox-item', 'Mail Box: daftar pesan'],
    ['.mailbox-detail', 'Mail Box: isi pesan'],
    ['.home-season-highlights', 'Bagian Season Highlights di Homepage'],
    ['.home-season-card', 'Kartu Season Highlights'],
    ['.home-header', 'Header Homepage'], ['.home-nav-link', 'Menu navigasi'],
    ['.home-brand', 'Nama/logo header'], ['.home-hero', 'Hero Video'],
    ['.home-hero-content h1', 'Judul Hero'], ['.home-hero-content h1 em', 'Highlight judul Hero'],
    ['.home-kicker', 'Teks kecil hero'], ['.home-story', 'Tentang Server'],
    ['.home-section-label', 'Nomor & label bagian'], ['.home-section-label i', 'Garis bagian'],
    ['.home-gallery-section', 'Galeri'], ['.home-gallery-grid figure', 'Kartu gambar galeri'],
    ['.home-journey-panel', 'Panel Join our Circle'], ['.home-steps', 'Langkah pendaftaran'],
    ['.home-community-card', 'Panel Discord'], ['.home-profile-item', 'Kartu Profil & Sejarah'],
    ['.home-leaderboard-shell', 'Kartu Leaderboard'], ['.home-cta-strip', 'Kartu Cek Status singkat'],
    ['.home-custom-block', 'Kartu tambahan Homepage'],
    ['.home-button-primary', 'Semua tombol utama Homepage'], ['.home-button-secondary', 'Semua tombol sekunder Homepage'],
    ['.button.primary', 'Tombol utama formulir'], ['.button.secondary', 'Tombol sekunder formulir'],
    ['.public-page .question-card', 'Kartu pertanyaan'], ['.public-page .answer-option', 'Pilihan jawaban'],
    ['.public-page input', 'Input pendaftaran'], ['.public-page textarea', 'Area teks pendaftaran'],
    ['.public-page .form-intro', 'Pembuka formulir'], ['.public-page .opening-ring', 'Bingkai animasi opening'],
    ['.status-standalone-card', 'Kartu status'], ['.status-nav a', 'Navigasi Cek Status'],
    ['.vote-card', 'Panel utama Voting'], ['.vote-option', 'Pilihan Voting'],
    ['.vote-result-fill', 'Bar hasil Voting'], ['.home-footer', 'Footer Homepage'],
    ['.site-footer', 'Footer publik'], ['.admin-page', 'Latar Admin Control'],
    ['.admin-page .panel', 'Panel Admin Control'], ['.admin-page .side-link', 'Menu Admin Control'],
    ['.admin-page input', 'Input Admin Control'], ['.admin-page .button.primary', 'Tombol utama Admin Control']
  ];
  const props = [['text', 'Warna teks / ikon'], ['background', 'Warna latar'], ['border', 'Garis / border'],
    ['outline', 'Garis fokus'], ['gradient', 'Gradasi dua warna'], ['shadow', 'Warna bayangan'], ['highlight', 'Highlight transparan']];
  function node(tag, cls, text) { const el = document.createElement(tag); if (cls)
    el.className = cls; if (text !== undefined)
    el.textContent = text; return el; }
  function colorGroup(value, onChange) {
    const row = node('div', 'ssc-theme-color-pair');
    const color = node('input'), hex = node('input');
    color.type = 'color';
    color.value = HEX.test(value) ? value : '#bc91f5';
    hex.type = 'text';
    hex.maxLength = 7;
    hex.value = color.value;
    const update = v => { if (!HEX.test(v))
      return; color.value = v; hex.value = v; onChange(v); };
    color.oninput = () => update(color.value);
    hex.onchange = () => HEX.test(hex.value) ? update(hex.value) : (hex.value = color.value);
    row.append(color, hex);
    return row;
  }
  function select(values, value, onChange) {
    const control = node('select');
    for (const [key, label] of values) {
      const option = node('option', '', label);
      option.value = key;
      control.append(option);
    }
    control.value = value;
    control.onchange = () => onChange(control.value);
    return control;
  }
  function mark() { changed(); schedule(); }
  function renderOverrides() {
    const area = $('theme-overrides');
    if (!area || !state)
      return;
    area.replaceChildren();
    state.settings.themeOverrides ||= [];
    const rules = state.settings.themeOverrides;
    rules.forEach((r, index) => {
      const card = node('div', 'ssc-theme-rule');
      const top = node('div', 'ssc-theme-rule-top');
      const title = node('strong', '', `Warna objek ${String(index + 1).padStart(2, '0')}`);
      const del = node('button', 'button secondary', 'Hapus');
      del.type = 'button';
      del.onclick = () => { rules.splice(index, 1); mark(); renderOverrides(); };
      top.append(title, del);
      const body = node('div', 'ssc-theme-rule-body');
      const choice = select([...targets, ['__custom__', 'Kustom: isi CSS selector']], targets.some(t => t[0] === r.selector) ? r.selector : '__custom__', v => {
        if (v !== '__custom__') {
          r.selector = v;
          selectorInput.value = v;
        }
        selectorInput.hidden = v !== '__custom__';
        mark();
      });
      const selectorInput = node('input');
      selectorInput.type = 'text';
      selectorInput.value = r.selector || '';
      selectorInput.maxLength = 140;
      selectorInput.placeholder = 'Contoh: .home-gallery-section h2';
      selectorInput.hidden = targets.some(t => t[0] === r.selector);
      selectorInput.onchange = () => {
        if (!window.SSCircleTheme?.validSelector(selectorInput.value)) {
          $('theme-preview-status').textContent = 'Selector tidak valid. Gunakan nama class, ID atau tag CSS tanpa fungsi.';
          return;
        }
        r.selector = selectorInput.value;
        mark();
      };
      const prop = select(props, r.property || 'text', v => { r.property = v; mark(); renderOverrides(); });
      const colors = node('div', 'ssc-theme-rule-colors');
      colors.append(colorGroup(r.value || '#bc91f5', v => { r.value = v; mark(); }));
      if (r.property === 'gradient') {
        colors.append(colorGroup(r.value2 || '#8069bf', v => { r.value2 = v; mark(); }));
        const angle = node('input');
        angle.type = 'number';
        angle.min = 0;
        angle.max = 360;
        angle.value = String(r.angle ?? 135);
        angle.setAttribute('aria-label', 'Sudut gradasi objek');
        angle.onchange = () => { r.angle = Math.min(360, Math.max(0, Number(angle.value) || 0)); mark(); };
        colors.append(angle);
      }
      body.append(choice, selectorInput, prop, colors);
      card.append(top, body);
      area.append(card);
    });
    $('theme-add-override').disabled = rules.length >= 80;
  }
  function choosePage() {
    const iframe = $('theme-preview-frame');
    if (!iframe)
      return;
    frameReady = false;
    const which = $('theme-preview-page').value;
    $('theme-preview-status').textContent = 'Memuat pratinjau ' + which + ' ...';
    const url = which === 'index.html' ? './' : (which === 'voting.html' ? 'voting-preview.html' : which);
    iframe.src = url + (url.includes('?') ? '&' : '?') + 'ssc_theme_preview=1' + (which === 'registration.html' ? '&ssc_registration_preview=1' : '');
    resize();
  }
  function resize() {
    const frame = $('theme-preview-frame'), viewport = $('theme-preview-window');
    if (!frame || !viewport)
      return;
    const width = phone ? 390 : 1280, height = phone ? 840 : 900;
    const scale = Math.min(1, Math.max(160, viewport.clientWidth - 24) / width);
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.transform = `scale(${scale})`;
    frame.setAttribute('scrolling', 'yes');
    viewport.style.height = Math.min(phone ? 620 : 660, height * scale + 20) + 'px';
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 110); }
  function update() {
    if (!state)
      return;
    const frame = $('theme-preview-frame');
    // Preview pages have a message receiver independent of API readiness.
    try {
      frame?.contentWindow?.postMessage({ type: 'ssc-theme-preview-settings', settings: JSON.parse(JSON.stringify(state.settings)) }, location.origin);
      if ($('theme-preview-page').value === 'seasons.html') {
        frame?.contentWindow?.postMessage({type:'ssc-season-preview-settings',settings:JSON.parse(JSON.stringify(state.settings))},location.origin);
      }
      if ($('theme-preview-page').value === 'events.html') {
        frame?.contentWindow?.postMessage({ type: 'ssc-events-preview-settings', settings: JSON.parse(JSON.stringify(state.settings)) }, location.origin);
      }
      if ($('theme-preview-page').value === 'rules.html') {
        frame?.contentWindow?.postMessage({ type: 'ssc-rules-preview-settings', settings: JSON.parse(JSON.stringify(state.settings)) }, location.origin);
      }
      if ($('theme-preview-page').value === 'profile-preview.html') {
        frame?.contentWindow?.postMessage({type:'ssc-profile-preview-settings',settings:JSON.parse(JSON.stringify(state.settings))},location.origin);
      }
      if ($('theme-preview-page').value === 'registration.html') {
        frame?.contentWindow?.postMessage({ type: 'ssc-registration-preview-settings', settings: JSON.parse(JSON.stringify(state.settings)), pages: JSON.parse(JSON.stringify(state.pages || [])) }, location.origin);
      }
    }
    catch {
      $('theme-preview-status').textContent = 'Pratinjau tidak dapat diperbarui.';
    }
    // When enabled, admins can see the colors locally without saving; don't auto-apply
    // to the actual Admin Control to avoid making controls illegible during editing.
  }
  function render(data, notify) {
    state = data;
    changed = notify;
    renderOverrides();
    const angle = $('theme-gradient-angle'), output = $('theme-gradient-angle-value');
    angle.value = String(state.settings.themeGradientAngle ?? 135);
    output.value = angle.value + '°';
    angle.oninput = () => { state.settings.themeGradientAngle = Number(angle.value); output.value = angle.value + '°'; mark(); };
    const pageMode = $('theme-page-background-mode');
    const pageAngle = $('theme-page-background-angle');
    const pageAngleOutput = $('theme-page-background-angle-value');
    const pageAngleRow = $('theme-page-background-angle-row');
    pageMode.value = state.settings.pageBackgroundMode === 'solid' ? 'solid' : 'gradient';
    pageAngle.value = String(state.settings.pageBackgroundAngle ?? 160);
    pageAngleOutput.value = pageAngle.value + '°';
    const syncPageMode = () => { pageAngleRow.hidden = pageMode.value === 'solid'; };
    syncPageMode();
    pageMode.onchange = () => { state.settings.pageBackgroundMode = pageMode.value; syncPageMode(); mark(); };
    pageAngle.oninput = () => { state.settings.pageBackgroundAngle = Number(pageAngle.value); pageAngleOutput.value = pageAngle.value + '°'; mark(); };
    $('theme-cards-gradient').checked = state.settings.cardGradientEnabled === true;
    $('theme-cards-gradient').onchange = e => { state.settings.cardGradientEnabled = e.target.checked; mark(); };
    $('theme-admin-enable').checked = state.settings.adminThemeEnabled === true;
    $('theme-admin-enable').onchange = e => { state.settings.adminThemeEnabled = e.target.checked; mark(); };
    if (!initialized) {
      initialized = true;
      $('theme-add-override').onclick = () => {
        state.settings.themeOverrides ||= [];
        if (state.settings.themeOverrides.length >= 80)
          return;
        state.settings.themeOverrides.push({ selector: '.home-section-label', property: 'text', value: '#bc91f5', value2: '#8069bf', angle: 135 });
        mark();
        renderOverrides();
      };
      $('theme-preview-page').onchange = choosePage;
      $('theme-preview-desktop').onclick = () => { phone = false; resize(); };
      $('theme-preview-mobile').onclick = () => { phone = true; resize(); };
      $('theme-preview-reload').onclick = choosePage;
      $('theme-preview-frame').onload = () => { resize(); schedule(); };
      window.addEventListener('message', e => {
        if (e.origin !== location.origin || e.source !== $('theme-preview-frame')?.contentWindow)
          return;
        if (e.data?.type === 'ssc-theme-preview-ready') {
          frameReady = true;
          schedule();
        }
        if (e.data?.type === 'ssc-theme-preview-applied')
          $('theme-preview-status').textContent = 'Pratinjau warna aktif';
      });
      if ('ResizeObserver' in window)
        new ResizeObserver(resize).observe($('theme-preview-window'));
    }
    resize();
    schedule();
  }
  return { render, schedule };
})();
