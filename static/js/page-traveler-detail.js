// /static/js/page-traveler-detail.js — POS-style header + Tabulator + autocomplete + Status dropdown
import { $, jfetch, toast, initTopbar } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

import { loadPartial } from "./load-partials.js";
import { applyLotLinks } from "./lot-links.js";

const qs = new URLSearchParams(location.search);
let travelerId = qs.get("id"); // ✅ must be let so we can reassign later
const lotId = qs.get("lot_id"); // ✅ add this line

let originalTraveler = null;
let isSubmitting = false;

/* ---- Header autocomplete state ---- */
let selectedLot = null; // { id, label }
let selectedCreator = null; // { id, label }

/* ---------- Helpers ---------- */
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numOrZero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
function setBusyT(b) {
  const el = $("t_hint");
  if (el) el.textContent = b ? "Working…" : "";
}
function setError(msg) {
  const e = $("errorBox");
  if (!e) return;
  e.style.display = msg ? "" : "none";
  e.textContent = msg || "";
}

/* ---------- Data fetchers for header autocomplete ---------- */
async function searchLots(term) {
  const q = (term || "").trim();
  const url = `/lots/keyset?limit=10${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  try {
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((it) => ({
      id: it.id,
      code: it.lot_no || "",
      label: it.lot_no || "",
    }));
  } catch {
    return [];
  }
}

async function searchEmployees(term) {
  const q = (term || "").trim();
  const url = `/employees/keyset?limit=10${
    q ? `&q=${encodeURIComponent(q)}` : ""
  }`;
  try {
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((e) => ({
      id: e.id,
      code: e.emp_code || "",
      label: e.emp_code || "",
    }));
  } catch {
    return [];
  }
}

/* ดึง emp_code จาก id (ใช้ตอนเติมค่าตอนโหลดหน้า) */
async function fetchEmpCodeById(id) {
  if (!id) return "";
  try {
    const e = await jfetch(`/employees/${encodeURIComponent(id)}`);
    return e?.emp_code || String(id);
  } catch {
    return String(id);
  }
}

/* ---------- Header Save/Cancel ---------- */
let btnHdrSave = null,
  btnHdrCancel = null;
function ensureHeaderButtons() {
  const sub = $("t_sub");
  if (!sub) {
    console.warn("⚠️ t_sub not found, cannot insert header buttons");
    return;
  }
  if (document.getElementById("hdr-actions")) return;

  const wrap = document.createElement("div");
  wrap.id = "hdr-actions";
  wrap.className = "hdr-actions";
  wrap.style.marginLeft = "12px"; // ให้มีช่องว่างนิดนึง

  btnHdrSave = document.createElement("button");
  btnHdrSave.className = "btn-mini";
  btnHdrSave.textContent = "💾 Save";
  btnHdrSave.style.display = "none";
  btnHdrSave.onclick = saveTraveler;

  btnHdrCancel = document.createElement("button");
  btnHdrCancel.className = "btn-mini";
  btnHdrCancel.textContent = "✖ Cancel";
  btnHdrCancel.style.display = "none";
  btnHdrCancel.onclick = cancelTraveler;

  const btnGetQR = document.createElement("button");
  btnGetQR.className = "btn-mini";
  btnGetQR.textContent = "🔳 Get QR";
  btnGetQR.onclick = showTravelerQR;

  wrap.append(btnHdrSave, btnHdrCancel, btnGetQR);

  // ✅ ใช้วิธี append หลัง h2 โดยตรงแทน
  const titleRow = sub.parentElement;
  titleRow.appendChild(wrap);

  console.log("✅ Header buttons added");
}

function markHeaderDirty(on) {
  if (btnHdrSave) btnHdrSave.style.display = on ? "" : "none";
  if (btnHdrCancel) btnHdrCancel.style.display = on ? "" : "none";
}
function wireHeaderDirtyOnly() {
  ["lot_id", "created_by_id", "status", "notes"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => markHeaderDirty(true));
    el.addEventListener("change", () => markHeaderDirty(true));
  });
}

/* ---------- Header Autocomplete ---------- */
function initHeaderAutocomplete() {
  const elLot = $("lot_id");
  const elCreator = $("created_by_id");

  // LOT → lot_no only
  if (elLot) {
    attachAutocomplete(elLot, {
      fetchItems: searchLots,
      getDisplayValue: (it) => (it ? it.label : ""),
      renderItem: (it) => `<div class="ac-row">${escapeHtml(it.label)}</div>`,
      openOnFocus: true,
      minChars: 0,
      debounceMs: 200,
      maxHeight: 260,
      onPick: (it) => {
        selectedLot = it;
        elLot.value = it.label; // show lot_no
        elLot.dataset.id = String(it.id); // keep id
        markHeaderDirty(true);
      },
    });
    elLot.addEventListener("input", () => {
      selectedLot = null;
      delete elLot.dataset.id;
      markHeaderDirty(true);
    });
  }

  // CREATED BY → emp_code only
  if (elCreator) {
    attachAutocomplete(elCreator, {
      fetchItems: searchEmployees,
      getDisplayValue: (it) => (it ? it.label : ""),
      renderItem: (it) => `<div class="ac-row">${escapeHtml(it.label)}</div>`,
      openOnFocus: true,
      minChars: 0,
      debounceMs: 200,
      maxHeight: 260,
      onPick: (it) => {
        selectedCreator = it;
        elCreator.value = it.label; // show emp_code
        elCreator.dataset.id = String(it.id); // keep id
        markHeaderDirty(true);
      },
    });
    elCreator.addEventListener("input", () => {
      selectedCreator = null;
      delete elCreator.dataset.id;
      markHeaderDirty(true);
    });
  }
}

/* ---------- Traveler IO ---------- */
async function fillTraveler(t) {
  const lotLabel = t.lot_no ? String(t.lot_no) : t.lot_id ?? "";
  $("lot_id").value = lotLabel;
  $("lot_id").dataset.id = t.lot_id ?? "";

  const creatorCode = t.created_by_id
    ? await fetchEmpCodeById(t.created_by_id)
    : "";
  $("created_by_id").value = creatorCode;
  $("created_by_id").dataset.id = t.created_by_id ?? "";

  $("status").value = t.status ?? "";
  $("notes").value = t.notes ?? "";
  console.log("t", t);
  $("t_sub").textContent = `#${t.traveler_no}`;
  document.title = `Traveler · #${t.id}`;
  markHeaderDirty(false);

  selectedLot = null;
  selectedCreator = null;
}
function readTraveler() {
  const lotInput = $("lot_id");
  const creatorInput = $("created_by_id");
  const lot_id =
    selectedLot?.id ??
    (lotInput?.dataset?.id ? Number(lotInput.dataset.id) : null);
  const created_by_id =
    selectedCreator?.id ??
    (creatorInput?.dataset?.id ? Number(creatorInput.dataset.id) : null);
  return {
    lot_id,
    created_by_id,
    status: strOrNull($("status")?.value),
    notes: strOrNull($("notes")?.value),
  };
}
async function loadTraveler() {
  if (!travelerId && !lotId) {
    setError("Missing ?id= or ?lot_id= in URL");
    return;
  }

  try {
    setBusyT(true);
    let t = null;

    if (travelerId) {
      // Normal case
      t = await jfetch(`/travelers/${encodeURIComponent(travelerId)}`);
    } else if (lotId) {
      // Find by lot_id
      const list = await jfetch(
        `/travelers?lot_id=${encodeURIComponent(lotId)}`
      );
      if (Array.isArray(list) && list.length > 0) {
        t = list[0];
      } else {
        setError("No traveler found for this lot");
        return;
      }
    }

    travelerId = t.id; // ✅ assign travelerId from response
    originalTraveler = t;
    await fillTraveler(t);
  } catch (e) {
    setError(e?.message || "Load failed");
  } finally {
    setBusyT(false);
  }
}

