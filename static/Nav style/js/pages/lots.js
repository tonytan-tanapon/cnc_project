// /static/js/pages/lots.js
import { $, jfetch, toast, renderTable } from "../api.js";

let disposers = [];
function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
}

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ---------- actions ----------
async function loadLots() {
  const el = $("l_table");
  try {
    const rows = await jfetch("/lots");
    renderTable(el, rows);
  } catch (e) {
    if (el) el.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Lots ไม่สำเร็จ: " + e.message, false);
  }
}

async function createLot() {
  const statusEl = $("l_status");
  const payload = {
    lot_no: (strOrNull($("l_no")?.value) || "").toUpperCase(),
    part_no: strOrNull($("l_part")?.value),
    po_id: numOrNull($("l_poid")?.value),
    planned_qty: Number($("l_qty")?.value || 0),
    status: statusEl?.value || "in_process", // 'in_process' | 'completed' | 'hold'
  };

  if (!payload.lot_no) {
    toast("ใส่ Lot No. ก่อนนะ", false);
    return;
  }

  try {
    await jfetch("/lots", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Lot สำเร็จ");
    await loadLots();
    // เคลียร์ฟอร์ม
    ["l_no", "l_part", "l_poid", "l_qty"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    if (statusEl) statusEl.value = "in_process";
  } catch (e) {
    toast("สร้าง Lot ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("l_create"), "click", createLot);
  on($("l_reload"), "click", loadLots);
  await loadLots();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
}

// เผื่อ router ของคุณ expect default export
export default { mount, unmount };
