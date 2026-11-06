/* SSCircle Server – dedicated voting administration */

// Pengaturan pilihan voting, foto, dan hasil suara.

'use strict';
window.SSCircleVoteAdmin = (() => {
  let data = null, dirtyMark = () => { }, resultsBusy = false;
  const root = () => document.getElementById('voting-admin-editor');
  const el = (tag, cls = '', text) => {
    const n = document.createElement(tag);
    if (cls)
      n.className = cls;
    if (text !== undefined)
      n.textContent = text;
    return n;
  };
  const notify = (text, type = 'success') => window.SSCNotice?.toast(text, type);
  function dirty() {
    dirtyMark();
  }
  function ensure() {
    const s = data.settings;
    s.homeVotingQuestion ??= 'Menurutmu, apa yang paling cocok untuk SSCircle?';
    s.homeVotingRequireCode ??= true;
    s.homeVotingSessionId ??= 'voting-1';
    s.homeVotingImages = Array.isArray(s.homeVotingImages) ? s.homeVotingImages : (s.homeVotingImage ? [s.homeVotingImage] : []);
    s.homeVotingOptions = Array.isArray(s.homeVotingOptions) && s.homeVotingOptions.length ? s.homeVotingOptions : [{ id: 'opsi-1', label: 'Pilihan 1' }, { id: 'opsi-2', label: 'Pilihan 2' }];
    s.homeVotingResultsMode ??= 'after_end';
    s.homeVotingPermanent ??= false;
    s.homeVotingEnabled ??= false;
    s.homeVotingShowImage ??= true;
  }
  function card(title, description) {
    const n = el('section', 'ssc-voting-card panel');
    const head = el('div', 'ssc-vote-card-heading');
    head.append(el('h2', '', title));
    if (description)
      head.append(el('p', '', description));
    n.append(head);
    return n;
  }
  function field(parent, key, label, opt = {}) {
    const w = el('label', 'field-group');
    w.append(el('span', 'field-label', label));
    const input = el(opt.multiline ? 'textarea' : 'input');
    if (opt.multiline)
      input.rows = 3;
    else
      input.type = opt.type || 'text';
    input.maxLength = opt.max || 300;
    input.placeholder = opt.placeholder || '';
    input.value = data.settings[key] ?? '';
    input.addEventListener('input', () => {
      data.settings[key] = input.value;
      dirty();
    });
    w.append(input);
    if (opt.help)
      w.append(el('small', 'field-help', opt.help));
    parent.append(w);
    return input;
  }
  function toggle(parent, key, label, help = '') {
    const wrap = el('label', 'toggle-row');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = data.settings[key] === true;
    input.addEventListener('change', () => {
      data.settings[key] = input.checked;
      dirty();
    });
    const visual = el('span', 'toggle-visual');
    visual.setAttribute('aria-hidden', 'true');
    const copy = el('span');
    copy.append(el('strong', '', label));
    if (help)
      copy.append(el('small', '', help));
    wrap.append(input, visual, copy);
    parent.append(wrap);
    return input;
  }
  function select(parent, key, label, options) {
    const w = el('label', 'field-group');
    w.append(el('span', 'field-label', label));
    const input = el('select');
    for (const [value, title] of options) {
      const o = el('option', '', title);
      o.value = value;
      input.append(o);
    }
    input.value = data.settings[key] ?? options[0][0];
    input.addEventListener('change', () => {
      data.settings[key] = input.value;
      dirty();
    });
    w.append(input);
    parent.append(w);
    return input;
  }
  function optionEditor(parent) {
    const heading = el('div', 'ssc-vote-inline-head');
    heading.append(el('h3', '', 'Pilihan jawaban'));
    const add = el('button', 'button secondary', '+ Tambah pilihan');
    add.type = 'button';
    heading.append(add);
    parent.append(heading);
    const list = el('div', 'ssc-vote-option-list ssc-vote-rich-list');
    parent.append(list);
    let mediaList = [];
    // Remember expanded photo settings when a voting card rerenders.
    const openedPhotoEditors = new Set();
    async function loadMedia() {
      try {
        const result = await SSCircle.getMediaLibrary();
        mediaList = (result.files || []).filter(file => file.visibility === 'public' && String(file.type || '').startsWith('image/'))
          .map(file => ({ src: file.source === 'built-in' ? file.path : '/api/media/' + file.id, name: file.name }));
      }
      catch {
        mediaList = [];
      }
    }
    function updateOption(option, key, value) {
      option[key] = value;
      dirty();
    }
    function move(array, from, to) {
      if (from === to || to < 0 || to >= array.length)
        return;
      array.splice(to, 0, array.splice(from, 1)[0]);
      dirty();
      redraw();
    }
    async function addPhotos(option, files) {
      const images = option.images;
      if (images.length + files.length > 6)
        return notify('Maksimal 6 gambar per pilihan.', 'warning');
      let count = 0;
      for (const file of files) {
        try {
          const uploaded = await SSCircle.uploadImage(file);
          images.push('/api/media/' + uploaded.id);
          count++;
        }
        catch (error) {
          notify('Unggahan gambar gagal: ' + error.message, 'error');
          break;
        }
      }
      if (count) {
        dirty();
        await loadMedia();
        redraw();
        notify(count + ' gambar ditambahkan.', 'success');
      }
    }
    add.onclick = () => {
      const options = data.settings.homeVotingOptions;
      if (options.length >= 20)
        return notify('Maksimal 20 pilihan.', 'warning');
      options.push({ id: 'opsi-' + crypto.randomUUID().slice(0, 12), label: 'Pilihan baru', description: '', images: [] });
      dirty();
      redraw();
    };
    function redraw() {
      list.replaceChildren();
      const options = data.settings.homeVotingOptions;
      options.forEach((option, index) => {
        option.description ??= '';
        option.images = Array.isArray(option.images) ? option.images : [];
        const card = el('article', 'ssc-vote-option-row ssc-vote-choice-editor');
        const top = el('div', 'ssc-vote-choice-heading');
        top.append(el('span', 'ssc-vote-option-number', String(index + 1).padStart(2, '0')));
        const title = el('strong', '', 'Pilihan ' + (index + 1));
        top.append(title);
        const actions = el('div', 'ssc-vote-choice-actions');
        for (const [name, delta] of [['↑', -1], ['↓', 1]]) {
          const btn = el('button', 'button secondary ssc-vote-mini', name);
          btn.type = 'button';
          btn.disabled = index + delta < 0 || index + delta >= options.length;
          btn.title = delta < 0 ? 'Geser ke atas' : 'Geser ke bawah';
          btn.onclick = () => move(options, index, index + delta);
          actions.append(btn);
        }
        const remove = el('button', 'button secondary ssc-vote-mini', '×');
        remove.type = 'button';
        remove.disabled = options.length <= 1;
        remove.title = 'Hapus pilihan';
        remove.onclick = async () => {
          if (!await SSCNotice.confirm('Hapus pilihan voting ini?', { danger: true, confirmText: 'Hapus pilihan' }))
            return;
          options.splice(index, 1);
          dirty();
          redraw();
        };
        actions.append(remove);
        top.append(actions);
        card.append(top);
        const fields = el('div', 'ssc-vote-choice-fields');
        const nameLabel = el('label', 'field-group');
        nameLabel.append(el('span', 'field-label', 'Teks pilihan'));
        const input = el('input');
        input.type = 'text';
        input.value = option.label || '';
        input.maxLength = 120;
        input.placeholder = 'Nama jawaban';
        input.oninput = () => updateOption(option, 'label', input.value);
        nameLabel.append(input);
        const descriptionLabel = el('label', 'field-group');
        descriptionLabel.append(el('span', 'field-label', 'Keterangan tambahan (opsional)'));
        const textarea = el('textarea');
        textarea.rows = 2;
        textarea.maxLength = 500;
        textarea.value = option.description || '';
        textarea.placeholder = 'Penjelasan singkat tentang pilihan ini';
        textarea.oninput = () => updateOption(option, 'description', textarea.value);
        descriptionLabel.append(textarea);
        fields.append(nameLabel, descriptionLabel);
        card.append(fields);
        const pictures = el('div', 'ssc-vote-choice-images');
        option.images.forEach((src, photoIndex) => {
          const box = el('div', 'ssc-vote-choice-photo');
          const img = el('img');
          img.src = src;
          img.alt = 'Gambar pilihan ' + (index + 1);
          img.loading = 'lazy';
          const del = el('button', 'ssc-vote-image-remove', '×');
          del.type = 'button';
          del.title = 'Lepas gambar';
          del.onclick = () => {
            option.images.splice(photoIndex, 1);
            dirty();
            redraw();
          };
          box.append(img, del);
          pictures.append(box);
        });
        const photoSettings = el('details', 'ssc-vote-choice-media-details');
        const editorId = String(option.id || 'option-' + index);
        photoSettings.open = openedPhotoEditors.has(editorId);
        photoSettings.addEventListener('toggle', () => {
          if (photoSettings.open)
            openedPhotoEditors.add(editorId);
          else
            openedPhotoEditors.delete(editorId);
        });
        photoSettings.append(el('summary', 'ssc-vote-choice-media-summary', `Gambar pilihan (${option.images.length}/6) · tambah atau atur foto`));
        photoSettings.append(pictures);
        window.SSCircleSort?.attach(pictures, {
          item: '.ssc-vote-choice-photo',
          onMove: (from, to) => {
            option.images.splice(to, 0, option.images.splice(from, 1)[0]);
            dirty();
            redraw();
          },
        });
        const tools = el('div', 'ssc-vote-choice-media-tools');
        const uploadLabel = el('label', 'field-group');
        uploadLabel.append(el('span', 'field-label', `Tambah gambar (${option.images.length}/6)`));
        const upload = el('input');
        upload.type = 'file';
        upload.multiple = true;
        upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
        upload.onchange = async () => {
          const files = [...(upload.files || [])];
          if (!files.length)
            return;
          upload.disabled = true;
          await addPhotos(option, files);
          upload.disabled = false;
        };
        uploadLabel.append(upload);
        tools.append(uploadLabel);
        const useRow = el('div', 'ssc-vote-choice-existing');
        const select = el('select');
        select.setAttribute('aria-label', 'Pilih gambar tersimpan');
        const placeholder = el('option', '', 'Pilih dari Penyimpanan Media');
        placeholder.value = '';
        select.append(placeholder);
        for (const item of mediaList) {
          if (!/^(assets\/gallery\/sscircle-0[1-9]\.webp|assets\/sscircle-community-icon\.png|assets\/sscircle-logo\.png|\/api\/media\/[0-9a-f-]{36})$/.test(item.src))
            continue;
          const opt = el('option', '', item.name || 'Gambar');
          opt.value = item.src;
          select.append(opt);
        }
        const addExisting = el('button', 'button secondary', '+ Gunakan gambar');
        addExisting.type = 'button';
        addExisting.onclick = () => {
          if (!select.value)
            return;
          if (option.images.length >= 6)
            return notify('Maksimal 6 gambar per pilihan.', 'warning');
          if (option.images.includes(select.value))
            return notify('Gambar sudah dipilih.', 'warning');
          option.images.push(select.value);
          dirty();
          redraw();
        };
        useRow.append(select, addExisting);
        tools.append(useRow);
        tools.hidden = true;
        photoSettings.append(tools);
        SSCircleImagePicker.mount(photoSettings, {
          compact: true, title: 'Gambar pilihan ' + (index + 1),
          count: () => option.images.length, max: 6,
          onAdd: src => {
            if (option.images.includes(src))
              throw Error('Gambar ini sudah digunakan pada pilihan ini.');
            option.images.push(src);
            dirty();
            redraw();
          }
        });
        card.append(photoSettings);
        list.append(card);
      });
      window.window.SSCircleSort?.attach(list, {
        item: '.ssc-vote-option-row',
        onMove: (from, to) => move(options, from, to),
      });
    }
    redraw();
    void loadMedia().then(redraw);
  }
  function imageEditor(parent) {
    const heading = el('div', 'ssc-vote-inline-head');
    heading.append(el('h3', '', 'Gambar pertanyaan (opsional)'));
    const count = el('span', 'ssc-vote-count');
    heading.append(count);
    parent.append(heading);
    const gallery = el('div', 'ssc-vote-admin-gallery');
    parent.append(gallery);
    const upload = el('input');
    upload.type = 'file';
    upload.accept = 'image/jpeg,image/png,image/webp,image/gif';
    upload.multiple = true;
    const info = el('p', 'field-help', 'Kamu dapat menambahkan hingga 8 gambar. Foto yang diunggah juga muncul di Penyimpanan Media.');
    upload.hidden = true;
    parent.append(upload, info);
    const chooseRow = el('div', 'ssc-vote-image-chooser');
    const picker = el('select');
    picker.setAttribute('aria-label', 'Pilih gambar tersimpan');
    const use = el('button', 'button secondary', '+ Gunakan gambar tersimpan');
    use.type = 'button';
    chooseRow.append(picker, use);
    chooseRow.hidden = true;
    parent.append(chooseRow);
    SSCircleImagePicker.mount(parent, {
      title: 'Foto pertanyaan voting', count: () => data.settings.homeVotingImages.length, max: 8,
      onAdd: src => {
        const images = data.settings.homeVotingImages;
        if (images.includes(src))
          throw Error('Foto yang sama sudah ada.');
        images.push(src);
        dirty();
        redraw();
      }
    });
    async function fillPicker() {
      picker.replaceChildren();
      const first = el('option', '', 'Pilih dari gambar yang sudah tersimpan');
      first.value = '';
      picker.append(first);
      try {
        const result = await SSCircle.getMediaLibrary();
        for (const item of result.files || []) {
          if (!String(item.type || '').startsWith('image/') || item.visibility !== 'public')
            continue;
          const src = item.source === 'built-in' ? item.path : '/api/media/' + item.id;
          if (!/^(assets\/gallery\/sscircle-0[1-9]\.webp|assets\/sscircle-community-icon\.png|\/api\/media\/[0-9a-f-]{36})$/.test(src))
            continue;
          const o = el('option', '', item.name || 'Gambar');
          o.value = src;
          picker.append(o);
        }
      }
      catch {
        info.textContent = 'Daftar gambar tersimpan belum bisa dimuat. Kamu tetap dapat mengunggah gambar baru.';
      }
    }
    use.onclick = () => {
      const src = picker.value;
      if (!src)
        return;
      if (data.settings.homeVotingImages.includes(src))
        return notify('Gambar sudah dipilih.', 'warning');
      if (data.settings.homeVotingImages.length >= 8)
        return notify('Maksimal 8 gambar.', 'warning');
      data.settings.homeVotingImages.push(src);
      dirty();
      redraw();
    };
    upload.onchange = async () => {
      const files = [...(upload.files || [])];
      if (!files.length)
        return;
      if (files.length + data.settings.homeVotingImages.length > 8)
        return notify('Jumlah gambar maksimal 8.', 'warning');
      upload.disabled = true;
      let count = 0;
      for (const file of files) {
        try {
          const result = await SSCircle.uploadImage(file);
          data.settings.homeVotingImages.push('/api/media/' + result.id);
          count++;
        }
        catch (e) {
          notify('Gagal upload ' + file.name + ': ' + e.message, 'error');
          break;
        }
      }
      upload.value = '';
      upload.disabled = false;
      redraw();
      if (count) {
        dirty();
        notify(count + ' gambar berhasil ditambahkan.', 'success');
        await fillPicker();
      }
    };
    function redraw() {
      const arr = data.settings.homeVotingImages;
      gallery.replaceChildren();
      count.textContent = arr.length + ' / 8 gambar';
      if (!arr.length) {
        gallery.append(el('p', 'field-help', 'Belum ada gambar. Kamu bisa melewati bagian ini.'));
        return;
      }
      arr.forEach((src, i) => {
        const item = el('div', 'ssc-vote-admin-image');
        const img = el('img');
        img.src = src;
        img.alt = 'Gambar voting ' + (i + 1);
        img.loading = 'lazy';
        const del = el('button', 'ssc-vote-image-remove', '×');
        del.type = 'button';
        del.setAttribute('aria-label', 'Lepas gambar ' + (i + 1));
        del.onclick = () => {
          arr.splice(i, 1);
          dirty();
          redraw();
        };
        item.append(img, del);
        gallery.append(item);
      });
      window.window.SSCircleSort?.attach(gallery, {
        item: '.ssc-vote-admin-image',
        onMove: (from, to) => {
          arr.splice(to, 0, arr.splice(from, 1)[0]);
          dirty();
          redraw();
        }
      });
    }
    redraw();
    void fillPicker();
  }
  function render(formData, onDirty) {
    data = formData;
    dirtyMark = onDirty;
    ensure();
    const host = root();
    if (!host)
      return;
    host.replaceChildren();
    const statusCard = card('01 · Status Voting', 'Aktifkan sesi dan tentukan siapa yang dapat berpartisipasi.');
    const controls = el('div', 'ssc-vote-controls');
    statusCard.append(controls);
    toggle(controls, 'homeVotingEnabled', 'Voting aktif', 'Tombol voting di Homepage otomatis mengikuti pengaturan ini.');
    controls.append(el('p', 'field-help', 'Pemain masuk memakai kode pendaftaran yang terverifikasi. Satu pendaftaran hanya mendapat satu suara per sesi.'));
    toggle(controls, 'homeVotingPermanent', 'Tanpa batas waktu', 'Jika dimatikan, voting akan berhenti pada waktu yang ditentukan.');
    const dateField = el('label', 'field-group');
    dateField.append(el('span', 'field-label', 'Waktu akhir voting'));
    const inputDate = el('input');
    inputDate.type = 'datetime-local';
    const deadlineDate = data.settings.homeVotingEndsAt ? new Date(data.settings.homeVotingEndsAt) : null;
    inputDate.value = deadlineDate && !Number.isNaN(deadlineDate.getTime()) ? new Date(deadlineDate.getTime() - deadlineDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    inputDate.oninput = () => {
      data.settings.homeVotingEndsAt = inputDate.value ? new Date(inputDate.value).toISOString() : '';
      dirty();
    };
    dateField.append(inputDate);
    controls.append(dateField);
    const mode = select(controls, 'homeVotingResultsMode', 'Tampilkan hasil kepada pengunjung', [['after_end', 'Setelah sesi berakhir'], ['always', 'Selama dan setelah voting'], ['hidden', 'Hanya admin']]);
    mode.classList.add('ssc-vote-control');
    host.append(statusCard);
    const questionCard = card('02 · Pertanyaan & Pilihan', 'Tulis pertanyaan yang ingin dijawab pemain, lalu tambahkan pilihan dan gambar seperlunya. Jika sudah ada suara, mulai sesi baru sebelum mengubah pilihan.');
    field(questionCard, 'homeVotingTitle', 'Judul halaman voting');
    field(questionCard, 'homeVotingQuestion', 'Pertanyaan voting', { max: 200, placeholder: 'Contoh: Event apa yang ingin kamu lihat berikutnya?' });
    field(questionCard, 'homeVotingText', 'Deskripsi tambahan', { multiline: true, max: 500 });
    field(questionCard, 'homeVotingButton', 'Teks tombol pada Homepage', { max: 90 });
    optionEditor(questionCard);
    toggle(questionCard, 'homeVotingShowImage', 'Tampilkan gambar pada halaman voting');
    imageEditor(questionCard);
    host.append(questionCard);
    const resultsCard = card('03 · Hasil Voting', 'Hasil dihitung dari seluruh suara yang masuk. Peringkat dengan suara terbanyak berada di atas.');
    const resultHead = el('div', 'ssc-vote-results-head');
    const total = el('div', 'ssc-vote-total', '0 suara masuk');
    const reload = el('button', 'button secondary', '↻ Muat ulang hasil');
    reload.type = 'button';
    reload.onclick = refreshResults;
    resultHead.append(total, reload);
    const results = el('div', 'ssc-vote-ranking');
    results.id = 'ssc-vote-ranking';
    resultsCard.append(resultHead, results);
    host.append(resultsCard);
    const bottom = el('div', 'ssc-vote-bottom');
    const preview = el('a', 'button secondary', 'Lihat halaman voting ↗');
    preview.href = 'voting.html';
    preview.target = '_blank';
    preview.rel = 'noopener noreferrer';
    const reset = el('button', 'button secondary', 'Mulai sesi voting baru');
    reset.type = 'button';
    reset.onclick = resetVotes;
    const save = el('button', 'button primary', 'Simpan pengaturan voting ✓');
    save.type = 'button';
    save.onclick = () => document.getElementById('save')?.click();
    bottom.append(preview, reset, save);
    host.append(bottom);
    void refreshResults();
  }
  async function refreshResults() {
    if (resultsBusy || !data)
      return;
    resultsBusy = true;
    const host = document.getElementById('ssc-vote-ranking');
    if (host)
      host.replaceChildren(el('p', 'field-help', 'Memuat hasil...'));
    try {
      const r = await fetch('/api/admin/voting', { credentials: 'same-origin' });
      const result = await r.json();
      if (!r.ok)
        throw Error(result.error || 'Gagal memuat hasil.');
      document.querySelector('.ssc-vote-total').textContent = result.totalVotes + ' suara masuk';
      const items = result.top10 || [];
      host.replaceChildren();
      if (!items.length) {
        host.append(el('p', 'field-help', 'Belum ada pilihan yang dapat ditampilkan.'));
        return;
      }
      for (const [index, item] of items.entries()) {
        const row = el('div', 'ssc-vote-result-row');
        row.append(el('strong', 'ssc-vote-result-rank', String(index + 1).padStart(2, '0')));
        const copy = el('div', 'ssc-vote-result-copy');
        copy.append(el('strong', '', item.label), el('small', '', item.count + ' suara · ' + item.percent + '%'));
        const track = el('div', 'ssc-vote-result-track');
        const fill = el('div', 'ssc-vote-result-fill');
        fill.style.width = item.percent + '%';
        track.append(fill);
        copy.append(track);
        row.append(copy);
        host.append(row);
      }
    }
    catch (e) {
      if (host) {
        host.replaceChildren(el('p', 'field-help', 'Hasil belum dapat dimuat: ' + e.message));
      }
    }
    finally {
      resultsBusy = false;
    }
  }
  async function resetVotes() {
    if (!data)
      return;
    if (!await SSCNotice.confirm('Mulai sesi baru dan kosongkan seluruh suara sesi sebelumnya? Tindakan ini tidak dapat dibatalkan.', { danger: true, confirmText: 'Mulai sesi baru' }))
      return;
    try {
      const r = await fetch('/api/admin/voting/reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET VOTING' })
      });
      const res = await r.json();
      if (!r.ok)
        throw Error(res.error || 'Gagal memulai sesi baru.');
      data.settings.homeVotingSessionId = res.sessionId;
      data.settings.homeVotingVotes = [];
      dirty();
      notify('Sesi baru berhasil dibuat. Simpan pengaturan jika ada perubahan lain.', 'success');
      await refreshResults();
    }
    catch (e) {
      notify(e.message, 'error');
    }
  }
  return { render, refreshResults };
})();
