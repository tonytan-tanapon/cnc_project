// /static/js/page-material.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ---------- Materials ----------
async function loadMaterials() {
  const holder = $("m_table");
  try {
    const rows = await jfetch("/materials");
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Materials ไม่สำเร็จ: " + e.message, false);
  }
}

async function createMaterial() {
  const payload = {
    code: (strOrNull($("m_code")?.value) || "").toUpperCase(), // เว้นว่าง/เขียน AUTO ให้หลังบ้าน autogen ได้
    name: strOrNull($("m_name")?.value) || "",
    spec: strOrNull($("m_spec")?.value),
    uom: strOrNull($("m_uom")?.value) || "ea",
    remark: strOrNull($("m_remark")?.value),
  };

  if (!payload.name) {
    toast("กรอกชื่อ Material ก่อนนะ", false);
    return;
  }

  try {
    await jfetch("/materials", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Material สำเร็จ");
    ["m_code", "m_name", "m_spec", "m_uom", "m_remark"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadMaterials();
  } catch (e) {
    toast("สร้าง Material ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- Batches ----------
async function loadBatches() {
  const holder = $("b_table");
  try {
    const rows = await jfetch("/batches");
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Batches ไม่สำเร็จ: " + e.message, false);
  }
}

async function createBatch() {
  const payload = {
    material_id: numOrNull($("b_mid")?.value),
    batch_no: strOrNull($("b_no")?.value) || "",
    supplier_id: numOrNull($("b_sid")?.value),
    qty_received: Number($("b_qty")?.value || 0),
    location: strOrNull($("b_loc")?.value),
    received_at: strOrNull($("b_recv")?.value), // yyyy-mm-dd หรือ null
    supplier_batch_no: null,
    mill_name: null,
    mill_heat_no: null,
    cert_file: null,
  };

  if (!payload.material_id) {
    toast("กรอก Material ID ก่อนนะ", false);
    return;
  }
  if (!payload.batch_no) {
    toast("กรอก Batch No. ก่อนนะ", false);
    return;
  }

  try {
    await jfetch("/batches", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Batch สำเร็จ");
    ["b_mid", "b_no", "b_sid", "b_qty", "b_loc", "b_recv"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadBatches();
  } catch (e) {
    toast("สร้าง Batch ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- bind & init ----------
document.addEventListener("DOMContentLoaded", () => {
  $("m_create")?.addEventListener("click", createMaterial);
  $("m_reload")?.addEventListener("click", loadMaterials);

  $("b_create")?.addEventListener("click", createBatch);
  $("b_reload")?.addEventListener("click", loadBatches);

  loadMaterials();
  loadBatches();
});
