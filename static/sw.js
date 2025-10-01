/* /static/sw.js */
const VERSION = "v1.0.0";
const STATIC_CACHE = `kiosk-static-${VERSION}`;

const APP_SHELL = [
  // ไฟล์สำคัญที่ต้องมีเพื่อให้หน้าโหลดออฟไลน์ได้
  "/static/kiosk.html", // ← แก้ชื่อไฟล์หน้า kiosk ถ้าแตกต่าง
  "/static/css/app.css", // ← ปรับให้ตรงกับของจริง
  "/static/js/api.js",
  // เพิ่มไฟล์ JS/CSS อื่นๆ ที่ kiosk.html import อยู่ เช่น:
  // '/static/js/whatever.js',
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/offline.html", // ตัวเลือก
];

// Install: cache ไฟล์แอป
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: ล้าง cache เก่า
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) =>
            k.startsWith("kiosk-static-") && k !== STATIC_CACHE
              ? caches.delete(k)
              : null
          )
        )
      )
  );
  self.clients.claim();
});

function isNavigationRequest(req) {
  return (
    req.mode === "navigate" ||
    (req.method === "GET" && req.headers.get("accept")?.includes("text/html"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) นำทางเข้า HTML → cache-first + offline fallback
  if (isNavigationRequest(request) && url.pathname.startsWith("/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached =
          (await cache.match("/static/kiosk.html")) ||
          (await cache.match(url.pathname));
        if (cached) return cached;

        try {
          const netRes = await fetch(request);
          if (netRes.ok) cache.put(url.pathname, netRes.clone());
          return netRes;
        } catch {
          const offline = await cache.match("/static/offline.html");
          return (
            offline ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  // 2) Static assets → cache-first
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const netRes = await fetch(request);
          if (netRes.ok) cache.put(request, netRes.clone());
          return netRes;
        } catch {
          return new Response("", { status: 504 });
        }
      })()
    );
    return;
  }

  // 3) API → ผ่านเน็ตตามปกติ (offline queue อยู่ในหน้า kiosk แล้ว)
});
