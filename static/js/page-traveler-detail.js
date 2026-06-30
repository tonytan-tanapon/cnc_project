// /static/js/page-traveler-detail.js — POS-style header + Tabulator + autocomplete + Status dropdown
import { $, jfetch, toast, initTopbar } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

import { loadPartial } from "./load-partials.js";
import { applyLotLinks } from "./lot-links.js";

const qs = new URLSearchParams(location.search);
let travelerId = qs.get("id"); // ✅ must be let so we can reassign later
const lotId = qs.get("lot_id"); // ✅ add this line

let originalTraveler = null;
let originalLot = null;
let isSubmitting = false;


let employees = [];
let machines = [];

function checkDueDate() {

  const releaseEl = $("created_at");
  const dueEl = $("lot_due_date");

  if (!releaseEl || !dueEl) return;

  const releaseDate = new Date(releaseEl.value);
  const dueDate = new Date(dueEl.value);

  console.log("release =", releaseEl.value);
  console.log("due =", dueEl.value);
  console.log("compare =", dueDate < releaseDate);

  dueEl.style.backgroundColor = "";
  dueEl.style.color = "";

  if (
    !isNaN(releaseDate) &&
    !isNaN(dueDate) &&
    dueDate < releaseDate
  ) {
    dueEl.style.setProperty(
      "background-color",
      "#ef4444",
      "important"
    );

    dueEl.style.setProperty(
      "color",
      "white",
      "important"
    );
  }
}

// ผูก event
$("created_at")?.addEventListener(
  "change",
  checkDueDate
);

$("lot_due_date")?.addEventListener(
  "change",
  checkDueDate
);

async function loadMasterData() {
  try {
    employees = await jfetch(
      "/api/v1/employees"
    );

    machines = await jfetch(
      "/api/v1/machines"
    );

    console.log("EMPLOYEES", employees);
    console.log("MACHINES", machines);

  } catch (err) {
    console.error(err);
    toast(
      "Failed to load master data",
      false
    );
  }
}

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
    await savePartRevisionMaterial();
    await saveLot();        // 🔥 save lot fields
    // await saveTraveler();   // existing logic

    markHeaderDirty(false);
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

async function savePartRevisionMaterial() {

  const revId = originalTraveler?.part_revision_id;

  if (!revId) return;
  await jfetch(
    `/parts/part-revision/${revId}/material`,
    {
      method: "PUT",

      body: JSON.stringify({
        material: strOrNull(
          $("material")?.value
        ),
      }),
    }
  );

}

