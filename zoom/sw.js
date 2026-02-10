const cacheName = 'nextmeet-v4'; // Ndryshova emrin që browser-i ta shohë si përditësim të ri
const assets = [
  '/',
  '/index.html',
  '/zoom/zoom.css',
  '/zoom/zoom.js',
  '/zoom/manifest.json',
  'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs/solid/bolt.svg'
];

// Instalimi i Service Worker
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheName).then(cache => {
      console.log('NextMeet: Duke ruajtur skedarët në Cache...');
      return cache.addAll(assets);
    })
  );
});

// Aktivizimi dhe pastrimi i cache-ve të vjetra
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== cacheName)
        .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

// Strategjia: Provo Cache, nëse s'ka, shko në Rrjet (Network)
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).catch(() => {
        // Nëse dështon çdo gjë (offline dhe s'ka cache), kthe index.html
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
