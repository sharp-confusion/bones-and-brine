/* Bones & Brine service worker: lets the installed app open instantly and play offline
   (pass & play and bots; online matches still need a connection). Bump VERSION on each release. */
const VERSION = 'bnb-v18';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/engine.js', 'js/bot.js', 'js/dice.js', 'js/avatar.js', 'js/net.js', 'js/config.js', 'js/chat.js', 'js/auth.js', 'js/app.js', 'js/avatar3d.js', 'models/pirates.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first (so updates arrive), falling back to the cache when offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /cdn\.jsdelivr\.net|unpkg\.com|www\.gstatic\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!cacheable) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
