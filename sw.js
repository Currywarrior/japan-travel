// 日本旅遊完全攻略 — Service Worker（離線快取）
// 發布新版時把 CACHE 的版本號往上加一，瀏覽器會重新 precache 並清掉舊快取。
const CACHE = 'jt-cache-v237';

// App shell：離線時最起碼要能開站的核心檔（相對路徑，兼容 GitHub Pages 子路徑）
const CORE = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './ai-planner.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

// 安裝：預先快取核心檔，個別失敗不影響整體
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// 啟用：清掉舊版本的快取，立即接管頁面
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 攔截：只處理 GET；快取優先（ignoreSearch 讓帶 ?v= 的檔命中），未命中再連網並回填
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                     // 放行 POST（例如 AI planner 打 worker）
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // 略過 chrome-extension 等

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => {
        // 離線且未快取：導覽請求退回首頁，其餘就讓它失敗
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
