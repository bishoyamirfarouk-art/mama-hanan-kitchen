const CACHE = 'home-food-store-v1';
const STATIC = ['/', '/index.html', '/products_page.html', '/gallery.html', '/services.html', '/style.css', '/config.js', '/app.js', '/assets/food/logo.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(req).then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); return res; }).catch(() => caches.match(req)));
});
