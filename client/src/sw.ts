/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  widgets?: { updateByTag: (tag: string, payload: { template: string; data: string }) => Promise<void> };
};

/* ── App shell ──────────────────────────────────────────────────────── */

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

// Every in-app URL is served by the cached shell, so the app opens offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/socket\.io\//] }));

/* ── Private data kept for offline use ──────────────────────────────────
   These caches hold the couple's own content. Their names start with
   "ours-private" so the app can wipe them all when someone signs out.   */

registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/media/') && request.method === 'GET' && !request.headers.has('range') && request.destination === 'image',
  new CacheFirst({
    cacheName: 'ours-private-media',
    plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true })],
  }),
);

const OFFLINE_READABLE = /^\/api\/(dashboard|events|countdowns|lists|notes|bucket|dates|albums|memories|messages|questions\/today|couple\/stats)$/;
registerRoute(
  ({ url, request }) => request.method === 'GET' && OFFLINE_READABLE.test(url.pathname),
  new NetworkFirst({
    cacheName: 'ours-private-api',
    networkTimeoutSeconds: 6,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 })],
  }),
);

/* ── Push notifications ─────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Ours', {
      body: payload.body ?? '',
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/';
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

/* ── Messages from the app ──────────────────────────────────────────── */

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') void self.skipWaiting();
  if (event.data?.type === 'widget-data') event.waitUntil(saveWidgetData(event.data.data).then(updateAllWidgets));
});

/* ── Windows 11 widgets (experimental, Microsoft Edge only) ──────────────
   The app hands over the couple's start date and next special date. The
   widgets are then drawn from that, so the day count stays right even
   when the app hasn't been opened for a while.                          */

interface WidgetData {
  title: string;
  startDate: string | null;
  timezone: string;
  next: { title: string; emoji: string; date: string } | null;
}

const WIDGET_CACHE = 'ours-private-widget';
const WIDGET_KEY = '/__widget-data';

async function saveWidgetData(data: WidgetData | null) {
  const cache = await caches.open(WIDGET_CACHE);
  if (data) await cache.put(WIDGET_KEY, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
  else await cache.delete(WIDGET_KEY);
}

async function loadWidgetData(): Promise<WidgetData | null> {
  const cache = await caches.open(WIDGET_CACHE);
  const response = await cache.match(WIDGET_KEY);
  return response ? ((await response.json()) as WidgetData) : null;
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

function todayIn(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function updateWidget(tag: string) {
  if (!self.widgets) return;
  const template = await (await fetch(`/widgets/${tag}.json`)).text();
  const data = await loadWidgetData();
  let values: Record<string, string>;
  if (!data) {
    values = { headline: 'Ours', value: '❤️', caption: 'Open the app to sign in' };
  } else if (tag === 'counter') {
    const days = data.startDate ? Math.max(0, dayNumber(todayIn(data.timezone)) - dayNumber(data.startDate)) : null;
    values = { headline: `❤️ ${data.title}`, value: days === null ? '—' : days.toLocaleString('en'), caption: days === null ? 'Add your start date in the app' : days === 1 ? 'day together' : 'days together' };
  } else {
    const days = data.next ? dayNumber(data.next.date) - dayNumber(todayIn(data.timezone)) : null;
    values = data.next && days !== null && days >= 0
      ? { headline: `${data.next.emoji} ${data.next.title}`, value: days === 0 ? 'Today' : String(days), caption: days === 0 ? '' : days === 1 ? 'day to go' : 'days to go' }
      : { headline: '📅 Next special date', value: '—', caption: 'Open the app to refresh' };
  }
  await self.widgets.updateByTag(tag, { template, data: JSON.stringify(values) });
}

const updateAllWidgets = () => Promise.all(['counter', 'next-date'].map((tag) => updateWidget(tag).catch(() => undefined)));

type WidgetEvent = ExtendableEvent & { widget?: { definition?: { tag?: string } }; action?: string };
const widgetEvents = self as unknown as { addEventListener: (type: string, listener: (event: WidgetEvent) => void) => void };

for (const type of ['widgetinstall', 'widgetresume']) {
  widgetEvents.addEventListener(type, (event) => {
    const tag = event.widget?.definition?.tag;
    if (tag) event.waitUntil(updateWidget(tag));
  });
}
widgetEvents.addEventListener('widgetclick', (event) => {
  if (event.action === 'open') event.waitUntil(self.clients.openWindow('/'));
});
widgetEvents.addEventListener('periodicsync', (event) => event.waitUntil(updateAllWidgets()));
self.addEventListener('activate', (event) => event.waitUntil(updateAllWidgets()));
