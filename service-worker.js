/* SSCircle offline support: only public static assets are cached. */
'use strict';
const CACHE='sscircle-public-v10.53.0';
const PRE=['/offline.html','/style.css','/assets/sscircle-logo.png','/assets/sscircle-pwa-icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sscircle-public-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 const path=url.pathname;
 if(path.startsWith('/api/')||path.startsWith('/admin')||path.startsWith('/my-sscircle')||path.startsWith('/mailbox')||path.startsWith('/status')||path.startsWith('/registration')||path.startsWith('/voting')||path.startsWith('/rules')||path.startsWith('/seasons'))return;
 if(req.mode==='navigate'){
   if(path!=='/'&&path!=='/index.html')return;
   event.respondWith(fetch(req).catch(()=>caches.match('/offline.html')));return;
 }
 if(!/\.(?:css|js|png|jpg|jpeg|webp|gif|svg|ico|woff2?|webmanifest)$/.test(path))return;
 event.respondWith(caches.match(req).then(cached=>{
   const network=fetch(req).then(response=>{if(response.ok&&response.type==='basic'&&!response.headers.has('set-cookie')){
     const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));
   }return response;}).catch(()=>cached||Response.error());
   return cached||network;
 }));
});
