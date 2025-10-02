// /static/js/page-suppliers.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

async function loadSuppliers() {
  const holder = $("sup_table");
  try {
    const q = $("sup_q")?.value?.trim();
    const rows = await jfetch("/suppliers" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Suppliers ไม่สำเร็จ: " + e.message, false);
  }
}

async function createSupplier() {
  const payload = {
    code:    strOrNull($("sup_code")?.value),
    name:    strOrNull($("sup_name")?.value),
    phone:   strOrNull($("sup_phone")?.value),
    email:   strOrNull($("sup_email")?.value),
    address: strOrNull($("sup_addr")?.value),
    payment_terms: null,
    contact: null,
  };

  if (!payload.name) {
    toast("กรุณากรอกชื่อ Supplier", false);
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

document.addEventListener("DOMContentLoaded", () => {
  $("sup_create")?.addEventListener("click", createSupplier);
  $("sup_reload")?.addEventListener("click", loadSuppliers);
  $("sup_q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadSuppliers();
  });

  loadSuppliers();
});
