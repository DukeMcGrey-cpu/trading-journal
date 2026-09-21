/* Trading journal service worker.
 * Caches the app shell so the journal opens offline.
 * The Apps Script API is never cached: offline writes are handled by the app's outbox.
 * Bump CACHE_VERSION whenever you deploy new files. */
const CACHE_VERSION = 'v1';
const CACHE = 'tj-shell-' + CACHE_VERSION;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'assets/styles.css',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'js/main.js',
  'js/config.js',
  'js/util.js',
  'js/db.js',
  'js/store.js',
  'js/api.js',
  'js/sync.js',
  'js/router.js',
  'js/calc.js',
  'js/ui/icons.js',
  'js/ui/components.js',
  'js/ui/dialog.js',
  'js/ui/forms.js',
  'js/ui/theme.js',
  'js/ui/login.js',
  'js/ui/shell.js',
  'js/ui/dashboard.js',
  'js/ui/placeholders.js',
  'js/ui/settings.js'
];

const scopeUrl = p => new URL(p, self.registration.scope).toString();

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.map(scopeUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tj-shell-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return; // API

  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  // Page loads: network first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(scopeUrl('index.html')).then(r => r || caches.match(scopeUrl('./'))))
    );
    return;
  }

  // Everything else: serve from cache immediately, refresh in the background.
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
