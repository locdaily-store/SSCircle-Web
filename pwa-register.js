/* SSCircle installation helper. Installs only on compatible browsers. */
'use strict';
(()=>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).catch(()=>{}),{once:true});
 const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
 if(standalone)return;
 let deferred=null;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
 const button=document.createElement('button');button.type='button';button.className='ssc-pwa-install';button.textContent='Pasang SSCircle';button.hidden=true;
 const holder=document.querySelector('.home-footer-links')||document.querySelector('.site-header')||document.querySelector('footer');
 holder?.append(button);
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;button.hidden=false;});
 window.addEventListener('appinstalled',()=>{deferred=null;button.hidden=true;});
 if(ios)button.hidden=false;
 button.addEventListener('click',async()=>{
   if(deferred){
     const request=deferred;deferred=null;button.hidden=true;
     try{await request.prompt();await request.userChoice;}catch{}return;
   }
   if(!ios)return;
   const card=document.createElement('aside');card.className='ssc-pwa-hint';card.setAttribute('role','status');
   const title=document.createElement('strong');title.textContent='Pasang SSCircle';
   const text=document.createElement('p');text.textContent='Buka menu Bagikan di browser, lalu pilih Tambahkan ke Layar Utama.';
   const close=document.createElement('button');close.type='button';close.textContent='Mengerti';close.onclick=()=>card.remove();
   card.append(title,text,close);document.body.append(card);close.focus();
 });
})();
