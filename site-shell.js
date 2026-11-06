/* Header dan footer bersama untuk halaman publik selain Homepage. */
'use strict';
window.SSCircleShell = (() => {
  const menu = document.getElementById('home-menu-button');
  const nav = document.querySelector('.home-nav');
  function closeMenu() {
    document.body.classList.remove('home-menu-open');
    menu?.setAttribute('aria-expanded', 'false');
  }
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = document.body.classList.toggle('home-menu-open');
      menu.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !nav.contains(event.target)) closeMenu();
    });
  }
  function apply(settings = {}) {
    const brand = document.querySelector('.home-brand strong');
    if (brand) brand.textContent = settings.brandName || 'SSCircle';
    const logo = settings.logoImageUrl || (settings.logoMediaId ? '/api/media/' + settings.logoMediaId : 'assets/sscircle-logo.png');
    for (const id of ['home-logo', 'home-footer-logo']) {
      const img = document.getElementById(id);
      if (img) img.src = logo;
    }
    const footerText = document.getElementById('home-footer-text');
    if (footerText) footerText.textContent = settings.homeFooterText || settings.footerText || 'One circle. Endless stories.';
    const discord = settings.homeDiscordUrl;
    if (typeof discord === 'string' && /^https:\/\/(?:discord\.gg|discord\.com)\//i.test(discord))
      document.querySelectorAll('.home-footer-links a[href^="https://discord"]').forEach(link => { link.href = discord; });
  }
  const preview = new URLSearchParams(location.search).has('ssc_theme_preview');
  if (preview) {
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'ssc-theme-preview-settings') return;
      apply(event.data.settings);
    });
  } else {
    fetch('/api/form', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Gagal memuat identitas website')))
      .then(form => apply(form.settings))
      .catch(() => {});
  }
  return { apply };
})();
