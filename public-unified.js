/* Shared public header and footer. Admin Control keeps its dedicated shell. */
'use strict';
(() => {
  const normalizePath = pathname => { const path = (pathname || '/').replace(/\/$/, '') || '/'; return path === '/index.html' ? '/' : path === '/my-sscircle.html' ? '/my-sscircle' : path; };
  const page = normalizePath(location.pathname);
  const links = [
    ['Tentang','/#tentang'],['Galeri','/#galeri'],['Event','/events.html'],
    ['Announcement','/announcements.html'],['Seasons','/seasons.html'],
    ['Cek Status','/status.html'],['How to Play','/how-to-play.html'],['Profile','/my-sscircle']
  ];
  const route = path => normalizePath(path).replace(/\.html$/,'');
  const isActive = href => {
    const base=/^https?:\/\//.test(location.origin||'')?location.origin:'https://sscircle.pages.dev';
    const u=new URL(href,base),target=route(u.pathname),here=route(page);
    if(target==='/')return here==='/' && location.hash===u.hash;
    if(target==='/my-sscircle')return here==='/my-sscircle'||here==='/mailbox';
    return target===here;
  };
  const nav = () => links.map(([name,href]) => {
    const active=isActive(href)||(name==='Galeri'&&route(page)==='/gallery');
    return '<a class="home-nav-link'+(active?' ssc-nav-active':'')+'" href="'+href+'"'+(active?' aria-current="page"':'')+'>'+name+'</a>';
  }).join('')+'<a class="home-nav-join'+(route(page)==='/registration'?' ssc-nav-active':'')+'" href="/registration.html"'+(route(page)==='/registration'?' aria-current="page"':'')+'>Pendaftaran <span aria-hidden="true">↗</span></a>';
  function assemble() {
    if (document.body.classList.contains('admin-page') || document.body.closest('[data-admin-only]')) return;
    if (/\/admin(?:\.html)?$/.test(page) || /preview|offline/.test(page)) return;
    const old = document.querySelector('header.home-header,header.site-header');
    if (!old) return;
    const brandLogo = old.querySelector('.home-brand img,.brand img')?.getAttribute('src') || '/assets/sscircle-logo.png';
    const h = document.createElement('header');
    h.className='home-header ssc-site-header';
    h.id='top';
    h.innerHTML='<a href="/" class="home-brand" aria-label="SSCircle Server beranda"><img id="home-logo" data-site-logo src="'+brandLogo.replace(/[^a-zA-Z0-9_/.?-]/g,'')+'" width="41" height="41" alt="Logo SSCircle"><span><strong>SSCircle</strong><small>SERVER</small></span></a>'+
      '<nav class="home-nav" aria-label="Navigasi utama">'+nav()+'</nav>'+
      '<div class="ssc-header-actions"><button type="button" class="ssc-header-mailbox" data-open-mailbox aria-label="Buka Mail Box"><img class="ssc-mailbox-icon" src="/assets/mailbox-envelope.svg" alt="" aria-hidden="true"><span data-mailbox-count hidden></span></button>'+
      '<a class="ssc-header-profile" href="/my-sscircle" aria-label="Buka Profile"><img src="/assets/sscircle-logo.png" alt="" width="34" height="34"></a>'+
      '<button type="button" class="home-menu-button" id="home-menu-button" aria-label="Buka menu" aria-controls="ssc-navigation" aria-expanded="false">☰</button></div>';
    h.querySelector('.home-nav').id='ssc-navigation';
    old.replaceWith(h);
    if (page !== '/') document.body.classList.add('ssc-public-inner');
    if (!document.body.classList.contains('home-page')) document.body.classList.add('ssc-public-shell');
    const menu=h.querySelector('#home-menu-button'),navigation=h.querySelector('.home-nav');
    const setMenuOpen=open=>{
      document.body.classList.toggle('home-menu-open',open);
      h.classList.toggle('ssc-menu-open',open);
      navigation.classList.toggle('ssc-menu-visible',open);
      menu.setAttribute('aria-expanded',String(open));
    };
    menu.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();setMenuOpen(!h.classList.contains('ssc-menu-open'));},true);
    navigation.addEventListener('click',e=>{if(e.target.closest('a'))setMenuOpen(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setMenuOpen(false);});
    document.addEventListener('click',e=>{if(h.isConnected&&!h.contains(e.target))setMenuOpen(false);});
    const previousFooter = document.querySelector('footer.home-footer,footer.site-footer');
    const f = document.createElement('footer');f.className='home-footer ssc-unified-footer';
    f.innerHTML='<div class="home-container home-footer-content ssc-footer-content"><div class="home-footer-mark"><img id="home-footer-logo" data-site-logo src="/assets/sscircle-logo.png" width="27" height="27" alt=""><span>SSCircle Server</span></div><span id="home-footer-text">One circle. Endless stories.</span>'+
      '<div class="home-footer-links"><a href="/registration.html">Registration</a><a href="/status.html">Cek Status</a><a href="/my-sscircle">Profile</a><a href="/rules.html">Peraturan Server</a><a href="/how-to-play.html">How to Play</a><a href="/events.html">Event</a><a href="/announcements.html">Announcement</a><a href="/seasons.html" data-season-link hidden>Seasons</a><a href="https://discord.gg/vQQSgY2GRS" target="_blank" rel="noopener noreferrer">Discord ↗</a></div><small>© 2026 SSCircle Server</small></div>';
    if(previousFooter) previousFooter.replaceWith(f);else document.body.append(f);
    // Use the same verified primary-account skin source as the Profile dashboard.
    // The SSCircle logo remains the fallback when no linked skin is available.
    const profileLink=h.querySelector('.ssc-header-profile');
    const profileFallback=profileLink.querySelector('img');
    const avatarCanvas=document.createElement('canvas');
    avatarCanvas.className='ssc-header-avatar-canvas';
    avatarCanvas.width=64;avatarCanvas.height=64;avatarCanvas.hidden=true;
    avatarCanvas.setAttribute('aria-hidden','true');
    profileLink.append(avatarCanvas);
    let avatarRequest=0;
    function renderMemberAvatar(accounts) {
      const ticket=++avatarRequest;
      avatarCanvas.hidden=true;
      profileFallback.hidden=false;
      const account=Array.isArray(accounts)?(accounts.find(a=>a?.isPrimary)||accounts[0]):null;
      if(!account||typeof account.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id))return;
      const url=(typeof account.socialSkinUrl==='string' && /^\/api\/player\/social\/skin\?account=[0-9a-f-]{36}$/i.test(account.socialSkinUrl))
        ? account.socialSkinUrl : '/api/player/minecraft/skin/'+encodeURIComponent(account.id);
      const skin=new Image();
      skin.onload=()=>{
        if(ticket!==avatarRequest||skin.naturalWidth!==64||![32,64].includes(skin.naturalHeight))return;
        const ctx=avatarCanvas.getContext('2d');
        if(!ctx)return;
        ctx.clearRect(0,0,64,64);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(skin,8,8,8,8,0,0,64,64);
        if(skin.naturalHeight===64)ctx.drawImage(skin,40,8,8,8,0,0,64,64);
        avatarCanvas.hidden=false;
        profileFallback.hidden=true;
      };
      skin.onerror=()=>{};
      skin.src=url+(account.skinUpdatedAt?'?v='+encodeURIComponent(account.skinUpdatedAt):'');
    }
    window.SSCirclePublicAvatar=Object.freeze({render:renderMemberAvatar});
    // The profile page can supply its already loaded account list; other pages
    // retrieve only the signed-in member's private profile (never public guesses).
    fetch('/api/player/profile',{credentials:'same-origin',cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(data=>{if(data)renderMemberAvatar(data.accounts);})
      .catch(()=>{});
    function refreshActiveLinks(){
      h.querySelectorAll('.home-nav a').forEach(a=>{
        const href=a.getAttribute('href')||'/';
        const on=isActive(href)||(href==='/#galeri'&&route(page)==='/gallery')||(href==='/registration.html'&&route(page)==='/registration');
        a.classList.toggle('ssc-nav-active',on);
        if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
      });
    }
    addEventListener('hashchange',refreshActiveLinks);
    refreshActiveLinks();
    fetch('/api/form',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{
      const s=d?.settings;if(!s)return;
      const logo=s.logoImageUrl|| (s.logoMediaId?'/api/media/'+s.logoMediaId:'/assets/sscircle-logo.png');
      h.querySelectorAll('[data-site-logo]').forEach(i=>i.src=logo);
      f.querySelectorAll('[data-site-logo]').forEach(i=>i.src=logo);
      h.querySelector('.home-brand strong').textContent=s.brandName||'SSCircle';
      f.querySelector('#home-footer-text').textContent=s.homeFooterText||s.footerText||'One circle. Endless stories.';
      h.querySelector('a[href="/seasons.html"]')?.toggleAttribute('hidden',s.seasonArchiveEnabled!==true);f.querySelector('a[href="/seasons.html"]')?.toggleAttribute('hidden',s.seasonArchiveEnabled!==true);
      if(/^https:\/\/(?:discord\.gg|discord\.com)\//i.test(s.homeDiscordUrl||'')) f.querySelector('a[href^="https://discord"]').href=s.homeDiscordUrl;
    }).catch(()=>{});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',assemble,{once:true});
  else assemble();
})();