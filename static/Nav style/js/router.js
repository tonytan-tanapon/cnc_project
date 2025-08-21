// /static/js/router.js

// เก็บ loader ของแต่ละหน้า (name -> () => Promise<module>)
const registry = new Map();

// state ปัจจุบัน
let currentPage = null;         // ชื่อหน้า เช่น "customers"
let currentModule = null;       // module ของหน้า (มี mount/unmount)
let navToken = 0;               // ป้องกัน race เมื่อเปลี่ยนหน้าเร็ว ๆ
let ignoreHash = false;         // กัน loop เมื่อเราเปลี่ยน hash เอง

/**
 * ลงทะเบียนหน้าไว้ก่อน แล้วค่อย import ตอนเรียกใช้งาน
 * @param {string} name - ชื่อหน้า เช่น "customers"
 * @param {() => Promise<any>} loader - ฟังก์ชัน dynamic import module ของหน้านั้น
 */
function registerPage(name, loader) {
  registry.set(name, loader);
}

/**
 * แสดงหน้าและ lazy-load module จาก registry (ถ้ามี)
 * จะเรียก unmount() ของหน้าก่อนหน้าให้อัตโนมัติ
 * @param {string} name
 * @param {{updateHash?: boolean}} opts
 */
async function showPage(name, opts = { updateHash: true }) {
  const section = document.getElementById(`page-${name}`);
  if (!section) {
    console.warn(`[router] ไม่พบ section: #page-${name}`);
    return;
  }
  if (currentPage === name) {
    _activateSection(name);
    _activateNav(name);
    return;
  }

  if (currentModule?.unmount) {
    try { currentModule.unmount(); } catch (e) { console.error(e); }
  }

  _activateSection(name);
  _activateNav(name);

  if (opts.updateHash) {
    ignoreHash = true;
    location.hash = `#${name}`;
    setTimeout(() => { ignoreHash = false; }, 0);
  }

  currentPage = name;
  currentModule = null;

  const loader = registry.get(name);
  if (!loader) return;

  const myToken = ++navToken;
  try {
    const mod = await loader();
    if (myToken !== navToken) return; // ผู้ใช้เปลี่ยนหน้าไปแล้ว

    currentModule = mod;
    if (typeof mod.mount === "function" && currentPage === name && myToken === navToken) {
      await mod.mount();
    }
  } catch (err) {
    console.error(`[router] โหลดหน้า "${name}" ไม่สำเร็จ:`, err);
  }
}

/**
 * เตรียมระบบนำทาง (sidebar + quick tiles + hash routing)
 * @param {string} defaultPage - ชื่อหน้าแรก (เช่น "dash")
 */
function initRouter(defaultPage = "dash") {
  const sideNav = document.getElementById("sideNav");
  if (sideNav) {
    sideNav.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-page]");
      if (!a) return;
      e.preventDefault();
      const target = a.dataset.page;
      if (!target) return;
      showPage(target);
    });
  }

  const tiles = document.getElementById("quickTiles");
  if (tiles) {
    tiles.addEventListener("click", (e) => {
      const t = e.target.closest("[data-nav]");
      if (!t) return;
      e.preventDefault();
      const target = t.dataset.nav;
      if (!target) return;
      showPage(target);
    });
  }

  window.addEventListener("hashchange", () => {
    if (ignoreHash) return;
    const hash = (location.hash || "").replace(/^#/, "");
    const name = hash || defaultPage;
    showPage(name, { updateHash: false });
  });

  const first = (location.hash || "").replace(/^#/, "") || defaultPage;
  showPage(first, { updateHash: false });
}

function getCurrentPage() {
  return currentPage;
}

/* ---------------- internal helpers ---------------- */

function _activateSection(name) {
  document
    .querySelectorAll('main > section[id^="page-"]')
    .forEach((sec) => sec.classList.add("hidden"));
  const sec = document.getElementById(`page-${name}`);
  if (sec) sec.classList.remove("hidden");
}

function _activateNav(name) {
  document
    .querySelectorAll("#sideNav a[data-page]")
    .forEach((a) => a.classList.toggle("active", a.dataset.page === name));
}

// ---- exports ----
// รายฟังก์ชัน
export { registerPage, showPage, initRouter, getCurrentPage };

// อ็อบเจ็กต์ Router (รองรับ import { Router } from ".../router.js")
export const Router = { registerPage, showPage, initRouter, getCurrentPage };

// default export (จะ import Router จาก default ก็ได้)
export default Router;
