/* SSCircle Server • same-origin Cloudflare API; no third-party dependencies. */

// Penghubung request website ke Cloudflare Worker.

'use strict';
const SSCircle = (() => {
  async function api(path, options = {}) {
    let r;
    try {
      r = await fetch('/api' + path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.headers || {}) } });
    }
    catch {
      throw Error('Tidak dapat tersambung ke website. Periksa koneksi internet.');
    }
    let data;
    try {
      data = await r.json();
    }
    catch {
      throw Error('Terjadi gangguan saat memuat data. Coba kembali.');
    }
    if (!r.ok) {
      const err = new Error(data.error || 'Terjadi kesalahan (' + r.status + ').');
      err.status = r.status;
      if (Number.isFinite(data.remainingSeconds))
        err.remainingSeconds = data.remainingSeconds;
      throw err;
    }
    return data;
  }
  function jsonOptions(method, data) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  }
  // Small-image mode: automatically prepare uploads to fit D1 without an R2 bucket.
  async function prepareImage(file) {
    if (file.size <= 210 * 1024)
      return file;
    if (!file.type.startsWith('image/'))
      throw Error('Pilih file gambar JPG/PNG/WEBP/GIF.');
    if (file.size > 12 * 1024 * 1024)
      throw Error('Gambar terlalu besar (maksimal 12 MB sebelum kompresi).');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    }
    catch {
      throw Error('Browser tidak bisa membaca gambar. Gunakan JPG atau PNG.');
    }
    try {
      let side = Math.min(1100 / Math.max(bitmap.width, bitmap.height), 1), w = Math.max(1, Math.round(bitmap.width * side)), h = Math.max(1, Math.round(bitmap.height * side));
      const canvas = document.createElement('canvas');
      for (let pass = 0; pass < 5; pass++) {
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d', { alpha: true }).drawImage(bitmap, 0, 0, w, h);
        for (const quality of [.8, .65, .5, .38]) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
          if (blob && blob.size <= 210 * 1024)
            return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
        }
        w = Math.max(1, Math.round(w * .76));
        h = Math.max(1, Math.round(h * .76));
      }
      throw Error('Gambar sulit dikompresi di bawah 210 KB. Pilih gambar yang lebih sederhana.');
    }
    finally {
      bitmap.close?.();
    }
  }
  return {
    uuid: () => crypto.randomUUID(),
    getForm: () => api('/form'),
    getCooldown: () => api('/registration-cooldown'),
    async submit(answers, images = {}) {
      const payload = { answers, website: '' };
      const names = Object.keys(images).filter(k => images[k]);
      if (!names.length)
        return await api('/apply', jsonOptions('POST', payload));
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      for (const name of names)
        fd.append('file_' + name, await prepareImage(images[name]));
      return await api('/apply', { method: 'POST', body: fd });
    },
    checkStatus: code => api('/status-check', jsonOptions('POST', { code })),
    login: password => api('/admin/login', jsonOptions('POST', { password })),
    isAdmin: async () => {
      try {
        return !!(await api('/admin/session')).admin;
      }
      catch {
        return false;
      }
    },
    logout: () => api('/admin/logout', jsonOptions('POST', {})),
    async getSubmissions() {
      const submissions = [];
      let offset = 0;
      for (let i = 0; i < 4000; i++) {
        const batch = await api('/admin/submissions?offset=' + offset);
        submissions.push(...batch.items);
        offset += batch.items.length;
        if (!batch.hasMore)
          return submissions;
      }
      throw Error('Terlalu banyak pendaftaran untuk dimuat sekaligus.');
    },
    async getAdminData() {
      const form = await api('/admin/form');
      return { ...form, submissions: await this.getSubmissions() };
    },
    saveForm: (settings, pages, revision) => api('/admin/form', jsonOptions('PUT', { settings, pages, revision })),
    changeStatus: (id, status, reason = '') => api('/admin/status', jsonOptions('PATCH', { id, status, reason })),
    deleteSubmissions: (payload) => api('/admin/delete-submissions', jsonOptions('POST', payload)),
    getMediaLibrary: () => api('/admin/media-library'),
    deleteUnusedMedia: (ids) => api('/admin/media-cleanup', jsonOptions('POST', { ids, confirmation: 'HAPUS MEDIA' })),
    async uploadImage(file) {
      const fd = new FormData();
      fd.append('file', await prepareImage(file));
      return api('/admin/media', { method: 'POST', body: fd });
    },
    async uploadVideo(file, onProgress = () => { }) {
      if (!file)
        throw Error('Pilih file video.');
      const mediaType = ['video/mp4', 'video/webm'].includes(file.type) ? file.type : (/\.mp4$/i.test(file.name) ? 'video/mp4' : (/\.webm$/i.test(file.name) ? 'video/webm' : ''));
      if (!mediaType)
        throw Error('Gunakan video MP4 atau WebM.');
      if (file.size < 1024 || file.size > 16 * 1024 * 1024)
        throw Error('Ukuran video maksimal 16 MB.');
      const started = await api('/admin/video/start', jsonOptions('POST', { filename: file.name, type: mediaType, size: file.size }));
      const id = started.id, chunkSize = started.chunkSize;
      try {
        for (let index = 0; index < started.chunks; index++) {
          const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
          const r = await fetch('/api/admin/video/chunk/' + id + '/' + index, {
            method: 'PUT',
            body: chunk,
            headers: { 'Content-Type': 'application/octet-stream' },
            credentials: 'same-origin',
            cache: 'no-store'
          });
          if (!r.ok) {
            let data;
            try {
              data = await r.json();
            }
            catch { }
            throw Error(data?.error || 'Gagal mengunggah bagian video.');
          }
          onProgress(Math.min(100, Math.round((index + 1) / started.chunks * 100)));
        }
        return await api('/admin/video/finish', jsonOptions('POST', { id }));
      }
      catch (e) {
        try {
          await api('/admin/video/cancel', jsonOptions('POST', { id }));
        }
        catch { }
        throw e;
      }
    }
  };
})();
