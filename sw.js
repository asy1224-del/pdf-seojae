// 앱 화면 파일만 저장해 오프라인에서도 열리게 한다(PDF는 IndexedDB에 따로 저장).
const CACHE = 'pdf-reader-app-v1';
const SHELL_KEY = new URL('./', self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache') return;
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(e.data.urls.map((u) => c.add(new URL(u, self.registration.scope).href).catch(() => {}))),
    ),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 화면(HTML): 네트워크 우선, 안 되면 저장본
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(SHELL_KEY, copy));
          return r;
        })
        .catch(() => caches.match(SHELL_KEY)),
    );
    return;
  }
  // 나머지(js·css·아이콘): 저장본 우선
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return r;
        }),
    ),
  );
});
