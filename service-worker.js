// শাপলা আর্ট — Service Worker
// Cache version — নতুন আপডেট দিলে এই নম্বর বাড়ান
const CACHE_VERSION = 'shapla-art-v2';

// যেসব ফাইল অফলাইনে কাজ করবে
const STATIC_ASSETS = [
  './index.html',
  'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-regular-400.woff2',
];

// ── Install: সব ফাইল cache করা ──
self.addEventListener('install', function(event) {
  console.log('[SW] Installing:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      console.log('[SW] Caching static assets');
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Cache failed for:', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: পুরনো cache মুছা ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_VERSION; })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: Cache-first, তারপর Network ──
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Firebase Firestore/Auth — সরাসরি নেটওয়ার্কে যাবে
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('gstatic.com/firebasejs') ||
    url.includes('google.com/identitytoolkit') ||
    url.includes('securetoken.google.com')
  ) {
    return;
  }

  // about:srcdoc (iframe print) — bypass
  if (url.startsWith('about:')) return;

  // GET রিকোয়েস্ট ছাড়া বাকি সব bypass
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        // Cache থেকে দিলাম, background-এ আপডেট
        fetch(event.request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
        }).catch(function() {});
        return cachedResponse;
      }

      // Cache-এ নেই — নেটওয়ার্ক থেকে আনো এবং cache করো
      return fetch(event.request).then(function(networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        var responseClone = networkResponse.clone();
        caches.open(CACHE_VERSION).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(function() {
        // সম্পূর্ণ অফলাইন — index.html দিয়ে দাও
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Push Notification ──
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  self.registration.showNotification(data.title || 'শাপলা আর্ট', {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});
