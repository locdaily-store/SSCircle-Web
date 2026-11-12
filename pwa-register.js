/* SSCircle: installation on supported browsers, without private offline storage. */
'use strict';
(()=>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).catch(()=>{}),{once:true});
 const installed=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
 if(installed())return;
 let deferred=null;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const safari=/Safari/.test(navigator.userAgent)&&!/CriOS|FxiOS|EdgiOS|Chrome|Chromium/.test(navigator.userAgent);
 const button=document.createElement('button');
 button.type='button';button.className='ssc-pwa-install';
 button.textContent='Pasang SSCircle';button.hidden=true;
 button.setAttribute('aria-label','Pasang SSCircle sebagai aplikasi');
 const holder=document.querySelector('.home-footer-links')||document.querySelector('.site-header')||
   document.querySelector('.home-header')||document.querySelector('footer')||document.body;
 holder.append(button);
 function hint(message){
   document.querySelector('.ssc-pwa-hint')?.remove();
   const card=document.createElement('aside');card.className='ssc-pwa-hint';
   card.setAttribute('role','status');
   const title=document.createElement('strong');title.textContent='Pasang SSCircle';
   const detail=document.createElement('p');detail.textContent=message;
   const close=document.createElement('button');close.type='button';close.textContent='Mengerti';
   close.addEventListener('click',()=>card.remove());
   card.append(title,detail,close);document.body.append(card);close.focus();
 }
 window.addEventListener('beforeinstallprompt',event=>{
   event.preventDefault();deferred=event;button.hidden=false;
 });
 window.addEventListener('appinstalled',()=>{deferred=null;button.hidden=true;});
 // Safari on iOS does not fire beforeinstallprompt. Show an honest manual path.
 if(ios||safari)button.hidden=false;
 button.addEventListener('click',async()=>{
   if(installed()){button.hidden=true;return;}
   if(deferred){
     const request=deferred;deferred=null;button.hidden=true;
     try{
       await request.prompt();
       const choice=await request.userChoice;
       if(choice?.outcome!=='accepted')button.hidden=false;
     }catch{button.hidden=false;}
     return;
   }
   if(ios)hint('Di Safari, buka menu Bagikan lalu pilih Tambahkan ke Layar Utama. Jika opsi belum muncul, buka website ini langsung di Safari.');
   else if(safari)hint('Buka menu File di Safari, lalu pilih Tambahkan ke Dock jika tersedia.');
   else hint('Buka menu browser dan pilih Instal aplikasi atau Tambahkan ke layar utama jika tersedia.');
 });
})();
