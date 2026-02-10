const cacheName = 'nextmeet-v1';
const assets = [
  './',
  './index.html',
  './style.css',
  './zoom.js',
  './manifest.json',
  'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs/solid/bolt.svg'
];

// Instalimi i Service Worker dhe ruajtja e skedarëve në Cache
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheName).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// Aktivizimi dhe fshirja e cache-ve të vjetra
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== cacheName)
        .map(key => caches.delete(key))
      );
    })
  );
});

// Marrja e skedarëve nga Cache kur s'ka rrjet
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request);
    })
  );
});