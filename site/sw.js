// Caches the app shell so HealthyScan opens instantly and works offline (lookups still need a connection).
const CACHE = "healthyscan-v12";
const SHELL = ["/", "/index.html", "/css/app.css", "/js/conditions.js", "/js/engine.js", "/js/records.js", "/js/profiles.js", "/js/ehr.js", "/css/fonts.css", "/js/samples.js", "/js/app.js", "/js/scanner.js", "/vendor/zxing/zxing-reader.min.js", "/img/bg-food.webp", "/img/bg-products.webp", "/icons/icon.svg", "/manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // network first, fall back to cache
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
});
