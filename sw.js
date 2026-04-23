/* ═══════════════════════════════════════════════════════
   MOVE Sistema Interno — Service Worker v2
   Estrategia: Cache-first para assets estáticos,
               Network-first para Supabase API,
               Offline fallback para el app shell
═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'velum-v1';
const CACHE_STATIC  = `move-static-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './MOVE_Sistema_Interno.html',
  './checkin.html',
  './index.html',
  './manifest.json',
  './move-icon-192.png',
  './move-icon-512.png',
  'https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700;800&family=Barlow+Condensed:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

/* ── Install ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .catch(e => console.warn('[SW] Precache partial fail:', e))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: purge old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_STATIC).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch ── */
self.addEventListener('fetch', event => {
  const url  = event.request.url;
  const method = event.request.method;

  // Only intercept GET requests
  if (method !== 'GET') return;

  // Supabase API / Edge Functions → network only, offline JSON fallback
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión. Reconectando…' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Fonts & CDN → cache-first, fallback network
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') ||
      url.includes('cdnjs.cloudflare.com') || url.includes('esm.sh')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // App shell HTML → network-first, cache fallback (shows cached app when offline)
  event.respondWith(
    fetch(event.request)
      .then(res => {
        // Only cache successful same-origin responses
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request)
        .then(cached => cached || new Response('<h2>Sin conexión</h2><p>Abre MOVE cuando tengas internet.</p>', {
          headers: { 'Content-Type': 'text/html' }
        }))
      )
  );
});

/* ── Background Sync placeholder ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-checkins') {
    // Future: sync offline check-ins when back online
    console.log('[SW] Background sync: checkins');
  }
});
