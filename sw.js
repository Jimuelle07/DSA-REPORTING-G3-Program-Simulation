'use strict';

const CACHE_VERSION = 'v9';
const CACHE_NAME = 'dsa-sims-' + CACHE_VERSION;

const PRECACHE = [
  '/',
  '/stack/',
  '/queue/',
  '/assets/theme.css',
  '/assets/landing.css',
  '/assets/sim.css',
  '/assets/code-panel.js',
  '/assets/tour.js',
  '/assets/sw-register.js',
  '/assets/favicon.svg',
  '/assets/fonts/dm-sans-latin.woff2',
  '/assets/fonts/titan-one-latin.woff2',
  '/stack/style.css',
  '/stack/c-source.js',
  '/stack/stack.js',
  '/stack/history.js',
  '/stack/editor.js',
  '/queue/style.css',
  '/queue/c-source.js',
  '/queue/queue.js',
  '/queue/drive-thru.js',
  '/queue/app.js'
];

function canonicalPath(pathname) {
  if (pathname === '/index.html') return '/';
  if (pathname.length > '/index.html'.length && pathname.endsWith('/index.html')) {
    return pathname.slice(0, -'/index.html'.length) + '/';
  }
  if (pathname.length > '.html'.length && pathname.endsWith('.html')) {
    return pathname.slice(0, -'.html'.length) + '/';
  }
  const lastSlash = pathname.lastIndexOf('/');
  const lastSegment = pathname.slice(lastSlash + 1);
  if (lastSegment.indexOf('.') === -1 && !pathname.endsWith('/')) {
    return pathname + '/';
  }
  return pathname;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('dsa-sims-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

function updateCache(cache, key, response) {
  try {
    if (!response) return Promise.resolve();
    if (!response.ok || response.type !== 'basic' || response.redirected) {
      return Promise.resolve();
    }
    return cache.put(key, response.clone()).catch(() => {});
  } catch (err) {
    return Promise.resolve();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    const canonical = canonicalPath(url.pathname);
    if (canonical !== url.pathname) {
      event.respondWith(Response.redirect(canonical + url.search, 301));
      return;
    }
  }

  const key = url.pathname;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(key).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            event.waitUntil(updateCache(cache, key, response));
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }

        return network.then((response) => {
          if (response) return response;
          if (isNavigation) return caches.match('/');
          return Response.error();
        });
      })
    )
  );
});