async function saveLot() {

  const currentLotId = lotId;

  if (!currentLotId) {

    toast("Missing lot_id", false);

    return;
  }

  try {

    setBusyT(true);
    // 1111
    const payload = {

      lot_no: strOrNull(
        $("lot_no")?.value
      ),

      note: strOrNull(
        $("notes")?.value
      ),

      risk: strOrNull(
        $("risk")?.value
      ),


      planned_qty: numOrNull(
        $("lot_planned_qty")?.value
      ),

      status: strOrNull(
        $("status")?.value
      ),
      lot_shipped_qty: numOrNull($("lot_shipped_qty")?.value),

      started_at: strOrNull(
        $("started_at")?.value
      ),

      lot_po_duedate: strOrNull($("lot_po_duedate")?.value),

      created_at: strOrNull($("created_at")?.value),
      lot_due_date: strOrNull($("lot_due_date")?.value),

      risk: strOrNull(
        $("risk")?.value
      ),
    };

    await jfetch(
      `/lots/${currentLotId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );

    await loadLotDetail();
    markHeaderDirty(false);
    toast("Lot updated");

  } catch (e) {

    console.error(e);
    toast(
      e?.message || "Update lot failed",
      false
    );

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
    "lot_no",
    "status",
    "notes",
    "status",
    "risk",
    "lot_planned_qty",
    "lot_shipped_qty",
    "material",
    "started_at",             // 🔥 add
    "lot_po_duedate",         // 🔥 add
    "lot_due_date",
    "created_at"

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


}

/* ---------- Traveler IO ---------- */



async function fillTraveler(t) {

  console.log("🔥 fillTraveler called", t);

  // =====================
  // HEADER
  // =====================

  const sub = $("t_sub");

  if (sub) {

    let badge = "";

    if (t.latest_template) {

      badge = `<span style="
            margin-left:10px;
            padding:4px 10px;
            border-radius:999px;
            background:#16a34a;
            color:white;
            font-size:12px;
            font-weight:600;
          "
        >
          LATEST · ${t.latest_template_name || ""}
          (V${t.latest_template_version || ""})
        </span>
      `;
    }


    sub.innerHTML = `
      #${t.traveler_no || ""}
      ${badge}
    `;
  }
  if (originalLot?.all?.from_lot) {

    $("start_qty").value = 0;
    $("final_qty").value = 0;

  } else {

    $("start_qty").value = t.start_qty || 0;
    $("final_qty").value = t.final_qty || 0;
  }

  $("stock_qty").value =
    t.stock_qty || 0;

  // =====================
  // BASIC
  // =====================


  $("material").value =
    t.lot?.part_revision?.material || "";

  $("fileInputDir").value =
    t.file_dir || "";



  // =====================
  // CREATOR
  // =====================

  const creatorCode =
    t.created_by_id
      ? await fetchEmpCodeById(
        t.created_by_id
      )
      : "";

  const createdByEl =
    $("created_by_id");

  if (createdByEl) {

    createdByEl.value =
      creatorCode;

    createdByEl.dataset.id =
      t.created_by_id ?? "";
  }

  markHeaderDirty(false);
}

function readTraveler() {
  const lotInput = $("lot_id");
  const creatorInput = $("created_by_id");
  const lot_id = selectedLot?.id ?? (lotInput?.dataset?.id ? Number(lotInput.dataset.id) : null);
  const created_by_id = selectedCreator?.id ?? (creatorInput?.dataset?.id ? Number(creatorInput.dataset.id) : null);

  // not related to Save Lot. It use only lot
  return {
    lot_id,
    created_by_id,



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
    console.log("Loading traveler with travelerId:", travelerId, "or lotId:", lotId);
    if (travelerId) {
      // Normal case
      t = await jfetch(`/travelers/${encodeURIComponent(travelerId)}`);
      console.log("Fetched traveler by ID:", t);
    } else if (lotId) {
      // Find by lot_id
      const list = await jfetch(`/travelers?lot_id=${encodeURIComponent(lotId)}`);
      if (Array.isArray(list) && list.length > 0) {
        t = list[0];
      } else {
        setError("No traveler found for this lot");
        return;
      }
    }

    travelerId = t.id; // ✅ assign travelerId from response
    originalTraveler = t;
    console.log("Original traveler data:", originalTraveler);
    await fillTraveler(t);

  } catch (e) {
    setError(e?.message || "Load failed");
  } finally {
    setBusyT(false);
  }
}

// async function saveTraveler() {
//   if (!travelerId || isSubmitting) return;
//   try {
//     isSubmitting = true;
//     setBusyT(true);
//     const t = await jfetch(`/travelers/${encodeURIComponent(travelerId)}`, {
//       method: "PUT",
//       body: JSON.stringify(readTraveler()),
//     });
//     originalTraveler = t;
//     await fillTraveler(t);
//     toast("Traveler saved");
//   } catch (e) {
//     toast(e?.message || "Save failed", false);
//   } finally {
//     isSubmitting = false;
//     setBusyT(false);
//   }
// }

async function saveTraveler() {

  if (!travelerId || isSubmitting) return;

  try {

    isSubmitting = true;

    setBusyT(true);

    const payload = readTraveler();

    console.log("SAVE TRAVELER", payload);

    const t = await jfetch(
      `/travelers/${travelerId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );

    originalTraveler = t;

    await fillTraveler(t);

    toast("Traveler saved");

  } catch (e) {

    console.error("SAVE ERROR =", e);

    alert(JSON.stringify(e, null, 2));

    toast(
      e?.message || "Save failed",
      false
    );

  } finally {

    isSubmitting = false;

    setBusyT(false);
  }
}

async function cancelTraveler() {

  if (originalTraveler) {
    await fillTraveler(originalTraveler);
  }

  await loadLotDetail();

  markHeaderDirty(false);
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

  const logs = row.logs || [];

  // 🔥 latest log
  const latestLog =
    logs.length > 0
      ? logs[logs.length - 1]
      : {};

  return {

    id: row.id,

    seq: row.seq ?? 1,

    step_name:
      row.step_name ?? "",

    step_code:
      row.step_code ?? "",

    step_detail:
      row.step_detail ?? "",

    station:
      row.station ?? "",

    status:
      row.status || "pending",

    operator_id:
      row.operator_id ?? null,

    operator_nickname:
      row.operator_nickname ?? "",

    machine_id:
      row.machine_id ?? null,

    machine_name:
      row.machine_name ?? "",

    total_receive:
      row.total_receive ?? 0,

    total_accept:
      row.total_accept ?? 0,

    total_reject:
      row.total_reject ?? 0,

    // 🔥 NOW FROM LOG
    supplier_po:
      latestLog.supplier_po ?? "",

    supplier_name:
      latestLog.supplier_name ?? "",

    heat_lot:
      latestLog.supplier_lot ?? "",

    material_type:
      latestLog.material_type ?? "",

    material_size:
      latestLog.material_size ?? "",

    material_length:
      latestLog.material_length ?? "",

    material_qty:
      latestLog.material_qty ?? "",

    material_uom:
      latestLog.material_uom ?? "",

    supplier_send_date:
      latestLog.supplier_send_date ?? "",

    supplier_receive_date:
      latestLog.supplier_receive_date ?? "",

    logs
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


async function saveAllSteps() {

  const rows = Array.from(dirtyRows.values());

  if (!rows.length) {
    toast("No changes");
    return;
  }

  try {
    console.log(
      "Saving rows:",
      Array.from(dirtyRows.values())
    );

    for (const row of rows) {

      const payload = {

        seq: row.seq,

        step_code: row.step_code,

        step_name: row.step_name,

        step_detail: row.step_detail,

        station: row.station,

        status: row.status,

        operator_id: row.operator_id,

        machine_id: row.machine_id

      };

      console.log(
        "SAVE STEP",
        payload
      );

      await jfetch(
        `/api/v1/traveler-steps/${row.id}`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(payload)
        }
      );
    }

    toast("All steps updated");

    dirtyRows.clear();

    stepsTable.getRows().forEach(r => {
      r.getElement().classList.remove("is-dirty");
    });

  } catch (err) {

    console.error(err);

    toast("Save failed", false);
  }
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
    reactiveData: false,
    index: "id",
    editTriggerEvent: "dblclick",

    initialSort: [
      {
        column: "step_code",
        dir: "asc"
      }
    ],

    columns: [
      {
        title: "",
        formatter: function (cell) {

          const opened =
            cell.getRow()
              .getElement()
              .querySelector(".log-holder");

          return opened ? "▼" : "▶";
        },
        width: 50,
        hozAlign: "center",
        cellClick: function (e, cell) {

          const row = cell.getRow();

          const el = row.getElement();

          const old =
            el.querySelector(".log-holder");

          if (old) {

            old.remove();

            return;
          }

          const data = row.getData();

          const holder =
            document.createElement("div");

          holder.className = "log-holder";

          holder.style.padding = "10px";

          holder.innerHTML = `

      <div>

        <div style="margin-bottom:10px; display:flex; gap:10px; align-items:center;">

        <input
        type="date"
        class="new-log-date"
        value="${new Date().toISOString().slice(0, 10)}"
        style="width:140px;"
      >

        <button
        type="button"
        class="btn-mini btn-success add-log-btn"
        data-step-id="${data.id}"
      >
        + Add Log
      </button>

      <button
        type="button"
        class="btn-mini btn-primary save-all-logs-btn"
      >
        💾 Save All Logs
      </button>

      </div>

  <table class="log-subtable">

        <thead>
          <tr>
            <th style="width:110px;">Date</th>
            <th style="min-width:90px;">Good</th>
            <th style="min-width:90px;">Bad</th>
            <th style="min-width:80px;">Operator</th>
            <th style="min-width:80px;">Machine</th>
            <th style="min-width:220px;">Note</th>
            <th>Supplier PO</th>
            <th>Supplier</th>
            <th>Heat Lot</th>
            <th>Mat Type</th>
            <th>Mat Size</th>
            <th>Length</th>
            <th style="width:70px;">Qty</th>
            <th>UOM</th>
            <th>Send Date</th>
            <th>Recv Date</th>
            <th>Del</th>
          </tr>
        </thead>

        <tbody>

        ${(data.logs || []).map(log => `

            <tr data-log-id="${log.id}">

              <!-- DATE -->
              <td>
                <input
                  
                  class="log-input date-input"
                  type="date"
                  data-log-id="${log.id}"
                  data-field="work_date"
                  value="${log.work_date || ""}"
                >
              </td>

              <!-- GOOD -->
              <td>
                <input
                  class="log-input"
                  type="number"
                  data-log-id="${log.id}"
                  data-field="qty_accept"
                  value="${log.qty_accept || 0}"
                >
              </td>

              <!-- BAD -->
              <td>
                <input
                  class="log-input"
                  type="number"
                  data-log-id="${log.id}"
                  data-field="qty_reject"
                  value="${log.qty_reject || 0}"
                >
              </td>

              <!-- OPERATOR -->
              <td>

              <select
                class="log-input table-select"
                data-log-id="${log.id}"
                data-field="operator_id"
              >

            <option value="">
              Select
            </option>

          ${employees.map(e => `

          <option
            value="${e.id}"

            ${Number(e.id) ===
              Number(log.operator_id)
              ? "selected"
              : ""}

          >
          ${e.nickname || ""}
          </option>

          `).join("")}

          </select>

          </td>

          <!-- MACHINE -->
          <td>

          <select
            class="log-input table-select"
            data-log-id="${log.id}"
            data-field="machine_id"
          >

          <option value="">
            Select
          </option>

          ${machines.map(m => `

          <option
            value="${m.id}"

            ${Number(m.id) ===
                  Number(log.machine_id)
                  ? "selected"
                  : ""}

          >
            ${m.code}
          </option>

          `).join("")}

          </select>

          </td>

            <!-- NOTE -->
            <td>
              <textarea
                class="log-input"
                data-log-id="${log.id}"
                data-field="note"
                rows="2"
              >${log.note || ""}</textarea>
            </td>

            <!-- SUPPLIER PO -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="supplier_po"
                value="${log.supplier_po || ""}"
              >
            </td>

            <!-- SUPPLIER -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="supplier_name"
                value="${log.supplier_name || ""}"
              >
            </td>

            <!-- HEAT LOT -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="supplier_lot"
                value="${log.supplier_lot || ""}"
              >
            </td>

            <!-- MAT TYPE -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="material_type"
                value="${log.material_type || ""}"
              >
            </td>

            <!-- MAT SIZE -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="material_size"
                value="${log.material_size || ""}"
              >
            </td>

            <!-- LENGTH -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="material_length"
                value="${log.material_length || ""}"
              >
            </td>

            <!-- QTY -->
            <td>
              <input
                class="log-input qty-small-input"
                type="number"
                data-log-id="${log.id}"
                data-field="material_qty"
                value="${log.material_qty || 0}"
              >
            </td>

            <!-- UOM -->
            <td>
              <input
                class="log-input"
                data-log-id="${log.id}"
                data-field="material_uom"
                value="${log.material_uom || ""}"
              >
            </td>

            <!-- SEND DATE -->
            <td>
              <input
                class="log-input"
                type="date"
                data-log-id="${log.id}"
                data-field="supplier_send_date"
                value="${log.supplier_send_date || ""}"
              >
            </td>

            <!-- RECV DATE -->
            <td>
              <input
                class="log-input"
                type="date"
                data-log-id="${log.id}"
                data-field="supplier_receive_date"
                value="${log.supplier_receive_date || ""}"
              >
            </td>

            <!-- DELETE -->
            <td>

              <button
                type="button"
                class="btn-mini btn-danger delete-log-btn"
                data-log-id="${log.id}"
              >
                🗑
              </button>

            </td>

          </tr>

          `).join("")
            }

        </tbody>

              </table>
            `;

          el.appendChild(holder);

          holder
            .querySelector(".save-all-logs-btn")
            .addEventListener("click", async () => {

              try {

                const rows =
                  holder.querySelectorAll("tbody tr");

                for (const row of rows) {

                  const logId =
                    row.dataset.logId;

                  if (!logId) {
                    continue;
                  }

                  const payload = {};

                  row
                    .querySelectorAll(".log-input")
                    .forEach(input => {

                      const field =
                        input.dataset.field;

                      if (!field) return;

                      let value =
                        input.value;

                      if (
                        field === "qty_accept" ||
                        field === "qty_reject" ||
                        field === "material_qty"
                      ) {
                        value = Number(value || 0);
                      }

                      // skip display-only fields
                      if (
                        field === "operator_nickname" ||
                        field === "machine_name"
                      ) {
                        return;
                      }

                      payload[field] = value;
                    });

                  console.log(
                    "SAVE LOG",
                    logId,
                    payload
                  );

                  await jfetch(
                    `/api/v1/step-logs/${logId}`,
                    {
                      method: "PATCH",

                      body: JSON.stringify(payload)
                    }
                  );
                }

                toast("All logs saved");

              } catch (err) {

                console.error(err);

                toast("Save logs failed", false);
              }
            });

          holder
            .querySelectorAll(".delete-log-btn")
            .forEach(btn => {

              btn.addEventListener("click", async (e) => {

                e.preventDefault();
                e.stopPropagation();

                const logId =
                  btn.dataset.logId;

                if (!confirm("Delete log?")) {
                  return;
                }

                try {

                  await jfetch(
                    `/api/v1/step-logs/${logId}`,
                    {
                      method: "DELETE"
                    }
                  );

                  btn.closest("tr").remove();

                  toast("Log deleted");

                } catch (err) {

                  console.error(err);

                  toast("Delete failed", false);
                }
              });
            });
          holder
            .querySelector(".add-log-btn")
            .addEventListener("click", async (e) => {

              e.preventDefault();
              e.stopPropagation();

              try {

                const selectedDate =
                  holder.querySelector(".new-log-date").value;

                // 🔥 create and get created row back
                const created =
                  await jfetch(
                    "/api/v1/step-logs",
                    {
                      method: "POST",

                      body: JSON.stringify({

                        step_id: data.id,

                        work_date: selectedDate,

                        qty_accept: 0,

                        qty_reject: 0,

                        supplier_po: "",

                        supplier_name: "",

                        supplier_lot: "",

                        material_type: "",

                        material_size: "",

                        material_length: "",

                        material_qty: 0,

                        material_uom: ""

                      })
                    }
                  );


                console.log("LOG CREATED =", created);
                toast("Log created");
                const createdId =
                  created?.id ||
                  created?.data?.id;

                console.log(
                  "CREATED ID =",
                  createdId
                );

                if (!createdId) {

                  toast(
                    "Backend did not return log id",
                    false
                  );

                  return;
                }
                const tbody =
                  holder.querySelector("tbody");
                if (!createdId) {

                  toast("Backend did not return log id", false);

                  return;
                }

                tbody.insertAdjacentHTML(
                  "beforeend",

                  `
                  <tr data-log-id="${createdId}">

                    <!-- DATE -->
                    <td>
                      <input
                        class="log-input"
                        type="date"
                        data-log-id="${createdId}"
                        data-field="work_date"
                        value="${selectedDate}"
                      >
                    </td>

                    <!-- GOOD -->
                    <td>
                      <input
                        class="log-input"
                        type="number"
                        data-log-id="${createdId}"
                        data-field="qty_accept"
                        value="0"
                      >
                    </td>

                    <!-- BAD -->
                    <td>
                      <input
                        class="log-input"
                        type="number"
                        data-log-id="${createdId}"
                        data-field="qty_reject"
                        value="0"
                      >
                    </td>

                    <!-- OPERATOR -->
                  <td>

                  <select
                    class="log-input table-select"
                    data-log-id="${createdId}"
                    data-field="operator_id"
                  >

                  <option value="">
                    Select
                  </option>

                  ${employees.map(e => `

                  <option value="${e.id}">
                    ${e.emp_code} - ${e.nickname || ""}
                  </option>

                  `).join("")}

                  </select>

                  </td>

                  <!-- MACHINE -->
                  <td>

                  <select
                    class="log-input table-select"
                    data-log-id="${createdId}"
                    data-field="machine_id"
                  >

                  <option value="">
                    Select
                  </option>

                  ${machines.map(m => `

                  <option value="${m.id}">
                    ${m.code}
                  </option>

                  `).join("")}

                  </select>

                  </td>

                    <!-- NOTE -->
                    <td>
                      <textarea
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="note"
                        rows="2"
                      ></textarea>
                    </td>

                    <!-- SUPPLIER PO -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="supplier_po"
                        value=""
                      >
                    </td>

                    <!-- SUPPLIER -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="supplier_name"
                        value=""
                      >
                    </td>

                    <!-- HEAT LOT -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="supplier_lot"
                        value=""
                      >
                    </td>

                    <!-- MAT TYPE -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="material_type"
                        value=""
                      >
                    </td>

                    <!-- MAT SIZE -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="material_size"
                        value=""
                      >
                    </td>

                    <!-- LENGTH -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="material_length"
                        value=""
                      >
                    </td>

                    <!-- QTY -->
                    <td>
                      <input
                        class="log-input"
                        type="number"
                        data-log-id="${createdId}"
                        data-field="material_qty"
                        value="0"
                      >
                    </td>

                    <!-- UOM -->
                    <td>
                      <input
                        class="log-input"
                        data-log-id="${createdId}"
                        data-field="material_uom"
                        value=""
                      >
                    </td>

                    <!-- SEND DATE -->
                    <td>
                      <input
                        class="log-input"
                        type="date"
                        data-log-id="${createdId}"
                        data-field="supplier_send_date"
                        value=""
                      >
                    </td>

                    <!-- RECV DATE -->
                    <td>
                      <input
                        class="log-input"
                        type="date"
                        data-log-id="${createdId}"
                        data-field="supplier_receive_date"
                        value=""
                      >
                    </td>

                    <!-- DELETE -->
                    <td>

                      <button
                        type="button"
                        class="btn-mini btn-danger delete-log-btn"
                        data-log-id="${createdId}"
                      >
                        🗑
                      </button>

                    </td>

                  </tr>
                  `
                );

              } catch (err) {

                console.error(err);

                toast("Create log failed", false);
              }
            });
        }
      },

      // { title: "#", field: "seq", width: 70, hozAlign: "center", editor: "number" },

      {
        title: "OP",
        field: "step_code",
        width: 40,
        editor: "input",

        sorter: function (a, b) {

          const aIsM = /^M/i.test(a || "");
          const bIsM = /^M/i.test(b || "");

          // M comes first
          if (aIsM && !bIsM) return -1;
          if (!aIsM && bIsM) return 1;

          // compare numeric part
          const aNum = parseInt(String(a).replace(/\D/g, "")) || 0;
          const bNum = parseInt(String(b).replace(/\D/g, "")) || 0;

          return aNum - bNum;
        }
      },

      // { title: "Step Name", field: "step_name", width: 220, editor: "textarea" },

      // {
      //   title: "Step Detail",
      //   field: "step_detail",
      //   width: 300,
      //   editor: "textarea",
      // },

      {
        title: "Step Name",
        field: "step_name",
        width: 220,
        variableHeight: true,

        formatter: function (cell) {

          let value =
            cell.getValue() || "";

          // **bold**
          value = value.replace(
            /\*\*(.*?)\*\*/g,
            "<b>$1</b>"
          );

          // newline
          value = value.replace(
            /\n/g,
            "<br>"
          );

          return `
      <div style="
        white-space:normal;
        line-height:1.2;
        text-align:left;
        padding:2px 0;
      ">
        ${value}
      </div>
    `;
        },

        editor: function (
          cell,
          onRendered,
          success,
          cancel
        ) {

          const editor =
            document.createElement("div");

          editor.contentEditable = true;

          editor.style.minHeight = "40px";
          editor.style.padding = "4px";
          editor.style.outline = "none";
          editor.style.whiteSpace = "pre-wrap";
          editor.style.lineHeight = "1.2";
          editor.style.fontSize = "12px";
          editor.style.background = "#fff";
          editor.style.width = "100%";
          editor.style.boxSizing = "border-box";
          editor.style.border = "1px solid #ccc";

          // 🔥 initial value
          let value =
            cell.getValue() || "";

          value = value.replace(
            /\*\*(.*?)\*\*/g,
            "<b>$1</b>"
          );

          value = value.replace(
            /\n/g,
            "<br>"
          );

          editor.innerHTML = value;

          onRendered(() => {

            editor.focus();

            const range =
              document.createRange();

            const sel =
              window.getSelection();

            range.selectNodeContents(editor);

            range.collapse(false);

            sel.removeAllRanges();

            sel.addRange(range);
          });

          // =========================
          // KEYDOWN
          // =========================
          editor.addEventListener(
            "keydown",
            (e) => {

              // 🔥 CTRL+B
              if (
                e.ctrlKey &&
                e.key.toLowerCase() === "b"
              ) {

                e.preventDefault();

                document.execCommand(
                  "bold"
                );

                return;
              }

              // ESC
              if (e.key === "Escape") {
                cancel();
              }
            }
          );

          // =========================
          // SAVE
          // =========================
          function save() {

            let html =
              editor.innerHTML;

            // br -> newline
            html = html
              .replace(/<div>/gi, "\n")
              .replace(/<\/div>/gi, "")
              .replace(/<br>/gi, "\n");

            // preserve bold
            html = html
              .replace(
                /<b>(.*?)<\/b>/gi,
                "**$1**"
              )
              .replace(
                /<strong>(.*?)<\/strong>/gi,
                "**$1**"
              );

            // 🔥 CAPITAL LETTER
            html = html.toUpperCase();

            success(html.trim());
          }

          editor.addEventListener(
            "blur",
            save
          );

          return editor;
        }
      },

      {
        title: "Step Detail",
        field: "step_detail",
        width: 220,
        variableHeight: true,

        formatter: function (cell) {

          let value =
            cell.getValue() || "";

          // **bold**
          value = value.replace(
            /\*\*(.*?)\*\*/g,
            "<b>$1</b>"
          );

          // newline
          value = value.replace(
            /\n/g,
            "<br>"
          );

          return `
      <div style="
        white-space:normal;
        line-height:1.2;
        text-align:left;
        padding:2px 0;
      ">
        ${value}
      </div>
    `;
        },

        editor: function (
          cell,
          onRendered,
          success,
          cancel
        ) {

          const editor =
            document.createElement("div");

          editor.contentEditable = true;

          editor.style.minHeight = "40px";
          editor.style.padding = "4px";
          editor.style.outline = "none";
          editor.style.whiteSpace = "pre-wrap";
          editor.style.lineHeight = "1.2";
          editor.style.fontSize = "12px";
          editor.style.background = "#fff";
          editor.style.width = "100%";
          editor.style.boxSizing = "border-box";
          editor.style.border = "1px solid #ccc";

          // 🔥 initial value
          let value =
            cell.getValue() || "";

          value = value.replace(
            /\*\*(.*?)\*\*/g,
            "<b>$1</b>"
          );

          value = value.replace(
            /\n/g,
            "<br>"
          );

          editor.innerHTML = value;

          onRendered(() => {

            editor.focus();

            const range =
              document.createRange();

            const sel =
              window.getSelection();

            range.selectNodeContents(editor);

            range.collapse(false);

            sel.removeAllRanges();

            sel.addRange(range);
          });

          // =========================
          // KEYDOWN
          // =========================
          editor.addEventListener(
            "keydown",
            (e) => {

              // 🔥 CTRL+B
              if (
                e.ctrlKey &&
                e.key.toLowerCase() === "b"
              ) {

                e.preventDefault();

                document.execCommand(
                  "bold"
                );

                return;
              }

              // ESC
              if (e.key === "Escape") {
                cancel();
              }
            }
          );

          // =========================
          // SAVE
          // =========================
          function save() {

            let html =
              editor.innerHTML;

            // br -> newline
            html = html
              .replace(/<div>/gi, "\n")
              .replace(/<\/div>/gi, "")
              .replace(/<br>/gi, "\n");

            // preserve bold
            html = html
              .replace(
                /<b>(.*?)<\/b>/gi,
                "**$1**"
              )
              .replace(
                /<strong>(.*?)<\/strong>/gi,
                "**$1**"
              );

            // 🔥 CAPITAL LETTER
            html = html.toUpperCase();

            success(html.trim());
          }

          editor.addEventListener(
            "blur",
            save
          );

          return editor;
        }
      },
      //       {
      //         title: "Step",
      //         width: 500,
      //         variableHeight: true,

      //         formatter: function (cell) {

      //   const row =
      //     cell.getRow().getData();

      //   const name =
      //     row.step_name || "";

      //   const detail =
      //     row.step_detail || "";

      //   return `
      //     <div style="
      //       font-size:12px;
      //       line-height:1.15;
      //       padding:0;
      //       margin:0;
      //       width:100%;
      //       text-align:left;
      //     ">

      //       <div style="
      //         font-weight:bold;
      //         margin:0 0 2px 0;
      //         padding:0;
      //       ">
      //         ${name}
      //       </div>

      //       <div style="
      //         margin:0;
      //         padding:0;
      //         white-space:pre-line;
      //       ">
      //         ${detail}
      //       </div>

      //     </div>
      //   `;
      // },


      //         editor: function (
      //           cell,
      //           onRendered,
      //           success,
      //           cancel
      //         ) {

      //           const row =
      //             cell.getRow().getData();

      //           // =========================
      //           // CREATE EDITOR
      //           // =========================
      //           const editor =
      //             document.createElement("div");

      //           editor.contentEditable = true;

      //           // =========================
      //           // STYLE
      //           // =========================
      //           editor.style.minHeight = "40px";

      //           editor.style.padding = "4px";

      //           editor.style.outline = "none";

      //           editor.style.whiteSpace = "pre-wrap";

      //           editor.style.lineHeight = "1.2";

      //           editor.style.fontSize = "12px";

      //           editor.style.background = "#fff";

      //           editor.style.width = "100%";

      //           editor.style.boxSizing = "border-box";

      //           editor.style.border =
      //             "1px solid #ccc";

      //           // =========================
      //           // INITIAL VALUE
      //           // =========================
      //           editor.innerHTML =

      //             `${row.step_name || ""}<br><br>${row.step_detail || ""}`;

      //           // =========================
      //           // FOCUS
      //           // =========================
      //           onRendered(() => {

      //             editor.focus();

      //             const range =
      //               document.createRange();

      //             const sel =
      //               window.getSelection();

      //             range.selectNodeContents(editor);

      //             range.collapse(false);

      //             sel.removeAllRanges();

      //             sel.addRange(range);
      //           });

      //           // =========================
      //           // CTRL + B
      //           // =========================
      //           editor.addEventListener(
      //             "keydown",
      //             (e) => {

      //               // 🔥 CTRL+B
      //               if (
      //                 e.ctrlKey &&
      //                 e.key.toLowerCase() === "b"
      //               ) {

      //                 e.preventDefault();

      //                 document.execCommand("bold");

      //                 return;
      //               }

      //               // ESC
      //               if (e.key === "Escape") {

      //                 cancel();
      //               }
      //             }
      //           );

      //           // =========================
      //           // SAVE FUNCTION
      //           // =========================
      //           function save() {

      //             let html =
      //               editor.innerHTML;

      //             // convert div -> newline
      //             html = html
      //               .replace(/<div>/gi, "\n")
      //               .replace(/<\/div>/gi, "")
      //               .replace(/<br>/gi, "\n");

      //             // preserve bold
      //             html = html
      //               .replace(/<b>(.*?)<\/b>/gi, "**$1**")
      //               .replace(/<strong>(.*?)<\/strong>/gi, "**$1**");

      //             const text =
      //               html.trim();

      //             const lines =
      //               text.split("\n");

      //             const step_name =
      //               (lines.shift() || "").trim();

      //             const step_detail =
      //               lines.join("\n").trim();

      //             // update row
      //             cell.getRow().update({

      //               step_name,

      //               step_detail
      //             });

      //             // dirty
      //             dirtyRows.set(
      //               row.id,
      //               JSON.parse(
      //                 JSON.stringify(
      //                   cell.getRow().getData()
      //                 )
      //               )
      //             );

      //             cell
      //               .getRow()
      //               .getElement()
      //               .classList
      //               .add("is-dirty");

      //             success(step_name);
      //           }

      //           // =========================
      //           // SAVE ON BLUR
      //           // =========================
      //           editor.addEventListener(
      //             "blur",
      //             save
      //           );

      //           return editor;
      //         },
      //       },

      // {
      //   title: "Supplier",
      //   width: 120,

      //   formatter: function (cell) {

      //     const logs =
      //       cell.getRow().getData().logs || [];

      //     const blocks = [];

      //     logs.forEach(l => {

      //       const lines = [];

      //       if (l.supplier_po) {
      //         lines.push(
      //           `PO: ${l.supplier_po}`
      //         );
      //       }

      //       if (l.supplier_name) {
      //         lines.push(
      //           `Supplier: ${l.supplier_name}`
      //         );
      //       }

      //       if (l.supplier_lot) {
      //         lines.push(
      //           `Lot: ${l.supplier_lot}`
      //         );
      //       }

      //       // 🔥 skip empty logs
      //       if (lines.length === 0) {
      //         return;
      //       }

      //       const text = lines.join("<br>");

      //       // 🔥 prevent duplicate block
      //       if (!blocks.includes(text)) {
      //         blocks.push(text);
      //       }
      //     });

      //     return blocks.join(
      //       "<hr style='margin:4px 0'>"
      //     );
      //   }
      // },


      // { title: "Station", field: "station", width: 140 },
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

      //   {
      //     title: "Yield %",
      //     width: 110,
      //     hozAlign: "right",

      //     formatter: function (cell) {

      //       const row =
      //         cell.getRow().getData();

      //       const recv =
      //         Number(row.total_receive || 0);

      //       const accept =
      //         Number(row.total_accept || 0);

      //       const reject =
      //         Number(row.total_reject || 0);

      //       const denominator =
      //         accept + reject;

      //       let yieldValue = 0;

      //       // 🔥 use receive
      //       if (recv > 0) {

      //         yieldValue =
      //           (accept / recv) * 100;
      //       }

      //       let color = "#ef4444";

      //       if (yieldValue >= 95)
      //         color = "#10b981";

      //       else if (yieldValue >= 80)
      //         color = "#f59e0b";

      //       return `
      //   <div style="
      //     font-weight:700;
      //     color:${color};
      //   ">
      //     ${yieldValue.toFixed(2)}%
      //   </div>
      // `;
      //     }
      //   },
      {
        title: "Operator",
        width: 100,

        formatter: (cell) => {

          const logs =
            cell.getRow().getData().logs || [];

          const unique = [
            ...new Set(
              logs
                .map(l => l.operator_nickname)
                .filter(v => v)
            )
          ];

          return unique.join(", ");
        }
      },

      {
        title: "Machine",
        width: 100,

        formatter: (cell) => {

          const logs =
            cell.getRow().getData().logs || [];

          const unique = [
            ...new Set(
              logs
                .map(l => l.machine_name || l.machine_code || "")
                .filter(v => v)
            )
          ];

          return unique.join(", ");
        }
      },


      {
        title: "Supplier / Comment",
        width: 300,

        formatter: function (cell) {

          const logs =
            cell.getRow().getData().logs || [];

          const blocks = [];

          logs.forEach(l => {

            const lines = [];

            // =====================
            // SUPPLIER INFO
            // =====================



            if (l.supplier_name) {

              lines.push(
                `<b>Supplier:</b> ${l.supplier_name}`
              );
            }
            if (l.supplier_po) {

              lines.push(
                `<b>PO:</b> ${l.supplier_po}`
              );
            }

            if (l.supplier_lot) {

              const stepCode =
                String(
                  cell.getRow()
                    .getData()
                    .step_code || ""
                ).toUpperCase();

              if (stepCode.startsWith("M")) {

                lines.push(
                  `<b>Heat Lot:</b> ${l.supplier_lot}`
                );

              } else {

                lines.push(
                  `<b>Cert:</b> ${l.supplier_lot}`
                );

              }
            }

            // =====================
            // COMMENT
            // =====================

            const note =
              (l.note || "").trim();

            if (note) {

              lines.push(
                `<div style="
            margin-top:4px;
            color:#2563eb;
            font-style:italic;
          ">
            ${note}
          </div>`
              );
            }

            // skip empty
            if (lines.length === 0) {
              return;
            }

            const text =
              lines.join("<br>");

            // prevent duplicate
            if (!blocks.includes(text)) {

              blocks.push(text);
            }
          });

          return blocks.join(
            "<hr style='margin:6px 0'>"
          );
        }
      },

      // {
      //   title: "Note",
      //   width: 260,

      //   formatter: function (cell) {

      //     const logs =
      //       cell.getRow().getData().logs || [];

      //     const comments = [];

      //     logs.forEach(l => {

      //       const note =
      //         (l.note || "").trim();

      //       // only show if has comment
      //       if (!note) {
      //         return;
      //       }

      //       const line = `
      //   <div style="margin-bottom:4px;">
      //     ${note}
      //   </div>
      // `;

      //       if (!comments.includes(line)) {
      //         comments.push(line);
      //       }
      //     });

      //     // no comment
      //     if (comments.length === 0) {
      //       return "";
      //     }

      //     return comments.join(
      //       "<hr style='margin:4px 0'>"
      //     );
      //   }
      // },


      {
        title: "Check",
        width: 200,

        formatter(cell) {

          const errors = [];

          const current =
            cell.getRow().getData();

          const rows =
            cell.getTable()
              .getData()
              .slice()
              .sort((a, b) =>
                Number(a.seq) - Number(b.seq)
              );

          // =====================
          // current log
          // =====================

          const currentLog =
            current.logs?.at(-1);

          // =====================
          // operator required
          // =====================

          const hasOperator =

            current.logs?.some(
              l => l.operator_id
            );

          if (!hasOperator) {

            errors.push(
              "Operator Missing"
            );
          }

          if (!currentLog?.work_date) {
            return "";
          }

          const currentDate =
            new Date(currentLog.work_date);

          // =====================
          // 1. compare previous OP
          // =====================

          const idx =
            rows.findIndex(
              r => r.id === current.id
            );

          if (idx > 0) {

            const prev =
              rows[idx - 1];

            const prevLog =
              prev.logs?.at(-1);

            if (prevLog?.work_date) {

              const prevDate =
                new Date(prevLog.work_date);

              if (currentDate < prevDate) {

                errors.push(
                  `Date < ${prev.step_code}`
                );
              }
            }
          }

          // =====================
          // 2. first OP before release date
          // =====================

          if (idx === 0) {

            const releaseDate =
              $("created_at")?.value;

            if (releaseDate) {

              if (
                currentLog.work_date <
                releaseDate
              ) {

                errors.push(
                  `Before Release Date`
                );
              }
            }
          }

          // =====================
          // 3. last OP after due date
          // =====================

          if (idx === rows.length - 1) {

            const dueDate =
              $("lot_due_date")?.value;

            if (
              dueDate &&
              currentLog.work_date >
              dueDate
            ) {

              errors.push(
                `After Due Date`
              );
            }
          }

          // =====================
          // display
          // =====================

          if (!errors.length) {

            return `
        <span style="
          color:green;
          font-weight:bold;
        ">
          ✓
        </span>
      `;
          }

          return `
      <div style="
        color:red;
        font-weight:bold;
        line-height:1.2;
      ">
        ${errors.join("<br>")}
      </div>
    `;
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




    // cellEdited: function (cell) {
    //   const row = cell.getRow();
    //   setDirtyClass(row, true);

    //   // 🔥 refresh ปุ่ม
    //   row.getTable().redraw(true);
    // },

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

  stepsTable.on("cellEdited", function (cell) {

    const row = cell.getRow();

    const data = row.getData();

    console.log("CELL EDITED");

    dirtyRows.set(
      data.id,
      JSON.parse(JSON.stringify(data))
    );


    row.getElement().classList.add("is-dirty");

  });






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

document.addEventListener("keydown", function (e) {

  if (e.key !== "Enter") {
    return;
  }

  if (
    !e.target.classList.contains("log-input")
  ) {
    return;
  }

  // textarea allow newline
  if (e.target.tagName === "TEXTAREA") {
    return;
  }

  e.preventDefault();

  e.target.blur();
});

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

async function exportTravelerBlank() {
  console.log("Export blank traveler", travelerId);

  try {
    const res = await fetch(
      `/api/v1/traveler_drawing/export_traveler_blank/${travelerId}`,
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
    let filename = `traveler_blank_${travelerId}.docx`;
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

  console.log("Loading lot detail for lotId:", lotId);

  if (!lotId) return;

  try {

    const lot = await jfetch(
      `/lots/${encodeURIComponent(lotId)}`
    );

    originalLot = lot;

    console.log("lot detail:", originalLot);

    const partEl = $("part_no");
    const revEl = $("rev");
    const lotEl = $("lot_no");
    const poEl = $("po_no");
    const customerEl = $("customer_code");

    if (partEl) partEl.value = originalLot.part?.part_no || "";
    if (revEl) revEl.value = originalLot.part_revision?.rev || "";
    if (lotEl) lotEl.value = originalLot.all?.lot_no || "";
    if (poEl) poEl.value = originalLot.po?.po_number || "";
    if (customerEl) customerEl.value = originalLot.customer?.code || "";

    $("status").value = originalLot.all.status;
    const risk =
      originalLot.all?.risk || "green";

    $("risk").value = risk;

    if (!originalLot.all?.risk) {

      await jfetch(
        `/lots/${lotId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            risk: "green"
          })
        }
      );

      console.log("Default risk=green saved");
    }
    $("lot_shipped_qty").value =
      originalLot.lot_shipped_qty || "";

    $("lot_planned_qty").value =
      originalLot.all?.planned_qty || "";

    $("notes").value =
      originalLot.all?.note || "";

    $("started_at").value =
      originalLot.all.started_at
        ? originalLot.all.started_at.slice(0, 10)
        : "";

    $("lot_po_duedate").value =
      originalLot.lot_po_duedate
        ? originalLot.lot_po_duedate.slice(0, 10)
        : "";

    $("created_at").value =
      originalLot.all.created_at
        ? originalLot.all.created_at.slice(0, 10)
        : "";

    $("lot_due_date").value =
      originalLot.all.lot_due_date
        ? originalLot.all.lot_due_date.slice(0, 10)
        : "";

    console.log(
      "AFTER LOAD",
      $("created_at").value,
      $("lot_due_date").value
    );

    checkDueDate();

  } catch (err) {

    console.error("loadLotDetail error", err);

    toast("Load lot failed", false);
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


let isImporting = false;

async function handleImportFile(e) {

  const file = e.target.files[0];

  if (!file) return;

  if (isImporting) return;

  if (!travelerId) {
    toast("Traveler ID missing", false);
    return;
  }

  try {

    isImporting = true;

    setBusyT(true);

    const formData = new FormData();
    //console.log("Importing file:", file);  

    formData.append("file", file);

    formData.append("traveler_id", travelerId);

    // // ✅ ADD THESE
    const partNo =
      originalLot?.part?.part_no || "";

    const rev =
      originalLot?.part_revision?.rev || "";

    formData.append("part_no", partNo);
    formData.append("rev", rev);

    console.log("part_no =", partNo);
    console.log("rev =", rev);

    const res = await fetch(
      "/api/v1/traveler-steps/import",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!res.ok) {

      let msg = "Import failed";

      try {
        const err = await res.json();
        msg = err.detail || msg;
      } catch {
        msg = await res.text();
      }

      throw new Error(msg);
    }

    const result = await res.json();

    toast(`Imported ${result.count || 0} steps`);

    await reloadSteps();
    await loadTraveler();


    // ⭐ UPDATE LOT STATUS
    if (lotId) {
      await jfetch(`/api/v1/lots/${lotId}/status`, {
        method: "PUT",
        body: JSON.stringify({
          status: "in_process"
        })
      });
      console.log("Lot status updated to in_process");
    }

  } catch (err) {

    console.error(err);
    toast(err?.message || "Import failed", false
    );

  } finally {

    isImporting = false;

    setBusyT(false);

    e.target.value = "";
  }
}

const dirtyRows = new Map();
/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadMasterData();
  initTopbar();
  ensureHeaderButtons();
  wireHeaderDirtyOnly();
  initHeaderAutocomplete();

  // 🔥 add here
  $("created_at")?.addEventListener(
    "change",
    checkDueDate
  );

  $("lot_due_date")?.addEventListener(
    "change",
    checkDueDate
  );
  checkDueDate();
  // ---> Add Drawing diagram batch download
  // $("btnDrawing").addEventListener("click", downloadDrawingBatch);
  // $("btnTraveler").addEventListener("click", downloadTravelerBatch);
  // $("btnInspection").addEventListener("click", downloadInspectionBatch);
  $("btnExportTraveler").addEventListener("click", exportTraveler);
  $("btnExportTravelerBlank").addEventListener("click", exportTravelerBlank);





  const btnUpdateST = document.getElementById("btnUpdateTravelerStep");

  btnUpdateST?.addEventListener("click", async () => {

    // 🔥 force commit current editing cell
    document.activeElement?.blur();

    // 🔥 wait next tick
    await new Promise(r => setTimeout(r, 50));

    await saveAllSteps();

  });

  const btnDeleteAllSteps = document.getElementById("btnDeleteAllSteps");

  btnDeleteAllSteps?.addEventListener("click", async () => {
    if (!confirm("Delete all steps?")) {
      return;
    }

    try {
      setBusyT(true);

      const res = await jfetch(`/api/v1/travelers/${travelerId}/delete-all-steps`, {
        method: "DELETE"
      });

      toast("All steps deleted");

      originalTraveler.file_dir = null;

      $("fileInputDir").value = "";

      await reloadSteps();

    } catch (err) {
      console.error(err);
      toast(err?.message || "Failed to delete steps", false);
    } finally {
      setBusyT(false);
    }
  });

  const btnFromLot =
    document.getElementById("btnFromLot");

  btnFromLot?.addEventListener(
    "click",
    async () => {

      const fromLot =
        document.getElementById("fromLot")
          ?.value
          ?.trim();

      if (!fromLot) {

        toast("Enter lot no", false);

        return;
      }

      const fromLotQTY =
        document.getElementById("fromLotQTY")
          ?.value
          ?.trim();

      if (!fromLotQTY) {

        toast("Enter from lot quantity", false);

        return;
      }


      if (
        !confirm(
          `Create from Lot ${fromLot}?`
        )
      ) {
        return;
      }

      try {

        setBusyT(true);

        await jfetch(
          `/api/v1/travelers/${travelerId}/copy-from-lot`,
          {
            method: "POST",

            body: JSON.stringify({
              from_lot_no: fromLot,
              from_lot_qty: Number(fromLotQTY)
            })
          }
        );

        toast("Steps copied");

        await reloadSteps();

      } catch (err) {

        console.error(err);

        toast(
          err?.message ||
          "Copy failed",
          false
        );

      } finally {

        setBusyT(false);
      }
    }
  );


  const btnFromBlank =
    document.getElementById("btnFromBlank");

    

  btnFromBlank?.addEventListener("click", async () => {
      console.log("from blank")
       if (
    !confirm("Create from Blank?")
  ) {
    return;
  }
      try {

        setBusyT(true);

        await jfetch(
          `/api/v1/travelers/${travelerId}/copy-from-blank`,
          {
            method: "POST",

            body: JSON.stringify({
              from_lot_no: 111,
              from_lot_qty: 111
            })
          }
        );

        toast("From Blank completed");

        await reloadSteps();

      } catch (err) {

        console.error(err);

        toast(
          err?.message ||
          "Copy failed",
          false
        );

      } finally {

        setBusyT(false);
      }
    }

  );

  const btnUpdateTemplate = document.getElementById("btnUpdateTravelerTemplate");

  btnUpdateTemplate?.addEventListener("click", async () => {
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
      await loadTraveler();


      // 🔥 IMPORTANT → reload template dropdown

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

    if (!confirm("Apply latest template? Current steps will be replaced")) {
      return;
    }

    try {
      setBusyT(true);



      const res = await jfetch(
        `/api/v1/travelers/apply-template/${travelerId}`,
        { method: "POST" }
      );

      toast("Latest template applied");
      await loadTraveler();   // 🔥 reload badge/version
      await reloadSteps();

      // ⭐ UPDATE LOT STATUS
      if (lotId) {
        await jfetch(`/api/v1/lots/${lotId}/status`, {
          method: "PUT",
          body: JSON.stringify({
            status: "in_process"
          })
        });
        console.log("Lot status updated to in_process");
      }

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
  await loadLotDetail();
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


