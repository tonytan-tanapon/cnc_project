// โหลดพาร์เชียลเมนูแล้วแปะลงหน้า + ทำ active ให้อัตโนมัติ
export async function injectNav(slotSelector = '#navSlot') {
  const slot = document.querySelector(slotSelector) || document.querySelector('.sidebar');
  if (!slot) return;

  let html = '';
  try {
    const res = await fetch('/static/partials/nav.html', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error('[nav] load failed:', err);
    // fallback เผื่อโหลดไม่ได้ (จะไม่ active ให้นะ)
    html = `
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
      </nav>`;
  }

  // ถ้ามี #navSlot ให้แปะตรงนั้น, ไม่งั้นแปะท้าย .sidebar
  if (slot.id === 'navSlot' || slot.hasAttribute('data-nav-slot')) {
    slot.innerHTML = html;
  } else {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const nav = tmp.firstElementChild;
    slot.appendChild(nav);
  }

  // ทำ active ตาม path ปัจจุบัน
  const cur = new URL(location.href).pathname.replace(/\/+$/, '');
  (slot.querySelectorAll('.nav a') || []).forEach(a => {
    const href = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '');
    a.classList.toggle('active', href === cur);
  });
}

// auto-run
document.addEventListener('DOMContentLoaded', () => injectNav());
