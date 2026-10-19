// ---------------------------------------------------------------------------
// sw.js — service worker for the WebXR BIM Lab PWA
// ---------------------------------------------------------------------------
// Strategy:
//   • App shell (HTML / JS / icons / manifest)  -> cache-first, refreshed in background
//   • Third-party libraries (three.js, web-ifc, jspdf) -> stale-while-revalidate
//   • WebXR / BIMcollab / API traffic            -> network only (never cached)
// ---------------------------------------------------------------------------
'use strict';

var CACHE_VERSION = 'webxr-bim-v3';
var SHELL_CACHE = CACHE_VERSION + '-shell';
var RUNTIME_CACHE = CACHE_VERSION + '-runtime';

var SHELL_ASSETS = [
    './',
    './index.html',
    './ar.html',
    './manifest.json',
    './js/nft-marker.js',
    './js/bcf.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './README.md',
    './AR_ROADMAP.md'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(SHELL_CACHE).then(function (cache) {
            // addAll fails the whole install if one asset is missing — add individually
            return Promise.all(SHELL_ASSETS.map(function (url) {
                return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (key) {
                if (key !== SHELL_CACHE && key !== RUNTIME_CACHE) return caches.delete(key);
                return null;
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

function isThirdParty(url) {
    return url.origin !== self.location.origin;
}

function isApiTraffic(url) {
    return /bimcollab|bimdata|bcf|api\./i.test(url.pathname + url.hostname);
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url;
    try { url = new URL(request.url); } catch (e) { return; }

    // Never intercept WebXR, API or data requests
    if (isApiTraffic(url) || request.headers.get('accept') === 'application/json') return;
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;

    // App shell: cache-first with background refresh
    if (!isThirdParty(url) && SHELL_ASSETS.indexOf(url.pathname.replace(/^\/webxr-bim\//, './')) !== -1 ||
        (!isThirdParty(url) && /\.(html|js|png|json|md)$/i.test(url.pathname))) {
        event.respondWith(
            caches.match(request).then(function (cached) {
                var network = fetch(request).then(function (response) {
                    if (response && response.ok) {
                        var copy = response.clone();
                        caches.open(SHELL_CACHE).then(function (cache) { cache.put(request, copy); });
                    }
                    return response;
                }).catch(function () { return cached; });
                return cached || network;
            })
        );
        return;
    }

    // Third-party libraries: stale-while-revalidate
    if (isThirdParty(url)) {
        event.respondWith(
            caches.open(RUNTIME_CACHE).then(function (cache) {
                return cache.match(request).then(function (cached) {
                    var network = fetch(request).then(function (response) {
                        if (response && (response.ok || response.type === 'opaque')) {
                            var copy = response.clone();
                            cache.put(request, copy);
                        }
                        return response;
                    });
                    return cached || network;
                });
            })
        );
    }
});

self.addEventListener('message', function (event) {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
