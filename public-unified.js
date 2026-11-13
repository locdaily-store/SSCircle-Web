/* Shared public header and footer. Admin Control keeps its dedicated shell. */
'use strict';
(() => {
  const page = location.pathname.replace(new RegExp('/$'), '') || '/';
  const links = [
    ['Beranda','/'],['Tentang','/#tentang'],['Galeri','/gallery.html'],
    ['Event','/events.html'],['Announcement','/announcements.html'],
    ['Seasons','/seasons.html'],['Cek Status','/status.html'],
    ['Profile','/my-sscircle']
  ];
  const nav = () => links.map(([name,href]) => {
    const path = new URL(href,'https://sscircle.pages.dev/').pathname.replace(new RegExp('/$'),'') || '/';
    const active = path === page && (!href.includes('#') || location.hash === '#tentang');
    return '<a class="home-nav-link'+(active?' ssc-nav-active':'')+'" href="'+href+'"'+(active?' aria-current="page"':'')+'>'+name+'</a>';
  }).join('') + '<a class="home-nav-join" href="/registration.html">Pendaftaran <span aria-hidden="true">↗</span></a>';
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
      '<div class="ssc-header-actions"><button type="button" class="ssc-header-mailbox" data-open-mailbox aria-label="Buka Mail Box">✉<span data-mailbox-count hidden></span></button>'+
      '<a class="ssc-header-profile" href="/my-sscircle" aria-label="Buka Profile"><img src="/assets/sscircle-logo.png" alt="" width="34" height="34"></a>'+
      '<button type="button" class="home-menu-button" id="home-menu-button" aria-label="Buka menu" aria-controls="ssc-navigation" aria-expanded="false">☰</button></div>';
    h.querySelector('.home-nav').id='ssc-navigation';
    old.replaceWith(h);
    if (!document.body.classList.contains('home-page')) document.body.classList.add('ssc-public-shell');
    const menu=h.querySelector('#home-menu-button'),navigation=h.querySelector('.home-nav');
    menu.addEventListener('click',()=>{const open=document.body.classList.toggle('home-menu-open');menu.setAttribute('aria-expanded',String(open));});
    navigation.addEventListener('click',e=>{if(e.target.closest('a')){document.body.classList.remove('home-menu-open');menu.setAttribute('aria-expanded','false');}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('home-menu-open');menu.setAttribute('aria-expanded','false');}});
    const previousFooter = document.querySelector('footer.home-footer,footer.site-footer');
    const f = document.createElement('footer');f.className='home-footer ssc-unified-footer';
    f.innerHTML='<div class="home-container home-footer-content ssc-footer-content"><div class="home-footer-mark"><img id="home-footer-logo" data-site-logo src="/assets/sscircle-logo.png" width="27" height="27" alt=""><span>SSCircle Server</span></div><span id="home-footer-text">One circle. Endless stories.</span>'+
      '<div class="home-footer-links"><a href="/registration.html">Pendaftaran</a><a href="/status.html">Cek Status</a><a href="/my-sscircle">Profile</a><a href="/rules.html">Peraturan Server</a><a href="/events.html">Event</a><a href="/gallery.html">Gallery</a><a href="/announcements.html">Announcement</a><a href="/seasons.html">Seasons</a><a href="https://discord.gg/vQQSgY2GRS" target="_blank" rel="noopener noreferrer">Discord ↗</a></div><small>© 2026 SSCircle Server</small></div>';
    if(previousFooter) previousFooter.replaceWith(f);else document.body.append(f);
    addEventListener('hashchange',()=>{h.querySelectorAll('.home-nav a').forEach(a=>{const target=new URL(a.getAttribute('href')||'/', 'https://sscircle.pages.dev/');const on=target.pathname===location.pathname&&(!target.hash||target.hash===location.hash);a.classList.toggle('ssc-nav-active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});});
    fetch('/api/form',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{
      const s=d?.settings;if(!s)return;
      const logo=s.logoImageUrl|| (s.logoMediaId?'/api/media/'+s.logoMediaId:'/assets/sscircle-logo.png');
      h.querySelectorAll('[data-site-logo]').forEach(i=>i.src=logo);
      f.querySelectorAll('[data-site-logo]').forEach(i=>i.src=logo);
      h.querySelector('.home-brand strong').textContent=s.brandName||'SSCircle';
      f.querySelector('#home-footer-text').textContent=s.homeFooterText||s.footerText||'One circle. Endless stories.';
      if(s.seasonArchiveEnabled!==true){h.querySelector('a[href="/seasons.html"]')?.remove();f.querySelector('a[href="/seasons.html"]')?.remove();}
      if(/^https:\/\/(?:discord\.gg|discord\.com)\//i.test(s.homeDiscordUrl||'')) f.querySelector('a[href^="https://discord"]').href=s.homeDiscordUrl;
    }).catch(()=>{});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',assemble,{once:true});
  else assemble();
})();