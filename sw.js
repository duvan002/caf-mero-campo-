/* Service worker: guarda la aplicación para que abra sin Internet. */
const VERSION = 'mero-campo-v2';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './src/styles.css', './src/core.js', './src/db.js', './src/xlsx.js', './src/charts.js', './src/app.js', './src/costos.js', './src/gestion.js', './src/arranque.js', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((c) => c || fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSION).then((ca) => ca.put(e.request, copia)); return r; }).catch(() => caches.match('./index.html'))));
});
