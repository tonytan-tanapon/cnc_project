// /static/js/page-reports.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

// Lots by Status
async function lotsByStatus() {
  const holder = $("rpt_area");
  try {
    const rows = await jfetch("/lots");
    // รวมกลุ่มตาม status
    const by = rows.reduce((acc, r) => {
      const k = r.status || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const view = Object.entries(by).map(([status, count]) => ({ status, count }));
    renderTable(holder, view);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายงาน Lots by Status ไม่สำเร็จ: " + e.message, false);
  }
}

// Subcon due within N days
async function subconDue() {
  const holder = $("rpt_area");
  try {
    const days = Number($("rpt_due_days")?.value || 7);
    const rows = await jfetch("/subcon/orders");
    const now = Date.now();
    const msPerDay = 86400000;
    const due = rows.filter(o => {
      if (!o.due_date) return false;
      const d = new Date(o.due_date);
      const diffDays = (d.getTime() - now) / msPerDay;
      return diffDays <= days && diffDays >= 0;
    });
    renderTable(holder, due);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายงาน Subcon due ไม่สำเร็จ: " + e.message, false);
  }
}

// Raw subcon orders (ตารางเต็ม)
async function subconRaw() {
  const holder = $("rpt_subcon_raw_table");
  try {
    const rows = await jfetch("/subcon/orders");
    // แปลง lines ให้เป็นข้อความอ่านง่าย
    const view = rows.map(o => ({
      id: o.id,
      supplier_id: o.supplier_id,
      status: o.status,
      created_at: o.created_at,
      due_date: o.due_date,
      lines: (o.lines || []).map(l => `#${l.id}: step ${l.traveler_step_id} (plan ${l.qty_planned})`).join("; ")
    }));
    renderTable(holder, view);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดข้อมูล Subcon orders ไม่สำเร็จ: " + e.message, false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("rpt_lot_status")?.addEventListener("click", lotsByStatus);
  $("rpt_subcon_due")?.addEventListener("click", subconDue);
  $("rpt_subcon_raw")?.addEventListener("click", subconRaw);

  // โหลดค่าเริ่มต้น
  lotsByStatus();
  subconRaw();
});
