/* SSCircle Server • public multi-page branching form */

// Formulir pendaftaran: pertanyaan, navigasi, dan pengiriman data.

'use strict';
const $ = x => document.querySelector(x);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls)
    n.className = cls;
  if (txt !== undefined)
    n.textContent = txt;
  return n;
};
let model = null, pageIndex = 0, history = [], answers = {}, images = {}, demo = false;
const OTHER_PREFIX = '__SSC_OTHER__:';
const OTHER_RADIO = '__SSC_OTHER_CHOICE__';
const isOther = v => typeof v === 'string' && v.startsWith(OTHER_PREFIX);
const otherText = v => isOther(v) ? v.slice(OTHER_PREFIX.length) : '';
function safePublicText(value) {
  // Teks pengaturan ditampilkan sesuai isi yang disimpan admin.
  return String(value ?? '');
}
const presentationDefaults = {
  brandName: 'SSCircle Server',
  brandLabel: 'REGISTRATION',
  headerBadge: 'PENDAFTARAN DIBUKA',
  heroBadgeLeft: 'SSCIRCLE / SERVER',
  heroBadgeRight: 'REGISTRATION',
  heroEyebrow: 'THE NEXT CHAPTER',
  heroTitle: 'SSCircle Server',
  heroTagline: 'Petualangan baru. Cerita baru.',
  heroSubtitle: 'Komunitas yang sama.',
  heroFootnote: 'MINECRAFT SMP · JAVA + BEDROCK',
  heroStep1: 'DAFTAR',
  heroStep2: 'SELEKSI',
  heroStep3: 'BERMAIN',
  formEyebrow: 'APPLICATION FORM',
  sectionIndex: '001 — SSCIRCLE',
  pageLabel: 'REGISTRATION',
  availabilityOpen: 'PENDAFTARAN DIBUKA',
  availabilityClosed: 'PENDAFTARAN DITUTUP',
  formHint: 'Isi formulir di bawah dengan lengkap dan jujur.',
  submitTitle: 'Siap bergabung dengan SSCircle Server?',
  submitDescription: 'Pilih Lanjut untuk melihat halaman berikutnya, atau Kirim untuk menyelesaikan pendaftaran.',
  privacyNote: 'Jawaban hanya bisa dilihat tim admin SSCircle Server.',
  footerText: 'One circle. Endless stories.',
  footerNote: '© 2026 SSCircle Server',
  successTitle: 'Pendaftaran berhasil dikirim.',
  successDescription: 'Jawabanmu sudah tersimpan dan masuk ke dashboard admin.',
  successEyebrow: 'APPLICATION RECEIVED',
  backHomeText: 'Kembali ke beranda',
  buttonBack: 'Kembali',
  buttonNext: 'Lanjut ke halaman berikutnya',
  buttonSend: 'Kirim pendaftaran',
  logoMediaId: '',
  heroMediaId: '',
  introLogoMediaId: '',
  accentColor: '#bc91f5',
  secondaryColor: '#8069bf',
  backgroundColor: '#0c0815',
  backgroundEndColor: '#1b1030',
  textColor: '#f5efff',
  mutedColor: '#b8a5ca',
  panelColor: '#20142f',
  borderColor: '#62457d',
  inputColor: '#130b20',
  buttonTextColor: '#1e0d35',
  gradientStartColor: '#3a2056',
  gradientEndColor: '#1b102d',
  highlightColor: '#b29ad6',
  successColor: '#b6e2ce',
  dangerColor: '#ff9caf',
  introTitle: 'SSCircle Server',
  introSubtitle: 'REGISTRATION',
  introDuration: 2300,
  statusEyebrow: 'APPLICATION TRACKER',
  statusHeading: 'Cek status pendaftaran.',
  statusDescription: 'Masukkan kode pendaftaran untuk melihat apakah kamu sedang menunggu, diterima, atau ditolak beserta alasannya.',
  statusButtonText: 'Periksa status'
};
function hexToRgb(hex) {
  const c = hex.match(/^#([0-9a-f]{6})$/i);
  return c ? { r: parseInt(c[1].slice(0, 2), 16), g: parseInt(c[1].slice(2, 4), 16), b: parseInt(c[1].slice(4), 16) } : null;
}
function applyPresentation(settings) {
  const v = { ...presentationDefaults, ...settings };
  window.SSCircleSocial?.render(document.getElementById('registration-social-grid'), v, 'registration');
  const discord = document.getElementById('ssc-footer-discord');
  if (discord && /^https:\/\/(?:discord\.gg|discord\.com)\//.test(v.homeDiscordUrl || ''))
    discord.href = v.homeDiscordUrl;
  const ids = {
    brandName: ['public-brand-name', 'public-footer-brand'],
    brandLabel: ['public-brand-label'],
    headerBadge: ['public-header-badge'],
    heroBadgeLeft: ['public-hero-badge-left'],
    heroBadgeRight: ['public-hero-badge-right'],
    heroEyebrow: ['public-hero-eyebrow'],
    heroTitle: ['public-hero-title'],
    heroTagline: ['public-hero-tagline'],
    heroSubtitle: ['public-hero-subtitle'],
    heroFootnote: ['public-hero-footnote'],
    heroStep1: ['public-step-1'],
    heroStep2: ['public-step-2'],
    heroStep3: ['public-step-3'],
    formEyebrow: ['public-form-eyebrow'],
    sectionIndex: ['public-section-index'],
    pageLabel: ['public-page-label'],
    formHint: ['public-form-hint'],
    submitTitle: ['public-submit-title'],
    submitDescription: ['public-submit-description'],
    privacyNote: ['public-privacy-note'],
    footerText: ['public-footer-text'],
    footerNote: ['public-footer-note'],
    successTitle: ['public-success-title'],
    successDescription: ['public-success-description'],
    successEyebrow: ['public-success-eyebrow'],
    backHomeText: ['public-back-home'],
    buttonBack: ['public-back-label'],
    title: ['form-title'],
    subtitle: ['form-subtitle'],
    description: ['form-description'],
    introTitle: ['opening-title'],
    introSubtitle: ['opening-subtitle'],
    statusEyebrow: ['public-status-eyebrow'],
    statusHeading: ['status-check-heading'],
    statusDescription: ['public-status-description']
  };
  for (const [key, targets] of Object.entries(ids)) {
    for (const id of targets) {
      const node = document.getElementById(id);
      if (node)
        node.textContent = safePublicText(v[key] || '');
    }
  }
  if (typeof v.homeFooterText === 'string' && v.homeFooterText.trim()) {
    const footerText = document.getElementById('public-footer-text');
    if (footerText)
      footerText.textContent = v.homeFooterText;
  }
  const media = (id, src = '') => {
    if (src && (/^assets\/(?:gallery\/sscircle-0[1-9]\.webp|(?:sscircle-logo|sscircle-community-icon|tiktok-logo|discord-logo)\.png)$/.test(src) || /^https:\/\/[^\s<>"'\\]+$/i.test(src)))
      return src;
    return id && /^[0-9a-f-]{36}$/.test(id) ? '/api/media/' + id : 'assets/sscircle-logo.png';
  };
  for (const image of document.querySelectorAll('[data-site-logo]')) {
    image.src = media(v.logoMediaId, v.logoImageUrl);
    image.referrerPolicy = 'no-referrer';
  }
  $('.crest-logo').src = media(v.heroMediaId || v.logoMediaId, v.heroImageUrl || v.logoImageUrl);
  $('.crest-logo').referrerPolicy = 'no-referrer';
  $('#opening-logo').src = media(v.introLogoMediaId || v.logoMediaId, v.introLogoImageUrl || v.logoImageUrl);
  $('#opening-logo').referrerPolicy = 'no-referrer';
  const accent = hexToRgb(v.accentColor), background = hexToRgb(v.backgroundColor);
  if (accent) {
    document.documentElement.style.setProperty('--v7-accent', v.accentColor);
    document.documentElement.style.setProperty('--v7-accent-rgb', `${accent.r},${accent.g},${accent.b}`);
  }
  if (background) {
    document.documentElement.style.setProperty('--v7-background', v.backgroundColor);
  }
  window.SSCircleTheme?.apply(v);
  const colorVars = {
    accentColor: '--ssc-primary',
    secondaryColor: '--ssc-secondary',
    backgroundColor: '--ssc-bg',
    backgroundEndColor: '--ssc-bg-end',
    textColor: '--ssc-text',
    mutedColor: '--ssc-muted',
    panelColor: '--ssc-panel',
    borderColor: '--ssc-border',
    inputColor: '--ssc-input',
    buttonTextColor: '--ssc-button-text',
    gradientStartColor: '--ssc-gradient-start',
    gradientEndColor: '--ssc-gradient-end',
    highlightColor: '--ssc-highlight',
    successColor: '--ssc-success',
    dangerColor: '--ssc-danger'
  };
  for (const [key, cssVar] of Object.entries(colorVars)) {
    if (/^#[0-9a-fA-F]{6}$/.test(v[key] || ''))
      document.documentElement.style.setProperty(cssVar, v[key]);
  }
  document.title = safePublicText(v.title || 'Pendaftaran SSCircle Server') + ' | ' + safePublicText(v.brandName);
  document.querySelector('meta[name="description"]')?.setAttribute('content', safePublicText(v.description || 'Pendaftaran SSCircle Server'));
  if ($('#status-check-button'))
    $('#status-check-button').textContent = safePublicText(v.statusButtonText || 'Periksa status') + ' ↗';
  $('#opening-kicker').textContent = safePublicText(v.brandLabel || 'REGISTRATION');
  setOpeningDuration(v.introDuration);
}
let openingTimer = null;
const opening = $('#site-opening');
const motionOff = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function closeOpening() {
  if (openingTimer)
    clearTimeout(openingTimer);
  opening.classList.add('is-leaving');
  opening.classList.remove('is-active');
  opening.setAttribute('aria-hidden', 'true');
}
function setOpeningDuration(value) {
  if (!opening.classList.contains('is-active'))
    return;
  let ms = Number(value);
  if (!Number.isFinite(ms))
    ms = 2300;
  ms = Math.max(800, Math.min(6000, ms));
  if (openingTimer)
    clearTimeout(openingTimer);
  openingTimer = setTimeout(closeOpening, ms);
}
function startOpening() {
  if (motionOff)
    return;
  opening.classList.remove('is-leaving');
  opening.classList.add('is-active');
  opening.setAttribute('aria-hidden', 'false');
  setOpeningDuration(2300);
}
$('#opening-skip').onclick = closeOpening;
startOpening();
function note(text, error = false) {
  $('#notice').replaceChildren(el('div', 'message ' + (error ? 'message-error' : 'message-success'), text));
}
const fallback = {
  settings: {
    title: 'Pendaftaran SSCircle Server',
    subtitle: 'Your story starts here.',
    description: 'Pendaftaran SSCircle Server.',
    open: true
  },
  pages: [
    {
      id: 'page-demo',
      title: 'Pendaftaran',
      description: 'Formulir sedang disiapkan.',
      blocks: [{
          id: 'question-demo',
          type: 'question',
          question: {
            id: 'username',
            title: 'Username Minecraft kamu?',
            type: 'short',
            required: true,
            placeholder: 'Steve',
            options: []
          }
        }],
      routeQuestionId: '',
      routes: {}
    }
  ]
};
function mediaBlock(b) {
  if (b.type === 'text') {
    const section = el('section', 'content-section panel');
    if (b.title)
      section.append(el('h3', '', safePublicText(b.title)));
    if (b.description)
      section.append(el('p', '', safePublicText(b.description)));
    return section;
  }
  if (b.type === 'image') {
    const section = el('figure', 'media-card panel');
    const pic = el('img');
    pic.src = b.imageUrl || '/api/media/' + encodeURIComponent(b.imageId);
    pic.referrerPolicy = 'no-referrer';
    pic.onerror = () => { pic.onerror = null; pic.src = 'assets/sscircle-logo.png'; };
    pic.alt = safePublicText(b.caption) || 'Gambar dari admin SSCircle';
    pic.loading = 'lazy';
    section.append(pic);
    if (b.caption)
      section.append(el('figcaption', '', safePublicText(b.caption)));
    return section;
  }
  if (b.type === 'video') {
    const sec = el('section', 'media-card panel');
    if (b.title)
      sec.append(el('h3', '', safePublicText(b.title)));
    const iframe = el('iframe');
    iframe.loading = 'lazy';
    iframe.title = b.title || 'Video SSCircle';
    iframe.src = b.url;
    iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    sec.append(iframe);
    return sec;
  }
  return questionBlock(b.question);
}
function questionBlock(q) {
  const card = el('div', 'question-card panel');
  const h = el('div', 'question-header'), t = el('h3', '', q.title);
  if (q.required)
    t.append(el('span', 'required', ' *'));
  h.append(el('span', 'question-number', '✦'), t);
  card.append(h);
  if (['short', 'long'].includes(q.type)) {
    const field = el(q.type === 'long' ? 'textarea' : 'input', 'answer-input');
    if (q.type === 'short')
      field.type = 'text';
    else
      field.rows = 4;
    field.name = q.id;
    field.placeholder = q.placeholder || 'Ketik jawaban di sini...';
    field.maxLength = q.type === 'long' ? 2000 : 240;
    field.required = !!q.required;
    field.value = answers[q.id] || '';
    card.append(field);
  }
  else if (q.type === 'select') {
    const field = el('select', 'answer-input');
    field.name = q.id;
    field.required = !!q.required;
    const empty = el('option', '', 'Pilih jawaban...');
    empty.value = '';
    field.append(empty);
    for (const opt of q.options || []) {
      const o = el('option', '', opt);
      o.value = opt;
      field.append(o);
    }
    if (q.allowOther) {
      const o = el('option', '', 'Jawaban lainnya (ketik sendiri)...');
      o.value = OTHER_RADIO;
      field.append(o);
    }
    field.value = isOther(answers[q.id]) ? OTHER_RADIO : (answers[q.id] || '');
    card.append(field);
    if (q.allowOther) {
      const input = el('input', 'answer-input other-answer-input');
      input.type = 'text';
      input.maxLength = 140;
      input.placeholder = 'Ketik jawaban lainnya...';
      input.setAttribute('aria-label', 'Jawaban lainnya untuk ' + q.title);
      input.dataset.otherFor = q.id;
      input.value = otherText(answers[q.id]);
      input.hidden = field.value !== OTHER_RADIO;
      input.disabled = input.hidden;
      input.required = !input.hidden;
      field.addEventListener('change', () => {
        input.hidden = field.value !== OTHER_RADIO;
        input.disabled = input.hidden;
        input.required = !input.hidden;
        input.required = !input.hidden;
        captureCurrent();
        updateNextLabel();
      });
      input.addEventListener('input', () => {
        captureCurrent();
        updateNextLabel();
      });
      card.append(input);
    }
  }
  else if (q.type === 'single' || q.type === 'multi') {
    const wrap = el('div', 'answer-options');
    for (const choice of q.options || []) {
      const lab = el('label', 'answer-option'), field = el('input');
      field.type = q.type === 'single' ? 'radio' : 'checkbox';
      field.name = q.id;
      field.value = choice;
      field.checked = q.type === 'multi' ? (answers[q.id] || []).includes(choice) : answers[q.id] === choice;
      if (q.required && q.type === 'single')
        field.required = true;
      lab.append(field, el('span', 'custom-choice'), el('span', 'option-copy', choice));
      wrap.append(lab);
    }
    if (q.allowOther) {
      const lab = el('label', 'answer-option other-choice-option'), field = el('input');
      field.type = q.type === 'single' ? 'radio' : 'checkbox';
      field.name = q.id;
      field.value = OTHER_RADIO;
      field.checked = q.type === 'multi' ? (answers[q.id] || []).some(isOther) : isOther(answers[q.id]);
      if (q.required && q.type === 'single')
        field.required = true;
      lab.append(field, el('span', 'custom-choice'), el('span', 'option-copy', 'Jawaban lainnya:'));
      wrap.append(lab);
      const input = el('input', 'answer-input other-answer-input');
      input.type = 'text';
      input.dataset.otherFor = q.id;
      input.maxLength = 140;
      input.placeholder = 'Tulis jawaban sendiri...';
      input.setAttribute('aria-label', 'Jawaban lainnya untuk ' + q.title);
      input.value = q.type === 'multi' ? otherText((answers[q.id] || []).find(isOther)) : otherText(answers[q.id]);
      input.hidden = !field.checked;
      input.disabled = input.hidden;
      input.required = field.checked;
      const update = () => {
        input.hidden = !field.checked;
        input.disabled = input.hidden;
        input.required = field.checked;
        captureCurrent();
        updateNextLabel();
      };
      wrap.addEventListener('change', update);
      input.addEventListener('input', () => {
        if (!field.checked) {
          field.checked = true;
          input.hidden = false;
          input.disabled = false;
          input.required = true;
        }
        captureCurrent();
        updateNextLabel();
      });
      card.append(wrap, input);
    }
    else
      card.append(wrap);
    if (q.type === 'multi')
      card.append(el('p', 'question-hint', 'Pilih satu atau beberapa jawaban.'));
  }
  else if (q.type === 'image_upload') {
    const field = el('input', 'answer-input');
    field.type = 'file';
    field.accept = 'image/png,image/jpeg,image/webp,image/gif';
    field.name = 'file_' + q.id;
    field.required = q.required && !images[q.id];
    const hint = el('p', 'question-hint', images[q.id] ? 'Gambar dipilih: ' + (images[q.id].url || images[q.id].name || 'Foto') : 'JPG, PNG, WEBP, atau GIF. Gambar akan disesuaikan otomatis agar mudah dikirim.');
    field.onchange = () => {
      const f = field.files?.[0];
      if (f) {
        if (f.size > 12 * 1024 * 1024) {
          field.value = '';
          note('Maksimal 12 MB sebelum kompresi.', true);
          return;
        }
        images[q.id] = f;
        field.required = false;
        urlField.value = '';
        preview.hidden = true;
        useLink.disabled = true;
        hint.textContent = 'Terpilih: ' + f.name;
      }
      else
        delete images[q.id];
    };
    card.append(field, hint);
    // Pilihan tambahan untuk pertanyaan upload gambar milik pendaftar.
    const externalPanel = el('details', 'ssc-respondent-url-image');
    const summary = el('summary', '', 'Atau gunakan link URL gambar (HTTPS)');
    const urlField = el('input', 'answer-input');
    urlField.type = 'url';
    urlField.maxLength = 700;
    urlField.placeholder = 'https://contoh.com/foto.jpg';
    urlField.value = images[q.id]?.url || '';
    const preview = el('img', 'ssc-image-url-preview');
    preview.alt = 'Pratinjau jawaban gambar URL';
    preview.referrerPolicy = 'no-referrer';
    preview.hidden = true;
    const message = el('small', 'field-help', 'Foto tetap berada di hosting URL, bukan diunggah ke server SSCircle.');
    const useLink = el('button', 'button secondary', 'Gunakan URL ini');
    useLink.type = 'button';
    useLink.disabled = true;
    const validateURL = url => {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname.includes('.') &&
          !u.hostname.endsWith('.local') && !u.hostname.endsWith('.internal') && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) &&
          !/[<>"'\\]/.test(url);
      }
      catch {
        return false;
      }
    };
    let tick = 0;
    urlField.addEventListener('input', () => {
      const sequence = ++tick, raw = urlField.value.trim();
      preview.hidden = true;
      useLink.disabled = true;
      if (!validateURL(raw)) {
        message.textContent = 'Gunakan URL HTTPS publik yang valid.';
        return;
      }
      const check = new Image();
      check.referrerPolicy = 'no-referrer';
      check.onload = () => {
        if (sequence !== tick)
          return;
        preview.src = raw;
        preview.hidden = false;
        useLink.disabled = false;
        message.textContent = '✓ Gambar dapat ditampilkan. Klik Gunakan URL ini.';
      };
      check.onerror = () => { if (sequence === tick)
        message.textContent = 'Gambar gagal dimuat. Gunakan alamat langsung ke gambar.'; };
      check.src = raw;
    });
    useLink.onclick = () => {
      if (useLink.disabled || !validateURL(urlField.value.trim()))
        return;
      images[q.id] = { url: urlField.value.trim() };
      field.value = '';
      field.required = false;
      hint.textContent = 'Gambar menggunakan URL: ' + urlField.value.trim();
      message.textContent = '✓ URL gambar dipilih.';
    };
    if (images[q.id]?.url) {
      externalPanel.open = true;
      urlField.dispatchEvent(new Event('input'));
    }
    externalPanel.append(summary, urlField, preview, useLink, message);
    card.append(externalPanel);
  }
  return card;
}
function targetIndex(current) {
  const p = model.pages[current], v = answers[p.routeQuestionId], dest = p.routeQuestionId ? p.routes?.[v] : null;
  if (dest === 'end')
    return -1;
  if (dest && dest !== 'next') {
    const next = model.pages.findIndex(x => x.id === dest);
    return next > current ? next : -1;
  }
  return current + 1 < model.pages.length ? current + 1 : -1;
}
function draw() {
  const page = model.pages[pageIndex];
  $('#page-indicator').textContent = 'HALAMAN ' + String(pageIndex + 1).padStart(2, '0');
  $('#page-count').textContent = String(pageIndex + 1).padStart(2, '0') + ' / ' + String(model.pages.length).padStart(2, '0');
  $('#progress-bar').style.width = ((pageIndex + 1) / model.pages.length * 100) + '%';
  $('#page-title').textContent = safePublicText(page.title);
  $('#page-description').textContent = safePublicText(page.description || '');
  const root = $('#questions');
  root.replaceChildren(...page.blocks.map(mediaBlock));
  $('#back').hidden = !history.length;
  updateNextLabel();
}
function updateNextLabel() {
  if (!model)
    return;
  const settings = { ...presentationDefaults, ...model.settings };
  $('#send').querySelector('span').textContent = safePublicText(targetIndex(pageIndex) === -1 ? settings.buttonSend : settings.buttonNext);
}
function captureCurrent() {
  const form = $('#application-form'), page = model.pages[pageIndex];
  for (const block of page.blocks) {
    if (block.type !== 'question')
      continue;
    const q = block.question;
    if (q.type === 'image_upload')
      continue;
    const otherInput = form.querySelector(`[data-other-for="${CSS.escape(q.id)}"]`);
    const fromChoice = value => value === OTHER_RADIO ? OTHER_PREFIX + (otherInput?.value.trim() || '') : value;
    if (q.type === 'multi')
      answers[q.id] = Array.from(form.querySelectorAll(`input[name="${CSS.escape(q.id)}"]:checked`)).map(x => fromChoice(x.value));
    else if (q.type === 'single')
      answers[q.id] = fromChoice(form.querySelector(`input[name="${CSS.escape(q.id)}"]:checked`)?.value || '');
    else if (q.type === 'select')
      answers[q.id] = fromChoice(form.elements.namedItem(q.id)?.value || '');
    else
      answers[q.id] = form.elements.namedItem(q.id)?.value || '';
  }
}
function validPage() {
  for (const input of document.querySelectorAll('#questions .other-answer-input:not([hidden])')) {
    if (!input.value.trim()) {
      note('Ketik jawaban untuk “Jawaban lainnya” terlebih dahulu.', true);
      input.focus();
      return false;
    }
  }
  const page = model.pages[pageIndex];
  for (const b of page.blocks) {
    if (b.type !== 'question')
      continue;
    const q = b.question;
    if (q.type === 'multi' && q.required && !answers[q.id]?.length) {
      note('Pilih setidaknya satu jawaban untuk: ' + q.title, true);
      return false;
    }
    if (q.type === 'image_upload' && q.required && !images[q.id]) {
      note('Unggah gambar untuk: ' + q.title, true);
      return false;
    }
  }
  return $('#application-form').reportValidity();
}
function activeAnswers() {
  const relevant = {}, files = {}, ids = new Set(), seen = new Set();
  let idx = 0;
  for (let step = 0; idx !== -1 && step < model.pages.length; step++) {
    if (seen.has(idx))
      break;
    seen.add(idx);
    for (const b of model.pages[idx].blocks) {
      if (b.type !== 'question')
        continue;
      const q = b.question;
      ids.add(q.id);
      if (q.type === 'image_upload') {
        if (images[q.id]?.url)
          relevant[q.id] = images[q.id].url;
        else if (images[q.id])
          files[q.id] = images[q.id];
      }
      else
        relevant[q.id] = answers[q.id] ?? (q.type === 'multi' ? [] : '');
    }
    idx = targetIndex(idx);
  }
  return { relevant, files };
}
// Tampilan pertanyaan pendaftaran
function render(form, isDemo) {
  model = form;
  demo = isDemo;
  pageIndex = 0;
  history = [];
  answers = {};
  images = {};
  applyPresentation(form.settings);
  if (form.settings.introEnabled === false)
    closeOpening();
  if (!form.settings.open && !isDemo) {
    $('#availability').textContent = '● ' + safePublicText(form.settings.availabilityClosed || presentationDefaults.availabilityClosed);
    $('#availability').classList.add('closed');
    note('Pendaftaran sedang ditutup, coba lagi lain kali dan tunggu informasi lebih lanjut dari Discord dan Admin Server');
    $('#registration-closed-banner')?.classList.remove('hide');
    $('#registration-closed-message').textContent = safePublicText(form.settings.homeClosedMessage || 'Pendaftaran sedang ditutup, coba lagi lain kali dan tunggu informasi lebih lanjut dari Discord dan Admin Server');
    return;
  }
  $('#availability').replaceChildren(el('span', 'live-dot'), document.createTextNode(isDemo ? ' PRATINJAU' : ' ' + safePublicText(form.settings.availabilityOpen || presentationDefaults.availabilityOpen)));
  $('#application-form').classList.remove('hide');
  draw();
  if (isDemo) {
    $('#send').disabled = true;
    note(registrationEditorPreview ? 'Mode pratinjau: pengiriman pendaftaran dinonaktifkan.' : 'Pendaftaran belum tersedia. Silakan coba kembali nanti.', !registrationEditorPreview);
  }
}
$('#back').onclick = () => {
  if (!history.length)
    return;
  captureCurrent();
  pageIndex = history.pop();
  $('#notice').replaceChildren();
  draw();
  $('#application').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
$('#application-form').addEventListener('change', () => {
  if (model) {
    captureCurrent();
    updateNextLabel();
  }
});
$('#application-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (demo || !model)
    return;
  captureCurrent();
  if (!validPage())
    return;
  const next = targetIndex(pageIndex);
  $('#notice').replaceChildren();
  if (next !== -1) {
    history.push(pageIndex);
    pageIndex = next;
    draw();
    $('#application').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const { relevant, files } = activeAnswers(), button = $('#send');
  button.disabled = true;
  button.querySelector('span').textContent = 'Mengirim pendaftaran...';
  try {
    const result = await SSCircle.submit(relevant, files);
    $('#application-form').classList.add('hide');
    $('#success').classList.remove('hide');
    $('#reference-code').textContent = result.reference;
    startCooldown(result.remainingSeconds || 0);
    $('#application').scrollIntoView({ behavior: 'smooth' });
  }
  catch (err) {
    note('Gagal mengirim: ' + err.message, true);
    if (err.remainingSeconds)
      startCooldown(err.remainingSeconds);
    button.disabled = false;
    updateNextLabel();
  }
});
let cooldownEndsAt = 0, cooldownInterval = null;
const formatCountdown = seconds => {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
function tickCooldown() {
  const left = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
  if (left === 0) {
    if (cooldownInterval)
      clearInterval(cooldownInterval);
    cooldownInterval = null;
    cooldownEndsAt = 0;
    $('#cooldown-panel').classList.add('hide');
    $('#success-cooldown').classList.add('hide');
    if (model?.settings.open && !demo && $('#success').classList.contains('hide'))
      $('#application-form').classList.remove('hide');
    return;
  }
  $('#cooldown-remaining').textContent = formatCountdown(left);
  $('#success-cooldown-time').textContent = formatCountdown(left);
  $('#cooldown-panel').classList.remove('hide');
  if ($('#success').classList.contains('hide'))
    $('#application-form').classList.add('hide');
  else
    $('#cooldown-panel').classList.add('hide');
  $('#success-cooldown').classList.toggle('hide', $('#success').classList.contains('hide'));
}
// Jeda pengiriman formulir
function startCooldown(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0)
    return;
  cooldownEndsAt = Date.now() + Math.ceil(Number(seconds)) * 1000;
  if (cooldownInterval)
    clearInterval(cooldownInterval);
  tickCooldown();
  cooldownInterval = setInterval(tickCooldown, 1000);
}
// Mode pratinjau disuplai langsung dari editor admin dan tidak dapat mengirim pendaftaran.
// Data draf hanya lewat postMessage same-origin; tidak disimpan atau dikirim ke server.
const registrationEditorPreview = new URLSearchParams(location.search).has('ssc_registration_preview');
if (registrationEditorPreview) {
  document.body.classList.add('ssc-editor-preview', 'ssc-registration-editor-preview');
  render(fallback, true);
  closeOpening();
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'ssc-registration-preview-settings')
      return;
    if (!event.data.settings || !Array.isArray(event.data.pages))
      return;
    render({ settings: event.data.settings, pages: event.data.pages }, true);
    closeOpening();
    window.parent.postMessage({ type: 'ssc-registration-preview-applied' }, location.origin);
  });
  if (window.parent !== window)
    window.parent.postMessage({ type: 'ssc-registration-preview-ready' }, location.origin);
}
else {
  (async () => {
    try {
      render(await SSCircle.getForm(), false);
      if (model?.settings.open) {
        try {
          const state = await SSCircle.getCooldown();
          startCooldown(state.remainingSeconds || 0);
        }
        catch { /* Website can still be opened if the cooldown check is temporarily unavailable. */ }
      }
    }
    catch (err) {
      render(fallback, true);
      note('Website belum siap: ' + err.message, true);
    }
  })();
}
// Status tracker: only displays the applicant's own status and admin rejection reason.
const statusForm = document.querySelector('#status-check-form');
if (statusForm)
  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const root = document.querySelector('#status-result'), submit = document.querySelector('#status-check-button');
    root.replaceChildren();
    submit.disabled = true;
    submit.textContent = 'Memeriksa...';
    try {
      const result = await SSCircle.checkStatus(document.querySelector('#status-code').value);
      const labels = { pending: 'Sedang menunggu', accepted: 'Pendaftaran diterima', rejected: 'Pendaftaran ditolak' };
      const card = el('div', 'status-result-card ' + result.status), badge = el('span', 'status-result-badge', labels[result.status] || result.status);
      // Lightweight CSS status animation, with a reduced-motion fallback.
      const visual = el('div', 'status-visual status-visual-' + result.status);
      visual.setAttribute('aria-hidden', 'true');
      const aura = el('span', 'status-visual-aura'), glyph = el('span', 'status-visual-glyph');
      glyph.textContent = result.status === 'accepted' ? '✓' : result.status === 'rejected' ? '×' : '◷';
      visual.append(aura, glyph);
      if (result.status === 'accepted') {
        for (let i = 0; i < 6; i++) {
          const spark = el('span', 'status-celebration-particle');
          spark.style.setProperty('--p', String(i));
          visual.append(spark);
        }
      }
      card.append(visual);
      const text = result.status === 'accepted' ? 'Selamat! Pendaftaranmu telah disetujui oleh admin SSCircle Server. Silahkan cek server Discord SSCircle Community untuk informasi lebih lanjut' : result.status === 'rejected' ? 'Admin telah memeriksa pendaftaranmu.' : 'Jawabanmu sudah masuk dan masih dalam proses seleksi.';
      card.append(badge, el('p', '', text));
      if (result.status === 'rejected')
        card.append(el('strong', 'rejection-label', 'Alasan penolakan:'), el('p', 'rejection-text', result.reason || 'Tidak ada alasan tambahan.'));
      if (result.submittedAt)
        card.append(el('small', '', 'Dikirim: ' + new Date(result.submittedAt).toLocaleString('id-ID')));
      root.append(card);
    }
    catch (error) {
      root.append(el('div', 'message message-error', error.message));
    }
    finally {
      submit.disabled = false;
      submit.textContent = safePublicText(model?.settings?.statusButtonText || 'Periksa status') + ' ↗';
    }
  });
document.querySelector('#copy-code').onclick = async () => {
  const value = document.querySelector('#reference-code').textContent;
  try {
    await navigator.clipboard.writeText(value);
    document.querySelector('#copy-code').textContent = 'Tersalin ✓';
  }
  catch {
    document.querySelector('#copy-code').textContent = 'Salin manual';
  }
};
