// This file intentionally disables any previously-installed service worker.
// Unregister + clear caches so the SPA always loads fresh from network.
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
// No fetch handler -> browser always goes to network.
self.skipWaiting();
