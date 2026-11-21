// 앱 화면 파일만 저장해 오프라인에서도 열리게 한다(PDF는 IndexedDB에 따로 저장).
const CACHE = 'pdf-reader-app-v1';
const SHELL_KEY = new URL('./', self.registration.scope).href;
// 글자 인식(tesseract.js) 프로그램·언어 자료: 한 번 받으면 저장해 두고 오프라인에서도 쓴다
const OCR_CACHE = 'pdf-reader-ocr-v1';
const isOcr = (url) => (url.host === 'cdn.jsdelivr.net' || url.host === 'tessdata.projectnaptha.com') && /tesseract/.test(url.href);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE && k !== OCR_CACHE) await caches.delete(k);
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
  if (req.method === 'GET' && isOcr(url)) {
    e.respondWith(
      caches.open(OCR_CACHE).then(async (c) => {
        const hit = await c.match(req.url);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) c.put(req.url, r.clone());
        return r;
      }),
    );
    return;
  }
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
