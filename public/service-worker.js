
// Service Worker for Monjez PWA

const CACHE_NAME = 'monjez-cache-v1';

// Install Event - Activate immediately
self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
  // Note: We are not precaching specific files here to avoid "Request failed" errors
  // if files like index.css are missing or have hashed names in production.
});

// Activate Event - Clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Enable the service worker to control all open clients immediately
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Fetch Event - Network First, then Cache
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  // Skip API requests
  if (event.request.url.includes('/api/') || event.request.url.includes('supabase')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Return response immediately and optionally cache it for later
        // const responseClone = response.clone();
        // caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});

// Push Event - Handle incoming notifications
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'إشعار جديد', body: event.data.text() };
    }
  } else {
    data = { title: 'مواءمة', body: 'لديك تنبيه مالي جديد' };
  }

  const options = {
    body: data.body,
    icon: data.icon || 'https://cdn-icons-png.flaticon.com/512/2382/2382461.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/2382/2382461.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: '/' } // Store URL to open on click
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
