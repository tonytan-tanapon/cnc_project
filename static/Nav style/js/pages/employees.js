// /static/js/pages/employees.js
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
async function loadEmployees() {
  const holder = $("e_table");
  if (!holder) return;

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

// ---------- life-cycle ----------
export async function mount() {
  on($("e_create"), "click", createEmployee);
  on($("e_reload"), "click", loadEmployees);
  on($("e_q"), "keydown", (e) => { if (e.key === "Enter") loadEmployees(); });

  await loadEmployees();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
}
