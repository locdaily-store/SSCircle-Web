/* SSCircle Server — notifikasi dan konfirmasi admin */

// Dialog konfirmasi dan pemberitahuan di Admin Control.

'use strict';
window.SSCNotice = (() => {
  let overlay = null, toastRegion = null, queue = Promise.resolve(), toastTimeout = null;
  function ensure() {
    if (!overlay) {
      overlay = document.createElement('dialog');
      overlay.className = 'ssc-ui-dialog';
      overlay.setAttribute('aria-label', 'Konfirmasi SSCircle');
      overlay.innerHTML = '<form method="dialog" class="ssc-ui-dialog-inner"><div class="ssc-ui-dialog-symbol" aria-hidden="true">✦</div><h2 class="ssc-ui-dialog-title"></h2><p class="ssc-ui-dialog-copy"></p><label class="ssc-ui-dialog-prompt" hidden><span class="field-label">KONFIRMASI</span><input type="text" autocomplete="off" spellcheck="false"></label><div class="ssc-ui-dialog-actions"><button type="button" class="button secondary ssc-ui-cancel">Batal</button><button type="submit" class="button primary ssc-ui-accept">Lanjutkan</button></div></form>';
      document.body.append(overlay);
    }
    if (!toastRegion) {
      toastRegion = document.createElement('div');
      toastRegion.className = 'ssc-toast-stack';
      toastRegion.setAttribute('role', 'status');
      toastRegion.setAttribute('aria-live', 'polite');
      document.body.append(toastRegion);
    }
  }
  function show(message, options = {}) {
    ensure();
    const run = () => new Promise(resolve => {
      const isAlert = options.mode === 'alert', isPrompt = options.mode === 'prompt';
      const title = overlay.querySelector('.ssc-ui-dialog-title'), copy = overlay.querySelector('.ssc-ui-dialog-copy');
      const prompt = overlay.querySelector('.ssc-ui-dialog-prompt'), inp = prompt.querySelector('input');
      const yes = overlay.querySelector('.ssc-ui-accept'), no = overlay.querySelector('.ssc-ui-cancel'), form = overlay.querySelector('form');
      title.textContent = options.title || (isAlert ? 'Pemberitahuan' : isPrompt ? 'Konfirmasi penghapusan' : options.danger ? 'Hapus data?' : 'Konfirmasi');
      copy.textContent = String(message || '');
      prompt.hidden = !isPrompt;
      inp.value = '';
      inp.placeholder = isPrompt ? (options.expected || '') : '';
      yes.textContent = options.confirmText || (isAlert ? 'Mengerti' : isPrompt ? 'Konfirmasi' : options.danger ? 'Hapus' : 'Lanjutkan');
      yes.classList.toggle('ssc-ui-danger', Boolean(options.danger || isPrompt));
      no.hidden = isAlert;
      let finished = false;
      function settle(value) {
        if (finished)
          return;
        finished = true;
        form.removeEventListener('submit', submit);
        no.removeEventListener('click', cancel);
        overlay.removeEventListener('cancel', escape);
        overlay.removeEventListener('close', close);
        if (overlay.open)
          overlay.close();
        resolve(value);
      }
      function submit(e) {
        e.preventDefault();
        if (isPrompt) {
          if (inp.value.trim() !== options.expected) {
            inp.classList.add('ssc-ui-invalid');
            inp.focus();
            return;
          }
          return settle(true);
        }
        settle(true);
      }
      function cancel() {
        settle(false);
      }
      function escape(e) {
        e.preventDefault();
        cancel();
      }
      function close() {
        cancel();
      }
      inp.classList.remove('ssc-ui-invalid');
      form.addEventListener('submit', submit);
      no.addEventListener('click', cancel);
      overlay.addEventListener('cancel', escape);
      overlay.addEventListener('close', close);
      if (!overlay.open)
        overlay.showModal();
      (isPrompt ? inp : yes).focus();
    });
    // Queue dialogs rather than replacing an unfinished action.
    const next = queue.then(run, run);
    queue = next.catch(() => { });
    return next;
  }
  function toast(text, type = 'success', duration = 2800) {
    ensure();
    clearTimeout(toastTimeout);
    toastRegion.replaceChildren();
    const item = document.createElement('div');
    item.className = 'ssc-toast ' + (type === 'error' ? 'ssc-toast-error' : type === 'warning' ? 'ssc-toast-warning' : 'ssc-toast-success');
    const glyph = document.createElement('span');
    glyph.className = 'ssc-toast-icon';
    glyph.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : '•';
    const copy = document.createElement('span');
    copy.textContent = text;
    item.append(glyph, copy);
    toastRegion.append(item);
    requestAnimationFrame(() => item.classList.add('is-visible'));
    toastTimeout = setTimeout(() => {
      item.classList.remove('is-visible');
      setTimeout(() => item.remove(), 280);
    }, duration);
  }
  return {
    alert: (text) => show(text, { mode: 'alert' }),
    confirm: (text, opts = {}) => show(text, opts),
    promptConfirm: (text, expected) => show(text, { mode: 'prompt', expected, danger: true }),
    toast
  };
})();
