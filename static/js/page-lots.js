// /static/js/page_lots.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// -------- Lots --------
async function loadLots() {
  const holder = $("l_table");
  try {
    const rows = await jfetch("/lots");
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Lots ไม่สำเร็จ: " + e.message, false);
  }
}

async function createLot() {
  const payload = {
    lot_no: (strOrNull($("l_no")?.value) || "").toUpperCase(),
    part_no: strOrNull($("l_part")?.value),
    po_id: numOrNull($("l_poid")?.value),
    planned_qty: Number($("l_qty")?.value || 0),
    status: $("l_status")?.value || "in_process",
  };

  if (!payload.lot_no) {
    toast("ใส่ Lot No. ก่อนนะ", false);
    return;
  }

  try {
    await jfetch("/lots", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Lot สำเร็จ");
    ["l_no", "l_part", "l_poid", "l_qty"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    const st = $("l_status");
    if (st) st.value = "in_process";
    await loadLots();
  } catch (e) {
    toast("สร้าง Lot ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- bind & init ----------
document.addEventListener("DOMContentLoaded", () => {
  $("l_create")?.addEventListener("click", createLot);
  $("l_reload")?.addEventListener("click", loadLots);
  loadLots();
});
