// /static/js/nav.js
import { jfetch, toast } from "/static/js/api.js";

/* -----------------------------------------
   โหลด nav.html + แสดงชื่อผู้ใช้ + logout
----------------------------------------- */
let _navHTMLCache = null;

async function loadNavHTML(navURL) {
  if (_navHTMLCache) return _navHTMLCache;
  try {
    const res = await fetch(navURL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _navHTMLCache = await res.text();
  } catch (err) {
    console.error("[nav] load failed:", err);
    _navHTMLCache = `
      <nav class="nav" id="sidebar">
        <div class="logo">
          <span id="toggleNav" class="toggle-btn logo-badge">TN</span>
          <span id="userInfo" class="user-info"></span>
        </div>
        <a href="/static/index.html">🏠 Dashboard</a>
        <a href="/static/customers.html">👥 Customers</a>
      </nav>`;
  }
  return _navHTMLCache;
}

/* -----------------------------------------
   ตั้ง active link ให้ลิงก์ปัจจุบัน
----------------------------------------- */
function setActiveLink(navRoot) {
  const cur = new URL(location.href).pathname.replace(/\/+$/, "");
  (navRoot?.querySelectorAll("a") || []).forEach((a) => {
    const href = new URL(
      a.getAttribute("href"),
      location.origin
    ).pathname.replace(/\/+$/, "");
    a.classList.toggle("active", href === cur);
  });
}

/* -----------------------------------------
   โหลด nav + จัดการ toggle + ผู้ใช้
----------------------------------------- */
export async function injectNav(slotSelector = "#navSlot") {
  const KEY = "tn_sidebar_collapsed";
  const slot =
    document.querySelector(slotSelector) || document.querySelector(".sidebar");
  if (!slot) return;

  const html = await loadNavHTML("/static/partials/nav.html");

  // inject
  if (slot.id === "navSlot" || slot.hasAttribute("data-nav-slot"))
    slot.innerHTML = html;
  else slot.insertAdjacentHTML("beforeend", html);

  const app = document.querySelector(".app");
  const aside = document.querySelector(".sidebar");
  const nav = slot.querySelector(".nav") || document.querySelector(".nav");
  const btn = nav?.querySelector("#toggleNav");
  const userEl = nav?.querySelector("#userInfo");

  /* ---- ACTIVE ---- */
  setActiveLink(nav);

  /* ---- COLLAPSE ---- */
  function applySaved() {
    const collapsed = localStorage.getItem(KEY) === "1";
    app?.classList.toggle("is-collapsed", collapsed);
    aside?.classList.toggle("collapsed", collapsed);
    nav?.classList.toggle("collapsed", collapsed);
  }
  function toggle() {
    const next = !app?.classList.contains("is-collapsed");
    app?.classList.toggle("is-collapsed", next);
    aside?.classList.toggle("collapsed", next);
    nav?.classList.toggle("collapsed", next);
    localStorage.setItem(KEY, next ? "1" : "0");
  }
  applySaved();
  btn?.addEventListener("click", toggle);

  /* ---- USER SECTION ---- */
  await initUserSection(userEl);
}

/* -----------------------------------------
   แสดงชื่อผู้ใช้ / Logout
----------------------------------------- */
async function initUserSection(el) {
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
      <a href="#" id="logoutLink" style="margin-left:8px;">Logout</a>
    `;
    el.querySelector("#logoutLink").addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("token");
      toast("Logged out");
      setTimeout(() => (window.location.href = "/static/login.html"), 600);
    });
  } catch {
    localStorage.removeItem("token");
    el.innerHTML = `<a href="/static/login.html">Login</a>`;
  }
}

/* -----------------------------------------
   Autorun
----------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  injectNav("#navSlot").catch(console.error);
});
