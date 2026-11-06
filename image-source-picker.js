/* SSCircle V10.17 — reusable editor for uploads, external HTTPS image URLs, and the media library.
   External images remain hosted by their providers; only the URL is saved in website settings. */

// Pemilih gambar: upload, URL, dan penyimpanan media.

'use strict';
window.SSCircleImagePicker = (() => {
  let settings = null;
  const uuidImage = /^\/api\/media\/[0-9a-f-]{36}$/i;
  const builtin = /^assets\/(?:gallery\/sscircle-0[1-9]\.webp|(?:sscircle-logo|sscircle-community-icon|tiktok-logo|discord-logo)\.png)$/i;
  const byId = (tag, className = '', text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined)
      element.textContent = text;
    return element;
  };
  function external(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > 700 || /[\u0000-\u001f\u007f<>"'\\]/.test(raw))
      return false;
    try {
      const url = new URL(raw);
      const hostname = url.hostname.toLowerCase();
      return url.protocol === 'https:' && !url.username && !url.password && hostname.includes('.') &&
        hostname !== 'localhost' && !hostname.endsWith('.localhost') && !hostname.endsWith('.local') &&
        !hostname.endsWith('.internal') && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) &&
        !hostname.startsWith('[') && !url.port;
    }
    catch {
      return false;
    }
  }
  const valid = src => typeof src === 'string' && (builtin.test(src) || uuidImage.test(src) || external(src));
  const mediaURL = entry => entry.source === 'built-in' ? entry.path : '/api/media/' + entry.id;
  function setSettings(source) { settings = source || null; }
  async function library() {
    let items = [];
    try {
      const response = await SSCircle.getMediaLibrary();
      items = (response.files || [])
        .filter(item => item.visibility === 'public' && String(item.type || '').startsWith('image/'))
        .map(item => ({ src: mediaURL(item), name: item.name || 'Gambar tersimpan' })).filter(item => valid(item.src));
    }
    catch { /* Built-in images and external bookmarks remain available without a media-library response. */ }
    for (const [src, name] of [
      ['assets/sscircle-logo.png', 'Logo SSCircle'], ['assets/sscircle-community-icon.png', 'Ikon komunitas'],
      ['assets/tiktok-logo.png', 'Logo TikTok'], ['assets/discord-logo.png', 'Logo Discord']
    ])
      items.push({ src, name });
    (settings?.homeGallery || []).forEach((entry, i) => {
      if (valid(entry.src))
        items.push({ src: entry.src, name: 'Galeri ' + (i + 1) + ' · ' + (entry.title || 'Foto') });
    });
    (settings?.homeExternalImages || []).forEach((entry, i) => {
      if (valid(entry.src))
        items.push({ src: entry.src, name: 'URL tersimpan · ' + (entry.title || 'Foto ' + (i + 1)) });
    });
    return [...new Map(items.map(item => [item.src, item])).values()];
  }
  // Image loading is checked in the user's browser; server-side code never fetches external URLs.
  function probe(url, onResult) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let finished = false;
    const complete = ok => { if (finished)
      return; finished = true; clearTimeout(timer); onResult(ok); };
    const timer = setTimeout(() => complete(false), 12000);
    img.onload = () => complete(img.naturalWidth > 0);
    img.onerror = () => complete(false);
    img.src = url;
    return () => { finished = true; clearTimeout(timer); img.onload = null; img.onerror = null; };
  }
  function mount(host, { current = () => '', onSelect, onAdd, count = () => 0, max = 1, title = 'Sumber gambar', compact = false, onUploaded } = {}) {
    if (typeof onSelect !== 'function' && typeof onAdd !== 'function')
      throw Error('Editor gambar memerlukan callback.');
    const isMany = typeof onAdd === 'function';
    const use = isMany ? onAdd : onSelect;
    const box = byId('div', 'ssc-image-source' + (compact ? ' is-compact' : ''));
    const heading = byId('div', 'ssc-image-source-heading');
    heading.append(byId('span', 'field-label', title));
    const methods = byId('div', 'ssc-image-source-methods');
    const panels = new Map();
    const buttons = new Map();
    let selected = 'upload';
    function method(name, label) {
      const button = byId('button', 'ssc-image-method', label);
      button.type = 'button';
      button.dataset.sourceMethod = name;
      buttons.set(name, button);
      const panel = byId('div', 'ssc-image-source-panel');
      panels.set(name, panel);
      button.addEventListener('click', () => switchTo(name));
      methods.append(button);
      box.append(panel);
    }
    const info = byId('small', 'field-help ssc-image-source-message');
    function switchTo(name) {
      selected = name;
      buttons.forEach((button, key) => {
        const active = key === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      panels.forEach((panel, key) => { panel.hidden = key !== name; });
      if (name === 'media')
        void reloadLibrary();
    }
    function checkLimit() {
      if (isMany && count() >= max) {
        info.textContent = 'Batas ' + max + ' gambar sudah tercapai.';
        return false;
      }
      return true;
    }
    async function apply(src) {
      if (!valid(src) || !checkLimit())
        return false;
      try {
        await use(src);
        info.textContent = '✓ Gambar dipilih. Simpan perubahan Admin Control untuk menerapkan.';
        return true;
      }
      catch (error) {
        info.textContent = 'Gagal memilih gambar: ' + (error?.message || 'Coba lagi.');
        return false;
      }
    }
    method('upload', 'Upload');
    method('url', 'Link URL');
    method('media', 'Penyimpanan Media');
    box.insertBefore(heading, box.firstChild);
    box.insertBefore(methods, panels.get('upload'));
    const fileWrap = byId('label', 'ssc-image-file-wrap');
    fileWrap.append(byId('span', 'field-label', 'Pilih foto dari perangkat'));
    const file = byId('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp,image/gif';
    file.multiple = isMany;
    file.addEventListener('change', async () => {
      const files = [...(file.files || [])];
      if (!files.length)
        return;
      if (isMany && count() + files.length > max) {
        info.textContent = 'Maksimal ' + max + ' gambar.';
        file.value = '';
        return;
      }
      file.disabled = true;
      info.textContent = 'Mengunggah gambar...';
      try {
        for (const original of files) {
          const uploaded = await SSCircle.uploadImage(original);
          if (await apply('/api/media/' + uploaded.id))
            onUploaded?.(uploaded);
        }
      }
      catch (error) {
        info.textContent = 'Upload gagal: ' + error.message;
      }
      finally {
        file.disabled = false;
        file.value = '';
      }
    });
    fileWrap.append(file);
    panels.get('upload').append(fileWrap);
    const urlRow = byId('div', 'ssc-image-url-row');
    const input = byId('input');
    input.type = 'url';
    input.inputMode = 'url';
    input.maxLength = 700;
    input.placeholder = 'https://contoh.com/foto.webp';
    input.setAttribute('aria-label', 'Link HTTPS gambar');
    if (!isMany && external(current()))
      input.value = current();
    const useURL = byId('button', 'button secondary ssc-image-use', isMany ? '+ Tambahkan URL' : 'Gunakan URL');
    useURL.type = 'button';
    const preview = byId('img', 'ssc-image-url-preview');
    preview.alt = 'Pratinjau gambar dari URL';
    preview.referrerPolicy = 'no-referrer';
    preview.hidden = true;
    const previewHint = byId('small', 'field-help', 'Tempel tautan HTTPS langsung ke gambar. Tidak disalin ke penyimpanan Cloudflare.');
    let cancelProbe;
    function inspect() {
      cancelProbe?.();
      const value = input.value.trim();
      preview.hidden = true;
      useURL.disabled = true;
      if (!value) {
        previewHint.textContent = 'Tempel tautan HTTPS langsung ke gambar.';
        return;
      }
      if (!external(value)) {
        previewHint.textContent = 'Gunakan URL HTTPS publik yang valid (bukan localhost atau IP).';
        return;
      }
      previewHint.textContent = 'Memeriksa dan memuat pratinjau gambar...';
      cancelProbe = probe(value, ok => {
        if (value !== input.value.trim())
          return;
        useURL.disabled = !ok;
        preview.hidden = !ok;
        if (ok)
          preview.src = value;
        previewHint.textContent = ok ? '✓ Gambar dapat ditampilkan. Klik Gunakan URL untuk menyimpannya.' : 'Gambar tidak bisa dibuka. Gunakan link gambar langsung yang mengizinkan tampilan eksternal.';
      });
    }
    let debounce;
    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(inspect, 300); });
    input.addEventListener('change', () => { clearTimeout(debounce); inspect(); });
    useURL.addEventListener('click', async () => {
      if (await apply(input.value.trim()) && isMany) {
        input.value = '';
        preview.hidden = true;
        useURL.disabled = true;
      }
    });
    urlRow.append(input, useURL);
    panels.get('url').append(urlRow, preview, previewHint);
    const mediaRow = byId('div', 'ssc-image-media-row');
    const picker = byId('select');
    picker.setAttribute('aria-label', 'Gambar dari Penyimpanan Media');
    const choose = byId('button', 'button secondary ssc-image-use', isMany ? '+ Tambahkan' : 'Gunakan gambar');
    choose.type = 'button';
    choose.addEventListener('click', () => { if (picker.value)
      void apply(picker.value); });
    mediaRow.append(picker, choose);
    const reload = byId('button', 'button secondary ssc-image-reload', '↻ Muat gambar');
    reload.type = 'button';
    reload.addEventListener('click', () => void reloadLibrary());
    panels.get('media').append(mediaRow, reload);
    async function reloadLibrary() {
      picker.replaceChildren();
      const wait = byId('option', '', 'Memuat gambar...');
      wait.value = '';
      picker.append(wait);
      const result = await library();
      picker.replaceChildren();
      const first = byId('option', '', result.length ? 'Pilih foto tersimpan' : 'Belum ada foto tersimpan');
      first.value = '';
      picker.append(first);
      result.forEach(item => { const option = byId('option', '', item.name); option.value = item.src; picker.append(option); });
    }
    box.append(info);
    host.append(box);
    switchTo(!isMany && external(current()) ? 'url' : 'upload');
    if (!isMany && external(current()))
      inspect();
    return { box, input, reloadLibrary, refresh: () => { if (!isMany && external(current()) && input !== document.activeElement)
        input.value = current(); } };
  }
  return { mount, valid, external, setSettings, library };
})();
