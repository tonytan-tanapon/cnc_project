// /static/js/nav-loader.js
export async function injectNav(slotSelector = "#navSlot") {
  const KEY = "tn_sidebar_collapsed";
  const slot =
    document.querySelector(slotSelector) || document.querySelector(".sidebar");
  if (!slot) return;

  let html = "";
  try {
    const res = await fetch("/static/partials/nav.html", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error("[nav] load failed:", err);
    // fallback ย่อ ๆ แต่ใช้ได้
    html = `
      <nav class="nav" id="sidebar" aria-label="Primary">
        <button id="toggleNav" class="toggle-btn" type="button" aria-label="Toggle navigation">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18"/>
          </svg>
        </button>
        <a href="/static/index.html"><span class="icon">🏠</span><span class="label">Dashboard</span></a>
        <a href="/static/customers.html"><span class="icon">👥</span><span class="label">Customers</span></a>
      </nav>`;
  }

  // attach
  if (slot.id === "navSlot" || slot.hasAttribute("data-nav-slot")) {
    slot.innerHTML = html;
  } else {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    slot.appendChild(tmp.firstElementChild);
  }

  // refs
  const app = document.querySelector(".app");
  const aside = document.querySelector(".sidebar");
  const nav = slot.querySelector(".nav") || document.querySelector(".nav");
  const btn =
    slot.querySelector("#toggleNav") ||
    (nav && nav.querySelector("#toggleNav"));

  // active link
  const cur = new URL(location.href).pathname.replace(/\/+$/, "");
  (nav?.querySelectorAll("a") || []).forEach((a) => {
    const href = new URL(
      a.getAttribute("href"),
      location.origin
    ).pathname.replace(/\/+$/, "");
    a.classList.toggle("active", href === cur);
  });

  // collapse state
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
    localStorage.setItem(KEY, next ? "1" : "0"); // 1 = collapsed
  }

  applySaved();
  btn?.addEventListener("click", toggle);
  btn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
}
document.addEventListener("DOMContentLoaded", () => injectNav());
