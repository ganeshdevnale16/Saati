// Saathi service worker: shows alerts even when the Saathi tab is closed.
// Developed by Devnale Globals
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { title: 'Saathi', body: event.data && event.data.text() }; }
  const data = p.data || {};
  const sos = data.type === 'sos';
  event.waitUntil(self.registration.showNotification(p.title || 'Saathi', {
    body: p.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    data,
    tag: sos ? 'sos-' + (data.sosId || Date.now()) : (data.type || 'saathi'),
    renotify: true,
    requireInteraction: sos,             // SOS stays on screen until the user acts
    vibrate: sos ? [800, 300, 800, 300, 800] : [200],
    actions: sos && data.mobile ? [{ action: 'call', title: 'Call' }, { action: 'open', title: 'See location' }] : [],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  if (event.action === 'call' && d.mobile) { event.waitUntil(self.clients.openWindow('tel:' + d.mobile)); return; }
  const target = d.type === 'share_request' ? '/#/requests' : d.userId ? '/#/track/' + d.userId : '/#/alerts';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { w.navigate(target); return w.focus(); } }
    return self.clients.openWindow(target);
  })());
});
