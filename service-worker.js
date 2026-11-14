/* SSCircle offline support: cache public static assets, never API or member data. */
'use strict';
const CACHE='sscircle-public-v10.55.6-readiness-1';
const PRE=['/offline.html','/style.css','/assets/sscircle-logo.png','/assets/sscircle-pwa-icon.svg','/manifest.webmanifest'];
const STATIC=/\.(?:css|js|png|jpg|jpeg|webp|gif|svg|ico|woff2?|webmanifest)$/;
const CODE=/\.(?:css|js|webmanifest)$/;
const canCache=response=>response.ok&&response.type==='basic'&&
  !response.headers.has('set-cookie')&&
  !/(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get('cache-control')||'');
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(PRE)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(
    key=>key.startsWith('sscircle-public-')&&key!==CACHE
  ).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  const path=url.pathname;
  if(path.startsWith('/api/')||path.startsWith('/admin')||
     path.startsWith('/my-sscircle')||path.startsWith('/mailbox')||
     path.startsWith('/status')||path.startsWith('/registration')||
     path.startsWith('/voting')||path.startsWith('/rules')||
     path.startsWith('/seasons')||path.startsWith('/announcements'))return;
  if(req.mode==='navigate'){
    if(path!=='/'&&path!=='/index.html')return;
    event.respondWith(fetch(req).catch(()=>caches.match('/offline.html')));
    return;
  }
  if(!STATIC.test(path))return;
  // Never store arbitrary query parameters which could contain private tokens.
  if([...url.searchParams.keys()].some(key=>key!=='v')||url.search.length>100)return;
  const update=async()=>{
    const response=await fetch(req);
    if(canCache(response)){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));
    }
    return response;
  };
  if(CODE.test(path)){
    // Network first: an old script must not shadow a successful new deploy.
    event.respondWith(update().catch(()=>caches.match(req).then(cached=>cached||Response.error())));
  }else{
    // Stale while revalidate: keep images fast without making code stale.
    event.respondWith(caches.match(req).then(cached=>{
      const network=update().catch(()=>cached||Response.error());
      return cached||network;
    }));
  }
});
