/* SSCircle Server V10.5 Homepage Control. Uses the existing authenticated form save API. */

// Pengaturan konten Homepage dari Admin Control.

'use strict';
window.SSCircleHomeAdmin = (() => {
  let state = null, notifyDirty = () => { };
  const root = () => document.getElementById('home-admin-editor');
  const node = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls)
      e.className = cls;
    if (value !== undefined)
      e.textContent = value;
    return e;
  };
  const section = (name, help) => {
    const box = node('section', 'home-admin-section');
    const toggle = node('button', 'home-admin-section-toggle');
    toggle.type = 'button';
    const copy = node('span', 'home-admin-section-heading');
    copy.append(node('strong', '', name), node('small', '', help));
    const arrow = node('span', 'home-admin-section-arrow', '⌄');
    toggle.append(copy, arrow);
    box.append(toggle);
    const expanded = name.startsWith('01 ·');
    box.classList.toggle('is-collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.onclick = () => {
      box.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!box.classList.contains('is-collapsed')));
    };
    root().append(box);
    return box;
  };
  function changed() {
    notifyDirty();
    setStatus();
    window.SSCircleHomepageBuilder?.updatePreview();
  }
  function textField(container, key, label, { textarea = false, placeholder = '', hint = '' } = {}) {
    const wrap = node('label', 'field-group'), lab = node('span', 'field-label', label);
    const input = node(textarea ? 'textarea' : 'input');
    if (!textarea)
      input.type = 'text';
    else
      input.rows = 3;
    input.value = state.settings[key] ?? '';
    input.placeholder = placeholder;
    input.maxLength = textarea ? 1400 : 350;
    input.oninput = () => {
      state.settings[key] = input.value;
      changed();
    };
    wrap.append(lab, input);
    if (hint)
      wrap.append(node('small', 'field-help', hint));
    container.append(wrap);
    return input;
  }
  function formGrid(box, fields) {
    const grid = node('div', 'home-admin-grid');
    for (const [key, label, type] of fields)
      textField(grid, key, label, { textarea: type === 'textarea' });
    box.append(grid);
  }
  function toggle(box, key, title, help) {
    const row = node('label', 'toggle-row'), input = node('input');
    input.type = 'checkbox';
    input.checked = state.settings[key] !== false;
    input.onchange = () => {
      state.settings[key] = input.checked;
      changed();
      if (key === 'open') {
        const old = document.getElementById('form-open');
        if (old)
          old.checked = input.checked;
      }
    };
    const deco = node('span', 'toggle-visual');
    deco.setAttribute('aria-hidden', 'true');
    const copy = node('span');
    copy.append(node('strong', '', title), node('small', '', help));
    row.append(input, deco, copy);
    box.append(row);
    return input;
  }
  function helpButton(container, label, callback) {
    const b = node('button', 'button secondary', label);
    b.type = 'button';
    b.onclick = callback;
    container.append(b);
    return b;
  }
  function imageUrl(src) {
    return SSCircleImagePicker.valid(src) ? src : 'assets/gallery/sscircle-01.webp';
  }
  function posterControls(box) {
    const preview = node('img', 'home-admin-poster-preview');
    const update = () => {
      preview.src = imageUrl(state.settings.homePoster);
    };
    update();
    box.append(preview);
    const fields = node('div', 'home-admin-grid');
    const pick = node('label', 'field-group');
    pick.append(node('span', 'field-label', 'Gambar cadangan jika video tidak tersedia'));
    const select = node('select');
    const options = [
      ['assets/gallery/sscircle-01.webp', 'Foto pertama (bawaan)'],
      ...(state.settings.homeGallery || []).filter(g => g.src).map((g, i) => [g.src, (i + 1) + '. ' + (g.title || 'Gambar galeri')])
    ];
    const seen = new Set();
    for (const [value, label] of options) {
      if (seen.has(value))
        continue;
      seen.add(value);
      const opt = node('option', '', label);
      opt.value = value;
      select.append(opt);
    }
    select.value = state.settings.homePoster || 'assets/gallery/sscircle-01.webp';
    select.onchange = () => {
      state.settings.homePoster = select.value;
      update();
      changed();
    };
    pick.append(select);
    fields.append(pick);
    const custom = node('label', 'field-group');
    custom.append(node('span', 'field-label', 'Atau upload foto baru'));
    const upload = node('input');
    upload.type = 'file';
    upload.accept = 'image/jpeg,image/png,image/webp,image/gif';
    const status = node('small', 'field-help', 'Gambar otomatis dioptimalkan agar ringan.');
    upload.onchange = async () => {
      const file = upload.files?.[0];
      if (!file)
        return;
      status.textContent = 'Mengunggah gambar...';
      upload.disabled = true;
      try {
        const item = await SSCircle.uploadImage(file);
        state.settings.homePoster = '/api/media/' + item.id;
        update();
        changed();
        status.textContent = '✓ Foto berhasil dipilih. Simpan Homepage untuk menerapkan.';
      }
      catch (e) {
        status.textContent = 'Gagal upload: ' + e.message;
      }
      finally {
        upload.disabled = false;
        upload.value = '';
      }
    };
    custom.append(upload, status);
    fields.append(custom);
    fields.hidden = true; // Original input retained for old state; the shared picker is the visible editor.
    box.append(fields);
    SSCircleImagePicker.mount(box, {
      title: 'Poster / gambar cadangan', current: () => state.settings.homePoster,
      onSelect: src => { state.settings.homePoster = src; update(); changed(); }
    });
  }
  function aboutTagsEditor(box) {
    toggle(box, 'homeAboutTagsEnabled', 'Tampilkan label kecil Tentang Server', 'Label tersusun otomatis ke samping, lalu ke baris baru jika ruang tidak cukup.');
    const container = node('div', 'home-admin-about-tags');
    const controls = node('div', 'home-admin-gallery-add');
    const presets = [
      ['✧', 'Survival Community'], ['✧', 'Java & Bedrock'],
      ['✧', 'Petualangan Bersama'], ['✦', 'Event Komunitas'],
      ['✧', 'Build & Explore'], ['✦', 'Vanilla SMP']
    ];
    const ensure = () => {
      if (!Array.isArray(state.settings.homeAboutTags))
        state.settings.homeAboutTags = [
          { symbol: '✧', text: 'Survival Community' },
          { symbol: '✧', text: 'Java & Bedrock' },
          { symbol: '✧', text: 'Petualangan Bersama' }
        ];
      return state.settings.homeAboutTags;
    };
    function redraw() {
      container.replaceChildren();
      ensure().forEach((item, index) => {
        const card = node('div', 'home-admin-about-tag-row');
        // Drag icon is created by SSCircleSort; an extra glyph would appear twice.
        const drag = node('span', 'home-admin-tag-drag');
        drag.title = 'Seret untuk mengurutkan';
        const symbol = node('input');
        symbol.type = 'text';
        symbol.maxLength = 8;
        symbol.value = item.symbol ?? '✧';
        symbol.placeholder = '✧';
        symbol.setAttribute('aria-label', 'Simbol label ' + (index + 1));
        symbol.oninput = () => { item.symbol = symbol.value; changed(); };
        const text = node('input');
        text.type = 'text';
        text.maxLength = 65;
        text.value = item.text || '';
        text.placeholder = 'Teks label';
        text.setAttribute('aria-label', 'Teks label ' + (index + 1));
        text.oninput = () => { item.text = text.value; changed(); };
        const up = helpButton(card, '↑', () => {
          if (!index)
            return;
          [ensure()[index - 1], ensure()[index]] = [ensure()[index], ensure()[index - 1]];
          changed();
          redraw();
        });
        up.title = 'Naikkan urutan';
        up.disabled = index === 0;
        const down = helpButton(card, '↓', () => {
          if (index >= ensure().length - 1)
            return;
          [ensure()[index + 1], ensure()[index]] = [ensure()[index], ensure()[index + 1]];
          changed();
          redraw();
        });
        down.title = 'Turunkan urutan';
        down.disabled = index === ensure().length - 1;
        const remove = helpButton(card, 'Hapus', () => { ensure().splice(index, 1); changed(); redraw(); });
        remove.title = 'Hapus label';
        card.prepend(drag, symbol, text);
        container.append(card);
      });
      window.SSCircleSort?.attach(container, {
        item: '.home-admin-about-tag-row', handleTarget: '.home-admin-tag-drag',
        onMove: (from, to) => {
          const entries = ensure();
          entries.splice(to, 0, entries.splice(from, 1)[0]);
          changed();
          redraw();
        }
      });
    }
    helpButton(controls, '+ Tambah label', () => {
      if (ensure().length >= 16)
        return SSCNotice.alert('Maksimal 16 label Tentang Server.');
      ensure().push({ symbol: '✧', text: 'Label baru' });
      changed();
      redraw();
    });
    const select = node('select');
    select.setAttribute('aria-label', 'Pilih contoh label Tentang Server');
    select.append(node('option', '', 'Pilih contoh label...'));
    for (const [symbol, label] of presets) {
      const opt = node('option', '', label);
      opt.value = label;
      opt.dataset.symbol = symbol;
      select.append(opt);
    }
    select.onchange = () => {
      if (!select.value)
        return;
      if (ensure().length >= 16)
        return SSCNotice.alert('Maksimal 16 label Tentang Server.');
      ensure().push({ symbol: select.selectedOptions[0].dataset.symbol, text: select.value });
      select.value = '';
      changed();
      redraw();
    };
    controls.append(select);
    box.append(node('h3', 'home-admin-subheading', 'Label informasi singkat'));
    box.append(node('p', 'field-help', 'Setiap label memiliki simbol dan teks sendiri. Bisa ditambah, dihapus, diurutkan, dan terlihat langsung di preview.'));
    box.append(controls, container);
    redraw();
  }
  function galleryEditor(box) {
    const container = node('div', 'home-admin-gallery'), toolbar = node('div', 'home-admin-gallery-add');
    box.append(toolbar, container);
    function redraw() {
      container.replaceChildren();
      const gallery = state.settings.homeGallery || [];
      gallery.forEach((item, index) => {
        const row = node('div', 'home-admin-gallery-row home-admin-gallery-photo-row');
        const img = node('img');
        img.src = imageUrl(item.src);
        img.alt = 'Pratinjau foto';
        img.loading = 'lazy';
        const fields = node('div', 'home-admin-gallery-row-inputs');
        for (const [key, placeholder] of [['title', 'Judul foto'], ['caption', 'Deskripsi foto']]) {
          const input = node('input');
          input.type = 'text';
          input.placeholder = placeholder;
          input.value = item[key] || '';
          input.maxLength = key === 'title' ? 110 : 280;
          input.setAttribute('aria-label', placeholder + ' ' + (index + 1));
          input.oninput = () => {
            item[key] = input.value;
            changed();
          };
          fields.append(input);
        }
        const actions = node('div', 'home-admin-gallery-actions');
        const buttons = [
          ['↑', () => {
              if (index > 0) {
                [gallery[index - 1], gallery[index]] = [gallery[index], gallery[index - 1]];
                changed();
                redraw();
              }
            }],
          ['↓', () => {
              if (index < gallery.length - 1) {
                [gallery[index + 1], gallery[index]] = [gallery[index], gallery[index + 1]];
                changed();
                redraw();
              }
            }],
          [
            'Hapus',
            async () => {
              if (!await SSCNotice.confirm('Hapus foto ini dari galeri Homepage?', { danger: true, confirmText: 'Hapus foto' }))
                return;
              gallery.splice(index, 1);
              changed();
              redraw();
            }
          ]
        ];
        for (const [label, run] of buttons)
          helpButton(actions, label, run);
        row.append(img, fields, actions);
        const changePhoto = node('details', 'ssc-image-row-details');
        changePhoto.append(node('summary', '', 'Ubah gambar / URL'));
        SSCircleImagePicker.mount(changePhoto, {
          compact: true, title: 'Ganti gambar Galeri', current: () => item.src,
          onSelect: src => { item.src = src; changed(); redraw(); }
        });
        row.append(changePhoto);
        container.append(row);
      });
      window.SSCircleSort?.attach(container, {
        item: '.home-admin-gallery-row',
        onMove: (from, to) => {
          gallery.splice(to, 0, gallery.splice(from, 1)[0]);
          changed();
          redraw();
        }
      });
    }
    helpButton(toolbar, '+ Tambahkan foto bawaan', () => {
      if (state.settings.homeGallery.length >= 24) {
        SSCNotice.alert('Galeri maksimal 24 foto.');
        return;
      }
      state.settings.homeGallery.push({ src: 'assets/gallery/sscircle-01.webp', title: 'Foto SSCircle', caption: '' });
      changed();
      redraw();
    });
    const uploadLabel = node('label', 'field-group');
    uploadLabel.append(node('span', 'field-label', 'Tambah foto dari perangkat'));
    const upload = node('input');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
    upload.multiple = true;
    const info = node('small', 'field-help', 'Setiap gambar otomatis dikompresi agar hemat ruang.');
    upload.onchange = async () => {
      const files = [...(upload.files || [])];
      if (!files.length)
        return;
      if (state.settings.homeGallery.length + files.length > 24) {
        info.textContent = 'Jumlah galeri maksimal 24 foto.';
        return;
      }
      upload.disabled = true;
      let count = 0;
      for (const file of files) {
        try {
          const result = await SSCircle.uploadImage(file);
          state.settings.homeGallery.push({ src: '/api/media/' + result.id, title: file.name.replace(/\.[^.]+$/, '').slice(0, 110), caption: '' });
          count++;
        }
        catch (e) {
          info.textContent = 'Gagal upload ' + file.name + ': ' + e.message;
          break;
        }
      }
      upload.value = '';
      upload.disabled = false;
      if (count)
        info.textContent = '✓ ' + count + ' foto ditambahkan. Klik Simpan untuk menerapkan.';
      changed();
      redraw();
    };
    uploadLabel.append(upload, info);
    uploadLabel.hidden = true;
    toolbar.append(uploadLabel);
    SSCircleImagePicker.mount(toolbar, {
      title: 'Tambah foto Galeri', count: () => state.settings.homeGallery.length, max: 24,
      onAdd: src => {
        state.settings.homeGallery.push({ src, title: 'Foto SSCircle', caption: '' });
        changed();
        redraw();
      }
    });
    redraw();
  }
  // Profil & Sejarah: each card owns its photo, headline and subtitle.
  function profileItemsEditor(box) {
    const settings = state.settings;
    if (!Array.isArray(settings.homeProfileItems)) {
      settings.homeProfileItems = [{
          src: settings.homeProfileImage || 'assets/sscircle-logo.png',
          title: 'SSCircle Server',
          subtitle: 'Profil & Sejarah'
        }];
    }
    const list = node('div', 'home-admin-profile-list');
    const toolbar = node('div', 'home-admin-profile-toolbar');
    const helper = node('p', 'field-help', 'Foto tersusun otomatis mengikuti lebar layar. Tambahkan animasi dan popup detail melalui menu per kartu. Gambar popup boleh berbeda dari gambar kecil. Maksimal 24 foto.');
    box.append(helper, toolbar, list);
    const sizeField = node('label', 'field-group');
    sizeField.append(node('span', 'field-label', 'Ukuran kartu foto (otomatis menyesuaikan layar)'));
    const sizeInput = node('select');
    for (const [value, title] of [
      ['compact', 'Kecil • lebih banyak foto per baris'],
      ['normal', 'Sedang • rekomendasi'],
      ['wide', 'Lebar • lebih sedikit foto per baris']
    ]) {
      const option = node('option', '', title);
      option.value = value;
      sizeInput.append(option);
    }
    sizeInput.value = settings.homeProfileCardSize || 'normal';
    sizeInput.onchange = () => {
      settings.homeProfileCardSize = sizeInput.value;
      changed();
    };
    sizeField.append(sizeInput);
    box.append(sizeField);
    const photoOptions = () => [
      ['assets/sscircle-logo.png', 'Logo SSCircle (bawaan)'],
      ['assets/sscircle-community-icon.png', 'Ikon komunitas (bawaan)'],
      ...(settings.homeGallery || []).filter(item => item.src).map((item, index) => [item.src, 'Galeri ' + (index + 1) + ' · ' + (item.title || 'Foto')])
    ];
    function redraw() {
      list.replaceChildren();
      const items = settings.homeProfileItems;
      items.forEach((item, index) => {
        const row = node('div', 'home-admin-profile-row');
        const preview = node('img', 'home-admin-profile-preview');
        preview.src = item.src || 'assets/sscircle-logo.png';
        preview.alt = 'Pratinjau foto profil ' + (index + 1);
        preview.loading = 'lazy';
        const fields = node('div', 'home-admin-profile-fields');
        const imgWrap = node('label', 'field-group');
        imgWrap.append(node('span', 'field-label', 'Foto ' + (index + 1)));
        const select = node('select');
        for (const [value, title] of photoOptions()) {
          if ([...select.options].some(option => option.value === value))
            continue;
          const option = node('option', '', title);
          option.value = value;
          select.append(option);
        }
        if (item.src && ![...select.options].some(option => option.value === item.src)) {
          const option = node('option', '', 'Foto upload pilihan');
          option.value = item.src;
          select.append(option);
        }
        select.value = item.src;
        select.onchange = () => {
          item.src = select.value;
          preview.src = item.src;
          changed();
        };
        imgWrap.append(select);
        for (const [field, title, max] of [
          ['title', 'Judul di bawah foto', 110],
          ['subtitle', 'Subjudul / keterangan di bawah foto', 240]
        ]) {
          const wrap = node('label', 'field-group');
          wrap.append(node('span', 'field-label', title));
          const input = node(field === 'subtitle' ? 'textarea' : 'input');
          if (field !== 'subtitle')
            input.type = 'text';
          else
            input.rows = 2;
          input.maxLength = max;
          input.value = item[field] || '';
          input.oninput = () => {
            item[field] = input.value;
            changed();
          };
          wrap.append(input);
          fields.append(wrap);
        }
        const fileWrap = node('label', 'field-group');
        fileWrap.append(node('span', 'field-label', 'Ganti dengan foto dari perangkat'));
        const upload = node('input');
        upload.type = 'file';
        upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
        const uploadHelp = node('small', 'field-help');
        upload.onchange = async () => {
          const file = upload.files?.[0];
          if (!file)
            return;
          upload.disabled = true;
          uploadHelp.textContent = 'Mengunggah foto...';
          try {
            const media = await SSCircle.uploadImage(file);
            item.src = '/api/media/' + media.id;
            changed();
            redraw();
          }
          catch (error) {
            uploadHelp.textContent = 'Gagal: ' + error.message;
          }
          finally {
            upload.disabled = false;
            upload.value = '';
          }
        };
        fileWrap.append(upload, uploadHelp);
        const photoSettings = node('details', 'home-admin-profile-media-settings');
        photoSettings.append(node('summary', '', 'Ubah foto ini'));
        imgWrap.hidden = true;
        fileWrap.hidden = true;
        photoSettings.append(imgWrap, fileWrap);
        SSCircleImagePicker.mount(photoSettings, {
          compact: true, title: 'Foto Profil / Sejarah ' + (index + 1), current: () => item.src,
          onSelect: src => { item.src = src; changed(); redraw(); }
        });
        fields.append(photoSettings);
        // Compact popup editor: switches, title and story remain easy to edit,
        // while the reusable image picker stays tucked away until needed.
        const detailSettings = node('details', 'home-admin-profile-detail-settings');
        const detailSummary = node('summary', '', 'Popup detail & cerita lengkap');
        const detailStatus = node('span', 'home-admin-profile-detail-status');
        const updateDetailStatus = () => {
          detailStatus.textContent = item.detailEnabled === true ? 'Aktif' : 'Nonaktif';
          detailStatus.classList.toggle('is-active', item.detailEnabled === true);
        };
        updateDetailStatus();
        detailSummary.append(detailStatus);
        detailSettings.append(detailSummary);
        const detailInner = node('div', 'home-admin-profile-detail-body');
        const switches = node('div', 'home-admin-profile-detail-switches');
        const detailToggle = node('label', 'home-admin-profile-detail-toggle');
        const detailCheck = node('input', 'home-admin-profile-detail-check');
        detailCheck.type = 'checkbox';
        detailCheck.checked = item.detailEnabled === true;
        detailCheck.onchange = () => {
          item.detailEnabled = detailCheck.checked;
          updateDetailStatus();
          changed();
        };
        detailToggle.append(detailCheck, node('span', '', 'Buka popup ketika kartu diklik'));
        switches.append(detailToggle);
        const descriptionToggle = node('label', 'home-admin-profile-detail-toggle');
        const descriptionCheck = node('input', 'home-admin-profile-detail-check');
        descriptionCheck.type = 'checkbox';
        descriptionCheck.checked = item.detailDescriptionEnabled !== false;
        descriptionToggle.append(descriptionCheck, node('span', '', 'Tampilkan cerita tambahan'));
        switches.append(descriptionToggle);
        detailInner.append(switches);
        const detailHeading = node('label', 'field-group');
        detailHeading.append(node('span', 'field-label', 'Judul popup (opsional)'));
        const detailTitle = node('input');
        detailTitle.type = 'text';
        detailTitle.maxLength = 160;
        detailTitle.placeholder = 'Pakai judul kartu jika kosong';
        detailTitle.value = item.detailTitle || '';
        detailTitle.oninput = () => { item.detailTitle = detailTitle.value; changed(); };
        detailHeading.append(detailTitle);
        detailInner.append(detailHeading);
        const detailTextLabel = node('label', 'field-group home-admin-profile-detail-story');
        detailTextLabel.append(node('span', 'field-label', 'Cerita lengkap / sejarah (maks. 3000 karakter)'));
        const detailText = node('textarea');
        detailText.rows = 3;
        detailText.maxLength = 3000;
        detailText.placeholder = 'Ceritakan profil, sejarah atau pencapaian...';
        detailText.value = item.detailDescription || '';
        detailText.oninput = () => { item.detailDescription = detailText.value; changed(); };
        detailTextLabel.append(detailText);
        detailInner.append(detailTextLabel);
        detailTextLabel.hidden = !descriptionCheck.checked;
        descriptionCheck.onchange = () => {
          item.detailDescriptionEnabled = descriptionCheck.checked;
          detailTextLabel.hidden = !descriptionCheck.checked;
          changed();
        };
        const detailImageArea = node('div', 'home-admin-profile-detail-image-controls');
        detailImageArea.append(node('span', 'field-label', 'Gambar popup (opsional)'));
        const detailImageHeader = node('div', 'home-admin-profile-detail-image-header');
        const detailImagePreview = node('img', 'home-admin-profile-detail-image-preview');
        detailImagePreview.src = item.detailImage || item.src;
        detailImagePreview.alt = 'Foto popup kartu ' + (index + 1);
        detailImagePreview.loading = 'lazy';
        detailImagePreview.onerror = () => {
          detailImagePreview.onerror = null;
          detailImagePreview.src = 'assets/sscircle-logo.png';
        };
        detailImageHeader.append(detailImagePreview);
        const detailImageInfo = node('div', 'home-admin-profile-detail-image-info');
        detailImageInfo.append(node('small', 'field-help', 'Rasio 5:6 · skin full body ditampilkan utuh.'));
        helpButton(detailImageInfo, 'Pakai foto kartu kecil', () => {
          item.detailImage = '';
          detailImagePreview.src = item.src;
          changed();
        });
        detailImageHeader.append(detailImageInfo);
        detailImageArea.append(detailImageHeader);
        const detailPicker = node('details', 'home-admin-profile-detail-image-picker');
        detailPicker.append(node('summary', '', 'Ganti gambar popup'));
        SSCircleImagePicker.mount(detailPicker, {
          compact: true,
          title: 'Gambar popup kartu ' + (index + 1),
          current: () => item.detailImage || item.src,
          onSelect: src => {
            item.detailImage = src;
            detailImagePreview.src = src;
            changed();
          }
        });
        detailImageArea.append(detailPicker);
        detailInner.append(detailImageArea);
        detailSettings.append(detailInner);
        fields.append(detailSettings);
        const actions = node('div', 'home-admin-profile-actions');
        helpButton(actions, '↑', () => {
          if (index <= 0)
            return;
          [items[index - 1], items[index]] = [items[index], items[index - 1]];
          changed();
          redraw();
        }).disabled = index === 0;
        helpButton(actions, '↓', () => {
          if (index >= items.length - 1)
            return;
          [items[index + 1], items[index]] = [items[index], items[index + 1]];
          changed();
          redraw();
        }).disabled = index === items.length - 1;
        helpButton(actions, 'Hapus', async () => {
          if (!await SSCNotice.confirm('Hapus foto ini dari Profil & Sejarah?', { danger: true, confirmText: 'Hapus foto' }))
            return;
          items.splice(index, 1);
          changed();
          redraw();
        });
        row.append(preview, fields, actions);
        list.append(row);
      });
      window.SSCircleSort?.attach(list, {
        item: '.home-admin-profile-row',
        onMove: (from, to) => {
          const moved = items.splice(from, 1)[0];
          items.splice(to, 0, moved);
          changed();
          redraw();
        }
      });
      if (!items.length)
        list.append(node('p', 'field-help', 'Belum ada foto Profil & Sejarah. Gunakan tombol tambah foto.'));
    }
    helpButton(toolbar, '+ Tambah foto', () => {
      if (settings.homeProfileItems.length >= 24) {
        SSCNotice.alert('Profil & Sejarah maksimal 24 foto.');
        return;
      }
      settings.homeProfileItems.push({ src: 'assets/sscircle-logo.png', title: '', subtitle: '' });
      changed();
      redraw();
    });
    const uploadMany = node('label', 'field-group');
    uploadMany.append(node('span', 'field-label', 'Tambahkan beberapa foto sekaligus'));
    const upload = node('input');
    upload.type = 'file';
    upload.multiple = true;
    upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
    const info = node('small', 'field-help', 'Gambar akan diunggah ke Penyimpanan Media.');
    upload.onchange = async () => {
      const files = [...(upload.files || [])];
      if (!files.length)
        return;
      if (settings.homeProfileItems.length + files.length > 24) {
        info.textContent = 'Maksimal 24 foto untuk Profil & Sejarah.';
        upload.value = '';
        return;
      }
      upload.disabled = true;
      let success = 0;
      try {
        for (const file of files) {
          try {
            const media = await SSCircle.uploadImage(file);
            settings.homeProfileItems.push({
              src: '/api/media/' + media.id,
              title: file.name.replace(/\.[^.]+$/, '').slice(0, 110),
              subtitle: ''
            });
            success++;
          }
          catch (error) {
            info.textContent = 'Gagal upload ' + file.name + ': ' + error.message;
            break;
          }
        }
      }
      finally {
        upload.disabled = false;
        upload.value = '';
        if (success) {
          changed();
          redraw();
          info.textContent = success + ' foto ditambahkan. Klik Simpan Homepage untuk menerapkan.';
        }
      }
    };
    uploadMany.append(upload, info);
    uploadMany.hidden = true;
    toolbar.append(uploadMany);
    SSCircleImagePicker.mount(toolbar, {
      title: 'Tambah foto Profil & Sejarah', count: () => settings.homeProfileItems.length, max: 24,
      onAdd: src => {
        settings.homeProfileItems.push({ src, title: '', subtitle: '' });
        changed();
        redraw();
      }
    });
    redraw();
  }
  function socialEditor(box) {
    const links = state.settings.homeSocialLinks;
    const heading = node('div', 'home-admin-social-summary');
    const headingCopy = node('div', '');
    headingCopy.append(node('h3', '', 'Tautan media sosial'), node('p', '', 'Atur nama, tujuan, logo dan lokasi tampil setiap tautan. Klik kartu untuk mengedit.'));
    const count = node('span', 'home-admin-social-count');
    const add = helpButton(heading, '+ Tambah tautan', () => {
      if (links.length >= 20)
        return SSCNotice.alert('Maksimal 20 tautan media sosial.');
      const id = 'social-' + crypto.randomUUID().slice(0, 8);
      links.push({
        id,
        title: 'Akun media sosial',
        description: '',
        url: 'https://',
        icon: 'assets/tiktok-logo.png',
        showHome: true,
        showRegistration: true
      });
      changed();
      redraw(id);
    });
    heading.prepend(headingCopy);
    heading.append(count);
    const list = node('div', 'home-admin-social-list');
    box.append(heading, list);
    function redraw(forceOpen) {
      const openIds = new Set([...list.querySelectorAll('details[open]')].map(d => d.dataset.linkId));
      if (forceOpen)
        openIds.add(forceOpen);
      list.replaceChildren();
      count.textContent = links.length + '/20 tautan';
      for (const [index, item] of links.entries()) {
        const card = node('details', 'home-admin-social-card');
        card.dataset.linkId = item.id || String(index);
        card.open = openIds.has(card.dataset.linkId);
        const summary = node('summary', 'home-admin-social-card-header');
        const preview = node('img', 'home-admin-social-icon');
        preview.src = item.icon || 'assets/tiktok-logo.png';
        preview.alt = '';
        preview.loading = 'lazy';
        const identity = node('span', 'home-admin-social-identity');
        const title = node('strong', '', item.title || 'Tautan baru');
        const url = node('small', '', item.url || 'Belum ada tautan');
        identity.append(title, url);
        const locations = node('span', 'home-admin-social-locations');
        const arrow = node('span', 'home-admin-social-expand', 'Ubah');
        arrow.setAttribute('aria-hidden', 'true');
        const markers = node('span', 'home-admin-social-markers');
        markers.append(locations, arrow);
        summary.append(preview, identity, markers);
        card.append(summary);
        function updateLocations() {
          locations.replaceChildren();
          for (const [key, text] of [['showHome', 'Homepage'], ['showRegistration', 'Registration']])
            if (item[key] === true)
              locations.append(node('small', 'home-admin-social-tag', text));
          if (!locations.children.length)
            locations.append(node('small', 'home-admin-social-tag muted', 'Disembunyikan'));
        }
        updateLocations();
        const body = node('div', 'home-admin-social-card-body');
        const primary = node('div', 'home-admin-social-primary');
        function inputField(key, label, { wide = false, placeholder = '' } = {}) {
          const wrap = node('label', 'field-group' + (wide ? ' full' : ''));
          wrap.append(node('span', 'field-label', label));
          const inp = node('input');
          inp.type = key === 'url' ? 'url' : 'text';
          inp.value = item[key] || '';
          inp.maxLength = key === 'url' ? 500 : key === 'description' ? 240 : 90;
          inp.placeholder = placeholder;
          inp.setAttribute('aria-label', label + ' ' + (index + 1));
          inp.addEventListener('input', () => {
            item[key] = inp.value;
            if (key === 'title')
              title.textContent = inp.value || 'Tautan baru';
            if (key === 'url')
              url.textContent = inp.value || 'Belum ada tautan';
            changed();
          });
          wrap.append(inp);
          primary.append(wrap);
          return inp;
        }
        inputField('title', 'Judul / nama akun', { placeholder: 'Contoh: SSCircle Community' });
        inputField('url', 'Alamat tautan', { placeholder: 'https://...' });
        inputField('description', 'Keterangan singkat', { wide: true, placeholder: 'Deskripsi yang ditampilkan di bawah judul' });
        body.append(primary);
        const settingsRow = node('div', 'home-admin-social-settings');
        const logoControls = node('div', 'home-admin-social-logo-controls');
        logoControls.append(node('span', 'field-label', 'Logo'));
        const iconSelect = node('select');
        iconSelect.setAttribute('aria-label', 'Pilih logo tautan ' + (index + 1));
        for (const [src, name] of [['assets/tiktok-logo.png', 'TikTok'], ['assets/discord-logo.png', 'Discord']]) {
          const option = node('option', '', name);
          option.value = src;
          iconSelect.append(option);
        }
        if (item.icon?.startsWith('/api/media/')) {
          const custom = node('option', '', 'Logo kustom');
          custom.value = item.icon;
          iconSelect.append(custom);
        }
        iconSelect.value = item.icon || 'assets/tiktok-logo.png';
        iconSelect.onchange = () => {
          item.icon = iconSelect.value;
          preview.src = item.icon;
          changed();
        };
        const uploadLabel = node('label', 'home-admin-social-upload');
        uploadLabel.textContent = 'Unggah logo';
        const upload = node('input');
        upload.type = 'file';
        upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
        upload.setAttribute('aria-label', 'Unggah logo ' + (index + 1));
        upload.onchange = async () => {
          const file = upload.files?.[0];
          if (!file)
            return;
          upload.disabled = true;
          uploadLabel.firstChild.textContent = 'Mengunggah...';
          try {
            const result = await SSCircle.uploadImage(file);
            item.icon = '/api/media/' + result.id;
            changed();
            redraw(card.dataset.linkId);
          }
          catch (e) {
            SSCNotice.alert('Gagal mengunggah logo: ' + e.message);
            upload.disabled = false;
            uploadLabel.firstChild.textContent = 'Unggah logo';
          }
        };
        uploadLabel.append(upload);
        iconSelect.hidden = true;
        uploadLabel.hidden = true;
        logoControls.append(iconSelect, uploadLabel);
        SSCircleImagePicker.mount(logoControls, {
          compact: true, title: 'Logo akun / media sosial', current: () => item.icon,
          onSelect: src => { item.icon = src; changed(); redraw(item.id); }
        });
        const placement = node('div', 'home-admin-social-placement');
        placement.append(node('span', 'field-label', 'Tampilkan di'));
        for (const [key, label] of [['showHome', 'Homepage'], ['showRegistration', 'Registration']]) {
          const control = node('label', 'home-admin-social-check'), checkbox = node('input');
          checkbox.type = 'checkbox';
          checkbox.checked = item[key] === true;
          checkbox.onchange = () => {
            item[key] = checkbox.checked;
            updateLocations();
            changed();
          };
          control.append(checkbox, node('span', '', label));
          placement.append(control);
        }
        settingsRow.append(logoControls, placement);
        body.append(settingsRow);
        const actions = node('div', 'home-admin-social-actions');
        const up = helpButton(actions, '↑ Naik', () => {
          if (index > 0) {
            [links[index - 1], links[index]] = [links[index], links[index - 1]];
            changed();
            redraw(item.id);
          }
        });
        up.disabled = index === 0;
        const down = helpButton(actions, '↓ Turun', () => {
          if (index < links.length - 1) {
            [links[index + 1], links[index]] = [links[index], links[index + 1]];
            changed();
            redraw(item.id);
          }
        });
        down.disabled = index === links.length - 1;
        const del = helpButton(actions, 'Hapus tautan', async () => {
          if (await SSCNotice.confirm('Hapus tautan media sosial ini dari website?', { danger: true, confirmText: 'Hapus tautan' })) {
            links.splice(index, 1);
            changed();
            redraw();
          }
        });
        del.classList.add('danger-button');
        body.append(actions);
        card.append(body);
        list.append(card);
      }
      window.SSCircleSort?.attach(list, {
        item: '.home-admin-social-card',
        handleTarget: '.home-admin-social-card-header',
        onMove: (from, to) => {
          const moved = links.splice(from, 1)[0];
          links.splice(to, 0, moved);
          changed();
          redraw(moved?.id);
        }
      });
      if (!links.length)
        list.append(node('p', 'field-help', 'Belum ada tautan media sosial. Klik Tambah tautan untuk membuatnya.'));
    }
    redraw();
  }
  function imagePickerField(container, key, label, { builtin = 'assets/sscircle-community-icon.png', hint = 'Unggah gambar baru jika ingin mengganti gambar bawaan.' } = {}) {
    const wrap = node('div', 'field-group full');
    wrap.append(node('span', 'field-label', label));
    const preview = node('img', 'home-admin-poster-preview' + (key === 'homeDonateIcon' ? ' home-admin-donate-icon-preview' : ''));
    preview.src = state.settings[key] || builtin;
    wrap.append(preview);
    const select = node('select');
    for (const [value, title] of [
      [builtin, 'Gambar bawaan'],
      ...((state.settings.homeGallery || []).filter(item => item.src).map((item, index) => [item.src, (index + 1) + '. ' + (item.title || 'Gambar galeri')]))
    ]) {
      const opt = node('option', '', title);
      opt.value = value;
      select.append(opt);
    }
    if (state.settings[key] && [...select.options].every(opt => opt.value !== state.settings[key])) {
      const opt = node('option', '', 'Gambar saat ini');
      opt.value = state.settings[key];
      select.append(opt);
    }
    select.value = state.settings[key] || builtin;
    select.onchange = () => {
      state.settings[key] = select.value;
      preview.src = select.value;
      changed();
    };
    wrap.append(select);
    const upload = node('input');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
    const info = node('small', 'field-help', hint);
    upload.onchange = async () => {
      const file = upload.files?.[0];
      if (!file)
        return;
      upload.disabled = true;
      info.textContent = 'Mengunggah gambar...';
      try {
        const result = await SSCircle.uploadImage(file);
        state.settings[key] = '/api/media/' + result.id;
        preview.src = state.settings[key];
        if ([...select.options].every(opt => opt.value !== state.settings[key])) {
          const opt = node('option', '', 'Upload terbaru');
          opt.value = state.settings[key];
          select.append(opt);
        }
        select.value = state.settings[key];
        changed();
        info.textContent = '✓ Gambar berhasil dipilih. Simpan Homepage untuk menerapkan.';
      }
      catch (e) {
        info.textContent = 'Gagal upload: ' + e.message;
      }
      finally {
        upload.disabled = false;
        upload.value = '';
      }
    };
    select.hidden = true;
    upload.hidden = true;
    wrap.append(upload, info);
    SSCircleImagePicker.mount(wrap, {
      compact: true, title: label, current: () => state.settings[key],
      onSelect: src => { state.settings[key] = src; preview.src = src; changed(); }
    });
    container.append(wrap);
  }
  function leaderboardEditor(box) {
    if (!Array.isArray(state.settings.homeLeaderboardSeasons))
      state.settings.homeLeaderboardSeasons = [];
    const toolbar = node('div', 'home-admin-gallery-add'), list = node('div', 'home-admin-social-list');
    box.append(toolbar, list);
    helpButton(toolbar, '+ Tambah season', () => {
      if (state.settings.homeLeaderboardSeasons.length >= 12)
        return SSCNotice.alert('Maksimal 12 season leaderboard.');
      state.settings.homeLeaderboardSeasons.push({
        id: 'season-' + (state.settings.homeLeaderboardSeasons.length + 1),
        title: 'Leaderboard S' + (state.settings.homeLeaderboardSeasons.length + 1),
        entries: [{ name: '', score: '' }, { name: '', score: '' }, { name: '', score: '' }]
      });
      changed();
      redraw();
    });
    function redraw(forceId) {
      const openIds = new Set([...list.querySelectorAll('details[open]')].map(d => d.dataset.seasonId));
      if (forceId)
        openIds.add(forceId);
      list.replaceChildren();
      state.settings.homeLeaderboardSeasons.forEach((season, index) => {
        const card = node('details', 'home-admin-social-card');
        card.dataset.seasonId = season.id || String(index);
        card.open = openIds.has(card.dataset.seasonId);
        const summary = node('summary', 'home-admin-social-card-header');
        const identity = node('span', 'home-admin-social-identity');
        identity.append(node('strong', '', season.title || ('Leaderboard S' + (index + 1))), node('small', '', '' + ((season.entries || []).filter(entry => entry && (entry.name || entry.score)).length) + ' entri'));
        summary.append(identity, node('span', 'home-admin-social-expand', 'Ubah'));
        card.append(summary);
        const body = node('div', 'home-admin-social-card-body');
        const titleWrap = node('label', 'field-group full');
        titleWrap.append(node('span', 'field-label', 'Judul season'));
        const titleInput = node('input');
        titleInput.type = 'text';
        titleInput.maxLength = 120;
        titleInput.value = season.title || '';
        titleInput.oninput = () => {
          season.title = titleInput.value;
          changed();
        };
        titleWrap.append(titleInput);
        body.append(titleWrap);
        const entryWrap = node('div', 'home-admin-gallery');
        body.append(entryWrap);
        const entries = Array.isArray(season.entries) ? season.entries : [];
        entries.forEach((entry, rowIndex) => {
          const row = node('div', 'home-admin-gallery-row home-admin-leaderboard-entry-row');
          const fields = node('div', 'home-admin-gallery-row-inputs');
          const name = node('input');
          name.type = 'text';
          name.placeholder = 'Nama pemain';
          name.maxLength = 80;
          name.value = entry.name || '';
          name.oninput = () => {
            entry.name = name.value;
            changed();
          };
          const score = node('input');
          score.type = 'text';
          score.placeholder = 'Skor / catatan';
          score.maxLength = 80;
          score.value = entry.score || '';
          score.oninput = () => {
            entry.score = score.value;
            changed();
          };
          fields.append(name, score);
          const actions = node('div', 'home-admin-gallery-actions');
          helpButton(actions, '↑', () => {
            if (rowIndex > 0) {
              [entries[rowIndex - 1], entries[rowIndex]] = [entries[rowIndex], entries[rowIndex - 1]];
              changed();
              redraw(card.dataset.seasonId);
            }
          });
          helpButton(actions, '↓', () => {
            if (rowIndex < entries.length - 1) {
              [entries[rowIndex + 1], entries[rowIndex]] = [entries[rowIndex], entries[rowIndex + 1]];
              changed();
              redraw(card.dataset.seasonId);
            }
          });
          helpButton(actions, 'Hapus', async () => {
            if (!await SSCNotice.confirm('Hapus entri leaderboard ini?', { danger: true, confirmText: 'Hapus entri' }))
              return;
            entries.splice(rowIndex, 1);
            changed();
            redraw(card.dataset.seasonId);
          });
          row.append(fields, actions);
          entryWrap.append(row);
        });
        window.SSCircleSort?.attach(entryWrap, {
          item: '.home-admin-gallery-row',
          onMove: (from, to) => {
            entries.splice(to, 0, entries.splice(from, 1)[0]);
            changed();
            redraw(card.dataset.seasonId);
          }
        });
        const addEntry = helpButton(body, '+ Tambah entri', () => {
          if (entries.length >= 20)
            return SSCNotice.alert('Maksimal 20 entri per season.');
          entries.push({ name: '', score: '' });
          changed();
          redraw(card.dataset.seasonId);
        });
        addEntry.classList.add('secondary');
        const actions = node('div', 'home-admin-gallery-add');
        helpButton(actions, 'Geser season ke atas', () => {
          if (index > 0) {
            [state.settings.homeLeaderboardSeasons[index - 1], state.settings.homeLeaderboardSeasons[index]] = [state.settings.homeLeaderboardSeasons[index], state.settings.homeLeaderboardSeasons[index - 1]];
            changed();
            redraw(card.dataset.seasonId);
          }
        });
        helpButton(actions, 'Geser season ke bawah', () => {
          if (index < state.settings.homeLeaderboardSeasons.length - 1) {
            [state.settings.homeLeaderboardSeasons[index + 1], state.settings.homeLeaderboardSeasons[index]] = [state.settings.homeLeaderboardSeasons[index], state.settings.homeLeaderboardSeasons[index + 1]];
            changed();
            redraw(card.dataset.seasonId);
          }
        });
        helpButton(actions, 'Hapus season', async () => {
          if (!await SSCNotice.confirm('Hapus season leaderboard ini?', { danger: true, confirmText: 'Hapus season' }))
            return;
          state.settings.homeLeaderboardSeasons.splice(index, 1);
          changed();
          redraw();
        });
        body.append(actions);
        card.append(body);
        list.append(card);
      });
      window.SSCircleSort?.attach(list, {
        item: '.home-admin-social-card',
        handleTarget: '.home-admin-social-card-header',
        onMove: (from, to) => {
          const seasons = state.settings.homeLeaderboardSeasons;
          const item = seasons.splice(from, 1)[0];
          seasons.splice(to, 0, item);
          changed();
          redraw(item.id);
        }
      });
    }
    redraw();
  }
  function range(box, key, label, min, max, unit) {
    const labelWrap = node('label', 'field-group'), heading = node('span', 'field-label', label), slider = node('input'), line = node('div', 'home-admin-range'), out = node('output');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = 1;
    slider.value = state.settings[key] ?? min;
    out.textContent = slider.value + unit;
    line.append(node('span', '', 'Lebih lembut                                        Lebih kuat'), out);
    slider.oninput = () => {
      state.settings[key] = Number(slider.value);
      out.textContent = slider.value + unit;
      changed();
    };
    labelWrap.append(heading, slider, line);
    box.append(labelWrap);
  }
  function gotoAppearance(part) {
    if (part === 'colors') {
      document.querySelector('.dashboard-sidebar [data-tab="theme"]')?.click();
      return;
    }
    document.querySelector('[data-tab="appearance"]')?.click();
    document.querySelector('[data-appearance="' + part + '"]')?.click();
  }
  function setStatus() {
    const el = document.getElementById('home-admin-registration-state');
    if (el)
      el.textContent = state.settings.open ? '● Pendaftaran dibuka' : '◷ Pendaftaran ditutup';
  }
  function render(data, dirtyMark) {
    state = data;
    notifyDirty = dirtyMark;
    const r = root();
    if (!r)
      return;
    r.replaceChildren();
    if (!Array.isArray(data.settings.homeGallery))
      data.settings.homeGallery = [...Array.from({ length: 9 }, (_, i) => ({
          src: 'assets/gallery/sscircle-' + String(i + 1).padStart(2, '0') + '.webp',
          title: 'SSCircle Gallery ' + (i + 1),
          caption: ''
        }))];
    setStatus();
    const basics = section('01 · Homepage & Pendaftaran', 'Pengaturan utama yang paling sering digunakan.');
    toggle(basics, 'open', 'Pendaftaran dibuka', 'Matikan untuk menutup pendaftaran dan menampilkan pengumuman di halaman Registration.');
    textField(basics, 'homeClosedMessage', 'Pesan saat pendaftaran ditutup', { textarea: true });
    const welcome = section('02 · Sambutan utama', 'Teks yang tampil di atas video cinematic. Tombol pendaftaran akan membuka formulir dan animasi opening.');
    formGrid(welcome, [
      ['homeEyebrow', 'Label kecil', 'input'],
      ['homeTitle', 'Judul Homepage', 'input'],
      ['homeSubtitle', 'Deskripsi sambutan', 'textarea'],
      ['homePrimaryCTA', 'Teks tombol pendaftaran', 'input'],
      ['homeSecondaryCTA', 'Teks tombol jelajahi', 'input'],
      ['homeStatusCTA', 'Teks tombol cek status', 'input']
    ]);
    const video = section('03 · Video cinematic & gambar cadangan', 'Video tanpa audio, hanya di bagian pembukaan. Ketika pengunjung menggulir ke bawah, video tidak ikut menempel pada layar.');
    toggle(video, 'homeVideoEnabled', 'Tampilkan video cinematic', 'Jika dimatikan, Homepage menampilkan gambar cadangan.');
    toggle(video, 'homePauseOffscreen', 'Jeda saat video keluar dari layar', 'Menghemat daya saat pengunjung melihat galeri di bawah.');
    const videoUpload = node('div', 'home-admin-video-upload');
    const videoLabel = node('label', 'field-group');
    videoLabel.append(node('span', 'field-label', 'Ganti video dari perangkat'));
    const fileInput = node('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/mp4,video/webm,.mp4,.webm';
    const videoProgress = node('div', 'home-upload-progress'), bar = node('div', 'home-upload-progress-bar'), uploadText = node('small', 'field-help', 'Video maksimal 16 MB. Pilih MP4 atau WebM; gambar dan suara tidak akan dimodifikasi saat upload. Pemutaran video pada halaman publik tetap tanpa suara.');
    videoProgress.append(bar);
    videoProgress.hidden = true;
    const preview = node('video', 'home-admin-video-preview');
    preview.muted = true;
    preview.controls = true;
    preview.playsInline = true;
    preview.preload = 'metadata';
    function showVideo(src) {
      preview.src = src || 'assets/sscircle-cinematic.mp4';
      preview.load();
    }
    showVideo(state.settings.homeVideoUrl);
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file)
        return;
      fileInput.disabled = true;
      videoProgress.hidden = false;
      bar.style.width = '0%';
      uploadText.textContent = 'Mengunggah video...';
      try {
        const uploaded = await SSCircle.uploadVideo(file, progress => {
          bar.style.width = progress + '%';
          uploadText.textContent = 'Mengunggah video: ' + progress + '%';
        });
        state.settings.homeVideoUrl = uploaded.url;
        state.settings.homeVideoEnabled = true;
        showVideo(uploaded.url);
        changed();
        uploadText.textContent = '✓ Video tersimpan. Klik Simpan Homepage untuk mengaktifkannya. Video lama tetap bisa dikelola di Penyimpanan Media.';
      }
      catch (e) {
        uploadText.textContent = 'Gagal upload: ' + e.message;
      }
      finally {
        fileInput.disabled = false;
        fileInput.value = '';
        videoProgress.hidden = true;
      }
    };
    videoLabel.append(fileInput, uploadText);
    videoUpload.append(videoLabel, videoProgress, preview);
    const currentVideo = node('div', 'home-video-selection');
    const chooseLabel = node('label', 'field-group');
    chooseLabel.append(node('span', 'field-label', 'Video yang tersimpan'));
    const picker = node('select'), refresh = node('button', 'button secondary', '↻ Muat daftar video');
    refresh.type = 'button';
    const restore = node('button', 'button secondary', 'Gunakan video bawaan');
    restore.type = 'button';
    restore.onclick = () => {
      state.settings.homeVideoUrl = 'assets/sscircle-cinematic.mp4';
      syncVideo(state.settings.homeVideoUrl);
      picker.value = state.settings.homeVideoUrl;
      changed();
    };
    const external = textField(video, 'homeVideoUrl', 'Atau alamat video eksternal', { hint: 'Alternatif: alamat HTTPS langsung ke file MP4/WebM.' });
    // Tetap sinkron jika sumber dipilih lewat upload/daftar.
    const oldShow = showVideo;
    function syncVideo(src) {
      oldShow(src);
      external.value = src;
    }
    async function fill() {
      picker.replaceChildren();
      const first = node('option', '', 'Video bawaan');
      first.value = 'assets/sscircle-cinematic.mp4';
      picker.append(first);
      try {
        const result = await SSCircle.getMediaLibrary();
        for (const item of result.files || []) {
          if (!item.type?.startsWith('video/') || item.visibility === 'private' || item.visibility === 'uploading' || item.source === 'built-in')
            continue;
          const opt = node('option', '', item.name + ' · ' + (item.size / 1024 / 1024).toFixed(2) + ' MB');
          opt.value = '/api/media/' + item.id + (item.type === 'video/webm' ? '?format=webm' : '?format=mp4');
          picker.append(opt);
        }
      }
      catch {
        uploadText.textContent = 'Daftar video belum dapat dimuat. Upload baru tetap tersedia.';
      }
      picker.value = state.settings.homeVideoUrl;
    }
    picker.onchange = () => {
      state.settings.homeVideoUrl = picker.value;
      syncVideo(picker.value);
      changed();
    };
    refresh.onclick = fill;
    const videoPickerHelp = node('small', 'field-help', 'Semua video yang diunggah tersedia di Penyimpanan Media.');
    chooseLabel.append(picker, videoPickerHelp);
    currentVideo.append(chooseLabel, refresh, restore);
    video.append(videoUpload, currentVideo);
    const origFileChanged = fileInput.onchange;
    fileInput.onchange = async () => {
      await origFileChanged();
      external.value = state.settings.homeVideoUrl;
      await fill();
    };
    external.addEventListener('change', () => {
      showVideo(state.settings.homeVideoUrl);
    });
    fill();
    range(video, 'homeVideoOverlay', 'Gelap video (opacity)', 20, 85, '%');
    range(video, 'homeHeroHeight', 'Tinggi cinematic (persentase layar)', 70, 100, '%');
    posterControls(video);
    const about = section('04 · Tentang server', 'Atur informasi singkat mengenai komunitas.');
    toggle(about, 'homeShowAbout', 'Tampilkan Tentang Server', '');
    formGrid(about, [['homeAboutEyebrow', 'Label bagian', 'input'], ['homeAboutTitle', 'Judul Tentang', 'input'], ['homeAboutText', 'Deskripsi Tentang', 'textarea']]);
    aboutTagsEditor(about);
    const gallery = section('05 · SSCircle Gallery', 'Judul dan catatan foto untuk pengelolaan saja; pada Homepage foto ditampilkan bersih tanpa tulisan. Atur urutan atau tambahkan foto dari perangkat.');
    toggle(gallery, 'homeShowGallery', 'Tampilkan galeri', '');
    formGrid(gallery, [['homeGalleryEyebrow', 'Label galeri', 'input'], ['homeGalleryTitle', 'Judul galeri', 'input'], ['homeGalleryText', 'Deskripsi galeri', 'textarea']]);
    galleryEditor(gallery);
    const upcoming = section('Upcoming Events · Jadwal Homepage', 'Kartu event terdekat otomatis mengambil data dari Atur Event & Jadwal. Tidak perlu menambahkan jadwal dua kali.');
    toggle(upcoming, 'homeUpcomingEnabled', 'Tampilkan Upcoming Events di Homepage', 'Halaman Event khusus tetap tersedia meskipun kartu di Homepage disembunyikan.');
    formGrid(upcoming, [
      ['homeUpcomingTitle','Judul kartu Event','input'],
      ['homeUpcomingDescription','Deskripsi singkat','textarea'],
      ['homeUpcomingButton','Teks tombol ke jadwal lengkap','input']
    ]);
    const upcomingCount = node('label','field-group');
    upcomingCount.append(node('span','field-label','Jumlah event yang ditampilkan (1–3)'));
    const countChoice = node('select');
    for (const n of [1,2,3]){const o=node('option','',String(n));o.value=String(n);countChoice.append(o);}
    countChoice.value=String([1,2,3].includes(Number(data.settings.homeUpcomingCount))?data.settings.homeUpcomingCount:2);
    countChoice.onchange=()=>{data.settings.homeUpcomingCount=Number(countChoice.value);changed();};
    upcomingCount.append(countChoice);upcoming.append(upcomingCount);
    const upcomingLayout = node('label','field-group');upcomingLayout.append(node('span','field-label','Tata letak kartu'));
    const layoutChoice=node('select');for(const [value,title] of [['grid','Grid responsif'],['slider','Slider horizontal']]){const o=node('option','',title);o.value=value;layoutChoice.append(o);}
    layoutChoice.value=data.settings.homeUpcomingLayout==='slider'?'slider':'grid';
    layoutChoice.onchange=()=>{data.settings.homeUpcomingLayout=layoutChoice.value;changed();};
    upcomingLayout.append(layoutChoice);upcoming.append(upcomingLayout);
    toggle(upcoming,'homeUpcomingOngoingFirst','Prioritaskan event berlangsung','Event yang sedang berlangsung muncul lebih dahulu.');
    toggle(upcoming,'homeUpcomingHideEmpty','Sembunyikan jika belum ada event','Homepage tetap ringkas tanpa kartu kosong.');
    const upcomingOpen=node('a','button secondary','Buka Atur Event & Jadwal ↗');upcomingOpen.href='#events-admin';
    upcomingOpen.onclick=(event)=>{event.preventDefault();document.querySelector('[data-tab="events-admin"]')?.click();};
    upcoming.append(upcomingOpen);
    const process = section('06 · Alur bergabung', 'Penjelasan singkat langkah bergabung ke SSCircle.');
    toggle(process, 'homeShowProcess', 'Tampilkan alur pendaftaran', '');
    formGrid(process, [['homeProcessTitle', 'Judul bagian', 'input'], ['homeProcessText', 'Deskripsi alur', 'textarea']]);
    const community = section('07 · Stay Connected', 'Pengaturan untuk bagian 04 · Stay Connected di Homepage, termasuk Discord dan semua tautan media sosial.');
    toggle(community, 'homeShowDiscord', 'Tampilkan Stay Connected di Homepage', 'Bagian Discord dan tautan media sosial tampil bersama.');
    formGrid(community, [
      ['homeDiscordTitle', 'Judul sambutan komunitas', 'input'],
      ['homeDiscordText', 'Keterangan Discord', 'textarea'],
      ['homeDiscordUrl', 'Link undangan Discord', 'input'],
      ['homeFooterText', 'Teks footer Homepage', 'input']
    ]);
    if (!Array.isArray(state.settings.homeSocialLinks))
      state.settings.homeSocialLinks = [
        {
          id: 'tiktok-owner',
          title: 'JasitS',
          description: 'TikTok Owner SSCircle Server',
          url: 'https://www.tiktok.com/@jasitsaja',
          icon: 'assets/tiktok-logo.png',
          showHome: true,
          showRegistration: true
        },
        {
          id: 'tiktok-community',
          title: 'SSCircle Community',
          description: 'TikTok resmi SSCircle Community',
          url: 'https://www.tiktok.com/@sscircle.id',
          icon: 'assets/tiktok-logo.png',
          showHome: true,
          showRegistration: true
        }
      ];
    socialEditor(community);
    const donationSubsection = node('div', 'home-admin-donation-subsection');
    donationSubsection.append(node('h3', '', 'Donasi Server'), node('p', 'field-help', 'Pengaturan dukungan server, tampil bersama Discord dan media sosial di Stay Connected.'));
    toggle(donationSubsection, 'homeShowDonate', 'Tampilkan Donasi di Stay Connected', 'Tombol donasi dapat dimatikan tanpa menghapus pengaturannya.');
    formGrid(donationSubsection, [
      ['homeDonateTitle', 'Judul donasi', 'input'],
      ['homeDonateText', 'Deskripsi donasi', 'textarea'],
      ['homeDonateButton', 'Teks tombol donasi', 'input'],
      ['homeDonateUrl', 'Link donasi (HTTPS)', 'input']
    ]);
    imagePickerField(donationSubsection, 'homeDonateIcon', 'Ikon donasi (persegi 1:1)');
    community.append(donationSubsection);
    const profile = section('09 · Profil & Sejarah', 'Tampilkan profil pemilik atau cerita sejarah server dengan foto kepala skin Minecraft.');
    toggle(profile, 'homeShowProfile', 'Tampilkan profil di Homepage', 'Bagian ini bisa disembunyikan tanpa menghapus isinya.');
    toggle(profile, 'homeProfileEnabled', 'Aktifkan kartu profil', 'Kartu profil akan muncul ketika kedua pengaturan aktif.');
    formGrid(profile, [
      ['homeProfileEyebrow', 'Label bagian', 'input'],
      ['homeProfileTitle', 'Judul profil', 'input'],
      ['homeProfileSubtitle', 'Subjudul profil', 'input'],
      ['homeProfileText', 'Cerita / deskripsi', 'textarea']
    ]);
    profileItemsEditor(profile);
    const leaderboard = section('10 · Leaderboard', 'Daftar peringkat yang bisa dipajang per season. Default-nya boleh dimatikan dulu dari Homepage.');
    toggle(leaderboard, 'homeShowLeaderboard', 'Tampilkan leaderboard di Homepage', 'Jika dimatikan, semua data tetap tersimpan tetapi tidak tampil di homepage.');
    formGrid(leaderboard, [['homeLeaderboardTitle', 'Judul leaderboard', 'input'], ['homeLeaderboardText', 'Deskripsi leaderboard', 'textarea']]);
    leaderboardEditor(leaderboard);
    const highlights = section('10A · Season Highlights', 'Tampilkan cuplikan season yang sudah dipublikasikan di halaman arsip. Kartu dapat dipindahkan dari Homepage Builder.');
    toggle(highlights, 'homeSeasonHighlightsEnabled', 'Tampilkan Season Highlights di Homepage', 'Arsip harus aktif dan ada season yang dipublikasikan agar kartu tampil.');
    formGrid(highlights, [
      ['homeSeasonHighlightsTitle', 'Judul bagian', 'input'],
      ['homeSeasonHighlightsDescription', 'Deskripsi singkat', 'textarea'],
      ['homeSeasonHighlightsButton', 'Teks tombol lihat arsip', 'input']
    ]);
    const hiOptions=node('div','home-admin-gallery-add');
    const countLabel=node('label','field-group');countLabel.append(node('span','field-label','Jumlah kartu yang ditampilkan'));
    const countSelect=node('select');for(const n of [1,2,3]){const option=node('option','',String(n));option.value=String(n);countSelect.append(option);}
    countSelect.value=String(state.settings.homeSeasonHighlightsCount||2);countSelect.onchange=()=>{state.settings.homeSeasonHighlightsCount=Number(countSelect.value);changed();};
    countLabel.append(countSelect);hiOptions.append(countLabel);
    const layoutLabel=node('label','field-group');layoutLabel.append(node('span','field-label','Model kartu'));
    const layoutSelect=node('select');for(const [value,label] of [['cards','Kartu ringkas'],['timeline','Mini timeline']]){const opt=node('option','',label);opt.value=value;layoutSelect.append(opt);}
    layoutSelect.value=state.settings.homeSeasonHighlightsStyle||'cards';layoutSelect.onchange=()=>{state.settings.homeSeasonHighlightsStyle=layoutSelect.value;changed();};
    layoutLabel.append(layoutSelect);hiOptions.append(layoutLabel);highlights.append(hiOptions);
    toggle(highlights, 'homeSeasonHighlightsHideEmpty', 'Sembunyikan bagian jika belum ada season', 'Homepage tetap rapi ketika arsip belum diisi.');
    highlights.append(node('p','field-help','Kelola foto, penghargaan dan cerita di menu “Atur Season & Sejarah”. Leaderboard tetap menggunakan data yang sama.'));
    const statusSection = section('11 · Cek Status & Kode Saya', 'Atur kartu Homepage dan seluruh pengaturan halaman Cek Status dari satu tempat.');
    formGrid(statusSection, [
      ['homeStatusEyebrow', 'Label kecil', 'input'],
      ['homeStatusTitle', 'Judul Cek Status', 'input'],
      ['homeStatusDescription', 'Deskripsi tambahan', 'textarea'],
      ['homeStatusCTA', 'Teks tombol Cek Status', 'input']
    ]);
    const statusDetails = node('details', 'home-admin-status-details');
    statusDetails.append(node('summary', '', 'Pengaturan halaman Cek Status & Kode Saya'));
    toggle(statusDetails, 'statusOwnCodeEnabled', 'Aktifkan Lihat kode saya', 'Pengguna bisa melihat kode berulang kali apabila sesi pendaftar masih aktif.');
    formGrid(statusDetails, [
      ['statusEyebrow', 'Label kecil Cek Status', 'input'],
      ['statusHeading', 'Judul halaman Cek Status', 'input'],
      ['statusDescription', 'Deskripsi halaman Cek Status', 'textarea'],
      ['statusButtonText', 'Teks tombol periksa', 'input'],
      ['statusOldHint', 'Petunjuk kode lama', 'input'],
      ['statusOwnCodeTitle', 'Judul Lihat kode saya', 'input'],
      ['statusOwnCodeDescription', 'Penjelasan Lihat kode saya', 'textarea'],
      ['statusOwnCodeHelp', 'Petunjuk masuk kembali', 'textarea'],
      ['statusOwnCodeLoginText', 'Teks tombol masuk', 'input'],
      ['statusOwnCodeCopyText', 'Teks tombol salin kode', 'input'],
      ['statusOwnCodeCheckText', 'Teks tombol cek status saya', 'input'],
      ['statusOwnCodeLogoutText', 'Teks tombol keluar', 'input']
    ]);
    statusSection.append(statusDetails);
    const visual = section('12 · Warna, logo & opening', 'Seluruh warna Homepage mengikuti tema website. Logo utama dan logo opening diatur melalui Atur Registration.');
    const buttons = node('div', 'home-admin-gallery-add');
    helpButton(buttons, 'Warna & gradasi →', () => gotoAppearance('colors'));
    helpButton(buttons, 'Logo website →', () => gotoAppearance('identity'));
    helpButton(buttons, 'Logo & animasi opening →', () => gotoAppearance('opening'));
    visual.append(buttons);
    // Setiap pengaturan ditempatkan di kartu Homepage sesuai posisi kontennya.
    window.SSCircleHomepageBuilder?.render(data, changed, {
      intro: [basics, welcome, video],
      about: [about],
      gallery: [gallery],
      upcoming: [upcoming],
      process: [process],
      community: [community],
      profile: [profile],
      leaderboard: [leaderboard],
      status: [statusSection],
      design: [visual]
    });
  }
  function init() {
    for (const id of ['home-admin-save', 'home-admin-save-top'])
      document.getElementById(id)?.addEventListener('click', () => document.getElementById('save')?.click());
    document.getElementById('home-admin-preview')?.addEventListener('click', () => window.open('./', '_blank', 'noopener'));
  }
  init();
  return { render };
})();
