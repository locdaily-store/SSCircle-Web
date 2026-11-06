/* SSCircle: real registration-page live preview, isolated from submitting applications. */

// Pratinjau halaman pendaftaran di Admin Control.

'use strict';
window.SSCircleRegistrationPreview = (() => {
  let form = null;
  let frame = null;
  let viewport = null;
  let panel = null;
  let badge = null;
  let mode = 'desktop';
  let timer = null;
  let listening = false;
  const el = (tag, cls = '', label) => {
    const n = document.createElement(tag);
    if (cls)
      n.className = cls;
    if (label !== undefined)
      n.textContent = label;
    return n;
  };
  const clone = object => JSON.parse(JSON.stringify(object));
  function resize() {
    if (!frame || !viewport)
      return;
    const width = mode === 'mobile' ? 390 : 1280;
    const height = mode === 'mobile' ? 860 : 900;
    const available = Math.max(200, viewport.clientWidth - 24);
    const scale = Math.min(1, available / width);
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.transform = `scale(${scale})`;
    viewport.style.height = Math.min(mode === 'mobile' ? 640 : 620, height * scale + 10) + 'px';
  }
  function update() {
    if (!form || !frame)
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        frame.contentWindow?.postMessage({
          type: 'ssc-registration-preview-settings',
          settings: clone(form.settings),
          pages: clone(form.pages)
        }, location.origin);
      }
      catch {
        badge.textContent = 'Tidak dapat memperbarui pratinjau';
      }
    }, 110);
  }
  function render(data) {
    form = data;
    const root = document.getElementById('registration-live-preview');
    if (!root)
      return;
    // Refresh data on re-login without multiplying frames, events, or timers.
    if (panel) {
      update();
      return;
    }
    panel = el('section', 'home-builder-preview-panel ssc-registration-preview-panel');
    const top = el('div', 'home-builder-preview-top');
    const heading = el('div');
    heading.append(el('strong', '', 'Pratinjau langsung Registration'), el('small', '', 'Tampilan asli formulir. Perubahan langsung terlihat sebelum disimpan.'));
    badge = el('span', 'home-preview-connection', 'Menghubungkan pratinjau...');
    top.append(heading, badge);
    const controls = el('div', 'home-builder-view-controls');
    for (const [value, label] of [['desktop', 'Desktop'], ['mobile', 'HP']]) {
      const button = el('button', 'home-builder-mini' + (mode === value ? ' is-active' : ''), label);
      button.type = 'button';
      button.onclick = () => {
        mode = value;
        controls.querySelectorAll('[data-preview-mode]').forEach(n => n.classList.toggle('is-active', n === button));
        resize();
      };
      button.dataset.previewMode = value;
      controls.append(button);
    }
    const reload = el('button', 'home-builder-mini home-preview-reload', '↻ Muat ulang');
    reload.type = 'button';
    reload.onclick = () => {
      badge.textContent = 'Memuat ulang pratinjau...';
      frame.src = 'registration.html?ssc_registration_preview=1&r=' + Date.now();
    };
    controls.append(reload);
    const fullscreen = el('button', 'home-builder-mini home-preview-expand', '⛶ Layar penuh');
    fullscreen.type = 'button';
    fullscreen.onclick = () => viewport.requestFullscreen?.();
    controls.append(fullscreen);
    const hide = el('button', 'home-builder-mini home-builder-preview-toggle', 'Sembunyikan pratinjau');
    hide.type = 'button';
    hide.onclick = () => {
      panel.classList.toggle('is-collapsed');
      hide.textContent = panel.classList.contains('is-collapsed') ? 'Tampilkan pratinjau' : 'Sembunyikan pratinjau';
      if (!panel.classList.contains('is-collapsed'))
        requestAnimationFrame(resize);
    };
    controls.append(hide);
    viewport = el('div', 'home-builder-preview-viewport');
    frame = el('iframe', 'home-builder-preview-iframe');
    frame.title = 'Pratinjau langsung halaman pendaftaran SSCircle';
    frame.scrolling = 'yes';
    frame.loading = 'eager';
    frame.src = 'registration.html?ssc_registration_preview=1';
    frame.addEventListener('load', () => { resize(); update(); });
    viewport.append(frame);
    panel.append(top, controls, viewport);
    root.append(panel);
    if (!listening) {
      listening = true;
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow)
          return;
        if (event.data?.type === 'ssc-registration-preview-ready')
          update();
        if (event.data?.type === 'ssc-registration-preview-applied') {
          badge.textContent = 'Pratinjau aktif';
          badge.classList.add('is-ready');
        }
      });
    }
    if ('ResizeObserver' in window)
      new ResizeObserver(resize).observe(viewport);
    requestAnimationFrame(resize);
    update();
  }
  return { render, update };
})();
