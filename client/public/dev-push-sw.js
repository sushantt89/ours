/* Development-only service worker: just enough to receive push notifications while running
   `npm run dev`. The real worker (src/sw.ts, with offline support and widgets) is used in
   production builds. Keep the two push handlers in step. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: event.data ? event.data.text() : undefined };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Ours', {
      body: payload.body || '',
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'navigate', url });
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