async function saveTraveler() {
  if (!travelerId || isSubmitting) return;
  try {
    isSubmitting = true;
    setBusyT(true);
    const t = await jfetch(`/travelers/${encodeURIComponent(travelerId)}`, {
      method: "PUT",
      body: JSON.stringify(readTraveler()),
    });
    originalTraveler = t;
    await fillTraveler(t);
    toast("Traveler saved");
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    isSubmitting = false;
    setBusyT(false);
  }
}
function cancelTraveler() {
  if (originalTraveler) fillTraveler(originalTraveler);
}

/* ---------- Status badge & options ---------- */
function statusBadge(s) {
  const st = String(s || "pending").toLowerCase();
  const cls =
    st === "running" || st === "in_progress"
      ? "blue"
      : st === "passed"
      ? "green"
      : st === "failed"
      ? "red"
      : "gray";
  const label =
    {
      running: "Running",
      in_progress: "In Progress",
      passed: "Passed",
      failed: "Failed",
      skipped: "Skipped",
      pending: "Pending",
    }[st] || st[0]?.toUpperCase() + st.slice(1);
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}
const STATUS_OPTIONS = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
};

/* ---------- Tabulator: Steps ---------- */
let stepsTable = null;
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;

function normalizeStep(row) {
  return {
    id: row.id,
    seq: row.seq ?? 1,
    station: row.station ?? "",
    step_name: row.step_name ?? "",
    step_code: row.step_code ?? "",
    operator_id: row.operator_id ?? null,
    status: row.status ?? "pending",
    qty_receive: row.qty_receive ?? 0,
    qty_accept: row.qty_accept ?? 0,
    qty_reject: row.qty_reject ?? 0,
    qa_required: !!row.qa_required,
    step_note: row.step_note ?? "", // 👈 เพิ่ม
  };
}
function setDirtyClass(row, on) {
  const el = row?.getElement?.();
  if (!el) return;
  el.classList.toggle("is-dirty", !!on);
}

