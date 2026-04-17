/* ═══════════════════════════════════════════════════════
   MOVE Sistema Interno — Service Worker
   Estrategia: Cache-first para assets estáticos,
               Network-first para Supabase API
═══════════════════════════════════════════════════════ */

const CACHE_NAME   = 'move-v1';
const CACHE_STATIC = 'move-static-v1';

/* Assets que queremos cachear para uso offline */
const STATIC_ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700;800&family=Barlow+Condensed:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
];

/* ── Install: precache assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: limpiar caches viejos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: estrategia por tipo de request ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* Supabase API → siempre network (datos en tiempo real) */
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  /* Google Fonts → cache-first */
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  /* CDN (Chart.js, etc.) → cache-first */
  if (url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  /* HTML principal → network-first, fallback a cache */
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
