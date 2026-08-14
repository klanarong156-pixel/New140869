// SmartFarm V6.2 Service Worker
// Navigation-first cache strategy. Every production deployment gets a new cache namespace.
const CACHE_NAME='smartfarm-v6.2-app-1';
const APP_SHELL=['./','./index.html','./schedule.html','./account.html','./settings.html','./ota.html','./admin.html','./auth.html','./finance.html','./manifest.json','./style.css','./page-nav.js','./config.js','./firebase.js','./access.js','./script.js','./mqtt-handler.js','./cloud-farm-sync.js','./finance-core.js','./finance-config.js','./logo.png','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
const MEDIA_EXT=/\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/i;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('smartfarm-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==self.location.origin)return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r,{cache:'no-store'}).then(res=>res).catch(()=>caches.match(r).then(c=>c||caches.match('./index.html'))));
    return;
  }
  if(/\.(?:js|css|html|json)$/i.test(u.pathname)){
    e.respondWith(fetch(r,{cache:'no-store'}).then(res=>{const c=res.clone();caches.open(CACHE_NAME).then(x=>x.put(r,c)).catch(()=>{});return res;}).catch(()=>caches.match(r)));
    return;
  }
  if(MEDIA_EXT.test(u.pathname)){
    e.respondWith(caches.match(r).then(c=>c||fetch(r).then(res=>{const x=res.clone();caches.open(CACHE_NAME).then(z=>z.put(r,x)).catch(()=>{});return res;})));
  }
});
