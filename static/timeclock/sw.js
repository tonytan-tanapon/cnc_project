// --- v3: robust offline with navigation fallback ---
const CACHE_VERSION = "v3";
const CACHE_NAME = `kiosk-cache-${CACHE_VERSION}`;

// เส้นทางไฟล์หลักที่ต้องใช้แบบออฟไลน์
const OFFLINE_URL = "/static/timeclock/kiosk.html";

const CORE_ASSETS = [
  "/static/timeclock/kiosk.html",
  "/static/timeclock/queue.html",
  "/static/timeclock/manifest.json",
  // ถ้ามี favicon / icon ใส่ด้วย
  // "/static/timeclock/icons/icon-192.png",
  // "/static/timeclock/icons/icon-512.png",
  // สำคัญ: ใส่เวอร์ชันตามที่หน้า HTML import จริง ๆ
  "/static/js/api.js?v=1",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      // cache หน้า offline อีกครั้งด้วย ignoreSearch เผื่อมี query อื่น ๆ
      await cache.put(
        OFFLINE_URL,
        await (await fetch(OFFLINE_URL, { cache: "reload" })).clone()
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
      );
      await self.clients.claim();
    })()
  );
});

// ตัวช่วย match cache แบบไม่สนใจ query string
async function matchCache(req) {
  // ลอง match ตรง ๆ ก่อน
  let res = await caches.match(req, { ignoreSearch: false });
  if (res) return res;
  // แล้วลองแบบ ignoreSearch (กันเคส ?v=...)
  res = await caches.match(req, { ignoreSearch: true });
  return res || null;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ไม่ยุ่งกับ API — ให้วิ่งถึง backend ตรง ๆ
  if (url.pathname.startsWith("/api/")) return;

  // ทำงานเฉพาะ scope static timeclock + static js
  const inScope =
    url.pathname.startsWith("/static/timeclock/") ||
    url.pathname.startsWith("/static/js/");

  // 1) จัดการ "navigation" (ผู้ใช้เปิดหน้า/รีเฟรชหน้า)
  // ให้ network-first; ถ้าเน็ตล่ม → เสิร์ฟ OFFLINE_URL จาก cache
  if (req.mode === "navigate" && inScope) {
    event.respondWith(
      (async () => {
        try {
          // เผื่อ server map "/static/timeclock/" → kiosk.html
          // request แบบนี้จะมี accept:text/html อยู่แล้ว
          const net = await fetch(req);
          // เก็บลง cache ไว้ด้วย
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, net.clone());
          return net;
        } catch {
          // ถ้า offline หรือเน็ตพัง → เสิร์ฟหน้านี้แทน
          const fallback = await matchCache(OFFLINE_URL);
          if (fallback) return fallback;
          return new Response("<h1>Offline</h1>", {
            headers: { "Content-Type": "text/html" },
            status: 200,
          });
        }
      })()
    );
    return;
  }

  if (!inScope) return;

  // 2) ถ้าเป็นไฟล์ HTML (non-navigation fetch) → network-first + fallback cache
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, net.clone());
          return net;
        } catch {
          const cached = await matchCache(req);
          return (
            cached ||
            (await matchCache(OFFLINE_URL)) ||
            new Response("<h1>Offline</h1>", {
              headers: { "Content-Type": "text/html" },
            })
          );
        }
      })()
    );
    return;
  }

  // 3) ไฟล์ static อื่น ๆ (js/css/img) → cache-first + fallback เน็ต
  event.respondWith(
    (async () => {
      const cached = await matchCache(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, net.clone());
        return net;
      } catch {
        // ไม่มีใน cache และโหลดเน็ตไม่ได้
        return new Response("", { status: 504 });
      }
    })()
  );
});
