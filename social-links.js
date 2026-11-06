/* SSCircle Server — public social links, configurable by admin. */

// Tampilan tautan media sosial dan ikon komunitas.

'use strict';
window.SSCircleSocial = (() => {
  const defaults = [
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
  function safeIcon(icon) {
    if (typeof icon !== 'string')
      return 'assets/tiktok-logo.png';
    if (/^assets\/(?:tiktok-logo|discord-logo|sscircle-logo|sscircle-community-icon)\.png$/.test(icon) || /^assets\/gallery\/sscircle-0[1-9]\.webp$/.test(icon) || /^\/api\/media\/[0-9a-f-]{36}$/.test(icon))
      return icon;
    try {
      const u = new URL(icon);
      if (u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.'))
        return u.href;
    }
    catch { }
    return 'assets/tiktok-logo.png';
  }
  function render(root, settings, placement) {
    if (!root)
      return;
    root.replaceChildren();
    const links = Array.isArray(settings?.homeSocialLinks) ? settings.homeSocialLinks : defaults;
    const items = links.filter(link => link && (placement === 'home' ? link.showHome === true : link.showRegistration === true));
    const parent = root.closest('.ssc-social-section');
    if (parent)
      parent.hidden = items.length === 0;
    for (const entry of items) {
      let target;
      try {
        target = new URL(entry.url);
        if (target.protocol !== 'https:')
          continue;
      }
      catch {
        continue;
      }
      const link = document.createElement('a');
      link.className = 'ssc-social-link';
      link.href = target.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = safeIcon(entry.icon);
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.onerror = null; img.src = 'assets/tiktok-logo.png'; };
      img.alt = '';
      img.loading = 'lazy';
      img.width = 38;
      img.height = 38;
      const info = document.createElement('span');
      info.className = 'ssc-social-info';
      const title = document.createElement('strong');
      title.textContent = entry.title || 'Media sosial';
      const desc = document.createElement('small');
      desc.textContent = entry.description || 'Kunjungi akun resmi';
      info.append(title, desc);
      const arrow = document.createElement('span');
      arrow.className = 'ssc-social-arrow';
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      link.append(img, info, arrow);
      root.append(link);
    }
    if (parent)
      parent.hidden = !root.children.length;
  }
  return { render };
})();
