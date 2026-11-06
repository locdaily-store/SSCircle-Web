/* SSCircle Server • Admin form builder and browser spreadsheet */

// Kontrol utama Admin: formulir, pendaftar, media, dan tampilan.

'use strict';
const $ = s => document.querySelector(s);
const make = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls)
    n.className = cls;
  if (text !== undefined)
    n.textContent = text;
  return n;
};
const uid = () => SSCircle.uuid();
let data = { settings: {}, pages: [], submissions: [] }, activePage = 0, dirty = false, sheetPage = 0, selectedIds = new Set(), currentDetailId = null, dragState = { pageId: '', fromIndex: -1 }, collapsedPages = new Set(), openRoutes = new Set();
const PAGE_SIZE = 20;
// Review reason dialog is shown only when administrator rejects an application.
const qtypes = [
  ['short', 'Jawaban singkat'],
  ['long', 'Paragraf'],
  ['single', 'Pilihan tunggal'],
  ['multi', 'Checkbox'],
  ['select', 'Dropdown'],
  ['image_upload', 'Upload gambar (pengunjung)']
];
function dirtyMark() {
  dirty = true;
  window.SSCircleRegistrationPreview?.update();
  for (const id of ['#save-message', '#appearance-message', '#theme-message']) {
    const n = $(id);
    if (n)
      n.replaceChildren(make('span', 'draft-label', '● Perubahan belum disimpan'));
  }
}
function notify(selector, message, isError = false) {
  $(selector).replaceChildren(make('div', 'message ' + (isError ? 'message-error' : 'message-success'), message));
}
function field(label, value, fn, { kind = 'input', hint = '', placeholder = '' } = {}) {
  const w = make('label', 'field-group'), l = make('span', 'field-label', label), c = make(kind);
  if (kind === 'input')
    c.type = 'text';
  if (kind === 'textarea')
    c.rows = 3;
  c.value = value ?? '';
  c.placeholder = placeholder;
  c.addEventListener('input', () => {
    fn(c.value);
    dirtyMark();
  });
  w.append(l, c);
  if (hint)
    w.append(make('small', 'field-help', hint));
  return w;
}
function button(label, callback, cls = 'button secondary') {
  const b = make('button', cls, label);
  b.type = 'button';
  b.onclick = callback;
  return b;
}
function dropdown(options, value, callback) {
  const select = make('select');
  for (const [id, label] of options) {
    const option = make('option', '', label);
    option.value = id;
    select.append(option);
  }
  select.value = value;
  select.onchange = () => {
    callback(select.value);
    dirtyMark();
  };
  return select;
}
function tab(id) {
  for (const s of document.querySelectorAll('.tab-page'))
    s.classList.toggle('hide', s.id !== id);
  for (const b of document.querySelectorAll('[data-tab]')) {
    const active = b.dataset.tab === id;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  for (const group of document.querySelectorAll('.sidebar-group'))
    group.classList.toggle('has-active', !!group.querySelector('.side-link.active'));
  const selected = document.querySelector('.dashboard-sidebar .side-link.active span:not(.side-icon):not(.nav-count)');
  const label = document.getElementById('admin-nav-current');
  if (selected && label) label.textContent = selected.textContent.trim();
  document.querySelector('.dashboard-sidebar')?.classList.remove('nav-open');
  document.getElementById('admin-nav-toggle')?.setAttribute('aria-expanded', 'false');
  if (id === 'answers') {
    renderAnswers();
    void reloadSpreadsheet();
  }
  if (id === 'rules-admin')
    window.SSCircleRulesAdmin?.schedule();
  if (id === 'events-admin')
    window.SSCircleEventsAdmin?.schedule();
  if (id === 'seasons-admin')
    window.SSCircleSeasonsAdmin?.schedule();
  if (id === 'theme')
    window.SSCircleThemeEditor?.schedule();
  if (id === 'analytics')
    renderAnalytics();
  if (id === 'media')
    loadMediaLibrary();
  if (id === 'voting-admin')
    window.SSCircleVoteAdmin?.refreshResults();
  if (id === 'spreadsheet' && window.SSCSpreadsheet) {
    SSCircleSheet.render(data, allColumns(), valueText, applicantName, showDetails);
    void reloadSpreadsheet();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const mobileNavToggle = document.getElementById('admin-nav-toggle');
mobileNavToggle?.addEventListener('click', () => {
  const sidebar = document.querySelector('.dashboard-sidebar');
  mobileNavToggle.setAttribute('aria-expanded', String(sidebar?.classList.toggle('nav-open') || false));
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelector('.dashboard-sidebar')?.classList.remove('nav-open');
  mobileNavToggle?.setAttribute('aria-expanded', 'false');
});
for (const btn of document.querySelectorAll('[data-tab]'))
  btn.onclick = async () => {
    if (dirty && !['form', 'appearance', 'theme', 'rules-admin', 'events-admin', 'seasons-admin'].includes(btn.dataset.tab) && !await SSCNotice.confirm('Ada perubahan yang belum disimpan. Tetap pindah?', { confirmText: 'Pindah halaman' }))
      return;
    tab(btn.dataset.tab);
  };
function summary() {
  const list = [
    ['TOTAL PENDAFTAR', data.submissions.length, '◈'],
    ['MENUNGGU REVIEW', data.submissions.filter(s => s.status === 'pending').length, '◷'],
    ['DITERIMA', data.submissions.filter(s => s.status === 'accepted').length, '✓'],
    ['DITOLAK', data.submissions.filter(s => s.status === 'rejected').length, '×']
  ];
  $('#stat-cards').replaceChildren(...list.map(([title, count, icon]) => {
    const card = make('div', 'stat-card panel');
    const head = make('div', 'stat-card-head');
    head.append(make('span', '', title), make('span', 'stat-icon', icon));
    card.append(head, make('strong', 'stat-value', String(count).padStart(2, '0')));
    return card;
  }));
  $('#nav-count').textContent = data.submissions.filter(s => s.status === 'pending').length;
  $('#form-status').textContent = data.settings.open ? '● PENDAFTARAN DIBUKA' : '● PENDAFTARAN DITUTUP';
}
async function refresh() {
  data = await SSCircle.getAdminData();
  SSCircleImagePicker.setSettings(data.settings);
  activePage = Math.min(activePage, data.pages.length - 1);
  dirty = false;
  $('#dashboard').classList.remove('hide');
  $('#login').classList.add('hide');
  selectedIds.clear();
  renderAppearance();
  window.SSCircleThemeEditor?.render(data, dirtyMark);
  window.SSCircleRegistrationPreview?.render(data);
  window.SSCircleHomeAdmin?.render(data, dirtyMark);
  window.SSCircleVoteAdmin?.render(data, dirtyMark);
  window.SSCircleRulesAdmin?.render(data, dirtyMark);
  window.SSCircleEventsAdmin?.render(data, dirtyMark);
  window.SSCircleSeasonsAdmin?.render(data, dirtyMark);
  if (data.settings.adminThemeEnabled === true)
    window.SSCircleTheme?.apply(data.settings);
  summary();
  renderBuilder();
  renderAnswers();
  renderAnalytics();
}
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const submit = $('#login-form button');
  submit.disabled = true;
  $('#login-error').textContent = '';
  try {
    await SSCircle.login($('#password').value);
    $('#password').value = '';
    await refresh();
  }
  catch (error) {
    $('#login-error').textContent = error.message;
  }
  finally {
    submit.disabled = false;
  }
};
$('#logout').onclick = async () => {
  await SSCircle.logout();
  location.reload();
};
const cooldownControl = $('#registration-cooldown-minutes');
if (cooldownControl)
  cooldownControl.oninput = () => {
    const value = Number(cooldownControl.value);
    if (Number.isInteger(value) && value >= 0 && value <= 10080) {
      data.settings.cooldownMinutes = value;
      dirtyMark();
    }
  };
$('#jump-form').onclick = () => tab('form');
$('#jump-answers').onclick = () => tab('answers');
$('#refresh').onclick = async () => {
  try {
    await refresh();
  }
  catch (e) {
    SSCNotice.alert(e.message);
  }
};
function newQuestion() {
  return {
    id: uid(),
    title: 'Pertanyaan baru',
    type: 'short',
    required: false,
    placeholder: '',
    options: [],
    allowOther: false
  };
}
function newPage() {
  return {
    id: uid(),
    title: 'Halaman ' + (data.pages.length + 1),
    description: '',
    blocks: [],
    routeQuestionId: '',
    routes: {}
  };
}
function selectedPage() {
  return data.pages[activePage];
}
function cleanRoutes() {
  for (let i = 0; i < data.pages.length; i++) {
    const p = data.pages[i], q = p.blocks.find(b => b.type === 'question' && b.question.id === p.routeQuestionId)?.question;
    if (!q || !['single', 'select'].includes(q.type)) {
      p.routeQuestionId = '';
      p.routes = {};
      continue;
    }
    for (const [key, dest] of Object.entries(p.routes || {})) {
      const ind = data.pages.findIndex(x => x.id === dest);
      if (!q.options.includes(key) || (dest !== 'end' && dest !== 'next' && ind <= i))
        delete p.routes[key];
    }
  }
}
function navToPage(index) {
  activePage = index;
  collapsedPages.delete(data.pages[index].id);
  renderBuilder();
  document.getElementById('form-section-' + data.pages[index].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Editor pertanyaan dan halaman formulir
function renderBuilder() {
  activePage = Math.max(0, Math.min(activePage, data.pages.length - 1));
  cleanRoutes();
  const tabs = $('#page-tabs');
  tabs.replaceChildren(...data.pages.map((pg, i) => {
    const b = button(String(i + 1).padStart(2, '0') + ' · ' + (pg.title || 'Bagian ' + (i + 1)), () => navToPage(i), 'builder-tab ' + (i === activePage ? 'active' : ''));
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === activePage ? 'true' : 'false');
    return b;
  }));
  $('#builder-count').textContent = data.pages.reduce((sum, p) => sum + p.blocks.length, 0) + ' item · ' + data.pages.length + ' bagian';
  const root = $('#builder');
  root.replaceChildren();
  data.pages.forEach((page, index) => root.append(buildSection(page, index)));
  window.SSCircleSort?.attach(root, {
    item: '.form-section',
    handleTarget: '.form-section-bar',
    onMove: (from, to) => {
      const page = data.pages.splice(from, 1)[0];
      data.pages.splice(to, 0, page);
      activePage = to;
      dirtyMark();
      renderBuilder();
    }
  });
}
function clearDropHints() {
  for (const el of document.querySelectorAll('.builder-card.drop-before,.builder-card.drop-after,.builder-card.dragging,.form-section.drop-in-section,.section-question-list.drop-in-section'))
    el.classList.remove('drop-before', 'drop-after', 'dragging', 'drop-in-section');
}
function moveBlockTo(sourcePage, fromIndex, targetPage, toIndex, placeAfter = false) {
  if (!sourcePage || !targetPage || fromIndex < 0 || fromIndex >= sourcePage.blocks.length)
    return;
  if (sourcePage !== targetPage && targetPage.blocks.length >= 30) {
    SSCNotice.alert('Bagian tujuan sudah berisi 30 item.');
    return;
  }
  let insertIndex = toIndex + (placeAfter ? 1 : 0);
  if (sourcePage === targetPage && fromIndex < insertIndex)
    insertIndex--;
  if (sourcePage === targetPage && insertIndex === fromIndex)
    return;
  const [item] = sourcePage.blocks.splice(fromIndex, 1);
  insertIndex = Math.max(0, Math.min(insertIndex, targetPage.blocks.length));
  targetPage.blocks.splice(insertIndex, 0, item);
  if (item.type === 'question' && sourcePage !== targetPage && sourcePage.routeQuestionId === item.question.id) {
    sourcePage.routeQuestionId = '';
    sourcePage.routes = {};
  }
  activePage = data.pages.indexOf(targetPage);
  collapsedPages.delete(targetPage.id);
  dirtyMark();
  renderBuilder();
  const moved = document.querySelector(`[data-block-id="${item.id}"]`);
  moved?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function finishDraggedOnCard(page, index, after) {
  const src = data.pages.find(p => p.id === dragState.pageId);
  if (!src)
    return;
  moveBlockTo(src, dragState.fromIndex, page, index, after);
  dragState = { pageId: '', fromIndex: -1 };
  clearDropHints();
}
function buildSection(page, index) {
  const section = make('section', 'form-section');
  section.id = 'form-section-' + page.id;
  section.dataset.pageId = page.id;
  const collapsed = collapsedPages.has(page.id);
  if (collapsed)
    section.classList.add('is-collapsed');
  const bar = make('div', 'form-section-bar');
  const tag = make('span', 'form-section-tag', 'Bagian ' + (index + 1) + ' dari ' + data.pages.length);
  const barControls = make('div', 'form-section-controls');
  const toggle = button(collapsed ? '▾ Buka' : '▴ Lipat', () => {
    if (collapsed)
      collapsedPages.delete(page.id);
    else
      collapsedPages.add(page.id);
    renderBuilder();
  }, 'section-tool');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  const clone = button('⧉', () => {
    if (data.pages.length >= 24)
      return SSCNotice.alert('Maksimal 24 halaman.');
    const c = structuredClone(page);
    c.id = uid();
    c.title += ' (salinan)';
    c.routeQuestionId = '';
    c.routes = {};
    for (const b of c.blocks) {
      b.id = uid();
      if (b.type === 'question')
        b.question.id = uid();
    }
    data.pages.splice(index + 1, 0, c);
    activePage = index + 1;
    dirtyMark();
    renderBuilder();
    navToPage(activePage);
  }, 'section-tool');
  clone.title = 'Duplikat bagian';
  const del = button('✕', async () => {
    if (data.pages.length === 1)
      return SSCNotice.SSCNotice.alert('Minimal ada satu halaman.');
    if (!await SSCNotice.confirm('Hapus bagian beserta pertanyaan di dalamnya? Jawaban yang sudah masuk tetap disimpan.', { danger: true, confirmText: 'Hapus bagian' }))
      return;
    data.pages.splice(index, 1);
    collapsedPages.delete(page.id);
    activePage = Math.max(0, Math.min(index, data.pages.length - 1));
    dirtyMark();
    renderBuilder();
  }, 'section-tool delete');
  del.title = 'Hapus bagian';
  del.disabled = data.pages.length === 1;
  const movePrev = button('↑', () => {
    if (index === 0)
      return;
    [data.pages[index - 1], data.pages[index]] = [data.pages[index], data.pages[index - 1]];
    activePage = index - 1;
    dirtyMark();
    renderBuilder();
  }, 'section-tool');
  movePrev.title = 'Pindahkan bagian ke atas';
  movePrev.disabled = index === 0;
  const moveNext = button('↓', () => {
    if (index === data.pages.length - 1)
      return;
    [data.pages[index], data.pages[index + 1]] = [data.pages[index + 1], data.pages[index]];
    activePage = index + 1;
    dirtyMark();
    renderBuilder();
  }, 'section-tool');
  moveNext.title = 'Pindahkan bagian ke bawah';
  moveNext.disabled = index === data.pages.length - 1;
  barControls.append(toggle, movePrev, moveNext, clone, del);
  bar.append(tag, barControls);
  section.append(bar);
  const content = make('div', 'form-section-content');
  if (collapsed) {
    const preview = make('div', 'collapsed-summary');
    preview.append(make('strong', '', page.title || 'Bagian tanpa judul'), make('span', '', page.blocks.length + ' item · Klik Buka untuk mengedit'));
    section.append(preview);
    return section;
  }
  const title = field('Judul bagian', page.title, v => {
    page.title = v;
    tabsName(page, index, v);
  });
  title.classList.add('section-title-field');
  const desc = field('Deskripsi bagian (opsional)', page.description, v => page.description = v, { kind: 'textarea' });
  desc.classList.add('section-description-field');
  content.append(title, desc);
  const list = make('div', 'section-question-list');
  list.dataset.pageId = page.id;
  list.replaceChildren(...page.blocks.map((block, i) => buildBlock(page, block, i)));
  list.addEventListener('dragover', e => {
    if (dragState.pageId && !page.blocks.length) {
      e.preventDefault();
      list.classList.add('drop-in-section');
    }
  });
  list.addEventListener('dragleave', () => list.classList.remove('drop-in-section'));
  list.addEventListener('drop', e => {
    if (!dragState.pageId)
      return;
    if (e.target.closest('.builder-card'))
      return;
    e.preventDefault();
    const src = data.pages.find(p => p.id === dragState.pageId);
    if (src)
      moveBlockTo(src, dragState.fromIndex, page, page.blocks.length);
  });
  if (!page.blocks.length)
    list.append(make('p', 'empty-section-hint', 'Belum ada pertanyaan. Tambahkan pertanyaan melalui tombol di bawah ini.'));
  content.append(list);
  const toolbar = make('div', 'section-add-toolbar');
  for (const [type, label] of [['question', '＋ Pertanyaan'], ['text', '＋ Judul / teks'], ['image', '＋ Gambar'], ['video', '＋ Video']])
    toolbar.append(button(label, () => addBlock(type, page), 'section-add-button'));
  content.append(toolbar);
  const routeDetails = make('details', 'section-route-details');
  routeDetails.open = openRoutes.has(page.id);
  const routeSummary = make('summary', '', 'Atur percabangan ke bagian lain');
  routeDetails.append(routeSummary);
  const routeContents = make('div', 'section-route-editor');
  routeDetails.append(routeContents);
  routeDetails.addEventListener('toggle', () => {
    if (routeDetails.open)
      openRoutes.add(page.id);
    else
      openRoutes.delete(page.id);
  });
  renderRouting(page, routeContents, index);
  content.append(routeDetails);
  section.append(content);
  return section;
}
function tabsName(page, index, value) {
  const tab = document.querySelectorAll('#page-tabs .builder-tab')[index];
  if (tab)
    tab.textContent = String(index + 1).padStart(2, '0') + ' · ' + (value || 'Bagian ' + (index + 1));
}
function buildBlock(page, block, index) {
  const card = make('article', 'builder-card panel');
  card.dataset.index = String(index);
  card.dataset.blockId = block.id;
  card.dataset.pageId = page.id;
  card.draggable = true;
  const header = make('div', 'builder-card-head');
  const left = make('div', 'builder-card-meta');
  const dragHandle = make('span', 'drag-handle', '⋮⋮');
  dragHandle.title = 'Tahan dan seret untuk mengurutkan pertanyaan';
  dragHandle.setAttribute('role', 'img');
  dragHandle.setAttribute('aria-label', 'Pegangan untuk menyeret kartu pertanyaan');
  dragHandle.setAttribute('tabindex', '0');
  left.append(dragHandle, make('span', 'question-number', String(index + 1).padStart(2, '0')), make('span', 'builder-number', ({ question: 'PERTANYAAN', text: 'JUDUL / TEKS', image: 'GAMBAR', video: 'VIDEO' })[block.type] || block.type));
  header.append(left);
  const buttons = make('div', 'block-actions');
  const del = button('✕', async () => {
    if (!await SSCNotice.confirm('Hapus item ini?', { danger: true, confirmText: 'Hapus item' }))
      return;
    page.blocks.splice(index, 1);
    dirtyMark();
    renderBuilder();
  }, 'icon-button');
  del.title = 'Hapus item';
  buttons.append(del);
  header.append(buttons);
  card.append(header);
  dragHandle.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      card.draggable = true;
      return;
    }
    startTouchDrag(e, card, page, index);
  });
  dragHandle.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')
      return;
    e.preventDefault();
    const step = e.key === 'ArrowUp' ? -1 : 1;
    const j = index + step;
    if (j < 0 || j >= page.blocks.length)
      return;
    moveBlockTo(page, index, page, j);
    document.querySelector(`[data-block-id="${block.id}"] .drag-handle`)?.focus();
  });
  card.addEventListener('dragstart', e => {
    if (e.target.closest?.('input,textarea,select,button')) {
      e.preventDefault();
      return;
    }
    dragState = { pageId: page.id, fromIndex: index };
    card.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', block.id);
    }
  });
  card.addEventListener('dragend', () => {
    card.draggable = false;
    dragState = { pageId: '', fromIndex: -1 };
    clearDropHints();
  });
  card.addEventListener('dragover', e => {
    if (!dragState.pageId)
      return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    card.classList.toggle('drop-before', before);
    card.classList.toggle('drop-after', !before);
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'move';
  });
  card.addEventListener('dragleave', e => {
    if (!card.contains(e.relatedTarget))
      card.classList.remove('drop-before', 'drop-after');
  });
  card.addEventListener('drop', e => {
    if (!dragState.pageId)
      return;
    e.preventDefault();
    e.stopPropagation();
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    finishDraggedOnCard(page, index, !before);
  });
  if (block.type === 'question')
    renderQuestionEditor(card, block.question, page);
  else if (block.type === 'text')
    card.append(field('Judul bagian informasi', block.title, v => block.title = v), field('Deskripsi atau informasi', block.description, v => block.description = v, { kind: 'textarea' }));
  else if (block.type === 'image') {
    const img = make('img', 'builder-media-preview');
    if (block.imageUrl || block.imageId)
      img.src = block.imageUrl || '/api/media/' + encodeURIComponent(block.imageId);
    img.referrerPolicy = 'no-referrer';
    img.alt = 'Gambar halaman';
    if (block.imageUrl || block.imageId)
      card.append(img);
    card.append(field('Caption gambar', block.caption, v => block.caption = v));
    const upload = make('input', 'image-upload-field');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
    const progress = make('p', 'field-help', block.imageId ? 'Gambar sudah terunggah.' : 'Unggah JPG, PNG, atau WEBP. Gambar disesuaikan otomatis agar ringan.');
    upload.onchange = async () => {
      const file = upload.files?.[0];
      if (!file)
        return;
      if (file.size > 12 * 1024 * 1024) {
        progress.textContent = 'File terlalu besar (maks. 12 MB sebelum kompresi).';
        return;
      }
      upload.disabled = true;
      progress.textContent = 'Mengunggah gambar...';
      try {
        const result = await SSCircle.uploadImage(file);
        block.imageId = result.id;
        dirtyMark();
        renderBuilder();
      }
      catch (e) {
        progress.textContent = 'Gagal upload: ' + e.message;
        upload.disabled = false;
      }
    };
    // Satu editor digunakan untuk upload, URL eksternal, maupun Media Library.
    const imageHost = make('div', 'builder-image-source');
    SSCircleImagePicker.mount(imageHost, {
      title: 'Gambar formulir', current: () => block.imageUrl || (block.imageId ? '/api/media/' + block.imageId : ''),
      onSelect: src => {
        block.imageId = /^\/api\/media\/[0-9a-f-]{36}$/.test(src) ? src.split('/').pop() : '';
        block.imageUrl = block.imageId ? '' : src;
        dirtyMark();
        renderBuilder();
      }
    });
    card.append(imageHost);
  }
  else if (block.type === 'video')
    card.append(field('Link video YouTube atau Vimeo', block.url, v => block.url = v, { placeholder: 'https://www.youtube.com/watch?v=...' }), field('Judul video (opsional)', block.title, v => block.title = v), make('p', 'field-help', 'Gunakan link HTTPS YouTube atau Vimeo. Video muncul langsung di halaman pengunjung.'));
  return card;
}
function startTouchDrag(event, card, page, index) {
  if (event.pointerType === 'mouse')
    return;
  event.preventDefault();
  const handle = event.currentTarget;
  dragState = { pageId: page.id, fromIndex: index };
  card.classList.add('dragging');
  handle.setPointerCapture(event.pointerId);
  let target = null, after = false;
  const move = e => {
    if (e.pointerId !== event.pointerId)
      return;
    clearDropHints();
    card.classList.add('dragging');
    const found = document.elementFromPoint(e.clientX, e.clientY);
    target = found?.closest('.builder-card,.section-question-list');
    if (target?.classList.contains('builder-card')) {
      const rect = target.getBoundingClientRect();
      after = e.clientY >= rect.top + rect.height / 2;
      target.classList.add(after ? 'drop-after' : 'drop-before');
    }
    else if (target?.classList.contains('section-question-list'))
      target.classList.add('drop-in-section');
  };
  const end = e => {
    if (e.pointerId !== event.pointerId)
      return;
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', cancel);
    if (handle.hasPointerCapture(event.pointerId))
      handle.releasePointerCapture(event.pointerId);
    if (target) {
      const pg = data.pages.find(p => p.id === (target.dataset.pageId || target.closest('.form-section')?.dataset.pageId));
      const dst = target.closest('.builder-card');
      if (pg && dst)
        moveBlockTo(page, index, pg, Number(dst.dataset.index), after);
      else if (pg)
        moveBlockTo(page, index, pg, pg.blocks.length);
    }
    dragState = { pageId: '', fromIndex: -1 };
    clearDropHints();
  };
  const cancel = e => {
    if (e.pointerId !== event.pointerId)
      return;
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', cancel);
    dragState = { pageId: '', fromIndex: -1 };
    clearDropHints();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', cancel);
}
function renderQuestionEditor(card, q, page) {
  card.append(field('Pertanyaan', q.title, v => q.title = v));
  const settings = make('div', 'question-settings');
  const selectWrap = make('label', 'field-group');
  selectWrap.append(make('span', 'field-label', 'Jenis jawaban'));
  const type = dropdown(qtypes, q.type, v => {
    q.type = v;
    if (['single', 'select', 'multi'].includes(v) && !q.options.length)
      q.options = ['Opsi 1', 'Opsi 2'];
    if (!['single', 'select', 'multi'].includes(v)) {
      q.options = [];
      q.allowOther = false;
    }
    if (v === 'multi' && page.routeQuestionId === q.id) {
      page.routeQuestionId = '';
      page.routes = {};
    }
    renderBuilder();
  });
  selectWrap.append(type);
  const required = make('label', 'required-toggle');
  const box = make('input');
  box.type = 'checkbox';
  box.checked = q.required;
  box.onchange = () => {
    q.required = box.checked;
    if (!box.checked && page.routeQuestionId === q.id) {
      page.routeQuestionId = '';
      page.routes = {};
      renderBuilder();
    }
    dirtyMark();
  };
  required.append(box, make('span', '', 'Wajib dijawab'));
  settings.append(selectWrap, required);
  card.append(settings);
  if (['short', 'long'].includes(q.type))
    card.append(field('Placeholder', q.placeholder, v => q.placeholder = v));
  if (q.type === 'image_upload')
    card.append(make('p', 'editor-note', 'Pengunjung dapat mengunggah 1 gambar (maksimal 3 MB). File tersimpan privat dan hanya admin dapat mengaksesnya.'));
  if (['single', 'multi', 'select'].includes(q.type)) {
    const intro = make('div', 'choice-editor-title');
    intro.append(make('strong', '', 'Pilihan jawaban'), make('small', '', 'Setiap opsi punya kontrol ' + (q.type === 'multi' ? 'checkbox' : q.type === 'single' ? 'radio' : 'dropdown') + ' asli.'));
    card.append(intro);
    const opts = make('div', 'choice-editor');
    q.options.forEach((value, i) => {
      const row = make('div', 'choice-editor-row');
      if (q.type === 'select')
        row.append(make('span', 'select-number', String(i + 1) + '.'));
      else {
        const ctrl = make('input', 'editor-choice-control');
        ctrl.type = q.type === 'multi' ? 'checkbox' : 'radio';
        ctrl.name = 'preview-' + q.id;
        ctrl.setAttribute('aria-label', 'Pratinjau ' + value);
        row.append(ctrl);
      }
      const name = make('input', 'choice-label-input');
      name.type = 'text';
      name.value = value;
      name.placeholder = 'Tulis opsi...';
      name.maxLength = 140;
      name.onchange = () => {
        const old = q.options[i], fresh = name.value.trim();
        if (!fresh) {
          name.value = old;
          return;
        }
        if (q.options.some((v, j) => j !== i && v === fresh)) {
          SSCNotice.alert('Opsi tidak boleh duplikat.');
          name.value = old;
          return;
        }
        q.options[i] = fresh;
        if (page.routes?.[old]) {
          page.routes[fresh] = page.routes[old];
          delete page.routes[old];
        }
        dirtyMark();
        renderBuilder();
      };
      const remove = button('×', () => {
        const old = q.options[i];
        q.options.splice(i, 1);
        delete page.routes?.[old];
        dirtyMark();
        renderBuilder();
      }, 'icon-button');
      remove.title = 'Hapus opsi';
      row.append(name, remove);
      opts.append(row);
    });
    card.append(opts);
    card.append(button('+ Tambah opsi', () => {
      q.options.push('Opsi ' + (q.options.length + 1));
      dirtyMark();
      renderBuilder();
    }, 'add-option-button'));
    const otherSetting = make('label', 'other-setting');
    const otherCheck = make('input');
    otherCheck.type = 'checkbox';
    otherCheck.checked = q.allowOther === true;
    otherCheck.setAttribute('aria-label', 'Izinkan jawaban lainnya yang diketik manual');
    otherCheck.addEventListener('change', () => {
      q.allowOther = otherCheck.checked;
      dirtyMark();
      renderBuilder();
    });
    otherSetting.append(otherCheck, make('span', '', 'Izinkan “Jawaban lainnya” (pengunjung dapat mengetik sendiri)'));
    card.append(otherSetting);
    if (q.allowOther === true) {
      const sample = make('div', 'other-editor-preview');
      const indicator = make('input');
      indicator.type = q.type === 'multi' ? 'checkbox' : 'radio';
      indicator.disabled = true;
      const copy = make('span', '', 'Jawaban lainnya:');
      const input = make('input');
      input.type = 'text';
      input.disabled = true;
      input.placeholder = 'Pengunjung mengetik jawaban sendiri...';
      sample.append(indicator, copy, input);
      card.append(sample);
    }
  }
}
function renderRouting(page, container = $('#routing-panel'), pageIndex = data.pages.indexOf(page)) {
  container.replaceChildren();
  const heading = make('div', 'panel-heading'), detail = make('div');
  detail.append(make('h2', '', 'Alur & percabangan jawaban'), make('p', '', 'Arahkan pengunjung ke halaman khusus atau langsung selesai berdasarkan jawaban.'));
  heading.append(make('span', 'panel-heading-icon', '⑂'), detail);
  container.append(heading);
  const eligible = page.blocks.filter(b => b.type === 'question' && ['single', 'select'].includes(b.question.type) && b.question.required).map(b => b.question);
  const options = [['', 'Otomatis: halaman berikutnya'], ...eligible.map(q => [q.id, q.title])];
  const fieldWrap = make('label', 'field-group');
  fieldWrap.append(make('span', 'field-label', 'Pertanyaan yang mengatur tujuan halaman'));
  const select = dropdown(options, page.routeQuestionId || '', v => {
    page.routeQuestionId = v;
    page.routes = {};
    renderBuilder();
  });
  fieldWrap.append(select);
  container.append(fieldWrap);
  const q = eligible.find(q => q.id === page.routeQuestionId);
  if (!q) {
    container.append(make('p', 'field-help', 'Untuk membuat percabangan, buat pertanyaan Pilihan Tunggal/Dropdown dan aktifkan Wajib dijawab, lalu pilih di sini.'));
    return;
  }
  container.append(make('p', 'field-help', 'Contoh: "Iya" → halaman streamer, "Tidak" → selesai. Pilihan tujuan hanya boleh maju, agar tidak terjadi loop.'));
  const targets = [['next', 'Lanjut ke halaman berikutnya'], ['end', 'Akhiri dan kirim formulir'], ...data.pages.slice(pageIndex + 1).map(p => [p.id, 'Buka: ' + p.title])];
  for (const option of q.options) {
    const row = make('div', 'route-row');
    row.append(make('span', 'route-option', '↳ ' + option));
    row.append(dropdown(targets, page.routes?.[option] || 'next', v => {
      if (v === 'next')
        delete page.routes[option];
      else
        page.routes[option] = v;
    }));
    container.append(row);
  }
  if (pageIndex === data.pages.length - 1)
    container.append(make('p', 'field-help', 'Halaman ini paling akhir. Pilih Akhiri dan kirim, atau tambahkan halaman baru untuk percabangan.'));
}
$('#add-page').onclick = () => {
  if (data.pages.length >= 24)
    return SSCNotice.alert('Maksimal 24 halaman.');
  data.pages.push(newPage());
  activePage = data.pages.length - 1;
  dirtyMark();
  navToPage(activePage);
};
function addBlock(type, page = selectedPage()) {
  if (page.blocks.length >= 30)
    return SSCNotice.alert('Maksimal 30 item per bagian.');
  const b = { id: uid(), type };
  if (type === 'question')
    b.question = newQuestion();
  if (type === 'text') {
    b.title = 'Judul bagian';
    b.description = 'Tuliskan informasi atau petunjuk...';
  }
  if (type === 'image') {
    b.imageId = '';
    b.caption = '';
  }
  if (type === 'video') {
    b.url = '';
    b.title = '';
  }
  page.blocks.push(b);
  activePage = data.pages.indexOf(page);
  collapsedPages.delete(page.id);
  dirtyMark();
  renderBuilder();
  document.querySelector(`[data-block-id="${b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
for (const [id, type] of [['add-question', 'question'], ['add-text', 'text'], ['add-image', 'image'], ['add-video', 'video']])
  $('#' + id).onclick = () => addBlock(type);
async function save() {
  const btn = $('#save');
  btn.disabled = true;
  const saveButtons = [
    '#home-admin-save',
    '#home-admin-save-top',
    '#save',
    '#save-bottom',
    '#save-appearance',
    '#save-appearance-bottom',
    '#save-theme',
    '#save-theme-bottom',
    '#rules-admin-save',
    '#events-admin-save',
    '#seasons-admin-save'
  ].map($).filter(Boolean);
  saveButtons.forEach(b => {
    b.disabled = true;
    b.classList.add('is-saving');
  });
  try {
    const result = await SSCircle.saveForm(data.settings, data.pages, data.revision);
    data.revision = result.revision;
    dirty = false;
    ['#save-message', '#appearance-message', '#home-admin-message', '#theme-message'].forEach(selector => {
      const n = $(selector);
      if (n)
        n.replaceChildren();
    });
    saveButtons.forEach(b => {
      b.classList.remove('is-saving');
      b.classList.add('save-flash');
      setTimeout(() => b.classList.remove('save-flash'), 1150);
    });
    SSCNotice.toast('Perubahan berhasil disimpan.', 'success');
    renderBuilder();
    summary();
  }
  catch (e) {
    SSCNotice.toast(e.status === 409 ? 'Pengaturan berubah di sesi admin lain. Salin perubahanmu dulu, lalu muat ulang halaman agar tidak menimpa pekerjaan orang lain.' : 'Gagal menyimpan: ' + e.message, 'error', 7500);
  }
  finally {
    saveButtons.forEach(b => {
      b.disabled = false;
      b.classList.remove('is-saving');
    });
  }
}
$('#save').onclick = save;
$('#save-bottom').onclick = save;
$('#save-appearance').onclick = save;
$('#save-appearance-bottom').onclick = save;
$('#save-theme').onclick = save;
$('#save-theme-bottom').onclick = save;
$('#rules-admin-save').onclick = save;
$('#events-admin-save').onclick = save;
$('#seasons-admin-save').onclick = save;
function optionPreview(q) {
  const card = make('div', 'preview-question');
  card.append(make('strong', '', q.title + (q.required ? ' *' : '')));
  if (['single', 'multi'].includes(q.type)) {
    for (const v of q.options) {
      const label = make('label', 'preview-choice'), input = make('input');
      input.type = q.type === 'single' ? 'radio' : 'checkbox';
      input.name = 'preview-' + q.id;
      label.append(input, make('span', '', v));
      card.append(label);
    }
    if (q.allowOther) {
      const lab = make('label', 'preview-choice'), tick = make('input');
      tick.type = q.type === 'single' ? 'radio' : 'checkbox';
      tick.name = 'preview-' + q.id;
      lab.append(tick, make('span', '', 'Jawaban lainnya:'));
      card.append(lab);
      const custom = make('input');
      custom.type = 'text';
      custom.placeholder = 'Tulis jawaban sendiri...';
      card.append(custom);
    }
  }
  else if (q.type === 'select') {
    const input = dropdown([['', 'Pilih jawaban...'], ...q.options.map(v => [v, v]), ...(q.allowOther ? [['__SSC_OTHER__', 'Jawaban lainnya...']] : [])], '', () => { });
    card.append(input);
    if (q.allowOther) {
      const other = make('input');
      other.type = 'text';
      other.placeholder = 'Tulis jawaban sendiri...';
      card.append(other);
    }
  }
  else {
    const input = make(q.type === 'long' ? 'textarea' : 'input');
    if (q.type === 'image_upload') {
      input.type = 'file';
      input.accept = 'image/*';
    }
    else {
      if (q.type === 'long')
        input.rows = 3;
      else
        input.type = 'text';
      input.placeholder = q.placeholder || '';
    }
    card.append(input);
  }
  return card;
}
$('#preview-draft').onclick = () => {
  const p = selectedPage(), root = $('#preview-content');
  root.replaceChildren(make('h2', '', p.title), make('p', '', p.description || ''));
  for (const b of p.blocks) {
    if (b.type === 'question')
      root.append(optionPreview(b.question));
    else if (b.type === 'text') {
      root.append(make('h3', '', b.title), make('p', '', b.description));
    }
    else if (b.type === 'image') {
      if (b.imageId || b.imageUrl) {
        const img = make('img', 'preview-media');
        img.src = b.imageUrl || '/api/media/' + b.imageId;
        img.referrerPolicy = 'no-referrer';
        root.append(img);
      }
      root.append(make('p', '', b.caption || ''));
    }
    else if (b.type === 'video')
      root.append(make('p', '', b.title + ' · ' + b.url));
  }
  $('#preview-dialog').showModal();
};
$('#close-preview').onclick = () => $('#preview-dialog').close();
$('#close-detail').onclick = () => $('#answer-dialog').close();
function valueText(v) {
  if (Array.isArray(v))
    return v.map(valueText).join(' | ');
  if (typeof v === 'string' && v.startsWith('__SSC_OTHER__:'))
    return 'Jawaban lainnya: ' + v.slice('__SSC_OTHER__:'.length);
  return v && typeof v === 'object' ? (v.filename ? '📎 ' + v.filename : JSON.stringify(v)) : String(v ?? '');
}
function reasonDialog(previous = '') {
  return new Promise(resolve => {
    const dialog = $('#reject-dialog'), textarea = $('#reject-reason'), form = $('#reject-form');
    let settled = false;
    textarea.value = previous || '';
    $('#reject-error').textContent = '';
    const done = value => {
      if (settled)
        return;
      settled = true;
      dialog.removeEventListener('close', onClose);
      form.removeEventListener('submit', onSubmit);
      $('#reject-cancel').removeEventListener('click', cancel);
      $('#cancel-reject').removeEventListener('click', cancel);
      if (dialog.open)
        dialog.close();
      resolve(value);
    };
    const onClose = () => done(null), cancel = () => done(null);
    const onSubmit = event => {
      event.preventDefault();
      const reason = textarea.value.trim();
      if (!reason) {
        $('#reject-error').textContent = 'Isi alasan penolakan terlebih dahulu.';
        return;
      }
      done(reason);
    };
    form.addEventListener('submit', onSubmit);
    dialog.addEventListener('close', onClose);
    $('#reject-cancel').addEventListener('click', cancel);
    $('#cancel-reject').addEventListener('click', cancel);
    dialog.showModal();
    textarea.focus();
  });
}
async function reviewStatus(record, newStatus) {
  if (newStatus === record.status && newStatus !== 'rejected')
    return;
  let reason = '';
  if (newStatus === 'rejected') {
    reason = await reasonDialog(record.reason);
    if (reason === null) {
      renderAnswers();
      return;
    }
  }
  try {
    await SSCircle.changeStatus(record.id, newStatus, reason);
    record.status = newStatus;
    record.reason = reason;
    summary();
    renderAnswers();
  }
  catch (err) {
    SSCNotice.alert('Gagal mengubah status: ' + err.message);
    renderAnswers();
  }
}
function allColumns() {
  const cols = new Map();
  for (const p of data.pages)
    for (const b of p.blocks)
      if (b.type === 'question') {
        const q = b.question;
        cols.set(q.id, p.title + ' · ' + q.title);
      }
  for (const s of data.submissions)
    for (const q of s.questions || [])
      if (!cols.has(q.id))
        cols.set(q.id, (q.pageTitle ? q.pageTitle + ' · ' : '') + q.title);
  for (const s of data.submissions)
    for (const key of Object.keys(s.answers || {}))
      if (!cols.has(key))
        cols.set(key, 'Pertanyaan lama: ' + key);
  return [...cols];
}
async function reloadSpreadsheet() {
  const count = $('#fullsheet-count');
  if (count)
    count.textContent = 'Memperbarui jawaban terbaru...';
  try {
    data.submissions = await SSCircle.getSubmissions();
    summary();
    renderAnswers();
    renderAnalytics();
    if ($('#spreadsheet') && !$('#spreadsheet').classList.contains('hide'))
      SSCircleSheet.render(data, allColumns(), valueText, applicantName, showDetails);
  }
  catch (e) {
    if (count)
      count.textContent = 'Gagal memperbarui jawaban terbaru. Tampilkan data yang sudah dimuat.';
  }
}
window.SSCRefreshSheet = reloadSpreadsheet;
$('#open-spreadsheet').onclick = () => tab('spreadsheet');
$('#open-spreadsheet-answers').onclick = () => tab('spreadsheet');
$('#sheet-back-answers').onclick = () => tab('answers');
$('#search').oninput = () => {
  sheetPage = 0;
  renderAnswers();
};
$('#filter').onchange = () => {
  sheetPage = 0;
  renderAnswers();
};
$('#sheet-go-latest').onclick = () => {
  sheetPage = Math.max(0, Math.ceil(matched().length / PAGE_SIZE) - 1);
  renderAnswers();
  document.querySelector('#sheet-body tr:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
$('#sheet-prev').onclick = () => {
  sheetPage = Math.max(0, sheetPage - 1);
  renderAnswers();
};
$('#sheet-next').onclick = () => {
  sheetPage++;
  renderAnswers();
};
function matched() {
  const query = $('#search').value.trim().toLocaleLowerCase('id');
  return [...data.submissions].sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id))).filter(s => {
    if ($('#filter').value !== 'all' && s.status !== $('#filter').value)
      return false;
    return !query || [
      s.id,
      s.trackingCode || '',
      s.at,
      s.status,
      s.reason || '',
      ...Object.values(s.answers || {}).map(valueText)
    ].some(v => String(v).toLocaleLowerCase('id').includes(query));
  });
}
function applicantName(record) {
  const entries = record.questions || [];
  const candidate = entries.find(q => /username|gamertag|nickname|nama (pemain|minecraft)|ign\b/i.test(q.title || ''));
  let v = candidate ? record.answers?.[candidate.id] : null;
  if (!v) {
    const keys = Object.keys(record.answers || {});
    const fallback = keys.find(k => /ign|username|nickname|gamertag/i.test(k));
    if (fallback)
      v = record.answers[fallback];
  }
  return typeof v === 'string' && v.trim() ? v.trim() : 'Pendaftar #' + record.id.slice(0, 8).toUpperCase();
}
function renderAnswers() {
  const found = matched();
  $('#result-count').textContent = found.length + ' dari ' + data.submissions.length + ' pendaftar';
  const count = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
  sheetPage = Math.min(sheetPage, count - 1);
  $('#sheet-prev').disabled = sheetPage === 0;
  $('#sheet-next').disabled = sheetPage >= count - 1;
  $('#sheet-paging').textContent = 'Halaman ' + (sheetPage + 1) + ' / ' + count;
  const currentRows = found.slice(sheetPage * PAGE_SIZE, (sheetPage + 1) * PAGE_SIZE);
  const head = $('#sheet-head'), tr = make('tr'), thSelect = make('th', 'selection-col'), checkAll = make('input');
  checkAll.type = 'checkbox';
  checkAll.setAttribute('aria-label', 'Pilih semua pada halaman ini');
  checkAll.checked = !!currentRows.length && currentRows.every(x => selectedIds.has(x.id));
  checkAll.indeterminate = !checkAll.checked && currentRows.some(x => selectedIds.has(x.id));
  checkAll.onchange = () => {
    for (const item of currentRows) {
      if (checkAll.checked)
        selectedIds.add(item.id);
      else
        selectedIds.delete(item.id);
    }
    renderAnswers();
  };
  thSelect.append(checkAll);
  tr.append(thSelect);
  for (const title of ['No', 'Pendaftar / kode', 'Tanggal', 'Status', 'Aksi'])
    tr.append(make('th', '', title));
  head.replaceChildren(tr);
  const body = $('#sheet-body');
  body.replaceChildren();
  $('#sheet-empty').classList.toggle('hide', !!currentRows.length);
  $('#sheet-empty').textContent = 'Belum ada pendaftar sesuai filter.';
  currentRows.forEach((record, i) => {
    const row = make('tr', 'applicant-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', 'Lihat detail jawaban ' + applicantName(record));
    row.onclick = () => showDetails(record);
    row.onkeydown = e => {
      if (e.target !== row)
        return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showDetails(record);
      }
    };
    const checkCell = make('td', 'selection-col'), check = make('input');
    check.type = 'checkbox';
    check.checked = selectedIds.has(record.id);
    check.setAttribute('aria-label', 'Pilih pendaftaran ' + record.id.slice(0, 8));
    check.onclick = e => e.stopPropagation();
    check.onchange = () => {
      if (check.checked)
        selectedIds.add(record.id);
      else
        selectedIds.delete(record.id);
      renderAnswers();
    };
    checkCell.append(check);
    const number = make('td', 'applicant-index', String(sheetPage * PAGE_SIZE + i + 1));
    const identityCell = make('td', 'applicant-name-cell'), identity = make('div', 'applicant-list-name'), avatar = make('span', 'applicant-list-avatar', applicantName(record).slice(0, 1).toUpperCase()), identityText = make('span', 'applicant-list-meta');
    identityText.append(make('strong', '', applicantName(record)), make('small', '', record.trackingCode || '#' + record.id.slice(0, 8).toUpperCase()));
    identity.append(avatar, identityText);
    identityCell.append(identity);
    const date = make('td', 'applicant-list-date', new Date(record.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }));
    const statusCell = make('td', 'applicant-list-status'), status = make('select', 'status-select ' + record.status);
    status.setAttribute('aria-label', 'Ubah status ' + applicantName(record));
    for (const [val, label] of [['pending', 'Menunggu'], ['accepted', 'Diterima'], ['rejected', 'Ditolak']]) {
      const option = make('option', '', label);
      option.value = val;
      status.append(option);
    }
    status.value = record.status;
    status.onclick = e => e.stopPropagation();
    status.onkeydown = e => e.stopPropagation();
    status.onchange = () => reviewStatus(record, status.value);
    statusCell.append(status);
    const actions = make('td', 'applicant-actions'), open = button('Lihat ↗', e => showDetails(record), 'sheet-detail'), remove = button('Hapus', () => deleteOne(record), 'sheet-detail sheet-danger');
    open.onclick = e => {
      e.stopPropagation();
      showDetails(record);
    };
    remove.onclick = e => {
      e.stopPropagation();
      deleteOne(record);
    };
    actions.append(open, remove);
    row.append(checkCell, number, identityCell, date, statusCell, actions);
    body.append(row);
  });
  updateSelectionInfo();
}
function showDetails(sub) {
  currentDetailId = sub.id;
  const root = $('#answer-details');
  root.replaceChildren(make('p', 'field-help', 'Kode: ' + (sub.trackingCode || sub.id.slice(0, 8).toUpperCase()) + ' • ' + new Date(sub.at).toLocaleString('id-ID')));
  if (sub.status === 'rejected')
    root.append(make('div', 'detail-answer', 'Alasan penolakan: ' + (sub.reason || '—')));
  const questions = (sub.questions?.length ? sub.questions : Object.keys(sub.answers || {}).map(id => ({ id, title: 'Pertanyaan ' + id })));
  for (const q of questions) {
    const row = make('div', 'detail-answer');
    row.append(make('strong', '', q.pageTitle ? q.pageTitle + ' · ' + q.title : q.title));
    const v = sub.answers?.[q.id];
    if (v && typeof v === 'object' && !Array.isArray(v) && v.mediaId) {
      const a = make('a', '', 'Lihat gambar: ' + v.filename + ' ↗');
      a.href = '/api/admin/media/' + encodeURIComponent(v.mediaId);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      row.append(a);
    }
    else if (v && typeof v === 'object' && v.imageUrl && SSCircleImagePicker.external(v.imageUrl)) {
      const a = make('a', '', 'Lihat gambar melalui URL ↗');
      a.href = v.imageUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const pic = make('img', 'ssc-answer-url-preview');
      pic.src = v.imageUrl;
      pic.loading = 'lazy';
      pic.referrerPolicy = 'no-referrer';
      pic.alt = 'Pratinjau gambar jawaban dari URL';
      row.append(a, pic);
    }
    else
      row.append(make('p', '', valueText(v) || '—'));
    root.append(row);
  }
  $('#answer-dialog').showModal();
}
// Pengaturan tampilan publik: bagian terpisah agar admin tidak menggulir ratusan field.
const appearanceGroups = {
  identity: [
    ['brandName', 'Nama website (header)', 'input'],
    ['brandLabel', 'Label kecil di header', 'input'],
    ['headerBadge', 'Status singkat di header', 'input'],
    ['heroBadgeLeft', 'Label kecil kiri pada panel sambutan', 'input'],
    ['heroBadgeRight', 'Label kecil kanan pada panel sambutan', 'input']
  ],
  hero: [
    ['heroEyebrow', 'Teks pembuka di atas judul utama', 'input'],
    ['heroTitle', 'Judul utama halaman depan', 'input'],
    ['heroTagline', 'Kalimat sambutan utama', 'input'],
    ['heroSubtitle', 'Kalimat sambutan penekanan', 'input'],
    ['heroFootnote', 'Info server di bagian bawah', 'input'],
    ['heroStep1', 'Langkah pertama', 'input'],
    ['heroStep2', 'Langkah kedua', 'input'],
    ['heroStep3', 'Langkah ketiga', 'input']
  ],
  copy: [
    ['title', 'Judul formulir', 'input'],
    ['subtitle', 'Subjudul formulir', 'input'],
    ['description', 'Deskripsi formulir', 'textarea'],
    ['formEyebrow', 'Label di atas formulir', 'input'],
    ['sectionIndex', 'Label samping formulir', 'input'],
    ['pageLabel', 'Label kecil di atas tiap halaman', 'input'],
    ['availabilityOpen', 'Teks ketika pendaftaran dibuka', 'input'],
    ['availabilityClosed', 'Teks ketika pendaftaran ditutup', 'input'],
    ['formHint', 'Petunjuk pengisian', 'textarea'],
    ['submitTitle', 'Judul di atas tombol kirim', 'input'],
    ['submitDescription', 'Deskripsi langkah selanjutnya', 'textarea'],
    ['privacyNote', 'Catatan privasi di bawah tombol', 'textarea'],
    ['successTitle', 'Judul setelah formulir berhasil dikirim', 'input'],
    ['successDescription', 'Penjelasan setelah sukses', 'textarea'],
    ['successEyebrow', 'Label di halaman berhasil', 'input'],
    ['backHomeText', 'Teks tombol kembali ke beranda', 'input'],
    ['buttonBack', 'Teks tombol kembali halaman', 'input'],
    ['buttonNext', 'Teks tombol lanjut halaman', 'input'],
    ['buttonSend', 'Teks tombol kirim', 'input'],
    ['footerText', 'Kalimat footer', 'input'],
    ['footerNote', 'Copyright footer', 'input'],
  ],
  opening: [['introTitle', 'Judul opening', 'input'], ['introSubtitle', 'Subjudul opening', 'input'], ['introDuration', 'Durasi opening (milidetik, 800–6000)', 'number']]
};
// Pengaturan tampilan pendaftaran
function renderAppearance() {
  const cooldownInput = $('#registration-cooldown-minutes');
  if (cooldownInput)
    cooldownInput.value = String(data.settings.cooldownMinutes ?? 30);
  for (const [group, fields] of Object.entries(appearanceGroups)) {
    const root = $('#appearance-' + group + '-fields');
    root.replaceChildren();
    const advanced = new Set([
      'heroStep1',
      'heroStep2',
      'heroStep3',
      'heroBadgeLeft',
      'heroBadgeRight',
      'sectionIndex',
      'pageLabel',
      'availabilityOpen',
      'availabilityClosed',
      'privacyNote',
      'successEyebrow',
      'backHomeText',
      'buttonBack',
      'buttonNext',
      'buttonSend',
      'formEyebrow',
      'heroFootnote',
      'heroEyebrow'
    ]);
    const more = make('details', 'appearance-more'), summary = make('summary', '', 'Pengaturan lanjutan lainnya');
    more.append(summary);
    let hiddenCount = 0;
    for (const [key, label, kind] of fields) {
      const wrap = make('label', 'field-group'), name = make('span', 'field-label', label), input = make(kind === 'textarea' ? 'textarea' : 'input');
      if (kind === 'input')
        input.type = 'text';
      if (kind === 'number') {
        input.type = 'number';
        input.min = '800';
        input.max = '6000';
        input.step = '100';
      }
      if (kind === 'textarea')
        input.rows = 3;
      input.value = data.settings[key] ?? '';
      input.maxLength = kind === 'textarea' ? 1500 : 250;
      input.dataset.field = key;
      input.addEventListener('input', () => {
        data.settings[key] = kind === 'number' ? Number(input.value) : input.value;
        dirtyMark();
      });
      wrap.append(name, input);
      if (advanced.has(key)) {
        more.append(wrap);
        hiddenCount++;
      }
      else
        root.append(wrap);
    }
    if (hiddenCount)
      root.append(more);
  }
  $('#form-open').checked = !!data.settings.open;
  $('#form-open').onchange = () => {
    data.settings.open = $('#form-open').checked;
    dirtyMark();
  };
  $('#intro-enabled').checked = data.settings.introEnabled !== false;
  $('#intro-enabled').onchange = () => {
    data.settings.introEnabled = $('#intro-enabled').checked;
    dirtyMark();
  };
  renderColors();
  updateMediaPreviews();
}
function updateMediaPreviews() {
  const logo = data.settings.logoImageUrl || (data.settings.logoMediaId ? '/api/media/' + encodeURIComponent(data.settings.logoMediaId) : 'assets/sscircle-logo.png');
  $('#logo-preview').src = logo;
  $('#hero-image-preview').src = data.settings.heroImageUrl || (data.settings.heroMediaId ? '/api/media/' + encodeURIComponent(data.settings.heroMediaId) : logo);
  $('#intro-logo-preview').src = data.settings.introLogoImageUrl || (data.settings.introLogoMediaId ? '/api/media/' + encodeURIComponent(data.settings.introLogoMediaId) : logo);
  for (const id of ['logo-preview', 'hero-image-preview', 'intro-logo-preview'])
    $('#' + id).referrerPolicy = 'no-referrer';
}
for (const b of document.querySelectorAll('[data-appearance]'))
  b.onclick = () => {
    const part = b.dataset.appearance;
    for (const x of document.querySelectorAll('[data-appearance]'))
      x.classList.toggle('active', x === b);
    for (const panel of document.querySelectorAll('[data-appearance-panel]'))
      panel.classList.toggle('hide', panel.dataset.appearancePanel !== part);
  };
for (const [id, key, messageId] of [
  ['site-logo-input', 'logoMediaId', 'logo-upload-message'],
  ['hero-image-input', 'heroMediaId', 'hero-upload-message'],
  ['intro-logo-input', 'introLogoMediaId', 'intro-logo-upload-message']
]) {
  $('#' + id).onchange = async () => {
    const file = $('#' + id).files?.[0];
    if (!file)
      return;
    const msg = $('#' + messageId);
    if (file.size > 12 * 1024 * 1024) {
      msg.textContent = 'File lebih besar dari 12 MB sebelum kompresi.';
      return;
    }
    msg.textContent = 'Sedang mengunggah...';
    $('#' + id).disabled = true;
    try {
      const result = await SSCircle.uploadImage(file);
      data.settings[key] = result.id;
      data.settings[{ logoMediaId: 'logoImageUrl', heroMediaId: 'heroImageUrl', introLogoMediaId: 'introLogoImageUrl' }[key]] = '';
      updateMediaPreviews();
      dirtyMark();
      msg.textContent = '✓ Gambar tersimpan. Klik Simpan tampilan untuk menerapkan.';
    }
    catch (e) {
      msg.textContent = 'Gagal mengunggah: ' + e.message;
    }
    finally {
      $('#' + id).disabled = false;
      $('#' + id).value = '';
    }
  };
}
for (const [fileId, mediaKey, urlKey, description] of [
  ['site-logo-input', 'logoMediaId', 'logoImageUrl', 'Logo website'],
  ['hero-image-input', 'heroMediaId', 'heroImageUrl', 'Gambar utama halaman pendaftaran'],
  ['intro-logo-input', 'introLogoMediaId', 'introLogoImageUrl', 'Logo animasi opening']
]) {
  const field = $('#' + fileId);
  field.hidden = true;
  const wrapper = field.closest('.appearance-logo-actions');
  const label = wrapper?.querySelector('label[for="' + fileId + '"]');
  if (label)
    label.hidden = true;
  const holder = make('div', 'ssc-appearance-image-source');
  wrapper?.insertBefore(holder, field);
  SSCircleImagePicker.mount(holder, {
    title: description,
    current: () => data.settings[urlKey] || (data.settings[mediaKey] ? '/api/media/' + data.settings[mediaKey] : ''),
    onSelect: src => {
      data.settings[mediaKey] = /^\/api\/media\/[0-9a-f-]{36}$/.test(src) ? src.split('/').pop() : '';
      data.settings[urlKey] = data.settings[mediaKey] ? '' : src;
      updateMediaPreviews();
      dirtyMark();
    }
  });
}
$('#reset-intro-logo').onclick = () => {
  data.settings.introLogoMediaId = '';
  data.settings.introLogoImageUrl = '';
  updateMediaPreviews();
  dirtyMark();
};
$('#reset-logo').onclick = () => {
  data.settings.logoMediaId = '';
  data.settings.logoImageUrl = '';
  updateMediaPreviews();
  dirtyMark();
};
$('#reset-hero-image').onclick = () => {
  data.settings.heroMediaId = '';
  data.settings.heroImageUrl = '';
  updateMediaPreviews();
  dirtyMark();
};
$('#test-opening').onclick = () => {
  const url = new URL('registration.html', location.href);
  url.searchParams.set('previewIntro', '1');
  window.open(url.href, '_blank', 'noopener');
};
$('#open-public').onclick = () => window.open('./', '_blank', 'noopener');
function updateSelectionInfo() {
  const size = selectedIds.size;
  $('#selected-count').textContent = size + ' dipilih';
  $('#delete-selected').disabled = size < 1;
}
async function deleteOne(record) {
  if (!await SSCNotice.confirm('Hapus permanen seluruh jawaban milik #' + record.id.slice(0, 8).toUpperCase() + '? File gambar jawabannya juga akan dihapus.', { danger: true, confirmText: 'Hapus jawaban' }))
    return;
  try {
    const out = await SSCircle.deleteSubmissions({ scope: 'selected', ids: [record.id], confirmation: 'HAPUS' });
    selectedIds.delete(record.id);
    await refresh();
    SSCNotice.alert('Berhasil menghapus ' + out.deleted + ' pendaftaran.' + (out.mediaErrors ? ' Ada ' + out.mediaErrors + ' gambar lama yang belum dapat dibersihkan.' : ''));
  }
  catch (e) {
    SSCNotice.alert('Gagal menghapus: ' + e.message);
  }
}
$('#delete-current').onclick = () => {
  const sub = data.submissions.find(x => x.id === currentDetailId);
  if (!sub)
    return;
  $('#answer-dialog').close();
  deleteOne(sub);
};
$('#delete-selected').onclick = async () => {
  const ids = [...selectedIds];
  if (!ids.length)
    return;
  if (ids.length > 100)
    return SSCNotice.alert('Maksimal 100 pendaftar sekali hapus.');
  if (!await SSCNotice.confirm('Hapus permanen ' + ids.length + ' pendaftaran terpilih beserta gambar jawabannya? Tindakan ini tidak bisa dibatalkan.', { danger: true, confirmText: 'Hapus terpilih' }))
    return;
  try {
    const out = await SSCircle.deleteSubmissions({ scope: 'selected', ids, confirmation: 'HAPUS' });
    await refresh();
    SSCNotice.alert(out.deleted + ' jawaban berhasil dihapus.' + (out.mediaErrors ? ' ' + out.mediaErrors + ' gambar lama belum berhasil dihapus.' : ''));
  }
  catch (e) {
    SSCNotice.alert('Gagal menghapus: ' + e.message);
  }
};
$('#delete-all').onclick = async () => {
  if (!data.submissions.length)
    return SSCNotice.alert('Belum ada jawaban untuk dihapus.');
  if (!await SSCNotice.confirm('Semua pendaftaran dan gambar jawabannya akan dihapus permanen. Pastikan kamu sudah menyimpan salinan spreadsheet Excel sebelum melanjutkan.', { danger: true, confirmText: 'Lanjutkan' }))
    return;
  if (!await SSCNotice.promptConfirm('Sebagai konfirmasi terakhir, ketik HAPUS SEMUA.', 'HAPUS SEMUA'))
    return;
  const btn = $('#delete-all');
  btn.disabled = true;
  let total = 0, mediaErrors = 0;
  try {
    for (let i = 0; i < 1000; i++) {
      btn.textContent = 'Menghapus... ' + total;
      const out = await SSCircle.deleteSubmissions({ scope: 'all', confirmation: 'HAPUS SEMUA' });
      total += out.deleted;
      mediaErrors += out.mediaErrors || 0;
      if (!out.more)
        break;
      if (i === 999)
        throw Error('Batas 100.000 jawaban per operasi tercapai. Lanjutkan penghapusan dari menu admin.');
    }
    await refresh();
    SSCNotice.alert('Penghapusan selesai: ' + total + ' pendaftaran.' + (mediaErrors ? ' ' + mediaErrors + ' gambar lama belum berhasil dihapus.' : ''));
  }
  catch (e) {
    SSCNotice.alert('Penghapusan belum sepenuhnya selesai: ' + e.message + ' Data yang sudah terhapus tidak dapat dipulihkan.');
    await refresh().catch(() => { });
  }
  finally {
    btn.disabled = false;
    btn.textContent = 'Hapus semua jawaban';
  }
};
SSCircle.isAdmin().then(ok => {
  if (ok)
    refresh().catch(e => $('#login-error').textContent = e.message);
});
/* SSCircle V9 — Appearance palettes, public media hygiene and answer insights */
const V9_COLORS = [
  ['accentColor', 'Primary / tombol', '#bc91f5'],
  ['secondaryColor', 'Secondary / aksen', '#8069bf'],
  ['highlightColor', 'Highlight / sorotan', '#b29ad6'],
  ['backgroundColor', 'Warna latar halaman (utama)', '#0c0815'],
  ['backgroundEndColor', 'Warna latar halaman (ujung gradasi)', '#1b1030'],
  ['gradientStartColor', 'Gradasi panel awal', '#3a2056'],
  ['gradientEndColor', 'Gradasi panel akhir', '#1b102d'],
  ['textColor', 'Teks utama', '#f5efff'],
  ['mutedColor', 'Teks sekunder', '#b8a5ca'],
  ['buttonTextColor', 'Teks tombol utama', '#1e0d35'],
  ['panelColor', 'Background kartu', '#20142f'],
  ['inputColor', 'Background input', '#130b20'],
  ['borderColor', 'Garis / border', '#62457d'],
  ['successColor', 'Status diterima', '#b6e2ce'],
  ['dangerColor', 'Status ditolak', '#ff9caf'],
  ['headerBackgroundColor', 'Latar header', '#120b20'],
  ['headerTextColor', 'Teks header', '#f5efff'],
  ['footerBackgroundColor', 'Latar footer', '#0c0815'],
  ['footerTextColor', 'Teks footer', '#b8a5ca'],
  ['headingColor', 'Semua judul / heading', '#f5efff'],
  ['linkColor', 'Link biasa', '#bc91f5'],
  ['linkHoverColor', 'Link ketika hover', '#dfcbff'],
  ['badgeBackgroundColor', 'Latar badge / label', '#3a2056'],
  ['badgeTextColor', 'Teks badge', '#dfcbff'],
  ['placeholderColor', 'Placeholder input', '#76698b'],
  ['dividerColor', 'Garis pembatas', '#62457d'],
  ['inputBorderColor', 'Border input', '#62457d'],
  ['inputFocusColor', 'Sorotan input aktif', '#bc91f5'],
  ['inputTextColor', 'Teks input', '#f5efff'],
  ['primaryButtonColor', 'Awal tombol utama', '#bc91f5'],
  ['primaryButtonEndColor', 'Akhir tombol utama', '#8069bf'],
  ['secondaryButtonColor', 'Latar tombol kedua', '#20142f'],
  ['secondaryButtonTextColor', 'Teks tombol kedua', '#f5efff'],
  ['cardGradientStartColor', 'Gradasi kartu awal', '#20142f'],
  ['cardGradientEndColor', 'Gradasi kartu akhir', '#20142f'],
  ['selectedBackgroundColor', 'Latar teks diseleksi', '#8069bf'],
  ['selectedTextColor', 'Teks diseleksi', '#ffffff'],
  ['shadowColor', 'Warna bayangan', '#7147ba'],
  ['warningColor', 'Peringatan', '#f0c785'],
  ['heroTitleColor', 'Judul di hero video', '#ffffff'],
  ['heroOverlayColor', 'Warna lapisan hero', '#0c0815']
];
const V9_PRESETS = {
  'Ungu SSCircle': {},
  'Midnight Blue': {
    accentColor: '#82abff',
    secondaryColor: '#4563bb',
    highlightColor: '#8eaee5',
    backgroundColor: '#060e23',
    backgroundEndColor: '#152d52',
    gradientStartColor: '#203b70',
    gradientEndColor: '#08142c',
    textColor: '#f0f7ff',
    mutedColor: '#b5c7e7',
    buttonTextColor: '#061125',
    panelColor: '#172645',
    inputColor: '#0d1934',
    borderColor: '#47679b',
    successColor: '#9bd7ba',
    dangerColor: '#ffb0bc'
  },
  'Emerald Forest': {
    accentColor: '#8bdfb6',
    secondaryColor: '#3d9e80',
    highlightColor: '#90c5aa',
    backgroundColor: '#071b18',
    backgroundEndColor: '#123e35',
    gradientStartColor: '#235a45',
    gradientEndColor: '#0b2821',
    textColor: '#e7fff3',
    mutedColor: '#b4d6c3',
    buttonTextColor: '#09231a',
    panelColor: '#153329',
    inputColor: '#0b251e',
    borderColor: '#477b68',
    successColor: '#a7e7be',
    dangerColor: '#ffb3b3'
  },
  'Rose Twilight': {
    accentColor: '#f8abc5',
    secondaryColor: '#a878c6',
    highlightColor: '#d6a0c0',
    backgroundColor: '#1d0c1d',
    backgroundEndColor: '#4c2345',
    gradientStartColor: '#713b64',
    gradientEndColor: '#28112e',
    textColor: '#fff1f8',
    mutedColor: '#dcc1d7',
    buttonTextColor: '#2a0b1d',
    panelColor: '#362038',
    inputColor: '#231325',
    borderColor: '#99628e',
    successColor: '#b6e2ce',
    dangerColor: '#ff9caf'
  }
};
let mediaLibrary = [], mediaPage = 0, mediaLoading = false, analyticsModalItems = [], analyticsVisible = 0, activeColorCategory = 'brand';
const COLOR_CATEGORIES = {
  brand: { name: 'Aksen & sorotan', keys: ['accentColor', 'secondaryColor', 'highlightColor', 'selectedBackgroundColor', 'selectedTextColor', 'warningColor'] },
  background: { name: 'Latar & gradasi', keys: ['backgroundColor', 'backgroundEndColor', 'gradientStartColor', 'gradientEndColor', 'headerBackgroundColor', 'footerBackgroundColor', 'cardGradientStartColor', 'cardGradientEndColor', 'heroOverlayColor'] },
  text: { name: 'Teks & tautan', keys: ['textColor', 'mutedColor', 'headingColor', 'headerTextColor', 'footerTextColor', 'linkColor', 'linkHoverColor', 'heroTitleColor'] },
  buttons: { name: 'Tombol & label', keys: ['buttonTextColor', 'primaryButtonColor', 'primaryButtonEndColor', 'secondaryButtonColor', 'secondaryButtonTextColor', 'badgeBackgroundColor', 'badgeTextColor'] },
  forms: { name: 'Form & kartu', keys: ['panelColor', 'inputColor', 'borderColor', 'inputBorderColor', 'inputFocusColor', 'inputTextColor', 'placeholderColor', 'dividerColor', 'shadowColor'] },
  status: { name: 'Status', keys: ['successColor', 'dangerColor'] }
};
const mediaKB = bytes => bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(2) + ' MB' : (bytes / 1024).toFixed(1) + ' KB';
// Palet warna dan pratinjau
function renderColors() {
  const root = $('#color-editor');
  if (!root)
    return;
  root.replaceChildren();
  const tabs = $('#color-category-tabs');
  tabs.replaceChildren();
  for (const [id, group] of Object.entries(COLOR_CATEGORIES))
    tabs.append(button(group.name, () => {
      activeColorCategory = id;
      renderColors();
    }, 'button ' + (activeColorCategory === id ? 'primary' : 'secondary')));
  for (const [key, title, base] of V9_COLORS.filter(([id]) => COLOR_CATEGORIES[activeColorCategory].keys.includes(id))) {
    const wrap = make('label', 'color-field');
    const name = make('span', 'field-label', title), control = make('div', 'color-field-controls'), picker = make('input'), txt = make('input');
    picker.type = 'color';
    picker.value = data.settings[key] || base;
    txt.type = 'text';
    txt.value = picker.value;
    txt.maxLength = 7;
    txt.setAttribute('aria-label', 'Kode warna ' + title);
    const change = v => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v))
        return;
      picker.value = v;
      txt.value = v;
      data.settings[key] = v;
      dirtyMark();
      updateColorPreview();
      window.SSCircleThemeEditor?.schedule();
    };
    picker.addEventListener('input', () => change(picker.value));
    txt.addEventListener('change', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(txt.value))
        change(txt.value);
      else
        txt.value = picker.value;
    });
    control.append(picker, txt);
    wrap.append(name, control);
    root.append(wrap);
  }
  const presets = $('#color-presets');
  presets.replaceChildren();
  for (const [label, values] of Object.entries(V9_PRESETS))
    presets.append(button(label, () => {
      for (const [key, , base] of V9_COLORS)
        data.settings[key] = values[key] || base;
      // Extend every theme preset to the new components instead of retaining old purple shades.
      const s = data.settings;
      Object.assign(s, { headerBackgroundColor: s.backgroundEndColor, headerTextColor: s.textColor,
        footerBackgroundColor: s.backgroundColor, footerTextColor: s.mutedColor, headingColor: s.textColor,
        linkColor: s.accentColor, linkHoverColor: s.highlightColor, badgeBackgroundColor: s.gradientStartColor,
        badgeTextColor: s.textColor, placeholderColor: s.mutedColor, dividerColor: s.borderColor,
        inputBorderColor: s.borderColor, inputFocusColor: s.accentColor, inputTextColor: s.textColor,
        primaryButtonColor: s.accentColor, primaryButtonEndColor: s.secondaryColor,
        secondaryButtonColor: s.panelColor, secondaryButtonTextColor: s.textColor,
        cardGradientStartColor: s.panelColor, cardGradientEndColor: s.gradientEndColor,
        selectedBackgroundColor: s.secondaryColor, selectedTextColor: s.textColor,
        shadowColor: s.secondaryColor, warningColor: '#f0c785', heroTitleColor: s.textColor,
        heroOverlayColor: s.backgroundColor });
      renderColors();
      dirtyMark();
      window.SSCircleThemeEditor?.schedule();
    }, 'button secondary'));
  updateColorPreview();
}
function updateColorPreview() {
  const box = $('#color-preview');
  if (!box)
    return;
  const s = data.settings;
  box.style.background = s.pageBackgroundMode === 'solid'
    ? (s.backgroundColor || '#0c0815')
    : `linear-gradient(${Number.isFinite(Number(s.pageBackgroundAngle)) ? s.pageBackgroundAngle : 160}deg, ${s.backgroundColor || '#0c0815'}, ${s.backgroundEndColor || '#1b1030'})`;
  box.style.color = s.textColor || '#f5efff';
  const inner = box.querySelector('.color-preview-panel');
  if (inner) {
    inner.style.background = `linear-gradient(120deg, ${s.gradientStartColor || '#3a2056'}, ${s.gradientEndColor || '#1b102d'})`;
    inner.style.borderColor = s.borderColor || '#62457d';
    inner.querySelector('p').style.color = s.mutedColor || '#b8a5ca';
    const b = inner.querySelector('.color-preview-button');
    b.style.background = `linear-gradient(115deg, color-mix(in srgb, ${s.accentColor || '#bc91f5'} 69%, ${s.secondaryColor || '#8069bf'} 31%), color-mix(in srgb, ${s.accentColor || '#bc91f5'} 42%, ${s.secondaryColor || '#8069bf'} 58%))`;
    b.style.boxShadow = `0 6px 16px color-mix(in srgb, ${s.accentColor || '#bc91f5'} 9%, transparent)`;
    b.style.color = s.buttonTextColor || '#1e0d35';
  }
}
let mediaFilter = 'all';
const mediaType = f => f.type?.startsWith('video/') ? 'video' : 'image';
const mediaUrl = f => f.source === 'built-in' ? f.id.replace(/^built-in:/, '') : (f.visibility === 'private' ? '/api/admin/media/' : '/api/media/') + encodeURIComponent(f.id);
async function loadMediaLibrary() {
  if (mediaLoading)
    return;
  mediaLoading = true;
  const root = $('#media-list');
  root.replaceChildren(make('p', 'field-help', 'Memuat daftar media...'));
  try {
    const info = await SSCircle.getMediaLibrary();
    mediaLibrary = info.files || [];
    mediaPage = 0;
    const stats = $('#media-stats');
    stats.replaceChildren();
    for (const [title, count] of [
      ['SELURUH FILE', info.totalFiles || 0],
      ['VIDEO', info.videoCount || 0],
      ['GAMBAR JAWABAN', info.privateCount || 0],
      ['UKURAN SEMUA MEDIA', mediaKB(info.totalBytes || 0)],
      ['MEDIA TIDAK DIGUNAKAN', info.unused || 0]
    ]) {
      const card = make('div', 'panel media-stat');
      card.append(make('small', '', title), make('strong', '', String(count)));
      stats.append(card);
    }
    const quota = document.getElementById('media-storage-quota');
    if (quota) {
      quota.replaceChildren();
      const max = Number(info.storageLimitBytes) || 500000000;
      const exact = Number(info.allocatedBytes);
      const measured = info.allocatedBytes !== null && Number.isFinite(exact) && exact >= 0;
      const used = measured ? exact : (Number(info.uploadedBytes) || 0);
      const pct = Math.max(0, Math.min(100, (used / max) * 100)), remaining = Math.max(0, max - used);
      const formatSize = bytes => bytes >= 1000000 ? (bytes / 1000000).toFixed(2) + ' MB' : (bytes / 1000).toFixed(1) + ' KB';
      const title = make('h3', '', measured ? 'Pemakaian penyimpanan' : 'Perkiraan penyimpanan media');
      const meta = make('div', 'storage-quota-meta'), usage = make('strong', '', formatSize(used) + ' dari ' + formatSize(max)), percent = make('span', '', pct.toFixed(1) + '% terpakai');
      meta.append(usage, percent);
      const bar = make('div', 'storage-quota-bar'), fill = make('div', 'storage-quota-bar-fill');
      fill.style.width = pct > 0 ? Math.max(.5, pct) + '%' : '0%';
      bar.append(fill);
      const footer = make('div', 'storage-quota-meta'), free = make('span', '', 'Sisa ruang acuan: ' + formatSize(remaining)), media = make('span', '', 'File unggahan: ' + formatSize(Number(info.uploadedBytes) || 0));
      footer.append(free, media);
      const hint = make('p', '', measured ? 'Batas acuan sesuai paket Free. Pemakaian dapat berbeda jika paket atau kapasitas akun berubah.' : 'Estimasi file unggahan; data lain juga menggunakan ruang. Untuk angka kapasitas keseluruhan, lihat pengaturan penyimpanan akun.');
      quota.append(title, meta, bar, footer, hint);
      if (pct >= 80) {
        bar.classList.add('storage-warning');
        const warn = make('p', '', pct >= 95 ? 'Ruang hampir penuh. Hapus media yang sudah tidak digunakan.' : 'Penggunaan ruang mendekati batas. Pertimbangkan membersihkan media lama.');
        quota.append(warn);
      }
    }
    $('#media-message').textContent = info.limited ? 'Sebagian media belum ditampilkan. Muat ulang setelah membersihkan file yang tidak digunakan.' : 'Media bawaan tersedia untuk ditinjau. File yang masih digunakan dilindungi dari penghapusan.';
    renderMediaPage();
  }
  catch (e) {
    root.replaceChildren(make('div', 'message message-error', 'Gagal membaca media: ' + e.message));
  }
  finally {
    mediaLoading = false;
  }
}
function renderMediaPage() {
  const root = $('#media-list'), pageSize = 18;
  const filtered = mediaLibrary.filter(f => mediaFilter === 'all' || (mediaFilter === 'video' && mediaType(f) === 'video') || (mediaFilter === 'image' && mediaType(f) === 'image')
    || (mediaFilter === 'unused' && f.source === 'upload' && !f.used && f.visibility !== 'private')
    || (mediaFilter === 'private' && f.visibility === 'private'));
  const count = Math.max(1, Math.ceil(filtered.length / pageSize));
  mediaPage = Math.max(0, Math.min(mediaPage, count - 1));
  root.replaceChildren();
  for (const file of filtered.slice(mediaPage * pageSize, (mediaPage + 1) * pageSize)) {
    const card = make('article', 'panel media-item');
    card.classList.add('media-card-v102');
    const src = mediaUrl(file);
    let preview;
    if (mediaType(file) === 'video') {
      preview = make('video', 'media-thumb media-video');
      preview.src = src;
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = 'none';
      preview.controls = true;
    }
    else {
      preview = make('img', 'media-thumb');
      preview.src = src;
      preview.alt = file.name || 'Gambar';
      preview.loading = 'lazy';
    }
    const name = make('strong', 'media-name', file.name || file.id), meta = make('small', '', mediaKB(file.size) + ' · ' + (mediaType(file) === 'video' ? 'Video' : 'Gambar'));
    const source = file.source === 'built-in' ? 'Bawaan' : file.visibility === 'private' ? 'Jawaban pendaftar' : file.visibility === 'uploading' ? 'Unggahan belum selesai' : file.used ? 'Sedang digunakan' : 'Tidak digunakan';
    const flag = make('span', 'media-flag ' + ((file.used || file.source === 'built-in' || file.visibility === 'private') ? 'is-used' : ''), source);
    card.append(preview, name, meta, flag);
    if (file.source === 'upload' && file.visibility === 'public' && mediaType(file) === 'video') {
      const use = button('Gunakan di Homepage', () => {
        data.settings.homeVideoUrl = '/api/media/' + file.id + (file.type === 'video/webm' ? '?format=webm' : '?format=mp4');
        data.settings.homeVideoEnabled = true;
        dirtyMark();
        window.SSCircleHomeAdmin?.render(data, dirtyMark);
        tab('homepage');
        document.getElementById('home-admin-message').textContent = 'Video dipilih. Klik Simpan Homepage agar perubahan tampil ke pengunjung.';
      });
      card.append(use);
    }
    if (file.source === 'upload' && file.visibility !== 'private') {
      const remove = button(file.visibility === 'uploading' ? 'Hapus unggahan gagal' : 'Hapus media', () => removeMedia([file.id]), 'button secondary danger-button');
      remove.disabled = file.used;
      card.append(remove);
    }
    if (file.visibility === 'private')
      card.append(make('small', 'field-help', 'File jawaban privat. Hapus melalui daftar pendaftar jika sudah tidak diperlukan.'));
    if (file.source === 'built-in')
      card.append(make('small', 'field-help', 'Aset bawaan website. Tidak dapat dihapus dari dashboard.'));
    root.append(card);
  }
  if (!filtered.length)
    root.append(make('p', 'empty-state', 'Belum ada media untuk kategori ini.'));
  $('#media-pagination').textContent = 'Halaman ' + (mediaPage + 1) + ' dari ' + count + ' · ' + filtered.length + ' file';
  $('#media-prev').disabled = mediaPage === 0;
  $('#media-next').disabled = mediaPage >= count - 1;
}
async function removeMedia(ids) {
  if (!ids.length)
    return;
  if (!await SSCNotice.confirm('Hapus permanen ' + ids.length + ' media tidak terpakai? Pastikan perubahan Homepage atau formulir sudah disimpan.', { danger: true, confirmText: 'Hapus media' }))
    return;
  let deleted = 0, errors = [];
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const out = await SSCircle.deleteUnusedMedia(ids.slice(i, i + 50));
      deleted += out.deleted;
      errors.push(...(out.failures || []));
    }
    await loadMediaLibrary();
    SSCNotice.alert('Berhasil menghapus ' + deleted + ' file.' + (errors.length ? ' Gagal: ' + errors.length + ' file.' : ''));
  }
  catch (e) {
    SSCNotice.alert('Gagal menghapus media: ' + e.message);
    await loadMediaLibrary();
  }
}
function setupExternalImageLibrary() {
  const listPanel = make('div', 'panel ssc-external-image-library');
  listPanel.append(make('h3', '', 'Foto URL eksternal'), make('p', 'field-help', 'Bookmark tautan HTTPS untuk dipakai ulang di editor mana pun. Hanya URL disimpan, tanpa menyalin file ke Cloudflare.'));
  const list = make('div', 'ssc-external-image-list');
  const addPanel = make('div');
  listPanel.append(addPanel, list);
  const refreshList = () => {
    data.settings.homeExternalImages ||= [];
    list.replaceChildren();
    data.settings.homeExternalImages.forEach((entry, index) => {
      const row = make('div', 'ssc-external-image-item');
      const thumbnail = make('img', 'ssc-external-image-thumb');
      thumbnail.src = entry.src;
      thumbnail.referrerPolicy = 'no-referrer';
      thumbnail.loading = 'lazy';
      const name = make('input');
      name.type = 'text';
      name.maxLength = 110;
      name.value = entry.title || '';
      name.placeholder = 'Nama foto URL';
      name.addEventListener('input', () => { entry.title = name.value; dirtyMark(); });
      const remove = button('Hapus', () => {
        data.settings.homeExternalImages.splice(index, 1);
        dirtyMark();
        refreshList();
      }, 'button secondary danger-button');
      row.append(thumbnail, name, remove);
      list.append(row);
    });
  };
  SSCircleImagePicker.mount(addPanel, {
    title: 'Simpan tautan gambar untuk dipakai ulang',
    count: () => (data.settings.homeExternalImages || []).length, max: 80,
    onAdd: src => {
      const arr = data.settings.homeExternalImages ||= [];
      if (arr.some(entry => entry.src === src))
        throw Error('URL ini sudah disimpan.');
      arr.push({ src, title: 'Gambar URL ' + (arr.length + 1) });
      dirtyMark();
      refreshList();
    }
  });
  const tab = $('#media');
  const stats = $('#media-storage-quota');
  if (tab && stats)
    stats.before(listPanel);
  refreshList();
}
setupExternalImageLibrary();
$('#reload-media').onclick = loadMediaLibrary;
$('#media-prev').onclick = () => {
  mediaPage--;
  renderMediaPage();
};
$('#media-next').onclick = () => {
  mediaPage++;
  renderMediaPage();
};
$('#delete-unused-media').onclick = () => {
  const ids = mediaLibrary.filter(m => m.source === 'upload' && !m.used && m.visibility !== 'private').map(m => m.id);
  if (!ids.length)
    return SSCNotice.alert('Tidak ada media tidak terpakai.');
  removeMedia(ids);
};
$('#media-filter').onchange = e => {
  mediaFilter = e.target.value;
  mediaPage = 0;
  renderMediaPage();
};
$('#media-upload-image').onchange = async (e) => {
  const files = [...e.target.files || []], status = $('#media-upload-status');
  if (!files.length)
    return;
  e.target.disabled = true;
  let success = 0;
  for (const file of files) {
    try {
      await SSCircle.uploadImage(file);
      success++;
      status.textContent = 'Berhasil mengunggah ' + success + ' dari ' + files.length + ' gambar.';
    }
    catch (err) {
      status.textContent = 'Gagal mengunggah ' + file.name + ': ' + err.message;
      break;
    }
  }
  e.target.disabled = false;
  e.target.value = '';
  await loadMediaLibrary();
};
$('#media-upload-video').onchange = async (e) => {
  const file = e.target.files?.[0], status = $('#media-upload-status'), progress = $('#media-video-progress');
  if (!file)
    return;
  e.target.disabled = true;
  progress.hidden = false;
  progress.value = 0;
  try {
    const result = await SSCircle.uploadVideo(file, v => {
      progress.value = v;
      status.textContent = 'Mengunggah video ' + v + '%';
    });
    status.textContent = 'Video ' + result.filename + ' berhasil disimpan. Gunakan tombol “Gunakan di Homepage” untuk mengaktifkannya.';
    await loadMediaLibrary();
  }
  catch (err) {
    status.textContent = 'Gagal mengunggah video: ' + err.message;
  }
  finally {
    e.target.disabled = false;
    e.target.value = '';
    progress.hidden = true;
  }
};
// Aggregate based on exact question IDs and historic snapshots, not labels alone.
function aggregateAnswers() {
  const result = new Map();
  const filter = $('#analytics-status')?.value || 'all';
  const matches = data.submissions.filter(x => filter === 'all' || x.status === filter);
  const active = new Map();
  for (const p of data.pages)
    for (const block of p.blocks || [])
      if (block.type === 'question')
        active.set(block.question.id, { ...block.question, pageTitle: p.title });
  for (const sub of matches) {
    const old = new Map((sub.questions || []).map(q => [q.id, q]));
    for (const [id, value] of Object.entries(sub.answers || {})) {
      const q = old.get(id) || active.get(id) || { id, title: 'Pertanyaan lama ' + id, type: typeof value === 'string' ? 'short' : 'multi' };
      if (!result.has(id))
        result.set(id, {
          id,
          title: q.title || id,
          pageTitle: q.pageTitle || '',
          type: q.type || 'short',
          respondents: 0,
          counts: new Map(),
          written: [],
          images: 0
        });
      const entry = result.get(id);
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length))
        continue;
      if (entry.type === 'image_upload') {
        if (value?.mediaId) {
          entry.images++;
          entry.respondents++;
        }
        continue;
      }
      const values = Array.isArray(value) ? value : [value];
      entry.respondents++;
      for (const val of values) {
        if (val === null || val === undefined || val === '')
          continue;
        const text = String(val);
        if (['single', 'multi', 'select'].includes(entry.type)) {
          if (text.startsWith('__SSC_OTHER__:')) {
            entry.counts.set('Jawaban lainnya', (entry.counts.get('Jawaban lainnya') || 0) + 1);
            entry.written.push({ value: text.slice('__SSC_OTHER__:'.length), who: applicantName(sub) });
          }
          else
            entry.counts.set(text, (entry.counts.get(text) || 0) + 1);
        }
        else
          entry.written.push({ value: valueText(val), who: applicantName(sub) });
      }
    }
  }
  return [...result.values()].sort((a, b) => b.respondents - a.respondents);
}
const PIE_COLORS = [
  '#b58af4',
  '#80b7ff',
  '#f2a5cd',
  '#92ddbb',
  '#f3c478',
  '#9e8ad9',
  '#70d5d7',
  '#e1a5a2',
  '#aec6f5',
  '#cba2b9'
];
// Ringkasan dan statistik pendaftar
function renderAnalytics() {
  const root = $('#analytics-list');
  if (!root)
    return;
  root.replaceChildren();
  const all = aggregateAnswers(), query = $('#analytics-search').value.trim().toLocaleLowerCase('id');
  const items = all.filter(x => !query || (x.title + ' ' + x.pageTitle).toLocaleLowerCase('id').includes(query));
  $('#analytics-summary').textContent = items.length + ' pertanyaan · ' + data.submissions.filter(x => $('#analytics-status').value === 'all' || x.status === $('#analytics-status').value).length + ' pendaftar pada filter ini';
  if (!items.length) {
    root.append(make('p', 'empty-state', 'Belum ada jawaban yang cocok.'));
    return;
  }
  for (const q of items) {
    const card = make('article', 'panel analytics-card'), meta = make('div', 'analytics-meta', q.pageTitle + ' · ' + q.respondents + ' jawaban');
    card.append(meta, make('h3', '', q.title));
    if (q.counts.size) {
      const total = [...q.counts.values()].reduce((a, b) => a + b, 0), entries = [...q.counts].sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 6);
      const parts = [], donut = make('div', 'analytics-donut'), legend = make('div', 'analytics-legend');
      let start = 0;
      for (let i = 0; i < entries.length; i++) {
        const pct = entries[i][1] / total * 100, end = start + pct, color = PIE_COLORS[i % PIE_COLORS.length];
        parts.push(`${color} ${start.toFixed(3)}% ${end.toFixed(3)}%`);
        start = end;
      }
      donut.style.background = 'conic-gradient(' + parts.join(',') + ')';
      donut.append(make('div', 'analytics-donut-hole', String(total)));
      for (let i = 0; i < top.length; i++) {
        const [label, count] = top[i], row = make('div', 'analytics-legend-item'), dot = make('i', '');
        dot.style.background = PIE_COLORS[i % PIE_COLORS.length];
        row.append(dot, make('span', '', label), make('strong', '', `${count} · ${(count / total * 100).toFixed(1)}%`));
        legend.append(row);
      }
      const area = make('div', 'analytics-chart-row');
      area.append(donut, legend);
      card.append(area);
      if (q.type === 'multi')
        card.append(make('p', 'field-help', 'Persentase dihitung dari total pilihan yang dicentang; satu pemain dapat memilih beberapa opsi.'));
    }
    if (q.written.length) {
      const head = make('p', 'analytics-written-heading', 'Jawaban diketik (' + q.written.length + ')');
      card.append(head);
      const samples = make('div', 'analytics-written');
      for (const item of q.written.slice(0, 3))
        samples.append(make('div', 'analytics-written-item', item.value));
      card.append(samples);
    }
    if (q.images)
      card.append(make('p', 'field-help', q.images + ' gambar dikirim oleh pendaftar.'));
    card.append(button('Lihat lebih lanjut →', () => openAnalyticsDetail(q), 'button secondary'));
    root.append(card);
  }
}
function openAnalyticsDetail(q) {
  const root = $('#analytics-detail-content'), dialog = $('#analytics-dialog');
  $('#analytics-detail-heading').textContent = q.title;
  analyticsModalItems = [];
  if (q.counts.size) {
    const total = [...q.counts.values()].reduce((a, b) => a + b, 0);
    analyticsModalItems.push(...[...q.counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} — ${n} pilihan (${(n / total * 100).toFixed(1)}%)`));
  }
  if (q.written.length) {
    analyticsModalItems.push('── Semua jawaban teks (' + q.written.length + ') ──', ...q.written.map(x => x.value + ' · ' + x.who));
  }
  if (q.images)
    analyticsModalItems.push(q.images + ' lampiran gambar — buka detail pendaftar untuk melihatnya.');
  analyticsVisible = 0;
  root.replaceChildren();
  dialog.showModal();
  showMoreAnalytics();
}
function showMoreAnalytics() {
  const root = $('#analytics-detail-content');
  for (const value of analyticsModalItems.slice(analyticsVisible, analyticsVisible + 25))
    root.append(make('div', 'analytics-detail-row', value));
  analyticsVisible = Math.min(analyticsVisible + 25, analyticsModalItems.length);
  const more = $('#analytics-more');
  more.hidden = analyticsVisible >= analyticsModalItems.length;
  more.textContent = `Lihat lebih lanjut (${analyticsModalItems.length - analyticsVisible} tersisa)`;
}
$('#analytics-more').onclick = showMoreAnalytics;
$('#analytics-close').onclick = () => $('#analytics-dialog').close();
$('#analytics-search').oninput = renderAnalytics;
$('#analytics-status').onchange = renderAnalytics;
$('#analytics-refresh').onclick = async () => {
  try {
    await refresh();
    tab('analytics');
  }
  catch (e) {
    SSCNotice.alert(e.message);
  }
};
