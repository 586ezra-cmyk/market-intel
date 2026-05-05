// Service Worker — מערכת מסחר חכמה
// Handles push notifications and offline caching

const CACHE_NAME = 'market-system-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ─── Fetch — Network first, cache fallback ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only cache GET requests for same origin
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache successful responses
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { title: 'מערכת מסחר', body: event.data?.text() ?? '' }
  }

  const title = data.title ?? 'התראת מסחר חדשה'
  const options = {
    body: data.body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    dir: 'rtl',
    lang: 'he',
    vibrate: [200, 100, 200],
    tag: data.tag ?? 'market-alert',
    renotify: true,
    data: {
      url: data.url ?? '/',
      alertId: data.alertId,
    },
    actions: [
      { action: 'open', title: 'פתח גרף' },
      { action: 'dismiss', title: 'סגור' },
    ],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ─── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if open
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // Otherwise open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
  )
})
