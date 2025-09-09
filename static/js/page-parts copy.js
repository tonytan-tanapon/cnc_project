// /static/js/page-part.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

// ---------- Parts ----------
async function loadParts() {
  const holder = $("p_table");
  try {
    const q = $("p_q")?.value?.trim();
    // ถ้าหลังบ้านรองรับ ?q= ใช้ค้นหาได้เลย
    const rows = await jfetch("/parts" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Parts ไม่สำเร็จ: " + e.message, false);
  }
}

async function createPart() {
  const payload = {
    part_no: (strOrNull($("p_no")?.value) || "").toUpperCase(),
    name: strOrNull($("p_name")?.value),
    description: strOrNull($("p_desc")?.value),
    default_uom: strOrNull($("p_uom")?.value) || "ea",
    status: $("p_status")?.value || "active",
  };

  if (!payload.part_no) {
    toast("กรุณากรอก Part No.", false);
    return;
  }

  try {
    await jfetch("/parts", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Part สำเร็จ");
    ["p_no", "p_name", "p_desc", "p_uom"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    if ($("p_status")) $("p_status").value = "active";
    await loadParts();
  } catch (e) {
    toast("สร้าง Part ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- Part Revisions ----------
async function loadRevisions() {
  const pid = $("r_list_pid")?.value?.trim() || $("r_part_id")?.value?.trim();
  const holder = $("r_table");
  if (!pid) {
    holder.innerHTML = `<div class="hint">ใส่ Part ID ก่อน</div>`;
    return;
  }
  try {
    // สมมติ endpoint = /part-revisions?part_id=xx
    const rows = await jfetch(`/part-revisions?part_id=${encodeURIComponent(pid)}`);
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Revisions ไม่สำเร็จ: " + e.message, false);
  }
}

async function createRevision() {
  const payload = {
    part_id: numOrNull($("r_part_id")?.value),
    rev: (strOrNull($("r_rev")?.value) || "").toUpperCase(),
    drawing_file: strOrNull($("r_dwg")?.value),
    spec: strOrNull($("r_spec")?.value),
    is_current: ($("r_current")?.value || "false") === "true",
  };

  if (!payload.part_id || !payload.rev) {
    toast("ต้องกรอก Part ID และ Rev", false);
    return;
  }

  try {
    await jfetch("/part-revisions", { method: "POST", body: JSON.stringify(payload) });
    toast("เพิ่ม Revision สำเร็จ");
    await loadRevisions();
    ["r_rev", "r_dwg", "r_spec"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    if ($("r_current")) $("r_current").value = "false";
  } catch (e) {
    toast("เพิ่ม Revision ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- init ----------
document.addEventListener("DOMContentLoaded", () => {
  // Parts
  $("p_create")?.addEventListener("click", createPart);
  $("p_reload")?.addEventListener("click", loadParts);
  $("p_q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadParts();
  });

  // Revisions
  $("r_create")?.addEventListener("click", createRevision);
  $("r_reload")?.addEventListener("click", loadRevisions);

  // first load
  loadParts();
});