function buildStepPayload(d) {
  const p = { traveler_id: Number(travelerId) };
  if (d.seq != null) p.seq = Number(d.seq);
  if (d.station != null) p.station = strOrNull(d.station);
  if (d.step_name != null) p.step_name = strOrNull(d.step_name);
  if (d.step_code != null) p.step_code = strOrNull(d.step_code);
  if (d.operator_id != null) p.operator_id = numOrNull(d.operator_id);
  if (d.qa_required != null) p.qa_required = !!d.qa_required;
  if (d.qty_receive != null) p.qty_receive = Number(d.qty_receive) || 0;
  if (d.qty_accept != null) p.qty_accept = Number(d.qty_accept) || 0;
  if (d.qty_reject != null) p.qty_reject = Number(d.qty_reject) || 0;
  if (d.step_note != null) p.step_note = String(d.step_note); // 👈 เพิ่ม
  return p;
}

function autosaveStepRow(row, { immediate = false } = {}) {
  const d = row.getData();
  if (!travelerId) {
    toast("Missing traveler id", false);
    return;
  }

  // CREATE
  if (!d.id) {
    if (createInFlight.has(row)) return;
    if (!strOrNull(d.step_name)) return; // require step_name
    const qrecv = Number(d.qty_receive || 0),
      qacc = Number(d.qty_accept || 0),
      qrej = Number(d.qty_reject || 0);
    if (qacc + qrej > qrecv) {
      toast("qty_accept + qty_reject ต้องไม่เกิน qty_receive", false);
      return;
    }
    createInFlight.add(row);
    jfetch(`/traveler-steps`, {
      method: "POST",
      body: JSON.stringify(buildStepPayload(d)),
    })
      .then((created) => {
        row.update(normalizeStep(created));
        setDirtyClass(row, false);
        toast("Step added");
      })
      .catch((e) => toast(e?.message || "Create failed", false))
      .finally(() => {
        createInFlight.delete(row);
        setTimeout(() => {
          try {
            stepsTable.redraw(true);
          } catch {}
        }, 0);
      });
    return;
  }

  // PATCH (debounce) — ยกเว้น field 'status' ที่มี handler แยก
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const apply = () => {
    patchTimers.delete(row);
    const dd = row.getData();
    const qrecv = Number(dd.qty_receive || 0),
      qacc = Number(dd.qty_accept || 0),
      qrej = Number(dd.qty_reject || 0);
    if (qacc + qrej > qrecv) {
      toast("qty_accept + qty_reject ต้องไม่เกิน qty_receive", false);
      return;
    }
    jfetch(`/traveler-steps/${dd.id}`, {
      method: "PUT",
      body: JSON.stringify(buildStepPayload(dd)),
    })
      .then((upd) => {
        row.update(normalizeStep(upd || dd));
        setDirtyClass(row, false);
        toast("Saved");
      })
      .catch(async (e) => {
        try {
          const fresh = await jfetch(
            `/traveler-steps?traveler_id=${encodeURIComponent(travelerId)}`
          );
          const found = (fresh || []).find(
            (x) => Number(x.id) === Number(dd.id)
          );
          if (found) row.update(normalizeStep(found));
        } catch {}
        toast(e?.message || "Save failed", false);
      })
      .finally(() =>
        setTimeout(() => {
          try {
            stepsTable.redraw(true);
          } catch {}
        }, 0)
      );
  };
  if (immediate) apply();
  else patchTimers.set(row, setTimeout(apply, PATCH_DEBOUNCE_MS));
}

