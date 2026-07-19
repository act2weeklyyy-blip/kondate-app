// アプリの土台(HTML・アイコン・外部CDNの主要スクリプト)をキャッシュし、
// Gemini API等の動的な通信には干渉しない設計。
const CACHE_VERSION = "kondate-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];
// crossorigin="anonymous"付きで読み込んでいるCDNスクリプト(CORS対応済みなのでキャッシュ可能)
const CDN_SHELL = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // CDNは1本ずつ試し、どれかが失敗してもインストール全体を失敗させない
      await Promise.all(
        CDN_SHELL.map((url) =>
          fetch(url, { mode: "cors" })
            .then((res) => res.ok && cache.put(url, res))
            .catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 同一オリジンのアプリ本体か、キャッシュ対象に登録したCDNスクリプトのみを対象にする。
  // Firebase RTDB通信・Gemini APIなど、それ以外の外部通信は素通りさせる。
  const isSameOrigin = url.origin === self.location.origin;
  const isCachedCdn = CDN_SHELL.includes(event.request.url);
  if (!isSameOrigin && !isCachedCdn) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => cached);
      // キャッシュがあれば即座に返しつつ、裏で最新版に更新(stale-while-revalidate)
      return cached || fetchPromise;
    })
  );
});
