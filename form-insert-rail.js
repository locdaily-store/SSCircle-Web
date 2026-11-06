/* SSCircle Server — contextual insert rail for the form editor. */
'use strict';
(() => {
  const workspace = document.getElementById('builder-workspace');
  const rail = document.getElementById('floating-insert-rail');
  const context = document.getElementById('floating-rail-context');
  const form = document.getElementById('form');
  if (!workspace || !rail || !context || !form) return;
  let ticking = false;
  function syncContext() {
    ticking = false;
    if (form.classList.contains('hide') || !Array.isArray(data.pages) || !data.pages.length) {
      workspace.classList.remove('rail-in-view');
      return;
    }
    const r = workspace.getBoundingClientRect();
    const editing = r.top < innerHeight - 65 && r.bottom > 105;
    workspace.classList.toggle('rail-in-view', editing);
    if (!editing) return;
    const sections = [...workspace.querySelectorAll('.form-section')];
    if (!sections.length) return;
    const anchor = Math.min(265, innerHeight * .40);
    let current = sections[0];
    for (const section of sections) {
      const bounds = section.getBoundingClientRect();
      if (bounds.top <= anchor && bounds.bottom > anchor) {
        current = section;
        break;
      }
      if (bounds.top <= anchor) current = section;
    }
    const pageIndex = data.pages.findIndex(page => page.id === current.dataset.pageId);
    if (pageIndex >= 0) {
      activePage = pageIndex;
      context.textContent = 'B' + (pageIndex + 1);
      context.title = 'Tambah konten ke Bagian ' + (pageIndex + 1) + ': ' + (data.pages[pageIndex].title || '');
      document.querySelectorAll('#page-tabs .builder-tab').forEach((tab, index) => {
        const selected = index === pageIndex;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
    }
  }
  function scheduleSync() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(syncContext);
    }
  }
  rail.querySelectorAll('[data-insert]').forEach(btn => btn.addEventListener('click', () => {
    if (!data.pages?.length) return;
    syncContext();
    const page = data.pages[activePage];
    if (!page) return;
    addBlock(btn.dataset.insert, page);
    scheduleSync();
  }));
  document.getElementById('floating-add-section')?.addEventListener('click', () => {
    document.getElementById('add-page')?.click();
    scheduleSync();
  });
  window.addEventListener('scroll', scheduleSync, { passive: true });
  window.addEventListener('resize', scheduleSync, { passive: true });
  document.querySelectorAll('[data-tab],#jump-form,#add-page').forEach(n => n.addEventListener('click', scheduleSync));
  const observer = new MutationObserver(scheduleSync);
  observer.observe(form, { attributes: true, attributeFilter: ['class'] });
  observer.observe(document.getElementById('builder'), { childList: true });
  scheduleSync();
})();
