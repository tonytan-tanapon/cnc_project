// /static/js/page-pos.js
import { $, jfetch, renderTable, toast, initTopbar } from "/static/js/api.js";

const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

// โหลดรายการ PO
async function loadPOs() {
  const holder = $("po_table");
  try {
    const rows = await jfetch("/pos");
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด PO ไม่สำเร็จ: " + e.message, false);
  }
}

// สร้าง PO ใหม่
async function createPO() {
  const po_no  = ($("po_no")?.value || "").trim();     // ว่าง/"AUTO"/"AUTOGEN" ให้หลังบ้าน autogen
  const desc   = ($("po_desc")?.value || "").trim();
  const custId = Number($("po_cust")?.value || 0);

  if (!custId) {
    toast("กรุณาใส่ Customer ID", false);
    return;
  }

  const payload = {
    po_number: po_no,                          // ส่งไปตามที่กรอกไว้
    description: desc || null,
    customer_id: custId,
  };

  try {
    await jfetch("/pos", { method: "POST", body: JSON.stringify(payload) });
    toast("PO created");
    // เคลียร์ฟอร์ม
    ["po_no", "po_desc", "po_cust"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadPOs();
  } catch (e) {
    toast(e.message, false);
  }
}

// bootstrap เมื่อหน้าโหลด
document.addEventListener("DOMContentLoaded", () => {
  // ผูก topbar (API base + Ping)
  initTopbar();

  on($("po_reload"), "click", loadPOs);
  on($("po_create"), "click", createPO);

  // กด Enter ในช่อง customer id เพื่อสร้างเร็ว
  on($("po_cust"), "keydown", (e) => {
    if (e.key === "Enter") createPO();
  });

  // โหลดครั้งแรก
  loadPOs();
});
