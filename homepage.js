/* SSCircle Server V10.9 / homepage */

// Tampilan Homepage: galeri, urutan section, profil, dan leaderboard.

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const builtInGallery = [
    ['sscircle-01.webp', 'SSCircle Community', 'Bangunan dan cerita yang tumbuh bersama komunitas.'],
    ['sscircle-02.webp', 'Castle of SSCircle', 'Arsitektur megah, dibangun dengan detail.'],
    ['sscircle-03.webp', 'Dunia yang luas', 'Setiap perjalanan membawa kisah baru.'],
    ['sscircle-04.webp', 'Sudut Kota', 'Bangunan unik yang mewarnai dunia.'],
    ['sscircle-05.webp', 'Hanami District', 'Kawasan dengan sentuhan sakura.'],
    ['sscircle-06.webp', 'The Ancient Circle', 'Pemandangan misterius dari ketinggian.'],
    ['sscircle-07.webp', 'Community Hall', 'Cerita yang lahir dari pertemuan.'],
    ['sscircle-08.webp', 'Gather Together', 'Berkumpul, membangun, dan bertualang.'],
    ['sscircle-09.webp', 'Memories', 'Kenangan berharga di dalam server.']
  ].map(([src, title, caption]) => ({ src: 'assets/gallery/' + src, title, caption }));
  const defaults = {
    homeEnabled: true,
    homeVideoEnabled: true,
    homeVideoUrl: 'assets/sscircle-cinematic.mp4',
    homeVideoOverlay: 59,
    homeHeroHeight: 94,
    homePauseOffscreen: true,
    homePoster: 'assets/gallery/sscircle-01.webp',
    homeEyebrow: 'MINECRAFT SMP · JAVA & BEDROCK',
    homeTitle: 'SSCircle Server',
    homeSubtitle: 'Setiap blok menyimpan cerita. Setiap pemain adalah bagian darinya.',
    homePrimaryCTA: 'Daftar Sekarang',
    homeSecondaryCTA: 'Jelajahi Server',
    homeStatusCTA: 'Cek Pendaftaran',
    homeStatusEyebrow: 'SUDAH MENDAFTAR?',
    homeStatusTitle: 'Pantau ceritamu berikutnya.',
    homeStatusDescription: '',
    homeAboutEyebrow: 'OUR WORLD',
    homeAboutTitle: 'Tempat cerita dimulai.',
    homeAboutText: 'Bangun duniamu, temukan teman baru, dan ciptakan momen yang akan selalu diingat. SSCircle adalah rumah untuk petualangan yang kita bentuk bersama.',
    homeAboutTagsEnabled: true,
    homeAboutTags: [{ symbol: '✧', text: 'Survival Community' }, { symbol: '✧', text: 'Java & Bedrock' }, { symbol: '✧', text: 'Petualangan Bersama' }],
    homeGalleryEyebrow: 'MOMENTS & MEMORIES',
    homeGalleryTitle: 'SSCircle Gallery',
    homeGalleryLimit: 6,
    homeGalleryText: 'Sejumlah sudut dan kenangan dari perjalanan komunitas kami.',
    homeProcessTitle: 'Join our Circle',
    homeProcessText: 'Daftar, tunggu hasil seleksi, lalu mulai cerita barumu di server.',
    homeDiscordTitle: 'Temukan komunitasmu.',
    homeDiscordText: 'Pengumuman, informasi pendaftaran, dan obrolan pemain tersedia di Discord SSCircle Community.',
    homeDiscordUrl: 'https://discord.gg/vQQSgY2GRS',
    homeFooterText: 'One circle. Endless stories.',
    homeClosedMessage: 'Pendaftaran sedang ditutup, coba lagi lain kali dan tunggu informasi lebih lanjut dari Discord dan Admin Server',
    homeDonateEnabled: true,
    homeDonateTitle: 'Jika ingin mendukung server ini',
    homeDonateText: 'Donasi kalian akan sangat membantu dalam memperpanjang dan memperbaiki server ini. Terima kasih banyak atas dukungan kalian!',
    homeDonateButton: 'Donasi Sekarang ↗',
    homeDonateUrl: 'https://sociabuzz.com/jasits',
    homeDonateIcon: 'assets/sscircle-community-icon.png',
    homeVotingEnabled: false,
    homeVotingTitle: 'Voting Komunitas',
    homeVotingText: 'Ikuti voting komunitas SSCircle dan pilih opsi favoritmu.',
    homeVotingButton: 'Vote Sekarang ↗',
    homeVotingDeadlineLabel: 'Voting akan ditutup pada waktunya.',
    homeVotingPermanent: false,
    homeVotingEndsAt: '',
    homeVotingShowImage: true,
    homeVotingImage: '',
    homeVotingResultsMode: 'after_end',
    homeVotingOptions: [{ id: 'opsi-1', label: 'Pilihan 1' }, { id: 'opsi-2', label: 'Pilihan 2' }],
    homeVotingVotes: [],
    seasonArchiveEnabled: false,
    homeSeasonHighlightsEnabled: false,
    homeSeasonHighlightsCount: 2,
    homeSeasonHighlightsStyle: 'cards',
    homeSeasonHighlightsHideEmpty: true,
    homeSeasonHighlightsTitle: 'Season Highlights',
    homeSeasonHighlightsDescription: 'Cerita dan kenangan dari season SSCircle.',
    homeSeasonHighlightsButton: 'Jelajahi Semua Season ↗',
    homeLeaderboardEnabled: false,
    homeLeaderboardTitle: 'Leaderboard Komunitas',
    homeLeaderboardText: 'Riwayat pemain terbaik dari setiap season SSCircle.',
    homeLeaderboardSeasons: [
      { id: 'season-1', title: 'Leaderboard S1', entries: [{ name: '', score: '' }, { name: '', score: '' }, { name: '', score: '' }] },
      { id: 'season-2', title: 'Leaderboard S2', entries: [{ name: '', score: '' }, { name: '', score: '' }, { name: '', score: '' }] }
    ],
    homeProfileEnabled: false,
    homeShowProfile: false,
    homeProfileEyebrow: 'PROFILE / HISTORY',
    homeProfileTitle: 'Cerita di balik SSCircle',
    homeProfileSubtitle: 'Dari pemain, untuk komunitas.',
    homeProfileText: 'Kenali perjalanan dan sosok di balik komunitas SSCircle Server.',
    homeProfileImage: 'assets/sscircle-logo.png',
    homeProfileItems: [],
    homeProfileCardSize: 'normal',
    homeGallery: builtInGallery,
    homeSocialLinks: [
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
    ],
    homeShowAbout: true,
    homeShowGallery: true,
    homeShowProcess: true,
    homeShowDiscord: true,
    homeShowDonate: true,
    homeShowVoting: false,
    homeShowLeaderboard: false,
    homeUpcomingEnabled: false,
    homeUpcomingCount: 2,
    homeUpcomingLayout: 'grid',
    homeUpcomingOngoingFirst: true,
    homeUpcomingHideEmpty: true,
    homeUpcomingTitle: 'Upcoming Events',
    homeUpcomingDescription: 'Catat tanggalnya dan ikuti kegiatan SSCircle berikutnya.',
    homeUpcomingButton: 'Lihat Seluruh Jadwal ↗',
    homeLayout: [
      { id: 'about', kind: 'builtin' },
      { id: 'gallery', kind: 'builtin' },
      { id: 'upcoming', kind: 'builtin' },
      { id: 'process', kind: 'builtin' },
      { id: 'community', kind: 'builtin' },
      { id: 'profile', kind: 'builtin' },
      { id: 'leaderboard', kind: 'builtin' },
      { id: 'season-highlights', kind: 'builtin' },
      { id: 'status', kind: 'builtin' }
    ],
    accentColor: '#bc91f5',
    secondaryColor: '#8069bf',
    backgroundColor: '#0c0815',
    backgroundEndColor: '#1b1030',
    pageBackgroundMode: 'gradient',
    pageBackgroundAngle: 160,
    textColor: '#f5efff',
    mutedColor: '#b8a5ca',
    panelColor: '#20142f',
    borderColor: '#62457d',
    highlightColor: '#b29ad6',
    logoMediaId: '',
    open: true
  };
  const builtinParts = {
    about: 'tentang',
    gallery: 'galeri',
    upcoming: 'home-upcoming',
    process: 'proses',
    community: 'komunitas',
    profile: 'profile',
    leaderboard: 'leaderboard',
    'season-highlights': 'home-season-highlights',
    status: 'status-quick'
  };
  const video = $('home-cinematic'), hero = $('home-hero');
  let gallery = [], currentImage = 0, manualPause = false, isVisible = true, pauseOffscreen = true, leaderboardIndex = 0, observer;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');
  function safeImg(value) {
    if (typeof value !== 'string')
      return 'assets/gallery/sscircle-01.webp';
    if (/^assets\/(?:gallery\/sscircle-0[1-9]\.webp|(?:sscircle-logo|sscircle-community-icon|tiktok-logo|discord-logo)\.png)$/.test(value) || /^\/api\/media\/[0-9a-f-]{36}$/.test(value))
      return value;
    try {
      const u = new URL(value);
      if (u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname.includes('.') &&
        !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) && !u.hostname.endsWith('.local'))
        return u.href;
    }
    catch { /* Show the bundled fallback. */ }
    return 'assets/gallery/sscircle-01.webp';
  }
  const paint = (id, text) => {
    const node = $(id);
    if (node)
      node.textContent = String(text ?? '');
  };
  // Keep the label and arrow as separate pieces: textContent would otherwise
  // discard the arrow span and flatten the original three-button design.
  function heroButtonLabel(id, rawText, fallbackArrow) {
    const button = $(id);
    if (!button)
      return;
    const value = String(rawText ?? '').trim();
    const suffix = value.match(/\s*([↗→↓↑])$/);
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = suffix ? suffix[1] : fallbackArrow;
    const label = suffix ? value.slice(0, suffix.index).trimEnd() : value;
    button.replaceChildren(document.createTextNode(label + ' '), arrow);
  }
  function theme(s) {
    const map = {
      accentColor: '--ssc-primary',
      secondaryColor: '--ssc-secondary',
      backgroundColor: '--ssc-bg',
      backgroundEndColor: '--ssc-bg-end',
      textColor: '--ssc-text',
      mutedColor: '--ssc-muted',
      panelColor: '--ssc-panel',
      borderColor: '--ssc-border',
      highlightColor: '--ssc-highlight'
    };
    for (const [k, v] of Object.entries(map)) {
      if (/^#[0-9a-f]{6}$/i.test(s[k] || ''))
        document.documentElement.style.setProperty(v, s[k]);
    }
    const accent = s.accentColor?.match(/^#(..)(..)(..)$/);
    if (accent)
      document.documentElement.style.setProperty('--home-primary-rgb', [1, 2, 3].map(i => parseInt(accent[i], 16)).join(','));
  }
  function setupReveals() {
    observer?.disconnect();
    const nodes = [...document.querySelectorAll('.home-reveal')];
    if (prefersReduced.matches || !('IntersectionObserver' in window)) {
      nodes.forEach(node => node.classList.add('is-shown'));
      return;
    }
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-shown');
        observer.unobserve(entry.target);
      }
    }), { threshold: .08, rootMargin: '0px 0px 60px 0px' });
    nodes.forEach(node => observer.observe(node));
  }
  function playing() {
    if (!video || video.hidden)
      return;
    if (prefersReduced.matches || manualPause || (pauseOffscreen && !isVisible) || document.hidden) {
      video.pause();
      return;
    }
    video.play().catch(() => video.classList.add('video-unavailable'));
  }
  function headline(title) {
    const node = $('home-title');
    if (!node)
      return;
    const words = String(title || 'SSCircle Server').trim().split(/\s+/);
    if (words.length > 1) {
      const last = words.pop();
      const em = document.createElement('em');
      em.textContent = last;
      node.replaceChildren(document.createTextNode(words.join(' ') + ' '), em);
    }
    else
      node.textContent = words[0] || '';
  }
  function openImage(i) {
    currentImage = i;
    showImage();
    $('home-gallery-dialog')?.showModal();
  }
  function showImage() {
    const item = gallery[currentImage];
    if (!item)
      return;
    const img = $('home-gallery-preview');
    if (img) {
      img.src = safeImg(item.src);
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.onerror = null; img.src = 'assets/gallery/sscircle-01.webp'; };
      img.alt = item.title || 'Galeri SSCircle';
    }
  }
  function renderGallery(s) {
    const collection = Array.isArray(s.homeGallery) ? s.homeGallery : builtInGallery;
    const photos = collection.filter(item => item && item.src);
    const requested = Number(s.homeGalleryLimit);
    const limit = Number.isInteger(requested) && requested >= 1 && requested <= 80 ? requested : 6;
    gallery = photos.slice(0, limit);
    const grid = $('home-gallery-grid');
    if (!grid)
      return;
    grid.replaceChildren();
    gallery.forEach((item, i) => {
      const fig = document.createElement('button');
      fig.type = 'button';
      fig.className = 'home-gallery-item home-reveal' + (i === 0 ? ' home-gallery-featured' : '');
      const img = document.createElement('img');
      img.src = safeImg(item.src);
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.onerror = null; img.src = 'assets/gallery/sscircle-01.webp'; };
      img.alt = item.title || 'SSCircle Gallery';
      img.loading = i < 3 ? 'eager' : 'lazy';
      img.decoding = 'async';
      fig.append(img);
      fig.addEventListener('click', () => openImage(i));
      grid.append(fig);
    });
    paint('home-gallery-counter', String(gallery.length).padStart(2, '0') + ' / MEMORIES');
    setupReveals();
  }
  function safeButtonURL(url) {
    if ([
      'registration.html',
      'status.html',
      '/voting',
      '#tentang',
      '#galeri',
      '#komunitas',
      '#proses',
      '#donasi',
      '#voting',
      '#leaderboard',
      '#status-quick'
    ].includes(url))
      return url;
    if (typeof url === 'string') {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' && !parsed.username && !parsed.password)
          return parsed.href;
      }
      catch { }
    }
    return 'registration.html';
  }
  function buildCustom(item) {
    const section = document.createElement('section');
    section.id = item.id;
    section.className = 'home-custom-block home-reveal' + (item.width === 'half' ? ' home-custom-half' : '') + (item.align === 'center' ? ' home-custom-center' : '') + (item.appearance === 'plain' ? ' home-custom-plain' : '');
    const inner = document.createElement('div');
    inner.className = 'home-custom-inner';
    if (item.type === 'divider') {
      const hr = document.createElement('div');
      hr.className = 'home-custom-divider';
      inner.append(hr);
    }
    if (item.title && item.type !== 'divider') {
      const title = document.createElement('h2');
      title.textContent = item.title;
      inner.append(title);
    }
    if (item.description) {
      const p = document.createElement('p');
      p.textContent = item.description;
      inner.append(p);
    }
    const images = Array.isArray(item.images) ? item.images : (item.image ? [{ src: item.image, caption: item.caption || '' }] : []);
    if (images.length) {
      const g = document.createElement('div');
      g.className = 'home-custom-images' + (images.length > 1 ? ' is-multiple' : '');
      for (const photo of images) {
        if (!photo.src)
          continue;
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = safeImg(photo.src);
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => { img.onerror = null; img.src = 'assets/gallery/sscircle-01.webp'; };
        img.loading = 'lazy';
        img.alt = photo.caption || item.title || 'Foto SSCircle';
        img.className = 'home-custom-image';
        figure.append(img);
        if (photo.caption) {
          const caption = document.createElement('figcaption');
          caption.textContent = photo.caption;
          figure.append(caption);
        }
        g.append(figure);
      }
      inner.append(g);
    }
    const buttons = Array.isArray(item.buttons) ? item.buttons : (['button', 'feature'].includes(item.type) ? [{ label: item.buttonText || 'Selengkapnya', href: item.href || 'registration.html' }] : []);
    if (buttons.length) {
      const actions = document.createElement('div');
      actions.className = 'home-custom-actions';
      for (const [i, b] of buttons.entries()) {
        const anchor = document.createElement('a');
        anchor.className = 'home-button ' + (i === 0 && item.type === 'feature' ? 'home-button-primary' : 'home-button-secondary');
        anchor.href = safeButtonURL(b.href);
        if (anchor.href.startsWith('https://')) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        }
        anchor.textContent = b.label || 'Selengkapnya';
        actions.append(anchor);
      }
      inner.append(actions);
    }
    if (item.type !== 'divider') {
      const label = document.createElement('div');
      label.className = 'home-section-label home-custom-order-label';
      const number = document.createElement('span');
      number.className = 'home-order-number';
      const divider = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = item.title || 'BAGIAN TAMBAHAN';
      label.append(number, divider, name);
      section.append(label);
    }
    section.append(inner);
    return section;
  }
  function arrangeHomepage(s) {
    const parent = $('home-content-sections');
    if (!parent)
      return;
    const configured = Array.isArray(s.homeLayout) ? s.homeLayout : defaults.homeLayout;
    const used = new Set(), ordered = [];
    for (const block of configured) {
      if (!block || typeof block.id !== 'string' || used.has(block.id) || block.id === 'voting' || block.id === 'donate')
        continue;
      used.add(block.id);
      if (block.kind === 'builtin' && builtinParts[block.id]) {
        const el = $(builtinParts[block.id]);
        if (el)
          ordered.push(el);
      }
      else if (block.kind === 'custom' && ['text', 'button', 'image', 'feature', 'divider'].includes(block.type))
        ordered.push(buildCustom(block));
    }
    for (const id of Object.keys(builtinParts)) {
      if (!used.has(id)) {
        const el = $(builtinParts[id]);
        if (el)
          ordered.push(el);
      }
    }
    parent.replaceChildren(...ordered);
  }
  // Nomor tidak disimpan: selalu dihitung dari posisi nyata setelah drag/drop.
  // Kartu yang disembunyikan / nonaktif, termasuk profile kosong, tidak dihitung.
  function updateSectionNumbers() {
    const parent = $('home-content-sections');
    if (!parent)
      return;
    let number = 0;
    for (const section of parent.children) {
      const visible = !section.hidden && getComputedStyle(section).display !== 'none';
      const isDivider = section.classList.contains('home-custom-block') && !!section.querySelector('.home-custom-divider');
      const label = section.querySelector('.home-section-label');
      if (!visible || isDivider) {
        section.removeAttribute('data-home-order');
        continue;
      }
      const ordinal = String(++number).padStart(2, '0');
      section.dataset.homeOrder = ordinal;
      if (label) {
        let first = label.querySelector(':scope > .home-order-number');
        if (!first) {
          first = label.querySelector(':scope > span:first-child');
          if (first)
            first.classList.add('home-order-number');
        }
        if (first)
          first.textContent = ordinal;
      }
      else if (section.id === 'status-quick') {
        let marker = section.querySelector('.home-quick-order');
        if (!marker) {
          marker = document.createElement('span');
          marker.className = 'home-quick-order';
          section.firstElementChild?.prepend(marker);
        }
        marker.textContent = ordinal + '  /  CEK STATUS';
      }
    }
  }
  function votingRuntime(s) {
    const end=s.homeVotingPermanent?0:Date.parse(s.homeVotingEndsAt||'');
    const expired=Number.isFinite(end)&&end>0&&end<=Date.now();
    const active=s.homeVotingEnabled===true&&!expired;
    const first=Array.isArray(s.homeVotingQuestions)&&s.homeVotingQuestions.length?s.homeVotingQuestions[0]:
      {id:'question-1',options:s.homeVotingOptions||[]};
    const counts=Object.fromEntries(first.options.map(o=>[o.id,0]));
    for(const vote of s.homeVotingVotes||[])
      if((vote.questionId||'question-1')===first.id&&Object.hasOwn(counts,vote.optionId))counts[vote.optionId]++;
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    const results=first.options.map(o=>({id:o.id,label:o.label,count:counts[o.id]||0,
      percent:total?Math.round((counts[o.id]||0)/total*1000)/10:0}));
    const mode=['always','after_end','hidden'].includes(s.homeVotingResultsMode)?s.homeVotingResultsMode:'after_end';
    return {active,results,total,showResults:mode==='always'||(mode==='after_end'&&!active)};
  }
  function renderVotingSummary(s) {
    const button = $('home-hero-voting-button');
    if (button) {
      button.hidden = s.homeVotingEnabled !== true;
      button.href = '/voting';
      heroButtonLabel('home-hero-voting-button', s.homeVotingButton || 'Vote Sekarang ↗', '↗');
    }
  }
  function renderLeaderboard(s) {
    paint('home-leaderboard-title', s.homeLeaderboardTitle);
    paint('home-leaderboard-description', s.homeLeaderboardText);
    const seasons = (Array.isArray(s.homeLeaderboardSeasons) ? s.homeLeaderboardSeasons : []).filter(season => season && season.title);
    const wrap = $('home-leaderboard-slides'), dots = $('home-leaderboard-dots');
    if (!wrap || !dots)
      return;
    wrap.replaceChildren();
    dots.replaceChildren();
    if (!seasons.length) {
      const empty = document.createElement('div');
      empty.className = 'home-leaderboard-empty';
      empty.textContent = 'Leaderboard belum diisi.';
      wrap.append(empty);
      $('home-leaderboard-prev').disabled = true;
      $('home-leaderboard-next').disabled = true;
      return;
    }
    leaderboardIndex = Math.min(leaderboardIndex, seasons.length - 1);
    seasons.forEach((season, index) => {
      const slide = document.createElement('article');
      slide.className = 'home-leaderboard-slide' + (index === leaderboardIndex ? ' is-active' : '');
      const heading = document.createElement('h3');
      heading.textContent = season.title;
      slide.append(heading);
      const list = document.createElement('ol');
      list.className = 'home-leaderboard-list';
      const entries = (Array.isArray(season.entries) ? season.entries : []).filter(entry => entry && (entry.name || entry.score));
      if (!entries.length) {
        const li = document.createElement('li');
        li.className = 'home-leaderboard-item';
        li.textContent = 'Belum ada data.';
        list.append(li);
      }
      else {
        entries.forEach((entry, rank) => {
          const li = document.createElement('li');
          li.className = 'home-leaderboard-item';
          const num = document.createElement('span');
          num.className = 'home-leaderboard-rank';
          num.textContent = String(rank + 1).padStart(2, '0');
          const name = document.createElement('strong');
          name.textContent = entry.name || '-';
          const score = document.createElement('small');
          score.textContent = entry.score || '';
          li.append(num, name, score);
          list.append(li);
        });
      }
      slide.append(list);
      wrap.append(slide);
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'home-leaderboard-dot' + (index === leaderboardIndex ? ' is-active' : '');
      dot.setAttribute('aria-label', 'Tampilkan ' + season.title);
      dot.onclick = () => {
        leaderboardIndex = index;
        renderLeaderboard(s);
      };
      dots.append(dot);
    });
    const change = delta => {
      leaderboardIndex = (leaderboardIndex + delta + seasons.length) % seasons.length;
      renderLeaderboard(s);
    };
    $('home-leaderboard-prev').disabled = seasons.length < 2;
    $('home-leaderboard-next').disabled = seasons.length < 2;
    $('home-leaderboard-prev').onclick = () => change(-1);
    $('home-leaderboard-next').onclick = () => change(1);
  }
  function openProfileDetail(card) {
    const dialog = $('home-profile-dialog');
    if (!dialog || !card || card.detailEnabled !== true)
      return;
    const picture = $('home-profile-detail-image');
    picture.src = safeImg(card.detailImage || card.src);
    picture.alt = 'Foto detail ' + (card.title || 'Profil SSCircle');
    picture.onerror = () => { picture.onerror = null; picture.src = safeImg(card.src); };
    paint('home-profile-detail-title', card.detailTitle || card.title || 'Profil & Sejarah');
    paint('home-profile-detail-subtitle', card.subtitle || '');
    const description = $('home-profile-detail-description');
    description.textContent = card.detailDescription || '';
    description.hidden = card.detailDescriptionEnabled === false || !description.textContent.trim();
    // Keep the modal visible when the longer description is intentionally disabled.
    if (!dialog.open)
      dialog.showModal();
  }
  function renderProfileCards(settings) {
    const grid = $('home-profile-grid');
    if (!grid)
      return;
    const sizes = { compact: 'compact', normal: 'normal', wide: 'wide' };
    grid.dataset.size = sizes[settings.homeProfileCardSize] || 'normal';
    const legacy = [{
        src: settings.homeProfileImage || 'assets/sscircle-logo.png',
        title: 'SSCircle Server',
        subtitle: 'Profil & Sejarah'
      }];
    // Backward compatible: previously this section stored only one photo.
    const cards = Array.isArray(settings.homeProfileItems) ? settings.homeProfileItems : legacy;
    grid.replaceChildren();
    for (const card of cards) {
      const src = ['assets/sscircle-logo.png', 'assets/sscircle-community-icon.png'].includes(card?.src)
        ? card.src : safeImg(card?.src);
      const interactive = card?.detailEnabled === true;
      const item = document.createElement(interactive ? 'button' : 'article');
      item.className = 'home-profile-item' + (interactive ? ' is-interactive' : '');
      if (interactive) {
        item.type = 'button';
        item.setAttribute('aria-haspopup', 'dialog');
        item.setAttribute('aria-label', 'Lihat cerita lengkap: ' + (card?.title || 'Profil & Sejarah'));
        item.addEventListener('click', () => openProfileDetail(card));
      }
      const figure = document.createElement('div');
      figure.className = 'home-profile-item-image';
      const img = document.createElement('img');
      img.src = src;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.onerror = null; img.src = 'assets/sscircle-logo.png'; };
      img.alt = card?.title ? 'Foto ' + card.title : 'Foto SSCircle';
      img.loading = 'lazy';
      img.decoding = 'async';
      figure.append(img);
      const content = document.createElement('div');
      content.className = 'home-profile-item-copy';
      if (card?.title) {
        const h = document.createElement('h4');
        h.textContent = card.title;
        content.append(h);
      }
      if (card?.subtitle) {
        const p = document.createElement('p');
        p.textContent = card.subtitle;
        content.append(p);
      }
      item.append(figure, content);
      grid.append(item);
    }
    if (!cards.length) {
      const empty = document.createElement('p');
      empty.className = 'home-profile-empty';
      empty.textContent = 'Foto profil belum ditambahkan.';
      grid.append(empty);
    }
  }
  function renderUpcomingEvents(s) {
    const section = $('home-upcoming'), list = $('home-upcoming-cards');
    if (!section || !list) return;
    list.replaceChildren();
    paint('home-upcoming-title',s.homeUpcomingTitle);
    paint('home-upcoming-description',s.homeUpcomingDescription);
    paint('home-upcoming-link',s.homeUpcomingButton);
    const now = Date.now();
    const items = Array.isArray(s.eventsItems) && s.eventsEnabled !== false ? s.eventsItems.filter(e =>
      e && Number.isFinite(Date.parse(e.startAt)) && Number.isFinite(Date.parse(e.endAt)) && Date.parse(e.endAt) > now) : [];
    items.sort((a,b)=> {
      const aStart=Date.parse(a.startAt),bStart=Date.parse(b.startAt);
      if(s.homeUpcomingOngoingFirst !== false){const aLive=aStart<=now,bLive=bStart<=now;
        if(aLive!==bLive)return aLive?-1:1;}
      return aStart-bStart;
    });
    const count=[1,2,3].includes(Number(s.homeUpcomingCount))?Number(s.homeUpcomingCount):2;
    for(const event of items.slice(0,count)){
      const card=document.createElement('article');card.className='home-upcoming-card';
      if(event.image){const image=document.createElement('img');image.src=safeImg(event.image);image.alt='Poster '+event.title;image.loading='lazy';card.append(image);}
      const body=document.createElement('div');body.className='home-upcoming-card-body';
      const badge=document.createElement('span');badge.className='home-upcoming-status';badge.textContent=Date.parse(event.startAt)<=now?'Berlangsung':'Akan Datang';
      const title=document.createElement('h3');title.textContent=event.title;
      const date=document.createElement('p');date.textContent=new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'}).format(new Date(event.startAt))+' WITA';
      body.append(badge,title,date);if(event.location){const location=document.createElement('small');location.textContent=event.location;body.append(location);}
      const link=document.createElement('a');link.className='home-upcoming-detail';link.href='events.html';link.textContent='Lihat jadwal lengkap ↗';body.append(link);
      card.append(body);list.append(card);
    }
    if (!items.length && s.homeUpcomingHideEmpty === false) {
      const empty=document.createElement('p');empty.className='events-empty';empty.textContent='Belum ada event mendatang.';list.append(empty);
    }
    list.dataset.layout=s.homeUpcomingLayout==='slider'?'slider':'grid';
    section.hidden = s.homeUpcomingEnabled !== true || (!list.children.length && s.homeUpcomingHideEmpty !== false);
  }
  function renderSeasonHighlights(settings) {
    const section=$('home-season-highlights'),root=$('home-season-cards');
    if(!section||!root) return;
    root.replaceChildren();
    paint('home-season-title',settings.homeSeasonHighlightsTitle||'Season Highlights');
    paint('home-season-description',settings.homeSeasonHighlightsDescription||'');
    paint('home-season-link',settings.homeSeasonHighlightsButton||'Jelajahi Semua Season ↗');
    const seasons=(Array.isArray(settings.homeLeaderboardSeasons)?settings.homeLeaderboardSeasons:[])
      .filter(item=>item?.archivePublished===true).slice(0,[1,2,3].includes(Number(settings.homeSeasonHighlightsCount))?Number(settings.homeSeasonHighlightsCount):2);
    root.dataset.layout=settings.homeSeasonHighlightsStyle==='timeline'?'timeline':'cards';
    for(const season of seasons){
      const card=document.createElement('a');card.href='seasons.html';card.className='home-season-card';
      if(season.archiveCover){const image=document.createElement('img');image.src=safeImg(season.archiveCover);image.loading='lazy';image.alt='Foto '+season.title;card.append(image);}
      const body=document.createElement('div');body.className='home-season-card-content';
      const title=document.createElement('h3');title.textContent=season.title||'Season SSCircle';body.append(title);
      if(season.archiveStartDate){const meta=document.createElement('small');meta.textContent='Mulai '+new Date(season.archiveStartDate+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});body.append(meta);}
      if(season.archiveSummary){const desc=document.createElement('p');desc.textContent=season.archiveSummary;body.append(desc);}
      const arrow=document.createElement('span');arrow.textContent='Lihat sejarah ↗';body.append(arrow);card.append(body);root.append(card);
    }
    const enabled=settings.seasonArchiveEnabled===true&&settings.homeSeasonHighlightsEnabled===true;
    section.hidden=!enabled||(!root.children.length&&settings.homeSeasonHighlightsHideEmpty!==false);
    $('home-season-link').hidden=!enabled;
  }
  function apply(settings) {
    const s = { ...defaults, ...settings };
    if (s.homeProcessTitle === 'Bergabung dalam lingkaran.')
      s.homeProcessTitle = 'Join our Circle';
    theme(s);
    window.SSCircleTheme?.apply(s);
    paint('home-eyebrow', '✦  ' + s.homeEyebrow);
    headline(s.homeTitle);
    paint('home-subtitle', s.homeSubtitle);
    heroButtonLabel('home-registration-button', s.homePrimaryCTA, '↗');
    heroButtonLabel('home-explore-button', s.homeSecondaryCTA, '↓');
    paint('home-about-eyebrow', s.homeAboutEyebrow);
    paint('home-about-title', s.homeAboutTitle);
    paint('home-about-text', s.homeAboutText);
    const aboutTags = document.getElementById('home-feature-tags');
    if (aboutTags) {
      aboutTags.replaceChildren();
      const source = Array.isArray(s.homeAboutTags) ? s.homeAboutTags : defaults.homeAboutTags;
      for (const item of source.slice(0, 16)) {
        const label = String(item?.text || '').trim();
        if (!label || s.homeAboutTagsEnabled === false)
          continue;
        const tag = document.createElement('span');
        tag.textContent = [String(item?.symbol ?? '✧').trim(), label].filter(Boolean).join(' ');
        aboutTags.append(tag);
      }
      aboutTags.hidden = !aboutTags.childElementCount;
    }
    paint('home-gallery-eyebrow', s.homeGalleryEyebrow);
    paint('home-gallery-title', s.homeGalleryTitle);
    paint('home-gallery-description', s.homeGalleryText);
    paint('home-process-title', s.homeProcessTitle);
    paint('home-process-description', s.homeProcessText);
    paint('home-process-button', s.homePrimaryCTA + ' ↗');
    paint('home-discord-title', s.homeDiscordTitle);
    paint('home-discord-description', s.homeDiscordText);
    paint('home-donate-title', s.homeDonateTitle);
    paint('home-donate-description', s.homeDonateText);
    paint('home-donate-cta', s.homeDonateButton || 'Donasi Sekarang ↗');
    paint('home-footer-text', s.homeFooterText);
    paint('home-status-button', s.homeStatusCTA + ' ↗');
    paint('home-status-eyebrow', s.homeStatusEyebrow);
    paint('home-status-title', s.homeStatusTitle);
    paint('home-status-description', s.homeStatusDescription);
    paint('home-profile-eyebrow', s.homeProfileEyebrow);
    paint('home-profile-title', s.homeProfileTitle);
    paint('home-profile-subtitle', s.homeProfileSubtitle);
    paint('home-profile-description', s.homeProfileText);
    renderProfileCards({ ...s, homeProfileItems: settings.homeProfileItems });
    const logo = s.logoImageUrl || (s.logoMediaId ? '/api/media/' + s.logoMediaId : 'assets/sscircle-logo.png');
    $('home-logo').src = logo;
    $('home-footer-logo').src = logo;
    const communityURL = /^https:\/\/(discord\.gg|discord\.com)\//.test(s.homeDiscordUrl) ? s.homeDiscordUrl : defaults.homeDiscordUrl;
    $('home-discord-button').href = communityURL;
    document.querySelectorAll('.home-footer-links a[href^="https://discord"]').forEach(a => a.href = communityURL);
    const donateButton = $('home-donate-button');
    if (donateButton) {
      donateButton.href = /^https:\/\//.test(s.homeDonateUrl || '') ? s.homeDonateUrl : defaults.homeDonateUrl;
      donateButton.target = '_blank';
      donateButton.rel = 'noopener noreferrer';
    }
    const donateIcon = $('home-donate-icon');
    if (donateIcon)
      donateIcon.src = safeImg(s.homeDonateIcon || defaults.homeDonateIcon);
    const poster = safeImg(s.homePoster);
    hero.style.setProperty('--home-poster', `url("${poster}")`);
    video.poster = poster;
    const rawVideo = s.homeVideoUrl || defaults.homeVideoUrl;
    const validVideo = rawVideo === 'assets/sscircle-cinematic.mp4' || /^\/api\/media\/[0-9a-f-]{36}(?:\?format=(?:mp4|webm))?$/.test(rawVideo)
      || /^https:\/\/[^\s<>"']+\.(mp4|webm)(\?[^<>"']*)?$/i.test(rawVideo);
    video.hidden = !s.homeVideoEnabled || !validVideo || prefersReduced.matches;
    if (!video.hidden) {
      let source = video.querySelector('source');
      if (source.getAttribute('src') !== rawVideo) {
        source.src = rawVideo;
        source.type = /(?:\.webm|format=webm)(?:\?|$)/i.test(rawVideo) ? 'video/webm' : 'video/mp4';
        video.load();
      }
    }
    hero.style.setProperty('--home-overlay-opacity', String(Math.min(85, Math.max(20, Number(s.homeVideoOverlay) || 59)) / 100));
    hero.style.setProperty('--home-hero-height', String(Math.min(100, Math.max(70, Number(s.homeHeroHeight) || 94))) + 'svh');
    pauseOffscreen = s.homePauseOffscreen !== false;
    $('home-video-toggle').hidden = video.hidden;
    playing();
    for (const [id, enabled] of [
      ['tentang', s.homeShowAbout],
      ['galeri', s.homeShowGallery],
      ['proses', s.homeShowProcess],
      ['komunitas', s.homeShowDiscord],
      ['home-community-donate', s.homeShowDonate !== false && s.homeDonateEnabled !== false],
      ['profile', s.homeShowProfile === true && s.homeProfileEnabled === true],
      [
        'leaderboard',
        s.homeShowLeaderboard && Array.isArray(s.homeLeaderboardSeasons)
          && s.homeLeaderboardSeasons.some(season => Array.isArray(season.entries) && season.entries.some(entry => entry && (entry.name || entry.score)))
      ]
    ]) {
      $(id).hidden = enabled === false;
    }
    if (s.homeShowGallery === false)
      $('home-explore-button').href = '#tentang';
    const closed = !s.open;
    $('home-closed-notice').hidden = !closed;
    $('home-closed-notice').textContent = s.homeClosedMessage || defaults.homeClosedMessage;
    $('home-registration-button').classList.toggle('registration-closed', closed);
    arrangeHomepage(s);
    renderUpcomingEvents(s);
    renderSeasonHighlights(s);
    document.querySelectorAll('[data-season-link]').forEach(link=>{link.hidden=s.seasonArchiveEnabled!==true;});
    updateSectionNumbers();
    renderGallery(s);
    renderVotingSummary(s);
    renderLeaderboard(s);
    window.SSCircleSocial?.render(document.getElementById('home-social-grid'), s, 'home');
    document.title = s.homeTitle + ' | Official Website';
    setupReveals();
  }
  $('home-gallery-prev').onclick = () => {
    currentImage = (currentImage + gallery.length - 1) % gallery.length;
    showImage();
  };
  $('home-gallery-next').onclick = () => {
    currentImage = (currentImage + 1) % gallery.length;
    showImage();
  };
  $('home-profile-detail-close').onclick = () => $('home-profile-dialog')?.close();
  $('home-profile-dialog')?.addEventListener('click', e => {
    if (e.target === $('home-profile-dialog'))
      $('home-profile-dialog').close();
  });
  $('home-gallery-close').onclick = () => $('home-gallery-dialog')?.close();
  $('home-gallery-dialog')?.addEventListener('click', e => {
    if (e.target === $('home-gallery-dialog'))
      $('home-gallery-dialog').close();
  });
  document.addEventListener('keydown', e => {
    if (!$('home-gallery-dialog')?.open)
      return;
    if (e.key === 'ArrowRight')
      $('home-gallery-next').click();
    if (e.key === 'ArrowLeft')
      $('home-gallery-prev').click();
  });
  $('home-menu-button').onclick = () => {
    const active = document.body.classList.toggle('home-menu-open');
    $('home-menu-button').setAttribute('aria-expanded', String(active));
  };
  document.querySelectorAll('.home-nav a').forEach(a => a.addEventListener('click', () => {
    document.body.classList.remove('home-menu-open');
    $('home-menu-button').setAttribute('aria-expanded', 'false');
  }));
  $('home-video-toggle').onclick = () => {
    manualPause = !manualPause;
    playing();
    $('home-video-toggle').textContent = manualPause ? '▶' : 'Ⅱ';
    $('home-video-toggle').setAttribute('aria-label', manualPause ? 'Putar video cinematic' : 'Jeda video cinematic');
  };
  video?.addEventListener('error', () => {
    $('home-video-toggle').hidden = true;
    video.classList.add('video-unavailable');
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      isVisible = entries[0]?.isIntersecting || false;
      playing();
    }, { threshold: .02 }).observe(hero);
  }
  document.addEventListener('visibilitychange', playing);
  if (location.hash === '#cek-status')
    location.replace('status.html');
  apply(defaults);
  const isEditorPreview = new URLSearchParams(location.search).has('ssc_preview');
  if (isEditorPreview) {
    document.body.classList.add('ssc-editor-preview');
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'ssc-preview-settings')
        return;
      if (event.data.settings && typeof event.data.settings === 'object') {
        apply(event.data.settings);
        window.parent.postMessage({ type: 'ssc-preview-applied' }, location.origin);
      }
    });
    if (window.parent !== window)
      window.parent.postMessage({ type: 'ssc-preview-ready' }, location.origin);
  }
  else
    SSCircle.getForm().then(form => apply(form.settings || {})).catch(() => { });
})();
