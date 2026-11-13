/* Komponen navigasi publik, selain Admin Control. */
'use strict';
(() => {
  if (document.body.classList.contains('admin-page')) return;
  const current=document.querySelector('header.home-header,header.site-header');
  if (!current) return;
  const page=location.pathname.replace(/\/$/,'').split('/').pop()||'index.html';
  const isPage=path=>path===page || (path==='my-sscircle.html' && page==='my-sscircle');
  const header=document.createElement('header');header.className='home-header ssc-public-header';header.id='top';
  const logo='/assets/sscircle-logo.png';
  const brand=document.createElement('a');brand.href='./';brand.className='home-brand';brand.setAttribute('aria-label','SSCircle Server');
  brand.innerHTML='<img id="home-logo" src="'+logo+'" width="41" height="41" alt="Logo SSCircle"><span><strong>SSCircle</strong><small>SERVER</small></span>';
  const nav=document.createElement('nav');nav.className='home-nav';nav.setAttribute('aria-label','Navigasi utama');
  const items=[['index.html','Beranda'],['gallery.html','Galeri'],['events.html','Event'],['announcements.html','Announcement'],['seasons.html','Seasons'],['status.html','Cek Status'],['/my-sscircle','Profile']];
  items.forEach(([href,name])=>{const a=document.createElement('a');a.href=href;a.textContent=name;a.className='home-nav-link';if(href==='seasons.html'){a.dataset.seasonLink='';a.hidden=true;}if(isPage(href.replace(/^\//,'')+'.html')||isPage(href.replace(/^\//,''))){a.setAttribute('aria-current','page');}nav.append(a);});
  const join=document.createElement('a');join.className='home-nav-join';join.href='registration.html';join.textContent='Pendaftaran ↗';if(isPage('registration.html'))join.setAttribute('aria-current','page');nav.append(join);
  const actions=document.createElement('div');actions.className='ssc-header-actions';
  if(document.querySelector('script[src*="mailbox-widget.js"]')){const mail=document.createElement('button');mail.type='button';mail.dataset.openMailbox='';mail.className='ssc-header-mailbox';mail.textContent='✉';mail.setAttribute('aria-label','Buka Mail Box');const count=document.createElement('span');count.hidden=true;count.dataset.mailboxCount='';mail.append(count);actions.append(mail);}
  const profile=document.createElement('a');profile.className='ssc-header-profile';profile.href='/my-sscircle';profile.setAttribute('aria-label','Buka Profile');
  const avatar=document.createElement('img');avatar.src=logo;avatar.alt='';profile.append(avatar);actions.append(profile);
  const menu=document.createElement('button');menu.type='button';menu.id='home-menu-button';menu.className='home-menu-button';menu.setAttribute('aria-label','Buka menu');menu.setAttribute('aria-expanded','false');menu.textContent='☰';actions.append(menu);
  header.append(brand,nav,actions);current.replaceWith(header);document.body.classList.add('ssc-public-shell');
  function close(){document.body.classList.remove('home-menu-open');menu.setAttribute('aria-expanded','false');}
  menu.addEventListener('click',()=>{const open=document.body.classList.toggle('home-menu-open');menu.setAttribute('aria-expanded',String(open));});
  nav.addEventListener('click',e=>{if(e.target.closest('a'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('click',e=>{if(!header.contains(e.target))close();});
  let footer=document.querySelector('footer.home-footer');if(!footer){footer=document.createElement('footer');document.body.append(footer);}
  footer.className='home-footer ssc-unified-footer';
  footer.innerHTML='<div class="home-container home-footer-content ssc-footer-content"><div class="home-footer-mark"><img id="home-footer-logo" src="'+logo+'" width="27" height="27" alt=""><span>SSCircle Server</span></div><span id="home-footer-text">One circle. Endless stories.</span><div class="home-footer-links"></div><small>© 2026 SSCircle Server</small></div>';
  const links=footer.querySelector('.home-footer-links');
  [['registration.html','Pendaftaran'],['status.html','Cek Status'],['gallery.html','Galeri'],['events.html','Event'],['announcements.html','Announcement'],['seasons.html','Seasons'],['rules.html','Peraturan Server'],['/my-sscircle','Profile']].forEach(([href,label])=>{const a=document.createElement('a');a.href=href;a.textContent=label;if(href==='seasons.html'){a.dataset.seasonLink='';a.hidden=true;}if(isPage(href))a.setAttribute('aria-current','page');links.append(a);});
  const discord=document.createElement('a');discord.href='https://discord.gg/vQQSgY2GRS';discord.target='_blank';discord.rel='noopener noreferrer';discord.textContent='Discord ↗';links.append(discord);
  const apply=s=>{const img=s.logoImageUrl||(s.logoMediaId?'/api/media/'+s.logoMediaId:logo);brand.querySelector('img').src=img;footer.querySelector('img').src=img;footer.querySelector('#home-footer-text').textContent=s.homeFooterText||s.footerText||'One circle. Endless stories.';document.querySelectorAll('[data-season-link]').forEach(a=>a.hidden=s.seasonArchiveEnabled!==true);if(/^https:\/\/(?:discord\.gg|discord\.com)\//.test(s.homeDiscordUrl||''))discord.href=s.homeDiscordUrl;};
  fetch('/api/form',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data)apply(data.settings||{});}).catch(()=>{});
})();
