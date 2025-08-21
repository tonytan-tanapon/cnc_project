// /static/js/page-subcon.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ------- Orders -------
async function loadOrders() {
  const holder = $("sc_table");
  try {
    const rows = await jfetch("/subcon/orders");
    // แปลง view ให้ดูง่าย
    const view = rows.map((o) => ({
      id: o.id,
      supplier_id: o.supplier_id,
      status: o.status,
      created_at: o.created_at,
      due_date: o.due_date,
      lines: (o.lines || [])
        .map((l) => `#${l.id}: step ${l.traveler_step_id} (plan ${l.qty_planned})`)
        .join("; "),
    }));
    renderTable(holder, view);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Orders ไม่สำเร็จ: " + e.message, false);
  }
}

async function createOrder() {
  let lines = [];
  try {
    lines = JSON.parse($("sc_lines").value || "[]");
    if (!Array.isArray(lines)) throw new Error("lines ต้องเป็น array");
  } catch {
    toast("Lines JSON ไม่ถูกต้อง", false);
    return;
  }

  const payload = {
    supplier_id: numOrNull($("sc_sup").value),
    ref_no: strOrNull($("sc_ref").value),
    due_date: strOrNull($("sc_due").value),
    notes: strOrNull($("sc_notes").value),
    lines,
  };

  if (!payload.supplier_id) {
    toast("กรุณาใส่ Supplier ID", false);
    return;
  }
  if (!lines.length) {
    toast("ต้องมี lines อย่างน้อย 1 บรรทัด", false);
    return;
  }

  try {
    await jfetch("/subcon/orders", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Order สำเร็จ");
    await loadOrders();
    ["sc_sup", "sc_ref", "sc_due", "sc_notes"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
  } catch (e) {
    toast("สร้าง Order ไม่สำเร็จ: " + e.message, false);
  }
}

// ------- Shipments -------
async function createShipment() {
  let items = [];
  try {
    items = JSON.parse($("sh_items").value || "[]");
    if (!Array.isArray(items)) throw new Error("items ต้องเป็น array");
  } catch {
    toast("Items JSON ไม่ถูกต้อง", false);
    return;
  }

  const payload = {
    order_id: numOrNull($("sh_order").value),
    package_no: strOrNull($("sh_pkg").value),
    carrier: strOrNull($("sh_carrier").value),
    tracking_no: strOrNull($("sh_track").value),
    items,
  };

  if (!payload.order_id) {
    toast("กรุณาใส่ Order ID", false);
    return;
  }
  if (!items.length) {
    toast("ต้องมี items อย่างน้อย 1 บรรทัด", false);
    return;
  }

  try {
    await jfetch("/subcon/shipments", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Shipment สำเร็จ");
    await loadOrders();
    ["sh_order","sh_pkg","sh_carrier","sh_track"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  } catch (e) {
    toast("สร้าง Shipment ไม่สำเร็จ: " + e.message, false);
  }
}

// ------- Receipts -------
async function createReceipt() {
  let items = [];
  try {
    items = JSON.parse($("rc_items").value || "[]");
    if (!Array.isArray(items)) throw new Error("items ต้องเป็น array");
  } catch {
    toast("Items JSON ไม่ถูกต้อง", false);
    return;
  }

  const receivedAt = strOrNull($("rc_at").value);
  const payload = {
    order_id: numOrNull($("rc_order").value),
    doc_no: strOrNull($("rc_doc").value),
    received_by: strOrNull($("rc_by").value),
    received_at: receivedAt ? new Date(receivedAt).toISOString() : null,
    items,
  };

  if (!payload.order_id) {
    toast("กรุณาใส่ Order ID", false);
    return;
  }
  if (!items.length) {
    toast("ต้องมี items อย่างน้อย 1 บรรทัด", false);
    return;
  }

  try {
    await jfetch("/subcon/receipts", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Receipt สำเร็จ");
    await loadOrders();
    ["rc_order","rc_doc","rc_by","rc_at"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  } catch (e) {
    toast("สร้าง Receipt ไม่สำเร็จ: " + e.message, false);
  }
}

// Bind events
document.addEventListener("DOMContentLoaded", () => {
  $("sc_reload")?.addEventListener("click", loadOrders);
  $("sc_create")?.addEventListener("click", createOrder);

  $("sh_create")?.addEventListener("click", createShipment);
  $("rc_create")?.addEventListener("click", createReceipt);

  loadOrders();
});
