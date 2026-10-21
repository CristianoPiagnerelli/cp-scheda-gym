// Cache dell'app per l'uso offline in palestra. Cambia VERSION a ogni rilascio.
const VERSION = 'cp-scheda-gym-18';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Prima la rete (così gli aggiornamenti arrivano subito); se non c'è campo o è lenta, la cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      // no-cache: chiede sempre al server se c'è una versione nuova (GitHub Pages altrimenti tiene i file 10 minuti)
      const fresh = fetch(e.request.url, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; });
      if (!cached) return fresh;
      const slow = new Promise(r => setTimeout(() => r(cached), 3000));
      return Promise.race([fresh.catch(() => cached), slow]);
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
      list.length ? list[0].focus() : self.clients.openWindow('./#/session')
    )
  );
});
