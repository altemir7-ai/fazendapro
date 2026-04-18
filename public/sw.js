const CACHE = 'fazendapro-v5';
const ASSETS = ['/','/index.html','/css/app.css','/js/db.js','/js/sync.js','/js/app.js','/manifest.json'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(()=>new Response(JSON.stringify({error:'offline'}),{headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));
});

self.addEventListener('sync', e => {
  if (e.tag==='sync-dados') e.waitUntil(self.clients.matchAll().then(cs=>cs.forEach(c=>c.postMessage({type:'DO_SYNC'}))));
});
