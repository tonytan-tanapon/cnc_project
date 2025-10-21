// /static/js/nav.js
import { jfetch, toast } from "/static/js/api.js";

/* -------------------------------------------------------
   SECTION 1: ฟังก์ชัน Nav เดิม (ไม่แตะ)
------------------------------------------------------- */
let _navHTMLCache = null;

function normalizePath(url) {
  const u = new URL(url, location.origin);
  return u.pathname.replace(/\/+$/, "") || "/";
}

function setActiveLinks(root, mode = "exact") {
  const cur = normalizePath(location.href);
  const links = root.querySelectorAll(".nav a[href]");
  links.forEach((a) => {
    const href = normalizePath(a.href);
    const isActive =
      mode === "prefix"
        ? cur === href || cur.startsWith(href + "/")
        : cur === href;
    a.classList.toggle("active", isActive);
  });
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
      </nav>`;
  }
  return _navHTMLCache;
}

/* -------------------------------------------------------
   SECTION 2: injectNav (เหมือนเดิม)
------------------------------------------------------- */
export async function injectNav(slotSelector = "#navSlot", opts = {}) {
  const { navURL = "/static/partials/nav.html", activeMode = "exact" } = opts;
  const slot =
    document.querySelector(slotSelector) || document.querySelector(".sidebar");
  if (!slot) return;

  const html = await loadNavHTML(navURL);

  const existing = slot.querySelector(":scope > .nav");
  if (existing) existing.outerHTML = html;
  else slot.innerHTML = html;

  setActiveLinks(slot, activeMode);

  window.removeEventListener("popstate", _onPopState);
  function _onPopState() {
    setActiveLinks(slot, activeMode);
  }
  window.addEventListener("popstate", _onPopState);

  const navRoot = slot.querySelector(".nav");
  if (navRoot && !navRoot.__spaBound) {
    navRoot.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const url = new URL(a.href, location.origin);
      const isInternal =
        url.origin === location.origin && !a.hasAttribute("target");
      if (isInternal) {
        e.preventDefault();
        history.pushState({}, "", url);
        setActiveLinks(slot, activeMode);
      }
    });
    navRoot.__spaBound = true;
  }

  // ✅ หลังโหลด nav เสร็จ -> เรียกแสดงชื่อผู้ใช้
  await initUserSection(slot);
}

/* -------------------------------------------------------
   SECTION 3: แสดงชื่อผู้ใช้ / logout / redirect
------------------------------------------------------- */
async function initUserSection(slot) {
  // หา element ที่จะใส่ชื่อผู้ใช้ (ต้องมี <span id="userInfo"> ใน nav.html)
  const el = slot.querySelector("#userInfo");
  if (!el) return;

  const token = localStorage.getItem("token");
  if (!token) {
    el.innerHTML = `<a href="/static/login.html">Login</a>`;
    return;
  }

  try {
    const me = await jfetch("/auth/me");
    el.innerHTML = `
      👋 ${me.username}
      <a href="#" id="logoutLink">Logout</a>
    `;
    el.querySelector("#logoutLink").addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("token");
      toast("Logged out");
      setTimeout(() => (window.location.href = "/static/login.html"), 700);
    });
  } catch {
    // token หมดอายุ
    localStorage.removeItem("token");
    el.innerHTML = `<a href="/static/login.html">Login</a>`;
  }
}

/* -------------------------------------------------------
   SECTION 4: autorun
------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const el = document.querySelector("#navSlot,[data-nav-slot],.sidebar");
  const mode = el?.getAttribute("data-active-mode") || "exact";
  injectNav("#navSlot", { activeMode: mode }).catch(console.error);
});