/* ---------- Status change handlers ---------- */
// ใช้ค่าตัวเลขในแถว ไม่ถาม prompt
async function finishStepFromRow(id, result) {
  const row = stepsTable?.getRow(id)?.getData() || {};
  const qs = new URLSearchParams({ result });

  const recv = Number(row.qty_receive ?? 0);
  const acc = Number(row.qty_accept ?? 0);
  const rej = Number(row.qty_reject ?? 0);

  if (recv && acc + rej > recv) {
    toast("qty_accept + qty_reject ต้องไม่เกิน qty_receive", false);
    throw new Error("qty invalid");
  }

  if (recv) {
    qs.set("qty_receive", String(recv));
    qs.set("qty_accept", String(acc));
    qs.set("qty_reject", String(rej));
  }

  await jfetch(`/traveler-steps/${id}/finish?${qs.toString()}`, {
    method: "POST",
  });
}

async function handleStatusChange(row, newStatus, oldStatus) {
  const d = row.getData();
  if (!d.id) {
    toast("Save this row first", false);
    row.update({ status: oldStatus });
    return;
  }
  try {
    if (newStatus === "pending") {
      await jfetch(`/traveler-steps/${d.id}/restart`, { method: "POST" });
      toast("Step reset");
    } else if (newStatus === "running" || newStatus === "in_progress") {
      await jfetch(`/traveler-steps/${d.id}/start`, { method: "POST" });
      toast("Step started");
    } else if (["passed", "failed", "skipped"].includes(newStatus)) {
      await finishStepFromRow(d.id, newStatus);
      toast(`Step ${newStatus}`);
    } else {
      throw new Error("Unknown status");
    }
    await reloadSteps();
  } catch (e) {
    row.update({ status: oldStatus }); // revert
    toast(e?.message || "Update status failed", false);
  }
}

/* ---------- Autocomplete Editors for table ---------- */
function stationAutocompleteEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";
  async function fetchStations(term) {
    const q = (term || "").trim();
    try {
      const url = q
        ? `/stations?q=${encodeURIComponent(q)}&page=1&page_size=10`
        : `/stations?page=1&page_size=10`;
      const res = await jfetch(url);
      const items = Array.isArray(res) ? res : res.items || [];
      return items
        .map((s) => ({
          code: s.code ?? s.name ?? s.station ?? "",
          name: s.name ?? "",
        }))
        .filter((x) => x.code);
    } catch {
      return [];
    }
  }
  attachAutocomplete(input, {
    fetchItems: fetchStations,
    getDisplayValue: (it) => (it ? it.code || it.name || "" : ""),
    renderItem: (it) =>
      `<div><b>${escapeHtml(it.code || "")}</b> ${escapeHtml(
        it.name || ""
      )}</div>`,
    onPick: (it) => {
      success(it.code || it.name || "");
      const row = cell.getRow();
      setTimeout(() => {
        row.update({ station: it.code || it.name || "" });
        setDirtyClass(row, true);
        autosaveStepRow(row);
      }, 0);
    },
    minChars: 0,
    openOnFocus: true,
  });
  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}

function operatorAutocompleteEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";
  async function fetchEmployees(term) {
    const q = (term || "").trim();
    try {
      const url = q
        ? `/employees?q=${encodeURIComponent(q)}&page=1&page_size=10`
        : `/employees?page=1&page_size=10`;
      const res = await jfetch(url);
      const items = Array.isArray(res) ? res : res.items || [];
      return items.map((e) => ({ id: e.id, label: `${e.emp_code || e.id}` }));
    } catch {
      return [];
    }
  }
  attachAutocomplete(input, {
    fetchItems: fetchEmployees,
    getDisplayValue: (it) => (it ? it.label : ""),
    renderItem: (it) => `<div>${escapeHtml(it.label)}</div>`,
    onPick: (it) => {
      success(String(it.id));
      const row = cell.getRow();
      setTimeout(() => {
        row.update({ operator_id: it.id });
        setDirtyClass(row, true);
        autosaveStepRow(row);
      }, 0);
    },
    minChars: 0,
    openOnFocus: true,
  });
  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}

