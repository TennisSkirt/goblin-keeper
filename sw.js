// sw.js — 오프라인 캐시 (정적 파일만, 민감 데이터는 절대 캐시하지 않음)
const CACHE = "goblin-keeper-v9";
const ASSETS = [
  ".",
  "index.html",
  "style.css",
  "crypto.js",
  "db.js",
  "bio.js",
  "icons.js",
  "i18n.js",
  "barcode.js",
  "types.js",
  "app.js",
  "manifest.webmanifest",
  "assets/gk-appicon.png",
  "assets/gk-desk.png",
  "assets/gk-logo.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
