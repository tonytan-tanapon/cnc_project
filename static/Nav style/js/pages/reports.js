// /static/js/pages/reports.js
import { $, jfetch, renderTable, toast } from "../api.js";

let disposers = [];
function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
}

// ---------- actions ----------
async function lotsByStatus() {
  const area = $("rpt_area");
  if (!area) return;

  try {
    const rows = await jfetch("/lots");
    const summary = rows.reduce((acc, r) => {
      const k = r.status || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const view = Object.entries(summary).map(([status, count]) => ({ status, count }));
    renderTable(area, view);
  } catch (e) {
    area.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายงาน Lots by Status ไม่สำเร็จ: " + e.message, false);
  }
}

async function subconDue7() {
  const area = $("rpt_area");
  if (!area) return;

  try {
    const orders = await jfetch("/subcon/orders");
    const now = Date.now();
    const dayMs = 86400000;

    const soon = orders
      .filter(o => o?.due_date)
      .map(o => {
        const dueMs = Date.parse(o.due_date);
        const days_left = Math.floor((dueMs - now) / dayMs); // อาจติดลบถ้าเกินกำหนด
        return {
          id: o.id,
          supplier_id: o.supplier_id,
          status: o.status,
          due_date: o.due_date,
          days_left,
          lines: (o.lines || []).length
        };
      })
      .filter(x => x.days_left <= 7) // ภายใน 7 วัน (รวมที่เลยกำหนดแล้ว)
      .sort((a, b) => a.days_left - b.days_left);

    renderTable(area, soon);
  } catch (e) {
    area.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายงาน Subcon due (7d) ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("rpt_lot_status"), "click", lotsByStatus);
  on($("rpt_subcon_due"), "click", subconDue7);

  // แสดงรายงานเริ่มต้นสักอัน เพื่อไม่ให้หน้าว่าง
  await lotsByStatus();
}

export function unmount() {
  disposers.forEach(off => off());
  disposers = [];
}