/* ---------- Build table ---------- */
function initStepsTable() {
  const holder = document.getElementById("steps_table");
  if (!holder) return;
  let ready = false;
  const safeRedraw = () => {
    if (!ready || !holder.offsetWidth) return;
    try {
      stepsTable.redraw(true);
    } catch {}
  };

  stepsTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 480px)", // 👈 เพิ่มระยะเพื่อให้มีที่สำหรับปุ่มด้านล่าง
    placeholder: "No steps",
    reactiveData: true,
    index: "id",
    columns: [
      {
        title: "APP",
        width: 80,
        hozAlign: "center",
        headerSort: false,

        formatter: (cell) => {
          const row = cell.getRow().getData();
          const seq = row.seq;

          const travelerNo = originalTraveler?.traveler_no || travelerId;
          if (!travelerNo || seq == null) return "";

          const baseUrl = `${location.protocol}//${location.host}`;
          const url =
            `${baseUrl}/static/ui-traveler.html` +
            `?traveler_no=${encodeURIComponent(travelerNo)}` +
            `&seq=${encodeURIComponent(seq)}`;

          return `
                <a href="${url}" target="_blank" rel="noopener"
                  style="text-decoration:none;font-weight:600;">
                  ${seq}
                </a>
              `;
        },
      },

      {
        title: "#OP",
        field: "seq",
        width: 80,
        hozAlign: "center",
        editor: "number",
        editorParams: { step: 1 },
      },

      { title: "Step Name", field: "step_name", width: 220, editor: "input" },
      {
        title: "Status",
        field: "status",
        width: 100,
        headerSort: false,
        editor: "select",
        editorParams: { values: STATUS_OPTIONS },
        formatter: (cell) => statusBadge(cell.getValue()),
      },
      {
        title: "Qty Recv",
        field: "qty_receive",
        width: 110,
        hozAlign: "right",
        editor: "number",
        editorParams: { step: 1, min: 0, precision: 0 },
        formatter: (cell) => {
          const v = cell.getValue();
          const n = parseInt(v, 10);
          return Number.isFinite(n) && n >= 0 ? n : 0; // 👈 บังคับ return integer
        },
      },
      {
        title: "Qty Accept",
        field: "qty_accept",
        width: 110,
        hozAlign: "right",
        editor: "number",
        editorParams: { step: 1, min: 0, precision: 0 },
        formatter: (cell) => {
          const v = cell.getValue();
          const n = parseInt(v, 10);
          return Number.isFinite(n) && n >= 0 ? n : 0; // 👈 integer only
        },
      },
      {
        title: "Qty Reject",
        field: "qty_reject",
        width: 110,
        hozAlign: "right",
        editor: "number",
        editorParams: { step: 1, min: 0, precision: 0 },
        formatter: (cell) => {
          const v = cell.getValue();
          const n = parseInt(v, 10);
          return Number.isFinite(n) && n >= 0 ? n : 0; // 👈 integer only
        },
      },
      { title: "Note", field: "step_note", width: 240, editor: "input" },
      { title: "Code", field: "step_code", width: 120, editor: "input" },
      {
        title: "Operator",
        field: "operator_id",
        width: 140,
        hozAlign: "right",
        editor: operatorAutocompleteEditor,
        formatter: (c) => (c.getValue() == null ? "" : String(c.getValue())),
      },
      {
        title: "Station",
        field: "station",
        width: 170,
        editor: stationAutocompleteEditor,
      },

      {
        title: "Manage",
        field: "_manage",
        width: 120,
        headerSort: false,
        formatter: () =>
          `<button class="btn-mini btn-danger" data-act="delete">Delete</button>`,
        cellClick: async (e, cell) => {
          const btn = e.target.closest("button[data-act='delete']");
          if (!btn) return;
          const row = cell.getRow();
          const d = row.getData();
          if (!d.id) {
            row.delete();
            return;
          }
          if (!confirm("ลบ Step นี้?")) return;
          try {
            await jfetch(`/traveler-steps/${d.id}`, { method: "DELETE" });
            row.delete();
            toast("Step deleted");
          } catch (err) {
            toast("ลบ Step ไม่สำเร็จ: " + (err?.message || ""), false);
          }
        },
      },
    ],
  });

  const btnAddStep = document.getElementById("btnAddStep");

  btnAddStep.addEventListener("click", async () => {
    if (!stepsTable) return;

    // หาค่า seq ล่าสุด
    const data = stepsTable.getData();
    const lastSeq = data.length
      ? Math.max(...data.map((r) => Number(r.seq || 0)))
      : 0;
    const nextSeq = lastSeq + 10;

    // สร้างแถวใหม่ (ใช้ field name ให้ตรงกับ columns ด้านบน)
    const newRow = {
      seq: nextSeq,
      step_name: "",
      status: "Pending",
      qty_receive: 0,
      qty_accept: 0,
      qty_reject: 0,
      step_note: "",
      step_code: "",
      operator_id: "",
      station: "",
    };

    // ✅ เพิ่มแถวใหม่ในตาราง (ต่อจากแถวสุดท้าย)
    const row = await stepsTable.addRow(newRow, false, "bottom");

    // เริ่มแก้ไขชื่อทันที
    row.getCell("step_name").edit();

    // เพิ่มคลาสเน้นสีพื้นหลัง (optional)
    row.getElement().classList.add("is-dirty");
  });

  const btnAddTemplate = document.getElementById("btnAddTemplate");

  btnAddTemplate.addEventListener("click", async () => {
    // const qs = new URLSearchParams(location.search);
    // const travelerId = qs.get("id");

    if (!travelerId) {
      alert("Traveler ID not found");
      return;
    }
    console.log("Applying template to traveler ID:", travelerId);
    const templateId = 1;
    try {
      const res = await fetch(
        `/api/v1/travelers/apply-template/${encodeURIComponent(
          travelerId
        )}?template_id=${encodeURIComponent(templateId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      // alert("Template applied successfully");
      location.reload();
    } catch (err) {
      console.error(err);
      // alert("Failed to apply template");
    }
  });

  stepsTable.on("cellEdited", (cell) => {
    const row = cell.getRow();
    setDirtyClass(row, true);

    const field = cell.getField();
    const newVal = cell.getValue();
    const oldVal = cell.getOldValue();

    if (field === "status") {
      handleStatusChange(
        row,
        String(newVal || "").toLowerCase(),
        String(oldVal || "").toLowerCase()
      );
      return;
    }

    setTimeout(() => autosaveStepRow(row), 0);
  });

  stepsTable.on("tableBuilt", () => {
    ready = true;
    requestAnimationFrame(safeRedraw);
    setTimeout(safeRedraw, 0);
  });

  const ro = new ResizeObserver(safeRedraw);
  ro.observe(holder);
  window.addEventListener("resize", safeRedraw);
}

async function reloadSteps() {
  if (!travelerId) {
    stepsTable?.setData([]);
    return;
  }
  try {
    const rows = await jfetch(
      `/traveler-steps?traveler_id=${encodeURIComponent(travelerId)}`
    );
    stepsTable?.setData((rows || []).map(normalizeStep));
  } catch {
    stepsTable?.setData([]);
  }
}

/* === Next seq helper (start 10, step 10) === */
function getNextSeq() {
  const data = stepsTable?.getData?.() || [];
  if (!data.length) return 10;
  const max = Math.max(...data.map((r) => Number(r.seq || 0)));
  const base = Math.max(0, isFinite(max) ? max : 0);
  const next = Math.ceil(base / 10) * 10 + 10;
  return Math.max(10, next);
}
function makeBlankStep(seq) {
  return {
    seq: seq ?? 10,
    station: "",
    step_name: "",
    step_code: "",
    operator_id: null,
    status: "pending",
    qty_receive: 0,
    qty_accept: 0,
    qty_reject: 0,
    qa_required: false,
  };
}

async function downloadDrawingBatch() {
  try {
    const res = await fetch(`/api/v1/traveler_drawing/drawing/${travelerId}`, {
      method: "POST",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("Download error:", res.status, txt);
      toast("Download failed");
      return;
    }
    console.log(res);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `drawing_${travelerId}.bat`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("Download exception:", err);
    toast("Download failed (exception)");
  }
}

async function downloadTravelerBatch() {
  try {
    const res = await fetch(
      `/api/v1/traveler_drawing/traveletdoc/${travelerId}`,
      {
        method: "POST",
      }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("Download error:", res.status, txt);
      toast("Download failed");
      return;
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `traveler_${travelerId}.bat`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("Download exception:", err);
    toast("Download failed (exception)");
  }
}

async function downloadInspectionBatch() {
  try {
    const res = await fetch(
      `/api/v1/traveler_drawing/inspection/${travelerId}`,
      {
        method: "POST",
      }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("Download error:", res.status, txt);
      toast("Download failed");
      return;
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inspection_${travelerId}.bat`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("Download exception:", err);
    toast("Download failed (exception)");
  }
}

// async function downloadInspection() {
//   const res = await fetch(`/traveler_drawing/inspection/${travelerId}`, {
//     method: "POST",
//   });

//   if (!res.ok) {
//     const err = await res.json();
//     alert(err.detail || "File not found");
//     return;
//   }

//   const blob = await res.blob();
//   const a = document.createElement("a");
//   a.href = URL.createObjectURL(blob);
//   a.download = `inspection_${travelerId}.bat`;
//   a.click();
// }

/* ---------- QR Code Popup ---------- */

function showTravelerQR() {
  if (!originalTraveler) {
    toast("Traveler not loaded", false);
    return;
  }

  const qrModal = document.getElementById("qrModal");
  const qrBox = document.getElementById("qrCode");
  qrBox.innerHTML = "";

  const travelerNo = originalTraveler.traveler_no || `TRAV-${travelerId}`;
  // ✅ ใช้ IP LAN ชั่วคราว
  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const qrLink = `${baseUrl}/static/ui-traveler.html?traveler_no=${encodeURIComponent(
    travelerNo
  )}`;

  new QRCode(qrBox, {
    text: qrLink,
    width: 180,
    height: 180,
    correctLevel: QRCode.CorrectLevel.M,
  });

  document.getElementById("qrText").textContent = travelerNo;
  qrModal.style.display = "flex";

  document.getElementById("qrPrintBtn").onclick = () =>
    printTravelerQR(travelerNo, qrLink);
  document.getElementById("qrCloseBtn").onclick = () =>
    (qrModal.style.display = "none");
}

function printTravelerQR(travelerNo, qrLink) {
  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>QR - ${travelerNo}</title></head>
    <body style="text-align:center; font-family:sans-serif;">
      <h2>Traveler ${travelerNo}</h2>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        qrLink
      )}" alt="QR">
      <p style="margin-top:10px;font-size:14px;">${qrLink}</p>
      <script>window.onload = () => { window.print(); }</script>
    </body></html>
  `);
  w.document.close();
}

function makeLotLinks(lotId) {
  if (!lotId) return;

  const links = [
    {
      id: "lot_link",
      href: `/static/lot-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "traveler_link",
      href: `/static/traveler-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "material_link",
      href: `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
        lotId
      )}`,
      title: "Materials",
    },
    {
      id: "shippment_link",
      href: `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
        lotId
      )}`,
      title: "Shipment",
    },
  ];

  links.forEach(({ id, href, title }) => {
    const el = document.getElementById(id);
    if (!el) return;

    const a = document.createElement("a");
    a.href = href;
    a.title = title;
    // a.target = "_blank";
    a.style.textDecoration = "none";
    a.style.color = "inherit";
    a.style.cursor = "pointer";

    // move existing content (icon + text) inside <a>
    while (el.firstChild) {
      a.appendChild(el.firstChild);
    }

    el.replaceWith(a);
  });
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  initTopbar();
  ensureHeaderButtons();
  wireHeaderDirtyOnly();
  initHeaderAutocomplete();
  // ---> Add Drawing diagram batch download
  $("btnDrawing").addEventListener("click", downloadDrawingBatch);
  $("btnTraveler").addEventListener("click", downloadTravelerBatch);
  $("btnInspection").addEventListener("click", downloadInspectionBatch);
  // Add Step (seq +10 เริ่ม 10)
  // $("btnAddStep")?.addEventListener("click", async () => {
  //   if (!travelerId) {
  //     toast("Missing traveler id", false);
  //     return;
  //   }
  //   const nextSeq = getNextSeq();
  //   const row = await stepsTable.addRow(
  //     makeBlankStep(nextSeq),
  //     false,
  //     "bottom"
  //   );
  //   row.getCell("step_name")?.edit();
  //   setDirtyClass(row, true);
  // });

  // Keyboard: Ctrl+Delete → (optional) delete traveler
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "delete") {
      e.preventDefault();
      // (อาจต่อยอดลบ traveler ได้ ถ้าต้องการ)
    }
  });

  initStepsTable();
  await loadTraveler();
  await reloadSteps();
  makeLotLinks(lotId);
});
