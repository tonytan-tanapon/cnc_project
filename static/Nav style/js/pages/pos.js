// /static/js/pages/customers.js
import { $, jfetch, toast } from "../api.js";

let disposers = [];
let rowsCache = [];

function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
}

const esc = (v) =>
  v == null ? "" : String(v).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));

function renderCustomersTable(rows){
  const holder = $("c_table");
  const cols = ["id","code","name","contact","email","phone","address","created_at"];
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = rows.map(r=>`
    <tr data-id="${r.id}">
      <td>${r.id}</td>
      <td>
        <a href="#/customer-detail?id=${r.id}" data-cust-id="${r.id}" class="link">
          ${esc(r.code)}
        </a>
      </td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.contact)}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.phone)}</td>
      <td>${esc(r.address)}</td>
      <td>${esc(r.created_at)}</td>
    </tr>
  `).join("");
  holder.innerHTML = `<div style="overflow:auto"><table>${thead}<tbody>${tbody}</tbody></table></div>`;
}

// ---------- actions ----------
async function loadCustomers() {
  const q = $("c_q")?.value?.trim();
  const path = "/customers" + (q ? `?q=${encodeURIComponent(q)}` : "");
  try {
    rowsCache = await jfetch(path);
    renderCustomersTable(rowsCache);
  } catch (e) {
    $("c_table").innerHTML = `<div class="hint">${e.message}</div>`;
  }
}

async function createCustomer() {
  const payload = {
    code: $("c_code").value.trim(),
    name: $("c_name").value.trim(),
    contact: $("c_contact").value.trim() || null,
    email: $("c_email").value.trim() || null,
    phone: $("c_phone").value.trim() || null,
    address: $("c_addr").value.trim() || null,
  };

  if (!payload.name) {
    toast("กรอกชื่อลูกค้าก่อนนะ", false);
    return;
  }

  try {
    await jfetch("/customers", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้างลูกค้าเรียบร้อย");
    ["c_code","c_name","c_contact","c_email","c_phone","c_addr"].forEach(id=>($(id).value=""));
    await loadCustomers();
  } catch (e) {
    toast(e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("c_create"), "click", createCustomer);
  on($("c_reload"), "click", loadCustomers);
  on($("c_q"), "keydown", (e) => { if (e.key === "Enter") loadCustomers(); });

  // จับคลิกที่ลิงก์ code เพื่อนำทางไปหน้า detail
  on($("c_table"), "click", (e) => {
    const a = e.target.closest('a[data-cust-id]');
    if (!a) return;
    // ปล่อยให้เปลี่ยน hash ตาม href (#/customer-detail?id=xxx) แล้ว router จะจัดการต่อ
    // ถ้าอยากสั่งผ่านตัวแปร global ของ router ก็ทำได้เช่น: window.appRouter?.go('customer-detail', {id: a.dataset.custId});
  });

  await loadCustomers();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
  rowsCache = [];
}
