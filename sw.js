// 앱 화면 파일을 저장해 오프라인에서도 열리고, 첫 화면을 네트워크 없이 바로 띄운다(PDF는 IndexedDB에 따로 저장).
// 0.44: 판마다 캐시를 따로 둔다. VERSION·ASSETS는 빌드 때 vite.config.js(swManifest)가 채운다.
//   설치: 그 판의 화면(HTML)과 묶음 파일을 모두 받아 둔다 → 기다림 → 앱의 「새 판이 있습니다」 알림을 누르거나
//   앱을 완전히 닫았다 열면 바뀐다 → 지난 판 캐시를 지운다(글자 인식 캐시는 둠).
//   화면(HTML)은 저장본 우선: 와이파이가 약해도 첫 화면을 기다리지 않는다. 새 판은 sw.js가 바뀌는 것으로 안다.
const VERSION = "0.65.0-87052e1a";
const ASSETS = ["./assets/barorder-DgR1xpmp.js","./assets/covers-SLAbOJUF.js","./assets/handwriting-DW8ERzg3.js","./assets/index-B_jNZsF8.css","./assets/index-Cxm70BQy.js","./assets/notesheets-BU4XL3nT.js","./assets/notesui-CW9SO5EC.js","./assets/opfs-worker-DrJoTbMF.js","./assets/pdf.worker.min-CIqJB0yW.mjs","./assets/pdfconst-B9TX_4z5.js","./assets/reader-DxprTxX2.js","./assets/searchui-D-68BSs2.js","./assets/settings-BytR_rmq.js","./assets/storageui-BaFe_PwQ.js","./assets/taps-DGB1zFkn.js","./assets/viewer-Dk2WeCB8.js","./icons/cat-book.svg","./icons/icon-180.png","./icons/icon-192.png","./icons/icon-512.png","./icons/logo.svg","./manifest.webmanifest","./pdfjs-wasm/jbig2.wasm","./pdfjs-wasm/openjpeg.wasm","./pdfjs-wasm/qcms_bg.wasm"];
const PREFIX = 'pdf-reader-app-';
const CACHE = PREFIX + VERSION;
const SHELL_KEY = new URL('./', self.registration.scope).href;
// 글자 인식(tesseract.js) 프로그램·언어 자료: 한 번 받으면 저장해 두고 오프라인에서도 쓴다
const OCR_CACHE = 'pdf-reader-ocr-v1';
const isOcr = (url) => (url.host === 'cdn.jsdelivr.net' || url.host === 'tessdata.projectnaptha.com') && /tesseract/.test(url.href);
// 글꼴(Google Fonts): CSS는 저장본을 먼저 쓰고 뒤에서 새로 받음, 글꼴 파일(주소에 판이 박힘)은 저장본 우선
const FONT_CACHE = 'pdf-reader-fonts-v1';
const isFontCss = (url) => url.host === 'fonts.googleapis.com';
const isFontFile = (url) => url.host === 'fonts.gstatic.com';
const keepable = (r) => r.ok || r.type === 'opaque';
const abs = (u) => new URL(u, self.registration.scope).href;

self.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      // 화면은 HTTP 캐시를 거치지 않고 받아, 이 판의 첫 묶음을 가리키는지 확인한다
      // (배포 직후 옛 화면이 섞여 들어오면 설치를 실패시켜 다음에 다시 하게)
      const r = await fetch(SHELL_KEY, { cache: 'reload' });
      if (!r.ok) throw new Error(`화면을 받지 못함 ${r.status}`);
      const entry = ASSETS.find((a) => /\/index-[^/]+\.js$/.test(a));
      if (entry && !(await r.clone().text()).includes(entry.replace(/^\.\//, ''))) throw new Error('화면과 묶음 판이 다름');
      await c.put(SHELL_KEY, r);
      await c.addAll(ASSETS.map((a) => new Request(abs(a), { cache: 'reload' })));
    })(),
  ),
);

self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE && k !== OCR_CACHE && k !== FONT_CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'skipWaiting') self.skipWaiting();
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
  if (req.method === 'GET' && (isFontCss(url) || isFontFile(url))) {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req.url);
        const net = () =>
          fetch(req).then((r) => {
            if (keepable(r)) c.put(req.url, r.clone());
            return r;
          });
        if (hit) {
          if (isFontCss(url)) e.waitUntil(net().catch(() => {}));
          return hit;
        }
        return net();
      }),
    );
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 화면(HTML): 이 판의 저장본을 바로 띄움. 없을 때만 네트워크
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        const hit = await c.match(SHELL_KEY);
        if (hit) return hit;
        try {
          const r = await fetch(req);
          if (r.ok && url.pathname === new URL(SHELL_KEY).pathname) c.put(SHELL_KEY, r.clone());
          return r;
        } catch (err) {
          return (await caches.match(SHELL_KEY)) || Promise.reject(err);
        }
      })(),
    );
    return;
  }
  // 나머지(js·css·아이콘): 저장본 우선, 없으면 받아서 이 판 캐시에 넣음
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
