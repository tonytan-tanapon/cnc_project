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
  const url = `/employees/keyset?limit=10${q ? `&q=${encodeURIComponent(q)}` : ""
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
  btnHdrSave.onclick = async () => {
    await saveLot();        // 🔥 save lot fields
    await saveTraveler();   // existing logic
  };

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

async function saveLot() {
  const lotId = $("lot_id")?.dataset?.id;
  if (!lotId) {
    toast("Missing lot_id", false);
    return;
  }

  try {
    setBusyT(true);

    const payload = {
      lot_po_qty: numOrNull($("lot_po_qty")?.value),
      planned_qty: numOrNull($("lot_planned_qty")?.value), // 🔥 DB field
      lot_po_date: strOrNull($("lot_release_date")?.value),
      lot_po_duedate: strOrNull($("lot_po_duedate")?.value),
    };

    await jfetch(`/lots/${lotId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    toast("Lot updated");

  } catch (e) {
    console.error(e);
    toast(e?.message || "Update lot failed", false);
  } finally {
    setBusyT(false);
  }
}

function markHeaderDirty(on) {
  if (btnHdrSave) btnHdrSave.style.display = on ? "" : "none";
  if (btnHdrCancel) btnHdrCancel.style.display = on ? "" : "none";
}
function wireHeaderDirtyOnly() {
  [
    "lot_id",
    "created_by_id",
    "status",
    "notes",
    "lot_po_qty",
    "lot_planned_qty",
    "lot_release_date",     // 🔥 add
    "lot_po_duedate"        // 🔥 add
  ].forEach((id) => {
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
  console.log("🔥 fillTraveler called", t);

  // ---------- Lot ----------
  const lotLabel = t.lot_no ? String(t.lot_no) : t.lot_id ?? "";
  $("lot_id").value = lotLabel;
  $("lot_id").dataset.id = t.lot_id ?? "";

  // ---------- Creator ----------
  const creatorCode = t.created_by_id
    ? await fetchEmpCodeById(t.created_by_id)
    : "";
  $("created_by_id").value = creatorCode;
  $("created_by_id").dataset.id = t.created_by_id ?? "";

  // ---------- Basic fields ----------
  // $("status").value = t.status ?? "";
  $("notes").value = t.notes ?? "";

  $("t_sub").textContent = `#${t.traveler_no}`;
  document.title = `Traveler · #${t.id}`;

  markHeaderDirty(false);

  selectedLot = null;
  selectedCreator = null;

  // ---------- Load template versions ----------
  await loadTemplateVersions(t.part_id, t.part_revision_id);

  // ---------- Load LOT summary ----------
  if (!t.lot_id) return;

  try {
    const lot = await jfetch(`/lots/${t.lot_id}`);
    console.log("Fetched lot for header:", lot);

    // ✅ SET HEADER INPUT VALUES
    const elPoQty = $("lot_po_qty");
    const elPlanQty = $("lot_planned_qty");
    const elRelease = $("lot_release_date");
    const elDue = $("lot_po_duedate");

    if (elPoQty) elPoQty.value = lot.lot_po_qty ?? "";
    if (elPlanQty) elPlanQty.value = lot.lot_planned_qty ?? "";
    if (elRelease) elRelease.value = lot.lot_po_date?.slice(0, 10) ?? "";
    if (elDue) elDue.value = lot.lot_po_duedate?.slice(0, 10) ?? "";

    const el = $("lot_summary");
    if (!el) return;

    // ✅ Option 1: clean string builder (recommended)
    const summary = [
      `<b>LOT:</b> ${lot.lot_no || "-"}`,
      `<b>Customer:</b> ${lot.customer?.code || "-"}`,
      `<b>PO:</b> ${lot.po?.po_number || "-"}`,
      `<b>Part:</b> ${lot.part?.part_no || "-"}`,
      `<b>Part Name:</b> ${lot.part?.part_name || "-"}`,
      `<b>Rev:</b> ${lot.part_revision?.rev || "-"}`
    ].join(" | ");

    el.innerHTML = summary;

  } catch (err) {
    console.error("❌ Failed to load lot:", err);
  }



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

    lot_po_qty: numOrNull($("lot_po_qty")?.value),
    lot_planned_qty: numOrNull($("lot_planned_qty")?.value),
    lot_po_date: strOrNull($("lot_release_date")?.value),
    lot_po_duedate: strOrNull($("lot_po_duedate")?.value),
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

    step_name: row.step_name ?? "",
    step_code: row.step_code ?? "",
    step_detail: row.step_detail ?? "",
    station: row.station ?? "",

    status: row.status || "pending",

    // ✅ ADD THESE
    operator_id: row.operator_id ?? null,
    operator_nickname: row.operator_nickname ?? "",

    machine_id: row.machine_id ?? null,
    machine_name: row.machine_name ?? "",

    total_receive: row.total_receive ?? 0,
    total_accept: row.total_accept ?? 0,
    total_reject: row.total_reject ?? 0,

    supplier_po: row.supplier_po ?? "",
    supplier_name: row.supplier_name ?? "",
    heat_lot: row.heat_lot ?? "",

    logs: row.logs || [],
  };
}

function setDirtyClass(row, on) {
  const el = row?.getElement?.();
  if (!el) return;
  el.classList.toggle("is-dirty", !!on);
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

      return items.map((e) => ({
        id: e.id,
        label: `${e.emp_code || ""} - ${e.nickname || e.name || ""}`,
      }));
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

      setTimeout(async () => {
        const nickname = it.label.split("-").pop().trim();

        row.update({
          operator_id: it.id,
          operator_nickname: nickname,
        });

        setDirtyClass(row, true);


        // 🔥 wait a bit
        await reloadSteps();

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

let logTable = null;


/* ---------- Build table ---------- */
function initStepsTable() {
  const holder = document.getElementById("steps_table");
  if (!holder) return;

  stepsTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 480px)",
    placeholder: "No steps",
    reactiveData: true,
    index: "id",

    columns: [
      // =====================
      // 💾 SAVE COLUMN
      // =====================
      {
        title: "Save",
        width: 100,
        hozAlign: "center",

        formatter: () => `
    <button class="btn-mini btn-success" data-action="save">💾</button>
  `,

        cellClick: async (e, cell) => {
          const action = e.target.getAttribute("data-action");
          if (action !== "save") return;

          const row = cell.getRow();
          const data = row.getData();

          try {
            await jfetch(`/traveler-steps/${data.id}`, {
              method: "PUT",
              body: JSON.stringify({
                seq: data.seq,
                step_code: data.step_code,
                step_name: data.step_name,
                step_detail: data.step_detail,
                station: data.station,
                operator_id: data.operator_id,
                supplier_po: data.supplier_po,
                supplier_name: data.supplier_name,
                heat_lot: data.heat_lot,
              }),
            });

            setDirtyClass(row, false);
            row.getTable().redraw(true);

            toast("Saved");

          } catch (err) {
            console.error(err);
            toast("Save failed", false);
          }
        }
      },

      { title: "#", field: "seq", width: 70, hozAlign: "center", editor: "number" },

      { title: "OP", field: "step_code", width: 100, editor: "input" },

      { title: "Step Name", field: "step_name", width: 220, editor: "textarea" },
      {
        title: "Step Detail",
        field: "step_detail",
        width: 300,
        editor: "textarea",
      },

      // { title: "Station", field: "station", width: 140 },

      {
        title: "Operator",
        width: 180,
        maxWidth: 200,
        formatter: (cell) => {
          const logs = cell.getRow().getData().logs || [];

          const unique = [...new Set(
            logs.map(l => l.operator_nickname).filter(v => v)
          )];

          const text = unique.join(", ");

          return `<span title="${text}">${text}</span>`;
        }
      },


      // 🔥 TOTALS (READ ONLY)
      {
        title: "Recv",
        field: "total_receive",
        width: 100,
        hozAlign: "right",
        formatter: (c) => Math.round(c.getValue() ?? 0)
      },
      {
        title: "Accept",
        field: "total_accept",
        width: 100,
        hozAlign: "right",
        formatter: (c) => Math.round(c.getValue() ?? 0)
      },
      {
        title: "Reject",
        field: "total_reject",
        width: 100,
        hozAlign: "right",
        formatter: (c) => Math.round(c.getValue() ?? 0)
      },
      {
        title: "Supplier",
        field: "supplier",
        width: 240,

        formatter: function (cell) {
          const data = cell.getRow().getData();

          const lines = [];

          if (data.supplier_po) {
            lines.push(`Supplier PO: ${data.supplier_po}`);
          }

          if (data.supplier_name) {
            lines.push(`Supplier: ${data.supplier_name}`);
          }

          if (data.heat_lot) {
            lines.push(`Heat Lot: ${data.heat_lot}`);
          }

          return lines.join("<br>");
        }
      },


      // 🔥 DELETE STEP

      // =====================
      // 🗑 DELETE COLUMN
      // =====================
      {
        title: "Del",
        width: 80,
        hozAlign: "center",

        formatter: () => `
    <button class="btn-mini btn-danger" data-action="delete">🗑</button>
  `,

        cellClick: async (e, cell) => {
          const action = e.target.getAttribute("data-action");
          if (action !== "delete") return;

          const row = cell.getRow();
          const data = row.getData();

          if (!confirm("Delete this step?")) return;

          try {
            await jfetch(`/traveler-steps/${data.id}`, {
              method: "DELETE",
            });

            row.delete();
            toast("Deleted");

          } catch (err) {
            console.error(err);
            toast("Delete failed", false);
          }
        }
      },



    ],

    formatter: (cell) => {
      const row = cell.getRow();
      const isDirty = row.getElement().classList.contains("is-dirty");

      if (isDirty) {
        return `
      <div style="display:flex; gap:6px; justify-content:center;">
        <button class="btn-mini btn-success" data-action="save">💾</button>
        <button class="btn-mini" data-action="cancel">✖</button>
        <button class="btn-mini btn-danger" data-action="delete">🗑</button>
      </div>
    `;
      }

      return `
    <div style="display:flex; gap:6px; justify-content:center;">
      <button class="btn-mini btn-danger" data-action="delete">🗑</button>
    </div>
  `;
    },



    cellEdited: function (cell) {
      const row = cell.getRow();
      setDirtyClass(row, true);

      // 🔥 refresh ปุ่ม
      row.getTable().redraw(true);
    },

    //   rowFormatter: function (row) {
    //     const data = row.getData();

    //     if (!data.logs || data.logs.length === 0) return;

    //     const holder = document.createElement("div");
    //     holder.style.padding = "10px";
    //     holder.style.background = "#f9fafb";

    //     const table = document.createElement("table");
    //     table.style.width = "100%";
    //     table.style.borderCollapse = "collapse";

    //     table.innerHTML = `
    //   <thead>
    //     <tr style="background:#e5e7eb">
    //       <th>Date</th>
    //       <th>Recv</th>
    //       <th>Accept</th>
    //       <th>Reject</th>
    //     </tr>
    //   </thead>
    //   <tbody>
    //     ${data.logs.map(l => `
    //       <tr>
    //         <td>${l.work_date}</td>
    //         <td>${Math.round(l.qty_receive || 0)}</td>
    //         <td>${Math.round(l.qty_accept || 0)}</td>
    //         <td style="color:${l.qty_reject > 0 ? 'red' : 'black'}">
    //           ${Math.round(l.qty_reject || 0)}
    //         </td>
    //       </tr>
    //     `).join("")}
    //   </tbody>
    // `;

    //     holder.appendChild(table);

    //     row.getElement().appendChild(holder);
    //   },
  });




}

async function loadTemplateVersions(part_id, part_revision_id) {
  const select = document.getElementById("templateSelect");

  console.log("select:", select);
  if (!select) return;

  try {
    const res = await jfetch(
      `/travelers/template-versions?part_id=${part_id}&part_revision_id=${part_revision_id}`
    );

    select.innerHTML = `<option value="">Select Version</option>`;

    res.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} (v${t.version})`;

      if (t.is_active) {
        opt.textContent += " ⭐";
      }

      select.appendChild(opt);
    });

    // ⭐ auto select active
    const active = res.find(t => t.is_active);
    if (active) {
      select.value = String(active.id);
    }

    // 🔥 👉 ใส่ตรงนี้ (ถูกตำแหน่ง)
    select.onchange = async () => {
      const templateId = select.value;

      if (!templateId) return;

      if (!confirm("Apply template? Current steps will be replaced")) {
        select.value = "";
        return;
      }

      try {
        setBusyT(true);

        await jfetch(
          `/travelers/apply-template/${travelerId}?template_id=${templateId}`,
          { method: "POST" }
        );

        toast("Template applied");

        await reloadSteps();

      } catch (err) {
        console.error(err);
        toast("Apply template failed", false);
      } finally {
        setBusyT(false);
      }
    };

  } catch (err) {
    console.error("loadTemplateVersions error:", err);
  }
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
    console.log("Fetched steps:", rows);
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

async function exportTraveler() {
  console.log("Export traveler", travelerId);

  try {
    const res = await fetch(
      `/api/v1/traveler_drawing/export_traveletdoc/${travelerId}`,
      { method: "POST" }
    );

    // ❌ backend error
    if (!res.ok) {
      let msg = "Export failed";
      try {
        const err = await res.json();
        msg = err.detail || msg;
      } catch (_) { }
      alert(msg);
      return;
    }

    // ✅ get filename from header (if provided)
    let filename = `traveler_${travelerId}.docx`;
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    // ✅ download blob
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // cleanup
    a.remove();
    URL.revokeObjectURL(url);

    console.log("Export completed:", filename);
  } catch (err) {
    console.error("Export error", err);
    alert("Unexpected error while exporting traveler");
  }
}

async function exportInspection() {
  // const res = await fetch(
  //   `/api/v1/traveler_drawing/export_inspection/${travelerId}`, {
  //     method: "POST",
  //   }
  // );
  // if (!res.ok) {
  //   const err = await res.json();
  //   alert(err.detail || "File not found");
  //   return;
  // }
  // const blob = await res.blob();
  // const a = document.createElement("a");
  // a.href = URL.createObjectURL(blob);
  // a.download = `export_inspection_${travelerId}.zip`;
  // a.click();
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

// function showTravelerQR() {
//   if (!originalTraveler) {
//     toast("Traveler not loaded", false);
//     return;
//   }

//   const qrModal = document.getElementById("qrModal");
//   const qrBox = document.getElementById("qrCode");
//   qrBox.innerHTML = "";

//   const travelerNo = originalTraveler.traveler_no || `TRAV-${travelerId}`;

//   // ✅ ใช้ IP LAN ชั่วคราว
//   const baseUrl = `${window.location.protocol}//${window.location.host}`;
//   const qrLink = `${baseUrl}/static/ui-traveler.html?traveler_no=${encodeURIComponent(
//     travelerNo
//   )}`;

//   new QRCode(qrBox, {
//     text: qrLink,
//     width: 180,
//     height: 180,
//     correctLevel: QRCode.CorrectLevel.M,
//   });

//   document.getElementById("qrText").textContent = travelerNo;
//   qrModal.style.display = "flex";

//   document.getElementById("qrPrintBtn").onclick = () =>
//     printTravelerQR(travelerNo, qrLink);
//   document.getElementById("qrCloseBtn").onclick = () =>
//     (qrModal.style.display = "none");
// }

// function printTravelerQR(travelerNo, qrLink) {
//   const w = window.open("", "_blank");
//   w.document.write(`
//     <html><head><title>QR - ${travelerNo}</title></head>
//     <body style="text-align:center; font-family:sans-serif;">
//       <h2>Traveler ${travelerNo}</h2>
//       <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
//         qrLink
//       )}" alt="QR">
//       <p style="margin-top:10px;font-size:14px;">${qrLink}</p>
//       <script>window.onload = () => { window.print(); }</script>
//     </body></html>
//   `);
//   w.document.close();
// }
function showTravelerQR() {
  if (!originalTraveler || !originalTraveler.lot_no) {
    toast("Lot not loaded", false);
    return;
  }

  const lotNo = originalTraveler.lot_no;

  const qrModal = document.getElementById("qrModal");
  const qrBox = document.getElementById("qrCode");

  qrBox.innerHTML = "";

  // 🔗 Link you want the QR to open
  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const qrLink = `${encodeURIComponent(lotNo)}`;

  // ✅ Use online QR generator (no backend needed)
  const qrImg = document.createElement("img");
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrLink)}`;
  qrImg.style.width = "180px";
  qrImg.style.height = "180px";

  qrBox.appendChild(qrImg);

  document.getElementById("qrText").textContent = `LOT: ${lotNo}`;
  qrModal.style.display = "flex";

  // Close button
  document.getElementById("qrCloseBtn")?.addEventListener("click", () => {
    qrModal.style.display = "none";
  });
}


async function loadLotDetail() {
  if (!lotId) return;

  try {
    const lot = await jfetch(`/lots/${encodeURIComponent(lotId)}`);

    console.log("lot detail:", lot);

    $("customer_name").value = lot.customer?.name || "";
    $("part_no").value = lot.part?.part_no || "";
    $("rev").value = lot.revision?.rev || "";

  } catch (err) {
    console.error(err);
    toast("Failed to load lot", false);
  }
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
      id: "inspection_link",
      href: `/static/travelerQA-detail.html?lot_id=${encodeURIComponent(lotId)}`,
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


async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!travelerId) {
    toast("Traveler ID missing", false);
    return;
  }

  console.log("import");


  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("traveler_id", travelerId);

    const res = await fetch("/api/v1/traveler-steps/import", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const result = await res.json();

    console.log("Import result:", result);

    toast("File imported");

    // ✅ reload steps from DB
    await reloadSteps();

  } catch (err) {
    console.error(err);
    toast("Import failed: " + err.message, false);
  }

  e.target.value = "";
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
  $("btnExportTraveler").addEventListener("click", exportTraveler);


  const btnUpdate = document.getElementById("btnUpdateTravelerStep");

  btnUpdate?.addEventListener("click", async () => {
    if (!travelerId) {
      toast("Traveler not loaded", false);
      return;
    }

    if (!confirm("Create new template version from this traveler?")) return;

    try {
      setBusyT(true);

      const res = await jfetch(
        `/api/v1/travelers/${travelerId}/create-template-version`,
        { method: "POST" }
      );

      toast(`✅ Template V${res.version} created`);

      // 🔥 IMPORTANT → reload template dropdown
      await loadTemplateVersions(
        originalTraveler.part_id,
        originalTraveler.part_revision_id
      );

    } catch (err) {
      console.error(err);
      toast(err?.message || "Failed to create template", false);
    } finally {
      setBusyT(false);
    }
  });


  // Keyboard: Ctrl+Delete → (optional) delete traveler
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "delete") {
      e.preventDefault();
      // (อาจต่อยอดลบ traveler ได้ ถ้าต้องการ)
    }
  });

  document.getElementById("btnUseTemplate")?.addEventListener("click", async () => {
  const select = document.getElementById("templateSelect");
  const templateId = select?.value;

  console.log("🔥 click use template:", templateId);

  if (!templateId) {
    toast("Please select template", false);
    return;
  }

  if (!confirm("Apply template? Current steps will be replaced")) {
    return;
  }

  try {
    setBusyT(true);

    await jfetch(
      `/travelers/apply-template/${travelerId}?template_id=${templateId}`,
      { method: "POST" }
    );

    toast("Template applied");

    await reloadSteps();

  } catch (err) {
    console.error(err);
    toast("Apply template failed", false);
  } finally {
    setBusyT(false);
  }
});
document.getElementById("btnSTdetail")?.addEventListener("click", () => {
  if (!travelerId) {
    toast("Traveler not loaded", false);
    return;
  }

  const url = `/static/traveler-view.html?traveler_id=${travelerId}`;

  console.log("Go to:", url);

  window.open(url, "_blank");
});
  document.getElementById("btnAddStep")?.addEventListener("click", async () => {
    if (!travelerId) {
      toast("Missing traveler id", false);
      return;
    }

    try {
      const nextSeq = getNextSeq();

      const step = await jfetch("/traveler-steps", {
        method: "POST",
        body: JSON.stringify({
          traveler_id: Number(travelerId),
          seq: nextSeq,
          step_name: "New Step",
          step_code: "",
          station: "",
          operator_id: null,
          status: "pending",
        }),
      });

      toast("Step created");

      await reloadSteps();

    } catch (err) {
      console.error(err);
      toast(err?.message || "Create step failed", false);
    }
  });

  initStepsTable();
  await loadTraveler();
  await reloadSteps();
  makeLotLinks(lotId);

  const btnImportFile = document.getElementById("btnImportFile");
  const fileInput = document.getElementById("fileInput");

  btnImportFile.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", handleImportFile);


});


