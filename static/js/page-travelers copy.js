// /static/js/page-travelers.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// -------- Travelers --------
async function loadTravelers() {
  const holder = $("t_table");
  try {
    const q = $("t_q")?.value?.trim();
    // สมมุติ backend รองรับ filter ?q= (หรือจะปรับเป็น lot_id/status ตามจริง)
    const rows = await jfetch("/travelers" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Travelers ไม่สำเร็จ: " + e.message, false);
  }
}

async function createTraveler() {
  const lot_id = numOrNull($("t_lot")?.value);
  const created_by_id = numOrNull($("t_emp")?.value);
  const notes = strOrNull($("t_notes")?.value);

  if (!lot_id) {
    toast("กรุณาใส่ Lot ID", false);
    return;
  }

  const payload = { lot_id, created_by_id, status: "open", notes };

  try {
    const t = await jfetch("/travelers", { method: "POST", body: JSON.stringify(payload) });
    toast("Traveler created (id: " + t.id + ")");
    // เคลียร์ฟอร์มบางส่วน
    ["t_emp", "t_notes"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
    await loadTravelers();
  } catch (e) {
    toast("สร้าง Traveler ไม่สำเร็จ: " + e.message, false);
  }
}

// -------- Steps --------
async function listSteps() {
  const holder = $("s_table");
  const tid = $("s_list_tid")?.value || $("s_tid")?.value;
  if (!tid) {
    toast("ใส่ Traveler ID ก่อน", false);
    return;
  }
  try {
    const rows = await jfetch(`/traveler-steps?traveler_id=${encodeURIComponent(tid)}`);
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Steps ไม่สำเร็จ: " + e.message, false);
  }
}

async function createStep() {
  const payload = {
    traveler_id: numOrNull($("s_tid")?.value),
    seq: numOrNull($("s_seq")?.value) || 1,
    step_name: strOrNull($("s_name")?.value),
    step_code: strOrNull($("s_code")?.value),
    station: strOrNull($("s_station")?.value),
    operator_id: numOrNull($("s_op")?.value),
    qa_required: ($("s_qa")?.value || "false") === "true",
  };

  if (!payload.traveler_id) {
    toast("ใส่ Traveler ID ก่อน", false);
    return;
  }
  if (!payload.step_name) {
    toast("ใส่ Step Name ก่อน", false);
    return;
  }

  try {
    await jfetch("/traveler-steps", { method: "POST", body: JSON.stringify(payload) });
    toast("Step added");
    await listSteps();
    // ไม่ล้าง traveler_id/seq เพื่อความสะดวกเวลาเพิ่มต่อเนื่อง
    ["s_station","s_name","s_code","s_op"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  } catch (e) {
    toast("เพิ่ม Step ไม่สำเร็จ: " + e.message, false);
  }
}

async function startStep() {
  const id = numOrNull($("s_act")?.value);
  if (!id) {
    toast("ใส่ Step ID ก่อน", false);
    return;
  }
  try {
    await jfetch(`/traveler-steps/${id}/start`, { method: "POST" });
    toast("Step started");
    await listSteps();
  } catch (e) {
    toast("เริ่ม Step ไม่สำเร็จ: " + e.message, false);
  }
}

async function finishStep() {
  const id = numOrNull($("s_act")?.value);
  if (!id) {
    toast("ใส่ Step ID ก่อน", false);
    return;
  }
  const result = ($("s_result")?.value || "").trim(); // passed|failed|skipped
  if (!result) {
    toast("เลือกผลลัพธ์ของ Step ก่อน", false);
    return;
  }

  const qs = new URLSearchParams({ result });
  const qa_result = strOrNull($("s_qa_result")?.value);
  const qa_notes  = strOrNull($("s_qa_notes")?.value);
  if (qa_result) qs.set("qa_result", qa_result);
  if (qa_notes)  qs.set("qa_notes", qa_notes);

  try {
    await jfetch(`/traveler-steps/${id}/finish?${qs.toString()}`, { method: "POST" });
    toast("Step finished");
    await listSteps();
  } catch (e) {
    toast("ปิด Step ไม่สำเร็จ: " + e.message, false);
  }
}

// Bind events
document.addEventListener("DOMContentLoaded", () => {
  // Travelers
  $("t_create")?.addEventListener("click", createTraveler);
  $("t_reload")?.addEventListener("click", loadTravelers);
  $("t_q")?.addEventListener("keydown", (e) => { if (e.key === "Enter") loadTravelers(); });

  // Steps
  $("s_create")?.addEventListener("click", createStep);
  $("s_reload")?.addEventListener("click", listSteps);
  $("s_start")?.addEventListener("click", startStep);
  $("s_finish")?.addEventListener("click", finishStep);

  // Initial loads
  loadTravelers();
});
