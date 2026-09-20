const CACHE = 'mama-hanan-kitchen-v6';
const STATIC = [
  '/', '/index.html', '/menu', '/gallery', '/services', '/404',
  '/style.css', '/config.js', '/app.js',
  '/assets/brand/logo-horizontal.png', '/assets/brand/logo-badge.png',
  '/assets/brand/logo-icon.png', '/assets/brand/hero-home.webp',
  '/assets/brand/favicon.png', '/assets/icons/whatsapp.svg',
  '/assets/food/photos/grill.webp', '/assets/food/photos/mahshi.webp', '/assets/food/photos/tajin.webp',
  '/assets/food/photos/chicken.webp', '/assets/food/photos/feteer.webp', '/assets/food/photos/dessert.webp'
];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
      return res;
    }).catch(() => caches.match(req))
  );
});
