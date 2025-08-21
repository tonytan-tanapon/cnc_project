// /static/js/pages/travelers.js
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

// ---------- Travelers ----------
async function loadTravelers() {
  const holder = $("t_table");
  if (!holder) return;

  try {
    // ถ้าอยากกรอง: ใส่เลข = lot_id, ใส่ข้อความ = status (เช่น "open")
    const q = $("t_q")?.value?.trim();
    let path = "/travelers";
    if (q) {
      if (/^\d+$/.test(q)) path += `?lot_id=${encodeURIComponent(q)}`;
      else path += `?status=${encodeURIComponent(q)}`;
    }
    const rows = await jfetch(path);
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Travelers ไม่สำเร็จ: " + e.message, false);
  }
}

async function createTraveler() {
  const payload = {
    lot_id: Number($("t_lot")?.value || 0),
    created_by_id: numOrNull($("t_emp")?.value),
    status: "open",
    notes: strOrNull($("t_notes")?.value),
  };

  if (!payload.lot_id) {
    toast("ระบุ Lot ID ก่อน", false);
    return;
  }

  try {
    const t = await jfetch("/travelers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast(`สร้าง Traveler เรียบร้อย (id: ${t?.id ?? "?"})`);
    ["t_lot", "t_emp", "t_notes"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    await loadTravelers();
  } catch (e) {
    toast("สร้าง Traveler ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- Steps ----------
async function listSteps() {
  const holder = $("s_table");
  if (!holder) return;

  const tid = $("s_list_tid")?.value?.trim() || $("s_tid")?.value?.trim();
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
    traveler_id: Number($("s_tid")?.value || 0),
    seq: Number($("s_seq")?.value || 1),
    step_name: strOrNull($("s_name")?.value) || "",
    step_code: strOrNull($("s_code")?.value),
    station: strOrNull($("s_station")?.value),
    operator_id: numOrNull($("s_op")?.value),
    qa_required: $("s_qa")?.value === "true",
  };

  if (!payload.traveler_id) {
    toast("ใส่ Traveler ID ก่อน", false);
    return;
  }
  if (!payload.step_name) {
    toast("ใส่ชื่อ Step ก่อน", false);
    return;
  }

  try {
    await jfetch("/traveler-steps", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast("เพิ่ม Step สำเร็จ");
    await listSteps();
  } catch (e) {
    toast("เพิ่ม Step ไม่สำเร็จ: " + e.message, false);
  }
}

async function startStep() {
  const id = Number($("s_act")?.value || 0);
  if (!id) {
    toast("ใส่ Step ID", false);
    return;
  }
  try {
    await jfetch(`/traveler-steps/${id}/start`, { method: "POST" });
    toast("เริ่ม Step แล้ว");
    await listSteps();
  } catch (e) {
    toast("เริ่ม Step ไม่สำเร็จ: " + e.message, false);
  }
}

async function finishStep() {
  const id = Number($("s_act")?.value || 0);
  if (!id) {
    toast("ใส่ Step ID", false);
    return;
  }
  const qs = new URLSearchParams({
    result: $("s_result")?.value || "passed",
  });
  const qa_res = strOrNull($("s_qa_result")?.value);
  const qa_notes = strOrNull($("s_qa_notes")?.value);
  if (qa_res) qs.set("qa_result", qa_res);
  if (qa_notes) qs.set("qa_notes", qa_notes);

  try {
    await jfetch(`/traveler-steps/${id}/finish?${qs.toString()}`, { method: "POST" });
    toast("ปิด Step แล้ว");
    await listSteps();
  } catch (e) {
    toast("ปิด Step ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("t_create"), "click", createTraveler);
  on($("t_reload"), "click", loadTravelers);
  on($("t_q"), "keydown", (e) => { if (e.key === "Enter") loadTravelers(); });

  on($("s_create"), "click", createStep);
  on($("s_reload"), "click", listSteps);
  on($("s_start"), "click", startStep);
  on($("s_finish"), "click", finishStep);

  await loadTravelers();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
}
