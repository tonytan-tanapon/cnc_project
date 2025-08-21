// /static/js/nav-active.js
(function () {
  // คืนค่า pathname แบบ normalize (ตัด / ท้าย ยกเว้น root)
  function normalize(path) {
    try {
      path = new URL(path, location.origin).pathname;
    } catch (_) { /* ignore */ }
    if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  }

  // เทียบว่า href ของลิงก์นี้ตรงกับหน้าปัจจุบันไหม (รองรับ dashboard หลายพาธ)
  function isCurrent(href, cur) {
    const p = normalize(href);
    if (p === cur) return true;

    // map ให้ dashboard เท่ากัน ไม่ว่าจะเป็น /, /index.html หรือ /static/index.html
    const dashSet = new Set(['/', '/index.html', '/static/index.html']);
    if (dashSet.has(cur) && (p === '/static/index.html' || p === '/')) return true;

    return false;
  }

  function activate() {
    const cur = normalize(location.pathname);
    document.querySelectorAll('.nav a[href]').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', isCurrent(href, cur));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate);
  } else {
    activate();
  }
})();
