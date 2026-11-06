/* SSCircle Server — Editor Homepage */
'use strict';
window.SSCircleHomepageBuilder = (() => {
  const BUILTINS = [
    { id: 'about', title: 'Tentang Server', help: 'Pengenalan server dan komunitas' },
    { id: 'gallery', title: 'SSCircle Gallery', help: 'Kumpulan foto dari server' },
    { id: 'process', title: 'Join our Circle', help: 'Informasi dan tombol pendaftaran' },
    { id: 'community', title: 'Stay Connected', help: 'Discord dan media sosial' },
    { id: 'profile', title: 'Profil & Sejarah', help: 'Foto kepala skin, judul, dan cerita komunitas' },
    { id: 'leaderboard', title: 'Leaderboard', help: 'Daftar peringkat komunitas per season' },
    { id: 'status', title: 'Cek Status', help: 'Cara memeriksa hasil pendaftaran' }
  ];
  const TYPES = {
    text: ['✎', 'Judul & teks'],
    feature: ['▧', 'Kartu informasi'],
    button: ['↗', 'Tombol tautan'],
    image: ['▣', 'Galeri gambar'],
    divider: ['—', 'Pemisah']
  };
  const el = (tag, cls = '', text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  let state,
    changed,
    list,
    notice,
    frame,
    frameShell,
    view = 'desktop',
    draftTimer = null,
    activeId = '',
    panel,
    drag = null,
    editors = {},
    parking = document.createDocumentFragment(),
    introCard,
    designCard,
    previewStatus;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const builtin = id => BUILTINS.find(b => b.id === id);
  function clone(arr) {
    return JSON.parse(JSON.stringify(arr));
  }
  function mark() {
    changed?.();
    updatePreview();
  }
  function message(text) {
    if (notice) notice.textContent = '';
    if (text && /maksimal|batas|gagal/i.test(text)) window.SSCNotice?.toast(text, 'warning');
  }
  function normalize() {
    let arr = Array.isArray(state.settings.homeLayout) ? state.settings.homeLayout.filter(x => x && x.id !== 'donate' && x.id !== 'voting').map(x => ({ ...x })) : [];
    const seen = new Set();
    arr = arr.filter(x => {
      if (!x?.id || seen.has(x.id)) return false;
      seen.add(x.id);
      return x.kind === 'builtin' || x.kind === 'custom';
    });
    for (const b of BUILTINS) if (!seen.has(b.id)) arr.push({ id: b.id, kind: 'builtin' });
    for (const item of arr) if (item.kind === 'custom') {
      if (!Array.isArray(item.images)) item.images = item.image ? [{ src: item.image, caption: item.caption || '' }] : [];
      if (!Array.isArray(item.buttons)) item.buttons = ['button', 'feature'].includes(item.type) ? [{ label: item.buttonText || 'Selengkapnya', href: item.href || 'registration.html' }] : [];
      item.width = item.width || 'full';
      item.align = item.align || 'left';
      item.appearance = item.appearance || 'card';
    }
    state.settings.homeLayout = arr;
  }
  function choose(id) {
    activeId = id;
    paint();
    const card = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function reorder(fromId, targetId, after) {
    const arr = state.settings.homeLayout;
    const a = arr.findIndex(x => x.id === fromId), b = arr.findIndex(x => x.id === targetId);
    if (a < 0 || b < 0 || a === b) return;
    const oldRects = new Map([...list.querySelectorAll('.home-builder-card[data-id]')].map(n => [n.dataset.id, n.getBoundingClientRect()]));
    const [item] = arr.splice(a, 1);
    let dest = arr.findIndex(x => x.id === targetId);
    if (after) dest++;
    arr.splice(dest, 0, item);
    activeId = fromId;
    mark();
    paint();
    animateReorder(oldRects);
  }
  function moveDelta(id, delta) {
    const arr = state.settings.homeLayout, i = arr.findIndex(x => x.id === id), j = i + delta;
    if (j < 0 || j >= arr.length) return;
    const [item] = arr.splice(i, 1);
    arr.splice(j, 0, item);
    activeId = id;
    mark();
    paint();
  }
  function add(type) {
    const arr = state.settings.homeLayout;
    if (arr.filter(x => x.kind === 'custom').length >= 18) return message('Kartu tambahan sudah mencapai batas.');
    const id = 'custom-' + SSCircle.uuid().replace(/-/g, '').slice(0, 16);
    const item = {
      id,
      kind: 'custom',
      type,
      title: type === 'button' ? '' : type === 'image' ? 'Foto SSCircle' : 'Bagian baru',
      description: '',
      images: [],
      buttons: [],
      width: 'full',
      align: 'left',
      appearance: 'card'
    };
    if (type === 'button' || type === 'feature') item.buttons = [{ label: 'Selengkapnya', href: 'registration.html' }];
    arr.push(item);
    mark();
    choose(id);
    message('Konten ditambahkan. Pilih kartu untuk mengedit isinya.');
  }
  async function remove(id) {
    if (!await SSCNotice.confirm('Hapus kartu ini dari Homepage?', { danger: true, confirmText: 'Hapus kartu' })) return;
    const arr = state.settings.homeLayout, i = arr.findIndex(x => x.id === id);
    if (i < 0 || arr[i].kind !== 'custom') return;
    arr.splice(i, 1);
    activeId = '';
    mark();
    paint();
  }
  function livePreviewFor(item) {
    if (item.kind === 'builtin') return builtin(item.id)?.help || 'Bagian Homepage';
    const parts = [];
    if (item.description) parts.push(item.description);
    if ((item.images || []).length) parts.push((item.images || []).length + ' gambar');
    if ((item.buttons || []).length) parts.push((item.buttons || []).length + ' tombol');
    return parts.join(' · ') || 'Klik untuk mengatur isi';
  }
  function clearIndicators() {
    for (const n of list.querySelectorAll('.is-drop-before,.is-drop-after,.is-dragging')) n.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging');
  }
  function dropMarkers() {
    for (const n of list.querySelectorAll('.is-drop-before,.is-drop-after')) n.classList.remove('is-drop-before', 'is-drop-after');
  }
  function startGhost(d) {
    const source = list.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
    if (!source) return;
    const bounds = source.getBoundingClientRect();
    d.left = bounds.left;
    d.top = bounds.top;
    d.width = bounds.width;
    const ghost = source.querySelector('.home-builder-card-bar')?.cloneNode(true) || source.cloneNode(true);
    ghost.className = 'home-builder-drag-ghost';
    ghost.style.width = bounds.width + 'px';
    ghost.style.left = bounds.left + 'px';
    ghost.style.top = bounds.top + 'px';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('button').forEach(b => {
      b.tabIndex = -1;
    });
    document.body.append(ghost);
    d.ghost = ghost;
    source.classList.add('is-dragging');
  }
  function pointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dist = Math.hypot(e.clientY - drag.y, e.clientX - drag.x);
    if (dist < 6 && !drag.started) return;
    if (!drag.started) {
      drag.started = true;
      startGhost(drag);
    }
    e.preventDefault();
    const d = drag;
    if (d.ghost) d.ghost.style.transform = `translate3d(${e.clientX - d.x}px,${e.clientY - d.y}px,0) rotate(-.8deg)`;
    dropMarkers();
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.home-builder-card[data-id]');
    d.target = null;
    if (target && list.contains(target) && target.dataset.id !== d.id) {
      d.target = target.dataset.id;
      const rect = target.getBoundingClientRect();
      d.after = e.clientY > rect.top + rect.height / 2;
      target.classList.add(d.after ? 'is-drop-after' : 'is-drop-before');
    }
    if (e.clientY < 85) window.scrollBy(0, -13); else if (e.clientY > window.innerHeight - 85) window.scrollBy(0, 13);
  }
  function removeGhost(d) {
    if (!d?.ghost) return;
    const node = d.ghost;
    if (!prefersReduced.matches && node.animate) {
      const a = node.animate([{ opacity: 1, transform: node.style.transform }, { opacity: 0, transform: node.style.transform + ' scale(.96)' }], { duration: 175, easing: 'ease-out' });
      a.onfinish = () => node.remove();
      setTimeout(() => node.remove(), 300);
    } else node.remove();
  }
  function pointerEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    document.removeEventListener('pointermove', pointerMove);
    document.removeEventListener('pointerup', pointerEnd);
    document.removeEventListener('pointercancel', pointerCancel);
    drag = null;
    removeGhost(d);
    clearIndicators();
    if (d.started && d.target) reorder(d.id, d.target, d.after);
  }
  function pointerCancel() {
    const d = drag;
    drag = null;
    document.removeEventListener('pointermove', pointerMove);
    document.removeEventListener('pointerup', pointerEnd);
    document.removeEventListener('pointercancel', pointerCancel);
    removeGhost(d);
    clearIndicators();
  }
  function attachDrag(handle, id) {
    handle.type = 'button';
    handle.setAttribute('aria-label', 'Tahan dan seret kartu untuk mengubah urutan');
    handle.title = 'Seret kartu';
    handle.draggable = false;
    handle.addEventListener('pointerdown', e => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || drag) return;
      drag = {
        id,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        target: null,
        after: false,
        started: false,
        ghost: null
      };
      e.preventDefault();
      document.addEventListener('pointermove', pointerMove, { passive: false });
      document.addEventListener('pointerup', pointerEnd);
      document.addEventListener('pointercancel', pointerCancel);
    });
  }
  function animateReorder(previous) {
    if (prefersReduced.matches) return;
    requestAnimationFrame(() => {
      for (const card of list.querySelectorAll('.home-builder-card[data-id]')) {
        const before = previous.get(card.dataset.id);
        if (!before) continue;
        const now = card.getBoundingClientRect();
        const dx = before.left - now.left, dy = before.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) < 1) continue;
        card.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 290, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
  }
  function field(parent, label, value, onChange, opt = {}) {
    const wrap = el('label', 'home-builder-field');
    wrap.append(el('span', 'field-label', label));
    let input;
    if (opt.options) {
      input = el('select');
      for (const [value, title] of opt.options) {
        const o = el('option', '', title);
        o.value = value;
        input.append(o);
      }
      input.value = value || opt.options[0][0];
      input.addEventListener('change', () => onChange(input.value));
    }
    else if (opt.multi) {
      input = el('textarea');
      input.rows = 3;
      input.maxLength = opt.max || 1400;
      input.value = value || '';
      input.addEventListener('input', () => onChange(input.value));
    }
    else {
      input = el('input');
      input.type = 'text';
      input.value = value || '';
      input.maxLength = opt.max || 350;
      input.placeholder = opt.placeholder || '';
      input.addEventListener('input', () => onChange(input.value));
    }
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function subheading(parent, title, help) {
    const heading = el('div', 'home-builder-subheading');
    heading.append(el('strong', '', title));
    if (help) heading.append(el('small', '', help));
    parent.append(heading);
    return heading;
  }
  function fieldRow(parent, items) {
    const grid = el('div', 'home-builder-fields-grid');
    parent.append(grid);
    for (const args of items) field(grid, ...args);
  }
  function editor(item) {
    const body = el('div', 'home-builder-card-editor');
    const change = (key, val) => {
      item[key] = val;
      mark();
      const name = list.querySelector(`[data-id="${CSS.escape(item.id)}"] .home-builder-card-title`);
      if (name && key === 'title') name.textContent = val || TYPES[item.type]?.[1] || 'Kartu baru';
      const sub = list.querySelector(`[data-id="${CSS.escape(item.id)}"] .home-builder-card-desc`);
      if (sub) sub.textContent = livePreviewFor(item);
    };
    field(body, 'Judul kartu', item.title, v => change('title', v), { max: 160, placeholder: 'Masukkan judul bagian' });
    if (item.type !== 'divider') field(body, 'Teks / deskripsi', item.description, v => change('description', v), { multi: true, max: 1400 });
    if (item.type !== 'divider') {
      const imagesArea = el('div', 'home-builder-subsection');
      subheading(imagesArea, 'Gambar dalam kartu', 'Kamu bisa menambahkan beberapa gambar.');
      function refreshImages() {
        imagesArea.querySelectorAll('.home-builder-media-row').forEach(n => n.remove());
        for (const [i, img] of (item.images || []).entries()) {
          const row = el('div', 'home-builder-media-row'), thumbnail = el('img');
          thumbnail.src = img.src;
          thumbnail.alt = 'Foto ' + (i + 1);
          row.append(thumbnail);
          const fields = el('div', 'home-builder-media-fields');
          field(fields, 'Keterangan foto ' + (i + 1), img.caption, v => {
            img.caption = v;
            mark();
          }, { max: 240 });
          row.append(fields);
          const del = el('button', 'home-builder-mini', '×');
          del.type = 'button';
          del.title = 'Hapus gambar dari kartu';
          del.onclick = () => {
            item.images.splice(i, 1);
            mark();
            refreshImages();
            updateCardSummary(item);
          };
          row.append(del);
          imagesArea.insertBefore(row, addControls);
        }
        window.SSCircleSort?.attach(imagesArea, {
          item: '.home-builder-media-row',
          onMove: (from, to) => {
            item.images.splice(to, 0, item.images.splice(from, 1)[0]);
            mark();
            refreshImages();
          }
        });
      }
      const addControls = el('div', 'home-builder-media-controls');
      const uploadBtn = el('label', 'button secondary home-builder-upload', '+ Tambah gambar');
      const upload = el('input');
      upload.type = 'file';
      upload.accept = 'image/jpeg,image/png,image/webp,image/gif';
      upload.hidden = true;
      const uploadFeedback = el('small', 'field-help');
      uploadBtn.append(upload);
      upload.addEventListener('change', async () => {
        const file = upload.files?.[0];
        if (!file) return;
        if (item.images.length >= 8) {
          uploadFeedback.textContent = 'Maksimal 8 gambar per kartu.';
          return;
        }
        upload.disabled = true;
        uploadFeedback.textContent = 'Mengunggah gambar...';
        try {
          const result = await SSCircle.uploadImage(file);
          item.images.push({ src: '/api/media/' + result.id, caption: '' });
          mark();
          refreshImages();
          updateCardSummary(item);
          uploadFeedback.textContent = 'Gambar ditambahkan.';
        } catch (e) {
          uploadFeedback.textContent = 'Gagal menambahkan gambar: ' + e.message;
        } finally {
          upload.disabled = false;
          upload.value = '';
        }
      });
      const gallerySelect = el('select');
      gallerySelect.setAttribute('aria-label', 'Pilih gambar dari galeri');
      const first = el('option', '', 'Atau pilih gambar galeri');
      first.value = '';
      gallerySelect.append(first);
      for (const photo of state.settings.homeGallery || []) {
        if (!photo.src) continue;
        const option = el('option', '', photo.title || 'Foto SSCircle');
        option.value = photo.src;
        gallerySelect.append(option);
      }
      gallerySelect.addEventListener('change', () => {
        if (!gallerySelect.value) return;
        if (item.images.length >= 8) {
          uploadFeedback.textContent = 'Maksimal 8 gambar per kartu.';
          gallerySelect.value = '';
          return;
        }
        item.images.push({ src: gallerySelect.value, caption: '' });
        gallerySelect.value = '';
        mark();
        refreshImages();
        updateCardSummary(item);
      });
      addControls.append(uploadBtn, gallerySelect, uploadFeedback);
      addControls.hidden = true;
      imagesArea.append(addControls);
      SSCircleImagePicker.mount(imagesArea, {
        title: 'Tambahkan gambar pada kartu', count: () => item.images.length, max: 8,
        onAdd: src => {
          item.images.push({ src, caption: '' });
          mark(); refreshImages(); updateCardSummary(item);
        }
      });
      refreshImages();
      body.append(imagesArea);
      const buttonsArea = el('div', 'home-builder-subsection');
      subheading(buttonsArea, 'Tombol dalam kartu', 'Tambahkan tombol dengan nama dan link masing-masing.');
      function refreshButtons() {
        buttonsArea.querySelectorAll('.home-builder-button-row').forEach(n => n.remove());
        for (const [i, b] of (item.buttons || []).entries()) {
          const row = el('div', 'home-builder-button-row');
          const group = el('div', 'home-builder-button-fields');
          field(group, 'Nama tombol ' + (i + 1), b.label, v => {
            b.label = v;
            mark();
          }, { max: 90 });
          field(group, 'Alamat tombol', b.href, v => {
            b.href = v;
            mark();
          }, { max: 500, placeholder: 'registration.html atau https://...' });
          row.append(group);
          const del = el('button', 'home-builder-mini', '×');
          del.type = 'button';
          del.title = 'Hapus tombol';
          del.onclick = () => {
            item.buttons.splice(i, 1);
            mark();
            refreshButtons();
            updateCardSummary(item);
          };
          row.append(del);
          buttonsArea.insertBefore(row, addButton);
        }
        window.SSCircleSort?.attach(buttonsArea, {
          item: '.home-builder-button-row',
          onMove: (from, to) => {
            item.buttons.splice(to, 0, item.buttons.splice(from, 1)[0]);
            mark();
            refreshButtons();
          }
        });
      }
      const addButton = el('button', 'button secondary', '+ Tambah tombol');
      addButton.type = 'button';
      addButton.onclick = () => {
        if (item.buttons.length >= 8) return message('Maksimal 8 tombol dalam satu kartu.');
        item.buttons.push({ label: 'Tombol baru', href: 'registration.html' });
        mark();
        refreshButtons();
        updateCardSummary(item);
      };
      buttonsArea.append(addButton);
      refreshButtons();
      body.append(buttonsArea);
      const layout = el('div', 'home-builder-subsection');
      subheading(layout, 'Tampilan kartu');
      fieldRow(layout, [
        ['Lebar', item.width, v => change('width', v), { options: [['full', 'Lebar penuh'], ['half', 'Setengah lebar']] }],
        ['Perataan', item.align, v => change('align', v), { options: [['left', 'Rata kiri'], ['center', 'Rata tengah']] }],
        ['Gaya', item.appearance, v => change('appearance', v), { options: [['card', 'Kartu'], ['plain', 'Tanpa latar']] }]
      ]);
      body.append(layout);
    }
    const del = el('button', 'button secondary home-builder-delete', 'Hapus kartu ini');
    del.type = 'button';
    del.onclick = () => remove(item.id);
    body.append(del);
    return body;
  }
  function updateCardSummary(item) {
    const node = list.querySelector(`[data-id="${CSS.escape(item.id)}"] .home-builder-card-desc`);
    if (node) node.textContent = livePreviewFor(item);
  }
  function parkEditors() {
    for (const sections of Object.values(editors)) for (const section of sections) if (section.parentNode !== parking) parking.append(section);
  }
  function pinnedCard(id, title, description) {
    const card = el('article', 'home-builder-card home-builder-pinned' + (activeId === id ? ' is-selected' : ''));
    card.dataset.pinned = id;
    const glyph = el('span', 'home-builder-glyph', id === 'intro' ? '✦' : '◈'), copy = el('div', 'home-builder-card-copy');
    copy.append(el('strong', '', title), el('small', '', description));
    const button = el('button', 'home-builder-select', activeId === id ? 'Tutup' : 'Atur');
    button.type = 'button';
    button.setAttribute('aria-expanded', String(activeId === id));
    button.onclick = () => {
      activeId = activeId === id ? '' : id;
      paint();
    };
    const bar = el('div', 'home-builder-card-bar');
    bar.append(glyph, copy, button);
    card.append(bar);
    card.addEventListener('click', e => {
      if (e.target.closest('button,input,textarea,select,label')) return;
      if (activeId !== id) {
        activeId = id;
        paint();
      }
    });
    if (activeId === id) mountSections(card, id);
    return card;
  }
  function mountSections(card, id) {
    const group = editors[id] || [];
    for (const section of group) {
      card.append(section);
      if (id !== 'intro' || section === group[0]) {
        section.classList.remove('is-collapsed');
        section.querySelector('.home-admin-section-toggle')?.setAttribute('aria-expanded', 'true');
      }
    }
  }
  function paint() {
    if (!list) return;
    parkEditors();
    list.replaceChildren();
    if (introCard) {
      introCard.replaceWith(pinnedCard('intro', 'Pembukaan & Pendaftaran', 'Video cinematic, sambutan, dan status pendaftaran'));
      introCard = document.querySelector('[data-pinned="intro"]');
    }
    if (designCard) {
      designCard.replaceWith(pinnedCard('design', 'Warna, logo & opening', 'Tema website, gradasi, dan identitas'));
      designCard = document.querySelector('[data-pinned="design"]');
    }
    const arr = state.settings.homeLayout;
    for (const [i, item] of arr.entries()) {
      const fixed = item.kind === 'builtin',
        card = el('article', 'home-builder-card' + (fixed ? ' home-builder-builtin' : '') + (activeId === item.id ? ' is-selected' : ''));
      card.dataset.id = item.id;
      const handle = el('button', 'home-builder-handle', '⠿');
      attachDrag(handle, item.id);
      const number = el('span', 'home-builder-counter', String(i + 1).padStart(2, '0'));
      const glyph = el('span', 'home-builder-glyph', fixed ? '▣' : TYPES[item.type]?.[0] || '▧');
      const title = el('strong', 'home-builder-card-title', fixed ? builtin(item.id)?.title : item.title || TYPES[item.type]?.[1] || 'Kartu baru');
      const desc = el('small', 'home-builder-card-desc', livePreviewFor(item));
      const name = el('div', 'home-builder-card-copy');
      name.append(title, desc);
      const select = el('button', 'home-builder-select', activeId === item.id ? 'Tutup' : 'Atur');
      select.type = 'button';
      select.setAttribute('aria-expanded', String(activeId === item.id));
      select.onclick = () => {
        activeId = activeId === item.id ? '' : item.id;
        paint();
      };
      const bar = el('div', 'home-builder-card-bar');
      bar.append(handle, number, glyph, name, select);
      const arrows = el('div', 'home-builder-arrows');
      for (const [label, offset] of [['↑', -1], ['↓', 1]]) {
        const btn = el('button', 'home-builder-mini', label);
        btn.type = 'button';
        btn.setAttribute('aria-label', offset < 0 ? 'Geser ke atas' : 'Geser ke bawah');
        btn.disabled = (offset < 0 && i === 0) || (offset > 0 && i === arr.length - 1);
        btn.onclick = () => moveDelta(item.id, offset);
        arrows.append(btn);
      }
      bar.append(arrows);
      card.append(bar);
      card.addEventListener('click', e => {
        if (e.target.closest('button,input,textarea,select,label')) return;
        if (activeId !== item.id) {
          activeId = item.id;
          paint();
        }
      });
      if (activeId === item.id) {
        if (fixed) {
          mountSections(card, item.id);
        } else card.append(editor(item));
      }
      list.append(card);
    }
    if (activeId) {
      const card = list.querySelector(`[data-id="${CSS.escape(activeId)}"]`);
      if (card) {
        card.classList.add('is-selected');
      }
    }
  }
  function resizeFrame() {
    if (!frame || !frameShell) return;
    const width = view === 'mobile' ? 390 : 1280;
    const available = Math.max(240, frameShell.clientWidth - 24);
    const scale = Math.min(1, available / width);
    const height = view === 'mobile' ? 860 : 900;
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.transform = `scale(${scale})`;
    frameShell.style.height = Math.min(view === 'mobile' ? 640 : 620, height * scale + 10) + 'px';
  }
  function updatePreview() {
    if (!frame || !state) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        frame.contentWindow?.postMessage({ type: 'ssc-preview-settings', settings: clone(state.settings) }, location.origin);
      } catch { }
    }, 90);
  }
  function previewPanel() {
    panel = el('section', 'home-builder-preview-panel');
    panel.id = 'home-live-preview';
    const top = el('div', 'home-builder-preview-top');
    const heading = el('div', '');
    heading.append(el('strong', '', 'Pratinjau langsung'), el('small', '', 'Lihat tampilan Homepage sebelum perubahan disimpan.'));
    previewStatus = el('span', 'home-preview-connection', 'Menyambungkan pratinjau...');
    top.append(heading, previewStatus);
    const controls = el('div', 'home-builder-view-controls');
    for (const [value, label] of [['desktop', 'Desktop'], ['mobile', 'HP']]) {
      const btn = el('button', 'home-builder-mini' + (view === value ? ' is-active' : ''), label);
      btn.type = 'button';
      btn.onclick = () => {
        view = value;
        controls.querySelectorAll('button').forEach(n => n.classList.toggle('is-active', n === btn));
        resizeFrame();
      };
      controls.append(btn);
    }
    const refresh = el('button', 'home-builder-mini home-preview-reload', '↻ Muat ulang');
    refresh.type = 'button';
    refresh.onclick = () => {
      previewStatus.textContent = 'Memuat ulang pratinjau...';
      frame.src = './?ssc_preview=1&r=' + Date.now();
    };
    controls.append(refresh);
    const expand = el('button', 'home-builder-mini home-preview-expand', '⛶ Layar penuh');
    expand.type = 'button';
    expand.onclick = () => frameShell.requestFullscreen?.();
    controls.append(expand);
    const toggle = el('button', 'home-builder-mini home-builder-preview-toggle', 'Sembunyikan pratinjau');
    toggle.type = 'button';
    toggle.onclick = () => {
      panel.classList.toggle('is-collapsed');
      toggle.textContent = panel.classList.contains('is-collapsed') ? 'Tampilkan pratinjau' : 'Sembunyikan pratinjau';
      if (!panel.classList.contains('is-collapsed')) requestAnimationFrame(resizeFrame);
    };
    controls.append(toggle);
    frameShell = el('div', 'home-builder-preview-viewport');
    frameShell.addEventListener('fullscreenchange', resizeFrame);
    frame = el('iframe', 'home-builder-preview-iframe');
    frame.title = 'Pratinjau Homepage SSCircle';
    frame.scrolling = 'yes';
    frame.loading = 'eager';
    frame.src = './?ssc_preview=1';
    frame.addEventListener('load', () => {
      updatePreview();
      resizeFrame();
    });
    frameShell.append(frame);
    panel.append(top, controls, frameShell);
    requestAnimationFrame(resizeFrame);
    return panel;
  }
  function render(data, onChanged, linkedEditors = {}) {
    state = data;
    changed = onChanged;
    normalize();
    const root = document.getElementById('home-admin-editor');
    if (!root) return;
    document.querySelector('.home-builder-section')?.remove();
    parking = document.createDocumentFragment();
    editors = linkedEditors;
    for (const sections of Object.values(editors)) for (const section of sections) parking.append(section);
    activeId = '';
    const section = el('section', 'home-admin-section home-builder-section');
    section.id = 'home-builder-section';
    const heading = el('div', 'home-builder-heading');
    heading.append(el('div', 'overline', 'SUSUNAN HOMEPAGE'), el('h2', '', 'Atur bagian dan konten'), el('p', '', 'Klik kartu untuk mengatur. Seret pegangan ⠿ untuk mengubah urutan.'));
    const addBar = el('div', 'home-builder-add');
    for (const [type, [icon, label]] of Object.entries(TYPES)) {
      const b = el('button', 'button secondary', icon + '  ' + label);
      b.type = 'button';
      b.onclick = () => add(type);
      addBar.append(b);
    }
    notice = el('p', 'home-builder-notice');
    notice.setAttribute('role', 'status');
    list = el('div', 'home-builder-list');
    const tools = el('div', 'home-builder-tools');
    tools.append(el('h3', '', 'Tambah konten baru'), addBar);
    introCard = pinnedCard('intro', 'Pembukaan & Pendaftaran', 'Video cinematic, sambutan, dan status pendaftaran');
    designCard = pinnedCard('design', 'Warna, logo & opening', 'Tema website, gradasi, dan identitas');
    const workspace = el('div', 'home-builder-workspace');
    const editColumn = el('div', 'home-builder-edit-column');
    editColumn.append(introCard, tools, notice, list, designCard);
    workspace.append(editColumn, previewPanel());
    section.append(heading, workspace);
    root.prepend(section);
    paint();
    if ('ResizeObserver' in window) new ResizeObserver(resizeFrame).observe(frameShell);
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
      if (event.data?.type === 'ssc-preview-ready') {
        previewStatus.textContent = 'Pratinjau aktif';
        previewStatus.classList.add('is-ready');
        updatePreview();
      } else if (event.data?.type === 'ssc-preview-applied') {
        previewStatus.textContent = 'Pratinjau aktif';
        previewStatus.classList.add('is-ready');
      }
    });
    window.setTimeout(() => {
      if (previewStatus && !previewStatus.classList.contains('is-ready')) previewStatus.textContent = 'Pratinjau belum tampil. Gunakan Muat ulang.';
    }, 4800);
    updatePreview();
  }
  return { render, updatePreview };
})();
