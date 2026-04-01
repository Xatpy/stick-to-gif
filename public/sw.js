const CACHE_NAME = 'sticktogif-v1';
const NETWORK_FIRST_PATHS = ['opencv.js', 'sample.gif'];

function getBasePath() {
  const pathname = self.location.pathname;
  return pathname.endsWith('/sw.js') ? pathname.slice(0, -5) : pathname.replace(/\/?$/, '/');
}

const BASE_PATH = getBasePath();
const SHELL_URLS = [
  `${BASE_PATH}`,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}favicon.png`,
  `${BASE_PATH}favicon-16.png`,
  `${BASE_PATH}favicon-32.png`,
  `${BASE_PATH}icon-192.png`,
  `${BASE_PATH}icon-512.png`,
  `${BASE_PATH}logo-192.png`,
  `${BASE_PATH}logo-512.png`,
  `${BASE_PATH}og-image.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isNetworkFirst(request) {
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    return true;
  }

  return NETWORK_FIRST_PATHS.some((name) => url.pathname.endsWith(`/${name}`))
    || url.pathname.endsWith('/index.html')
    || url.pathname === BASE_PATH.slice(0, -1);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw new Error(`Network request failed for ${request.url}`);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.endsWith('/capacitor.js') || url.pathname.endsWith('/cordova.js')) {
    return;
  }

  if (isNetworkFirst(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
