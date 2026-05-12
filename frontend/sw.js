const CACHE = 'suraj-commerce-v1';
const ASSETS = [
  '/frontend/index.html',
  '/frontend/assets/css/style.css',
  '/frontend/assets/js/script.js',
  '/frontend/assets/images/womens-banner.jpg',
  '/frontend/assets/images/mens-banner.jpg',
  '/frontend/assets/images/banner-2.jpg',
  '/frontend/assets/images/products/clothes-1.jpg',
  '/frontend/assets/images/products/jacket-1.jpg',
  '/frontend/assets/images/products/shorts-1.jpg',
  '/frontend/assets/images/products/shirt-1.jpg',
  '/frontend/assets/images/products/jacket-2.jpg',
  '/frontend/assets/images/products/watch-1.jpg',
  '/frontend/assets/images/products/shoe-1.jpg',
  '/frontend/assets/images/products/perfume.jpg',
  '/frontend/assets/images/products/sports-1.jpg',
  '/frontend/assets/images/products/belt.jpg',
  '/frontend/assets/images/products/1.jpg',
  '/frontend/assets/images/products/3.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // API calls — network first, no cache
  if (e.request.url.includes('localhost:5000')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});
