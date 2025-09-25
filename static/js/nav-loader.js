// /static/js/nav-loader.js

// โหลดพาร์เชียลเมนูแล้วแปะลงหน้า + ทำ active ให้อัตโนมัติ + ย่อ/ขยาย sidebar
export async function injectNav(slotSelector = "#navSlot") {
  const KEY = "tn_sidebar_collapsed"; // localStorage key
  const slot =
    document.querySelector(slotSelector) || document.querySelector(".sidebar");
  if (!slot) return;

  let html = "";
  try {
    // NOTE: path partials ตามของคุณ
    const res = await fetch("/static/partials/nav.html", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error("[nav] load failed:", err);
    // fallback (ใส่โครงสร้างพร้อมปุ่ม + icon/label เพื่อรองรับ collapse)
    html = `
      <nav class="nav" id="sidebar" aria-label="Primary">
        <button id="toggleNav" class="toggle-btn" type="button" aria-label="Toggle navigation">☰</button>
        <a href="/static/index.html"><span class="icon">🏠</span><span class="label">Dashboard</span></a>
        <a href="/static/customers.html"><span class="icon">👥</span><span class="label">Customers</span></a>
        <a href="/static/pos.html"><span class="icon">📦</span><span class="label">Purchase Orders</span></a>
        <a href="/static/parts.html"><span class="icon">⚙️</span><span class="label">Parts</span></a>
        <a href="/static/manage-test.html"><span class="icon">🧪</span><span class="label">Manage Test UI</span></a>
        <a href="/static/manage-parts.html"><span class="icon">🧩</span><span class="label">Manage Parts</span></a>
        <a href="/static/materials.html"><span class="icon">🧱</span><span class="label">Materials</span></a>
        <a href="/static/batches.html"><span class="icon">📚</span><span class="label">Batches</span></a>
        <a href="/static/lots.html"><span class="icon">🗂️</span><span class="label">Lots</span></a>
        <a href="/static/employees.html"><span class="icon">🧑‍🏭</span><span class="label">Employees</span></a>
        <a href="/static/users.html"><span class="icon">👤</span><span class="label">Users</span></a>
        <a href="/static/travelers.html"><span class="icon">🧾</span><span class="label">Travelers</span></a>
        <a href="/static/subcon.html"><span class="icon">🤝</span><span class="label">Subcontracting</span></a>
        <a href="/static/suppliers.html"><span class="icon">🏭</span><span class="label">Suppliers</span></a>
        <a href="/static/reports.html"><span class="icon">📊</span><span class="label">Reports</span></a>
        <a href="/static/payroll.html"><span class="icon">💵</span><span class="label">Payrolls</span></a>
        <a href="/static/time_clock.html"><span class="icon">⏱️</span><span class="label">Time clock</span></a>
      </nav>`;
  }

  // แปะ HTML ลง slot
  const attach = (container, markup) => {
    if (container.id === "navSlot" || container.hasAttribute("data-nav-slot")) {
      container.innerHTML = markup;
      return container; // nav อยู่ข้างใน container เลย
    } else {
      const tmp = document.createElement("div");
      tmp.innerHTML = markup;
      const nav = tmp.firstElementChild;
      container.appendChild(nav);
      return nav; // คืน element nav ที่แปะเพิ่ม
    }
  };
  const host = attach(slot, html);

  // หา element สำคัญ
  const app = document.querySelector(".app"); // wrapper หลัก (grid)
  const aside = document.querySelector(".sidebar"); // คอลัมน์ซ้าย
  // กรณี host คือ slot (#navSlot) ให้หา nav ข้างใน, ถ้า host คือ <nav> เองก็ใช้ host
  const nav = host.matches?.(".nav") ? host : host.querySelector?.(".nav");
  let btn = host.querySelector?.("#toggleNav");

  // ถ้า partial ไม่มีปุ่ม toggle ให้สร้างให้เอง (รองรับ partial เก่า)
  if (!btn && nav) {
    btn = document.createElement("button");
    btn.id = "toggleNav";
    btn.className = "toggle-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle navigation");
    btn.textContent = "☰";
    nav.prepend(btn);
  }

  // ทำ active ตาม path ปัจจุบัน
  const cur = new URL(location.href).pathname.replace(/\/+$/, "");
  (host.querySelectorAll?.(".nav a") || []).forEach((a) => {
    const href = new URL(
      a.getAttribute("href"),
      location.origin
    ).pathname.replace(/\/+$/, "");
    a.classList.toggle("active", href === cur);
  });

  // ====== ย่อ/ขยาย + จำสถานะ ======
  function applySavedState() {
    const collapsed = localStorage.getItem(KEY) === "1";
    app && app.classList.toggle("is-collapsed", collapsed);
    aside && aside.classList.toggle("collapsed", collapsed);
    nav && nav.classList.toggle("collapsed", collapsed);
  }

  function toggle() {
    // next = สถานะถัดไป (true = จะย่อ)
    const next = !(app && app.classList.contains("is-collapsed"));
    app && app.classList.toggle("is-collapsed", next);
    aside && aside.classList.toggle("collapsed", next);
    nav && nav.classList.toggle("collapsed", next);
    // เก็บ '1' เมื่อย่อ
    localStorage.setItem(KEY, next ? "1" : "0");
  }

  applySavedState();

  if (btn) {
    btn.addEventListener("click", toggle);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  }
}

// auto-run
document.addEventListener("DOMContentLoaded", () => injectNav());
