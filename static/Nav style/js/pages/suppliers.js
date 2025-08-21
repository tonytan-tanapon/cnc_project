// /static/js/pages/suppliers.js
import { $, jfetch, renderTable, toast } from "../api.js";

let disposers = [];
function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
}

const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ---------- actions ----------
async function loadSuppliers() {
  const holder = $("sup_table");
  if (!holder) return;

  try {
    const q = $("sup_q")?.value?.trim();
    const rows = await jfetch("/suppliers" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายชื่อซัพพลายเออร์ไม่สำเร็จ: " + e.message, false);
  }
}

async function createSupplier() {
  const payload = {
    code: strOrNull($("sup_code")?.value) || "",          // ว่างได้ เผื่อให้หลังบ้าน autogen
    name: strOrNull($("sup_name")?.value) || "",
    phone: strOrNull($("sup_phone")?.value),
    email: strOrNull($("sup_email")?.value),
    address: strOrNull($("sup_addr")?.value),
    // ฟิลด์เสริมที่ backend อาจรองรับ
    payment_terms: null,
    contact: null,
  };

  if (!payload.name) {
    toast("กรุณากรอกชื่อซัพพลายเออร์", false);
    return;
  }

  try {
    await jfetch("/suppliers", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Supplier สำเร็จ");
    ["sup_code","sup_name","sup_phone","sup_email","sup_addr"].forEach(id => {
      const el = $(id); if (el) el.value = "";
    });
    await loadSuppliers();
  } catch (e) {
    toast("สร้าง Supplier ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("sup_create"), "click", createSupplier);
  on($("sup_reload"), "click", loadSuppliers);
  on($("sup_q"), "keydown", (e) => { if (e.key === "Enter") loadSuppliers(); });

  await loadSuppliers();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
}
