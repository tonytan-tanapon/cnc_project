// /static/js/nav.js
let _navHTMLCache = null;
let _lastActiveHref = null;

function normalizePath(url) {
  // ตัด query/hash + ตัดท้ายด้วย / ให้เหมือนกัน
  const u = new URL(url, location.origin);
  return u.pathname.replace(/\/+$/, "") || "/";
}

function setActiveLinks(root, mode = "exact") {
  const cur = normalizePath(location.href);
  const links = root.querySelectorAll(".nav a[href]");
  let matched = null;

  links.forEach((a) => {
    const href = normalizePath(a.href);
    const isActive =
      mode === "prefix"
        ? cur === href || cur.startsWith(href + "/")
        : cur === href;

    a.classList.toggle("active", isActive);
    if (isActive) {
      a.setAttribute("aria-current", "page");
      matched = href;
    } else {
      a.removeAttribute("aria-current");
    }
  });

  _lastActiveHref = matched;
}

async function loadNavHTML(navURL) {
  if (_navHTMLCache) return _navHTMLCache;

  try {
    const res = await fetch(navURL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _navHTMLCache = await res.text();
  } catch (err) {
    console.error("[nav] load failed:", err);
    _navHTMLCache = `
      <nav class="nav">
        <a href="/static/index.html">Dashboard</a>
        <a href="/static/customers.html">Customers</a>
        <a href="/static/pos.html">Purchase Orders</a>
        <a href="/static/materials.html">Materials</a>
        <a href="/static/lots.html">Lots</a>
        <a href="/static/employees.html">Employees</a>
        <a href="/static/users.html">Users</a>
        <a href="/static/travelers.html">Travelers</a>
        <a href="/static/subcon.html">Subcontracting</a>
        <a href="/static/suppliers.html">Suppliers</a>
        <a href="/static/reports.html">Reports</a>
        <a href="/static/payroll.html">Payrolls</a>
      </nav>`;
  }
  return _navHTMLCache;
}

/**
 * injectNav
 * @param {string} slotSelector - ที่จะวาง nav (เช่น '#navSlot' หรือ '.sidebar')
 * @param {object} opts
 *   - navURL: ที่อยู่ partial (default: '/static/partials/nav.html')
 *   - activeMode: 'exact' | 'prefix' (default: 'exact')
 */
export async function injectNav(slotSelector = "#navSlot", opts = {}) {
  const { navURL = "/static/partials/nav.html", activeMode = "exact" } = opts;
  const slot =
    document.querySelector(slotSelector) || document.querySelector(".sidebar");

  if (!slot) return;

  // โหลด/อ่าน cache
  const html = await loadNavHTML(navURL);

  // ถ้า slot มี .nav อยู่แล้ว -> แทนที่ (idempotent)
  const existing = slot.querySelector(":scope > .nav");
  if (existing) {
    existing.outerHTML = html;
  } else {
    // ถ้า slot เป็น #navSlot หรือมี data-nav-slot ให้แทนที่ทั้งใน
    if (slot.id === "navSlot" || slot.hasAttribute("data-nav-slot")) {
      slot.innerHTML = html;
    } else {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      const nav = tmp.firstElementChild;
      slot.appendChild(nav);
    }
  }

  // ตั้ง active
  setActiveLinks(slot, activeMode);

  // รองรับ SPA: อัปเดต active ตอนเปลี่ยนหน้า (back/forward)
  window.removeEventListener("popstate", _onPopState);
  function _onPopState() {
    setActiveLinks(slot, activeMode);
  }
  window.addEventListener("popstate", _onPopState);

  // ถ้าแอพมีการ pushState เอง ให้ dev เรียก setActiveLinks() หลัง push
  // หรือจะ hook คลิกภายใน .nav ให้ทำงานเป็น SPA ก็ได้ (ตัวอย่างด้านล่าง)
  const navRoot = slot.querySelector(".nav");
  if (navRoot && !navRoot.__spaBound) {
    navRoot.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const url = new URL(a.href, location.origin);
      // เฉพาะลิงก์ภายในโดเมน/ไม่มี target/_blank
      const isInternal =
        url.origin === location.origin && !a.hasAttribute("target");
      if (isInternal && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))
        return; // ให้เปิดแท็บใหม่/ฯลฯตามปกติ
      if (isInternal) {
        e.preventDefault();
        if (normalizePath(url) !== normalizePath(location.href)) {
          history.pushState({}, "", url);
          setActiveLinks(slot, activeMode);
          // **ตรงนี้ให้แอพของคุณ trigger โหลดเพจ/section เอง**
          // เช่น: window.appRouter?.navigate(url.pathname)
        }
      }
    });
    navRoot.__spaBound = true;
  }
}

// auto-run (เหมือนเดิม แต่เพิ่มตัวเลือก activeMode ผ่าน data-attr ได้)
document.addEventListener("DOMContentLoaded", () => {
  const el = document.querySelector("#navSlot,[data-nav-slot],.sidebar");
  const mode = el?.getAttribute("data-active-mode") || "exact"; // ใส่ data-active-mode="prefix" ได้
  injectNav("#navSlot", { activeMode: mode }).catch(console.error);
});
