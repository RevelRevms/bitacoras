// Service worker de la Bitácora: recibe los avisos (push) y abre la app al tocarlos.
// A propósito NO guarda páginas en caché: así las actualizaciones (?v=N) llegan siempre.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});   // sin caché; el navegador pide la red como siempre

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Bitácora de práctica';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: d.kind || 'bitacora', renotify: true, data: { url: d.url || 'index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'index.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = all.find(c => c.url.split('#')[0] === url.split('#')[0]) || all.find(c => c.url.startsWith(self.registration.scope));
    if (same) { await same.focus(); if ('navigate' in same && same.url !== url) { try { await same.navigate(url); } catch {} } return; }
    await self.clients.openWindow(url);
  })());
});
