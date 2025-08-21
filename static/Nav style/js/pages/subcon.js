// /static/js/pages/subcon.js
import { $, jfetch, renderTable, toast } from "../api.js";

let disposers = [];
const on = (el, ev, fn) => {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
};

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// -------- Orders --------
async function loadOrders() {
  const holder = $("sc_table");
  if (!holder) return;

  try {
    const rows = await jfetch("/subcon/orders");
    // แปลงให้อ่านง่าย ไม่ให้เป็น object ซ้อน
    const view = (rows || []).map((o) => ({
      id: o.id,
      supplier_id: o.supplier_id,
      status: o.status,
      created_at: o.created_at,
      due_date: o.due_date,
      lines_count: Array.isArray(o.lines) ? o.lines.length : 0,
      lines_summary: Array.isArray(o.lines)
        ? o.lines
            .map(
              (l) =>
                `#${l.id ?? "-"}: step ${l.traveler_step_id ?? "-"} (plan ${
                  l.qty_planned ?? "-"
                })`
            )
            .join("; ")
        : "",
    }));
    renderTable(holder, view);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Subcon Orders ไม่สำเร็จ: " + e.message, false);
  }
}

async function createOrder() {
  let lines = [];
  try {
    lines = JSON.parse($("sc_lines")?.value || "[]");
    if (!Array.isArray(lines)) throw new Error("Lines ต้องเป็นอาร์เรย์");
  } catch (e) {
    toast("รูปแบบ Lines ไม่ถูกต้อง (JSON): " + e.message, false);
    return;
  }

  const payload = {
    supplier_id: Number($("sc_sup")?.value || 0),
    ref_no: strOrNull($("sc_ref")?.value),
    due_date: strOrNull($("sc_due")?.value), // yyyy-mm-dd
    notes: strOrNull($("sc_notes")?.value),
    lines,
  };

  if (!payload.supplier_id) {
    toast("ระบุ Supplier ID ก่อน", false);
    return;
  }

  try {
    await jfetch("/subcon/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast("สร้าง Order สำเร็จ");
    ["sc_sup", "sc_ref", "sc_due", "sc_notes"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadOrders();
  } catch (e) {
    toast("สร้าง Order ไม่สำเร็จ: " + e.message, false);
  }
}

// -------- Shipments --------
async function createShipment() {
  let items = [];
  try {
    items = JSON.parse($("sh_items")?.value || "[]");
    if (!Array.isArray(items)) throw new Error("Items ต้องเป็นอาร์เรย์");
  } catch (e) {
    toast("รูปแบบ Items ไม่ถูกต้อง (JSON): " + e.message, false);
    return;
  }

  const payload = {
    order_id: Number($("sh_order")?.value || 0),
    package_no: strOrNull($("sh_pkg")?.value),
    carrier: strOrNull($("sh_carrier")?.value),
    tracking_no: strOrNull($("sh_track")?.value),
    items,
  };

  if (!payload.order_id) {
    toast("ระบุ Order ID ก่อน", false);
    return;
  }

  try {
    await jfetch("/subcon/shipments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast("สร้าง Shipment สำเร็จ");
    ["sh_order", "sh_pkg", "sh_carrier", "sh_track"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadOrders();
  } catch (e) {
    toast("สร้าง Shipment ไม่สำเร็จ: " + e.message, false);
  }
}

// -------- Receipts --------
async function createReceipt() {
  let items = [];
  try {
    items = JSON.parse($("rc_items")?.value || "[]");
    if (!Array.isArray(items)) throw new Error("Items ต้องเป็นอาร์เรย์");
  } catch (e) {
    toast("รูปแบบ Items ไม่ถูกต้อง (JSON): " + e.message, false);
    return;
  }

  const localDT = strOrNull($("rc_at")?.value); // จาก <input type="datetime-local">
  const iso = localDT ? new Date(localDT).toISOString() : null;

  const payload = {
    order_id: Number($("rc_order")?.value || 0),
    doc_no: strOrNull($("rc_doc")?.value),
    received_by: strOrNull($("rc_by")?.value),
    received_at: iso,
    items,
  };

  if (!payload.order_id) {
    toast("ระบุ Order ID ก่อน", false);
    return;
  }

  try {
    await jfetch("/subcon/receipts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast("สร้าง Receipt สำเร็จ");
    ["rc_order", "rc_doc", "rc_by", "rc_at"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadOrders();
  } catch (e) {
    toast("สร้าง Receipt ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("sc_create"), "click", createOrder);
  on($("sc_reload"), "click", loadOrders);

  on($("sh_create"), "click", createShipment);
  on($("rc_create"), "click", createReceipt);

  await loadOrders();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
}
