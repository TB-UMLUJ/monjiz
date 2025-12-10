
// Service Worker for Monjez PWA

const CACHE_NAME = 'monjez-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.css'
];

// Install Event - Cache assets and activate immediately
self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
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

// Fetch Event - Serve from cache or network
self.addEventListener('fetch', (event) => {
  // Optional: Add logic to skip cache for API requests or specific paths if needed
  if (event.request.url.includes('/api/') || event.request.url.includes('supabase')) {
     return; // Network only for APIs
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
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
    data = { title: 'منجز', body: 'لديك تنبيه مالي جديد' };
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
