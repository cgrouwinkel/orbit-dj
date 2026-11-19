/* ORBIT DJ service worker — network-first with a versioned offline cache.
   Online you always get the newest deploy; offline you get the last version you played.
   Bump VERSION on every release so old caches are deleted. */
const VERSION = 'orbit-v3.1.0';
const CORE = ['./', 'index.html', 'css/orbit.css', 'js/util.js', 'js/sounds-manifest.js', 'js/engine.js', 'js/assets.js', 'js/music.js', 'js/game.js', 'js/tracks-manifest.js', 'js/beatpad.js', 'js/decks.js', 'js/school.js', 'js/ui.js', 'js/mixui.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('orbit-') && k !== VERSION).map(k => caches.delete(k)))));
});

self.addEventListener('message', event => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
