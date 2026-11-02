/* Stream TV — shell cache (offline-ready), works under /<repo>/ on GitHub Pages */
const VERSION = 'stv-v4';
const SHELL = [
  './',
  './index.html',
  './catalogo.html',
  './diag.html',
  './styles.css',
  './app.js',
  './catalog.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // never cache media / HLS segments / third-party CDNs
  if (url.origin !== location.origin || /\.(m3u8|ts|mp4|m4s|webm|aac)$/i.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put('./index.html', copy));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // catálogo: rede primeiro (stale-while-revalidate) para o app não ficar preso na versão antiga
  if (url.pathname.endsWith('/catalog.json')) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // resto do shell: rede primeiro, cache como fallback (atualiza sem precisar bump de versão)
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((r) => {   // revalida (304 é barato) e evita asset velho
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return r;
    }).catch(() => caches.match(req))
  );
});
