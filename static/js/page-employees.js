// /static/js/page-employees.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

async function loadEmployees() {
  const holder = $("e_table");
  try {
    const q = $("e_q")?.value?.trim();
    const rows = await jfetch("/employees" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายชื่อพนักงานไม่สำเร็จ: " + e.message, false);
  }
}

async function createEmployee() {
  const name  = strOrNull($("e_name")?.value);
  const email = strOrNull($("e_email")?.value);
  const phone = strOrNull($("e_phone")?.value);
  const role  = strOrNull($("e_role")?.value);

  if (!name) {
    toast("กรุณากรอกชื่อพนักงาน", false);
    return;
  }

  const payload = { name, email, phone, role };

  try {
    await jfetch("/employees", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้างพนักงานสำเร็จ");
    // เคลียร์ฟอร์ม
    ["e_name", "e_email", "e_phone", "e_role"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadEmployees();
  } catch (e) {
    toast("สร้างพนักงานไม่สำเร็จ: " + e.message, false);
  }
}

// bind
document.addEventListener("DOMContentLoaded", () => {
  $("e_create")?.addEventListener("click", createEmployee);
  $("e_reload")?.addEventListener("click", loadEmployees);
  $("e_q")?.addEventListener("keydown", (e) => { if (e.key === "Enter") loadEmployees(); });

  loadEmployees();
});
