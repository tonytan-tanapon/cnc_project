// /static/js/manage-parts-detail.js  (v24 — materials autocomplete + ID-based save, deduped, fixed add)
import { $, jfetch, showToast as toast, initTopbar } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const fmtQty = (v) =>
  v == null
    ? ""
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const sortAlpha = (arr, key) =>
  [...arr].sort((a, b) =>
    (key ? a[key] : a).localeCompare(key ? b[key] : b, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

// ---- DOM refs
const tableMount = $("p_table");
const inputSearch = $("p_q");

let table = null;
let currentSearch = "";
let allRows = [];

// ===== Materials state (ID-based) =====
let materials = []; // [{ id, material_id, code, name }]
let pendingSelectedMaterial = null; // { id, code, name } from AC selection
const MAT_LOOKUP_URL = (q) => `/lookups/materials?q=${encodeURIComponent(q)}`;

// Small helpers
function safeText(s) {
  return String(s ?? "").replace(
    /[<>&]/g,
    (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m])
  );
}

let lookups = { processes: [], finishes: [] };
let idCutting = null;
let idHeat = null;

const fmtDate = (s) => {
  if (!s) return "";
  // Accept 'YYYY-MM-DD' or ISO datetime. Prefer exact date parsing to avoid TZ shifts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d); // local date (no TZ shift)
    return dt.toLocaleDateString();
  }
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleDateString();
};

// ---- QS helpers
function qsParams() {
  const usp = new URLSearchParams(location.search);
  const part_id = usp.get("part_id") ? Number(usp.get("part_id")) : null;
  const customer_id = usp.get("customer_id")
    ? Number(usp.get("customer_id"))
    : null;
  const part_revision_id =
    usp.get("part_revision_id") ?? usp.get("revision_id");
  return {
    part_id,
    customer_id,
    part_revision_id: part_revision_id ? Number(part_revision_id) : null,
  };
}
function buildQS(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  });
  return usp.toString();
}

// ---- header & filters scaffold (Materials panel included)
async function fetchLotsByPart() {
  const { part_id, part_revision_id } = qsParams();
  if (!part_id) return [];

  const qs = new URLSearchParams();
  qs.set("part_id", part_id);

  if (part_revision_id) {
    qs.set("revision_id", part_revision_id);
  }

  const res = await jfetch(`/api/v1/lot-summary?${qs.toString()}`);
  return res?.items || [];
}
// ===== Materials (ID-based) =====
async function fetchMaterials() {
  const { part_id } = qsParams();
  if (!part_id) return [];
  try {
    const res = await jfetch(`/parts/${part_id}/materials`);
    // Expect: { items:[{ id, material_id, code, name }] }
    materials = Array.isArray(res?.items) ? res.items : [];
  } catch (e) {
    materials = [];
    console.warn("Fetch materials failed", e);
  }
  renderMaterials();
}

function renderMaterials() {
  const list = document.getElementById("mat_list");
  if (!list) return;
  list.innerHTML = "";

  if (!materials.length) {
    const span = document.createElement("span");
    span.style.color = "#64748b";
    span.textContent = "No materials yet.";
    list.appendChild(span);
    return;
  }

  // Sort by code then name
  const rows = [...materials].sort((a, b) => {
    const ac = (a.code || "").localeCompare(b.code || "", undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return ac !== 0
      ? ac
      : (a.name || "").localeCompare(b.name || "", undefined, {
          numeric: true,
          sensitivity: "base",
        });
  });

  for (const m of rows) {
    const chip = document.createElement("span");
    chip.className = "chip--pill";
    chip.innerHTML = `
      <span>${safeText(m.name ?? "")}</span>
      <span class="x" title="Remove" data-pm-id="${m.id}">×</span>
    `;
    list.appendChild(chip);
  }

  list.querySelectorAll(".x").forEach((x) => {
    x.addEventListener("click", async () => {
      const partMatId = Number(x.dataset.pmId);
      await deletePartMaterial(partMatId);
    });
  });
}

// Add by material_id (dedupe on same material_id)
async function addMaterialById(material_id) {
  console.log("[ADD] called with", material_id);
  const { part_id } = qsParams();
  if (!part_id || !material_id) {
    console.warn("Missing ids", { part_id, material_id });
    return;
  }

  // dedupe
  if (materials.some((m) => m.material_id === material_id)) {
    toast?.("Material already added", true);
    return;
  }

  try {
    const created = await jfetch(`/parts/${part_id}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id }),
    });
    console.log("[ADD] success", created);
    if (created?.id) {
      materials.push(created);
      renderMaterials();
      toast?.("Material added", true);
    } else {
      console.warn("[ADD] unexpected response", created);
      toast?.("Add succeeded but response shape unexpected", false);
    }
  } catch (e) {
    console.error("[ADD] exception", e);
    toast?.("Failed to add material: " + (e?.message || ""), false);
  }
}

async function deletePartMaterial(partMaterialId) {
  const { part_id } = qsParams();
  if (!part_id || !partMaterialId) return;
  try {
    await jfetch(`/parts/${part_id}/materials/${partMaterialId}`, {
      method: "DELETE",
    });
    materials = materials.filter((m) => m.id !== partMaterialId);
    renderMaterials();
  } catch (e) {
    toast?.("Failed to remove material", false);
  }
}

function initMaterialAutocomplete() {
  const ip = document.getElementById("mat_ac_input");
  const btn = document.getElementById("mat_add_btn");
  if (!ip) return;

  let lastItems = []; // keep last fetched results

  const fetchItems = async (q) => {
    try {
      const res = await jfetch(MAT_LOOKUP_URL(q || ""));
      const items = Array.isArray(res?.items) ? res.items : [];
      // console.log(items)
      lastItems = items;
      return items;
    } catch (e) {
      console.warn("[AC] fetch ERROR", e);
      lastItems = [];
      return [];
    }
  };

  const getDisplayValue = (m) => (m?.code ? `${m.name ?? ""}` : m?.name ?? "");
  const renderItem = (m) => `${safeText(m?.name ?? "")}`;

  const onSelectItem = async (m) => {
    // keep the selection (you can also auto-add here if preferred)
    pendingSelectedMaterial = m || null;
  };

  attachAutocomplete(ip, {
    minChars: 0,
    fetchItems,
    getDisplayValue,
    renderItem,
    onSelectItem,
  });

  // Open menu on focus even when empty
  ip.addEventListener("focus", () => {
    if (!ip.value) {
      ip.dispatchEvent(new Event("input", { bubbles: true }));
      ip.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }
  });

  // Typing clears the previous selection
  ip.addEventListener("input", () => {
    pendingSelectedMaterial = null;
  });

  // Robust Add handler (supports selection OR typed value)
  btn?.addEventListener("click", async () => {
    let m = pendingSelectedMaterial;
    if (!m) {
      const q = ip.value.trim();
      if (!q) {
        toast?.("Type or pick a material first", false);
        return;
      }

      // Try to resolve by current input
      let items = lastItems;
      if (!items?.length) items = await fetchItems(q);

      // 1) exact match against "CODE — Name" or Name
      const qLower = q.toLowerCase();
      m =
        items.find((x) => {
          const label = getDisplayValue(x).toLowerCase();
          return (
            label === qLower || (x.name && x.name.toLowerCase() === qLower)
          );
        }) || null;

      // 2) if still not found, unique match by contains
      if (!m) {
        const filt = items.filter((x) =>
          getDisplayValue(x).toLowerCase().includes(qLower)
        );
        if (filt.length === 1) m = filt[0];
      }

      if (!m) {
        toast?.("Pick a material from the list to add", false);
        return;
      }
    }

    try {
      await addMaterialById(m.id); // add by material_id
      ip.value = "";
      pendingSelectedMaterial = null;
    } catch (e) {
      toast?.("Failed to add material", false);
    }
  });
}

// ---- lookups (fetch IDs)
async function fetchLookups() {
  const [procs, fins] = await Promise.all([
    jfetch("/lookups/processes"),
    jfetch("/lookups/finishes"),
  ]);
  lookups.processes = sortAlpha(procs?.items || [], "name");
  lookups.finishes = sortAlpha(fins?.items || [], "name");
  // console.log("Fetching lookups...", lookups);
  // find IDs for "Cutting" and "Heat Treating & Stress Relieve"
  idCutting =
    (lookups.processes.find((p) => p.name === "Cutting") || {}).id || null;
  idHeat =
    (
      lookups.processes.find(
        (p) => p.name === "Heat Treating & Stress Relieve"
      ) || {}
    ).id || null;

  // console.log("Cutting ID:", idCutting, "Heat ID:", idHeat);
}

// ---- render filters with data-id attributes (so we can save by ID)
function renderFilters() {
  const elMproc = document.getElementById("g_mproc");
  const elChem = document.getElementById("g_chem");
  const cbCut = document.getElementById("g_cutting");
  const cbHeat = document.getElementById("g_heat");

  // set ids on basic checkboxes
  if (cbCut) cbCut.dataset.id = idCutting ?? "";
  if (cbHeat) cbHeat.dataset.id = idHeat ?? "";

  // manufacturing: all processes except the two basics
  const mprocs = lookups.processes.filter(
    (p) => p.id !== idCutting && p.id !== idHeat
  );
  elMproc.innerHTML = "";
  for (const p of mprocs) {
    const l = document.createElement("label");
    l.className = "chip";
    l.innerHTML = `<input type="checkbox" data-id="${
      p.id
    }" data-kind="process"><span>${safeText(p.name)}</span>`;
    elMproc.appendChild(l);
  }

  // chemical finishing
  elChem.innerHTML = "";
  for (const f of lookups.finishes) {
    const l = document.createElement("label");
    l.className = "chip";
    l.innerHTML = `<input type="checkbox" data-id="${
      f.id
    }" data-kind="finish"><span>${safeText(f.name)}</span>`;
    elChem.appendChild(l);
  }

  // wire saving
  const saveNow = debounce(saveSelectionsToDB, 200);
  [elMproc, elChem].forEach((el) =>
    el.addEventListener("change", () => {
      applyFiltersToTable();
      saveNow();
    })
  );
  cbCut?.addEventListener("change", () => {
    applyFiltersToTable();
    saveNow();
  });
  cbHeat?.addEventListener("change", () => {
    applyFiltersToTable();
    saveNow();
  });
  document.getElementById("g_other_text")?.addEventListener(
    "input",
    debounce(() => {
      applyFiltersToTable();
      saveSelectionsToDB();
    }, 400)
  );
}

// ---- preload saved selections (GET /part-selections/{part_id})
async function preloadSelectionsIntoUI() {
  const { part_id } = qsParams();
  if (!part_id) return;
  // console.log("Preloading selections for part_id", part_id);
  try {
    const data = await jfetch(`/part-selections/${part_id}`); // { process_ids:[], finish_ids:[], others:[] }
    // console.log("Preloaded selections:", data);
    // basics
    if (idCutting && data.process_ids?.includes(idCutting)) {
      const cb = document.getElementById("g_cutting");
      if (cb) cb.checked = true;
    }
    if (idHeat && data.process_ids?.includes(idHeat)) {
      const cb = document.getElementById("g_heat");
      if (cb) cb.checked = true;
    }

    // processes
    const elMproc = document.getElementById("g_mproc");
    data.process_ids?.forEach((pid) => {
      if (pid === idCutting || pid === idHeat) return;
      const inp = elMproc?.querySelector(
        `input[type=checkbox][data-id="${pid}"]`
      );
      if (inp) inp.checked = true;
    });

    // finishes
    const elChem = document.getElementById("g_chem");
    data.finish_ids?.forEach((fid) => {
      const inp = elChem?.querySelector(
        `input[type=checkbox][data-id="${fid}"]`
      );
      if (inp) inp.checked = true;
    });

    // other (first value)
    const otherTxt = document.getElementById("g_other_text");
    if (otherTxt && Array.isArray(data.others) && data.others.length) {
      otherTxt.value = data.others[0];
    }
  } catch (e) {
    console.warn("Preload selections failed", e);
  }
}

// ---- persist selections (POST /part-selections/{part_id})
async function saveSelectionsToDB() {
  console.log("💾 saveSelectionsToDB called");
  const { part_id } = qsParams();
  if (!part_id) return;

  const elMproc = document.getElementById("g_mproc");
  const elChem = document.getElementById("g_chem");
  const cbCut = document.getElementById("g_cutting");
  const cbHeat = document.getElementById("g_heat");
  const otherTxt = document.getElementById("g_other_text");

  const procIds = new Set();
  const finIds = new Set();

  if (cbCut?.checked && cbCut.dataset.id) procIds.add(Number(cbCut.dataset.id));
  if (cbHeat?.checked && cbHeat.dataset.id)
    procIds.add(Number(cbHeat.dataset.id));

  elMproc?.querySelectorAll("input[type=checkbox]:checked").forEach((cb) => {
    const id = Number(cb.dataset.id);
    if (id) procIds.add(id);
  });

  elChem?.querySelectorAll("input[type=checkbox]:checked").forEach((cb) => {
    const id = Number(cb.dataset.id);
    if (id) finIds.add(id);
  });

  const payload = {
    process_ids: [...procIds],
    finish_ids: [...finIds],
    others: (otherTxt?.value || "").trim() ? [otherTxt.value.trim()] : [],
  };

  try {
    await jfetch(`/part-selections/${part_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    toast?.("Failed to save selections: " + (e?.message || ""), false);
  }
}

// ---- simple local filter (does not hit DB)
function applyFiltersToTable() {
  if (!table) return;
  const search = (inputSearch?.value || "").trim().toLowerCase();
  let rows = allRows;
  if (search) {
    rows = rows.filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(search)
      )
    );
  }
  table.setData(rows);
}

// ---- fetch rows & meta
async function fetchDetail() {
  const { part_id, customer_id, part_revision_id } = qsParams();
  if (!part_id || !customer_id) {
    toast?.("Missing part_id or customer_id", false);
    return { items: [], meta: null };
  }
  const qs = buildQS({
    view: "detail",
    part_id,
    customer_id,
    revision_id: part_revision_id ?? undefined,
  });
  const res = await jfetch(`/data_detail?${qs}`);
  // console.log(res);
  const items = Array.isArray(res?.items) ? res.items : [];
  const meta = res?.meta ?? null;
  return { items, meta };
}
function fmtDateMMDDYY(value) {
  if (!value) return "";
  // รองรับทั้ง "YYYY-MM-DD" และ ISO
  if (typeof value === "string") {
    const [y, m, d] = value.split("T")[0].split("-");
    return `${m}/${d}/${y.slice(2)}`;
  }
  return "";
}
// ---- Tabulator
function initTable() {
  if (!tableMount) return;
  /* global Tabulator */
  table = new Tabulator(tableMount, {
    // layout: "fitColumns",
    layout: "fitDataFill",
    height: "auto",
    placeholder: "No rows",
    index: "lot_no",
    // groupBy: "po_number",
    pagination: false,
    columns: [
      {
        title: "Lot",
        field: "lot_no",
        minWidth: 80,
        headerSort: true,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          const lotId = row.lot_id;
          const lotNo = row.lot_no || "—";
          if (!lotId) return lotNo;
          return `
      <a href="/static/lot-detail.html?lot_id=${encodeURIComponent(lotId)}"
         class="link-lot"
         style="color:#2563eb; text-decoration:underline; cursor:pointer;">
         ${lotNo}
      </a>
    `;
        },
        cellClick: (e, cell) => {
          e.preventDefault(); // ✅ ป้องกัน reload หน้า
          const row = cell.getRow().getData();
          const lotId = row.lot_id;
          if (!lotId) return toast("No lot ID found", false);
          window.location.href = `/static/lot-detail.html?lot_id=${encodeURIComponent(
            lotId
          )}`;
        },
      },
      {
        title: "PO",
        field: "po_number",
        width: 80,
          headerSort: true,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          const poNumber = row.po_number || "—";
          const poId = row.po_id;
          if (!poId) return poNumber;

          // clickable link
          return `<a href="/static/manage-pos-detail.html?id=${encodeURIComponent(
            poId
          )}" 
              class="link-po" 
              style="color:#2563eb; text-decoration:underline; cursor:pointer;">
              ${poNumber}
            </a>`;
        },
        cellClick: (e, cell) => {
          e.preventDefault(); // prevent default <a> navigation
          const row = cell.getRow().getData();
          const poId = row.po_id;
          if (!poId) return toast("No PO ID found", false);
          window.location.href = `/static/manage-pos-detail.html?id=${encodeURIComponent(
            poId
          )}`;
        },
      },
      {
        title: "Rev",
        field: "revision_code",
        width: 70,
        hozAlign: "center",
        
      },
     {
  title: "Prod<br>Qty",
  field: "lot_qty",
  width: 110,
  hozAlign: "center",
  headerHozAlign: "center",

  formatter: (cell) => {
    const r = cell.getRow().getData();
    const lotId = r.lot_id;
    const qty = fmtQty(r.lot_qty);

    if (!lotId) return qty ?? "—";

    return `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        white-space:nowrap;
      ">
        <span style="font-weight:600;">
          ${qty}
        </span>

        <span data-action="traveler"
              title="Traveler"
              style="cursor:pointer;">
          🧾
        </span>

        <span data-action="materials"
              title="Materials"
              style="cursor:pointer;">
          🔩
        </span>
      </div>
    `;
  },

  cellClick: async (e, cell) => {
    const action = e.target?.dataset?.action;
    if (!action) return;

    e.preventDefault();

    const r = cell.getRow().getData();
    const lotId = r.lot_id;
    if (!lotId) return toast("No lot ID found", false);

    try {
      if (action === "traveler") {
        const res = await fetch(
          `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/material-id`
        );
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();

        if (!data.traveler_id) {
          toast("❌ Traveler not found", false);
          return;
        }

        window.location.href =
          `/static/traveler-detail.html?id=${encodeURIComponent(
            data.traveler_id
          )}`;

      } else if (action === "materials") {
        window.location.href =
          `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(lotId)}`;
      }

    } catch (err) {
      toast("⚠️ Action failed", false);
      console.error(err);
    }
  },
},

      // {
      //   title: "Prod allocate",
      //   field: "lot_qty",
      //   width: 100,
      //   hozAlign: "right",
      //   headerHozAlign: "right",
      //   formatter: (cell) => fmtQty(cell.getValue()),
      // },
      {
  title: "Prod<br>Date",
  minWidth: 80,
  sorter: "string",
  formatter: (cell) => {
    const r = cell.getRow().getData();
    const created = fmtDateMMDDYY(r.created_at);
    const due = fmtDateMMDDYY(r.lot_due_date);

    if (!created && !due) return "—";
    if (created && !due) return created;
    if (!created && due) return due;

    return `${created} →<br> ${due}`;
  },
},

      {
  title: "PO(Rem)<br>QTY",
  field: "po_qty_total",
  width: 120,
  hozAlign: "center",
  formatter: (cell) => {
    const r = cell.getRow().getData();

    const shipped = r.po_shipped_total ?? 0;
    const total   = r.po_qty_total ?? 0;
    const remain  = r.po_remaining_qty ?? (total - shipped);

    // สีตามสถานะ
    let bg = "#6b7280"; // gray
    if (shipped === 0) bg = "#ef4444";              // not shipped
    else if (remain > 0) bg = "#f59e0b";            // partial
    else if (remain === 0) bg = "#10b981";          // complete
    else bg = "#7c3aed";                             // overship

    // format remain
    const remText =
      remain < 0 ? `-${Math.abs(remain)}` : remain;

    return `
      <span style="
        background:${bg};
        color:white;
        padding:4px 10px;
        border-radius:8px;
        font-weight:600;
        display:inline-block;
      
        text-align:center;
      ">
         ${total} (${remText})
      </span>
    `;
  },
} ,
      {
  title: "PO<br>Date",
  minWidth: 80,
  hozAlign: "center",
  headerHozAlign: "center",
  // sorter: "string",
  formatter: (cell) => {
    const r = cell.getRow().getData();
    const poDate = fmtDateMMDDYY(r.lot_po_date);
    const dueDate = fmtDateMMDDYY(r.po_due_date);

    if (!poDate && !dueDate) return "—";
    if (poDate && !dueDate) return poDate;
    if (!poDate && dueDate) return dueDate;

    return `${poDate} →<br> ${dueDate}`;
  },
},

     
      {
  title: "Ship<br>QTY",
  width: 110,
  field: "lot_shipped_qty",
  hozAlign: "center",
        headerHozAlign: "center",

  formatter: (cell) => {
    const d = cell.getRow().getData();
    const shipped = d.lot_shipped_qty ?? 0;

    if (!d.lot_id) return shipped;

    const url = `http://100.88.56.126:9000/static/manage-lot-shippments.html?lot_id=${d.lot_id}`;

    return `
      <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
        <span>${shipped}</span>
        <a href="${url}"
           target="_blank"
           title="Open shipment"
           style="text-decoration:none; font-size:14px;">
           📦 
        </a>
      </div>
    `;
  }
}
,
 
//        {
//   title: "Actions",
//   width: 200,
//   hozAlign: "center",
//   headerHozAlign: "center",
//   formatter: (cell) => {
//     const row = cell.getRow().getData();
//     const lotId = row.lot_id;
//     if (!lotId) return "—";

//     return `
//       <span class="action-links" data-lot-id="${lotId}">
//         <a href="#" data-action="traveler" class="link-blue">Traveler</a>
//         <span style="color:#9ca3af;"> | </span>
//         <a href="#" data-action="materials" class="link-blue">Materials</a>
//         <span style="color:#9ca3af;"> | </span>
//         <a href="#" data-action="shipments" class="link-blue">Ship</a>
//       </span>
//     `;
//   },

//   cellClick: async (e, cell) => {
//     e.preventDefault();

//     const row = cell.getRow().getData();
//     const lotId = row.lot_id;
//     if (!lotId) return toast("No lot ID found", false);

//     const action = e.target?.dataset?.action;
//     if (!action) return;

//     try {
//       if (action === "traveler") {
//         const res = await fetch(
//           `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/material-id`
//         );
//         if (!res.ok) throw new Error("Server error");
//         const data = await res.json();

//         if (!data.traveler_id) {
//           toast("❌ Traveler not found", false);
//           return;
//         }

//         window.location.href =
//           `/static/traveler-detail.html?id=${encodeURIComponent(
//             data.traveler_id
//           )}`;

//       } else if (action === "materials") {
//         window.location.href =
//           `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(lotId)}`;

//       } else if (action === "shipments") {
//         window.location.href =
//           `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(lotId)}`;
//       }

//     } catch (err) {
//       toast("⚠️ Action failed", false);
//       console.error(err);
//     }
//   },
// },
      {
        title: "🧾",
        width: 80,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          const lotId = row.lot_id;
          if (!lotId) return "—";
          return `
      <a href="#" class="link-blue"
         style="color:#2563eb; text-decoration:underline; cursor:pointer;">
         Travelers
      </a>
    `;
        },
        cellClick: async (e, cell) => {
          e.preventDefault();
          const row = cell.getRow().getData();
          const lotId = row.lot_id;
          if (!lotId) return toast("No lot ID found", false);

          try {
            const res = await fetch(
              `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/material-id`
            );
            if (!res.ok) throw new Error("Server error");
            const data = await res.json();

            if (!data.traveler_id) {
              toast("❌ Traveler not found", false);
              return;
            }
            window.location.href = `/static/traveler-detail.html?id=${encodeURIComponent(
              data.traveler_id
            )}`;
          } catch (err) {
            toast("⚠️ Failed to fetch traveler id", false);
            console.error(err);
          }
        },
      },

     
      {
  title: "🔩",
  minWidth: 120,
  hozAlign: "left",
  headerHozAlign: "center",

  formatter: (cell) => {
    const row = cell.getRow().getData();
    const lotId = row.lot_id;
    const batches = row.batch_no_list;

    if (!lotId) return "—";

    const batchHtml = batches
      ? batches
          .split(",")
          .map(b => b.trim())
          .join("<br>")
      : "<span style='color:#9ca3af;'>No batch</span>";

    return `
      <div style="line-height:1.35;">
        <a href="/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
          lotId
        )}"
           class="link-blue"
           style="font-weight:600;">
           Materials
        </a>
        <br>
        <span style="font-size:12px; color:#374151;">
          ${batchHtml}
        </span>
      </div>
    `;
  },

  cellClick: (e, cell) => {
    e.preventDefault();

    const lotId = cell.getRow().getData().lot_id;
    if (!lotId) return toast("No lot ID found", false);

    // คลิกตรงไหนก็เข้า Materials
    window.location.href =
      `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(lotId)}`;
  },
},

    //   {
    //     title: "🚚",
    //     width: 90,
    //     formatter: (cell) => {
    //       const row = cell.getRow().getData();
    //       const lotId = row.lot_id;
    //       if (!lotId) return "—";
    //       return `
    //   <a href="/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
    //     lotId
    //   )}"
    //      class="link-blue"
    //      style="color:#2563eb; text-decoration:underline; cursor:pointer;">
    //      Shippment
    //   </a>
    // `;
    //     },
    //     cellClick: (e, cell) => {
    //       e.preventDefault();
    //       const row = cell.getRow().getData();
    //       const lotId = row.lot_id;
    //       if (!lotId) return toast("No lot ID found", false);
    //       window.location.href = `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
    //         lotId
    //       )}`;
    //     },
    //   },

      // placeholders...
      {
        title: "FAIR",
        field: "fair_note",
        minWidth: 50,
        headerSort: false,
        
      },
     
      {
  title: "Tracking no.",
  field: "tracking_no_list",
  minWidth: 100,
  headerSort: true,
  formatter: (cell) => {
    const v = cell.getValue();
    if (!v) return "";
    return v.split(",").map(s => s.trim()).join("<br>");
  },
},

     {
  title: "Shipped<br>Date",
  field: "shipped_at_list",
  minWidth: 100,
  headerSort: true,
  formatter: (cell) => {
    const v = cell.getValue();
    if (!v) return "";

    // backend ส่งมาเป็น "YYYY-MM-DD, YYYY-MM-DD"
    return v
      .split(",")
      .map(s => fmtDateMMDDYY(s.trim()))
      .join("<br>");
  },
},
     
    ],
  });
}

// ---- load header meta (no side-effects)
function fillHeaderMeta(meta) {
  // console.log("Filling header meta", meta);
  const elPartNo = document.getElementById("h_part_no");
  const elPartName = document.getElementById("h_part_name");
  const elPartRev = document.getElementById("h_part_rev");
  const elCust = document.getElementById("h_customer");
  const p = meta?.part || {};
  const r = meta?.revision || {};
  const c = meta?.customer || {};
  elPartNo.textContent = p.part_no ?? "—";
  elPartName.textContent = p.name ?? "—";
  elPartRev.textContent = r.rev ?? "—";
  elCust.textContent = c.code || c.name || "—";
}

// // ---- load
// async function loadData() {
//   console.log("TESTTTT")
//   const { metatest } = await fetchDetail();   // เอาไว้เติม header
//   const lotstest = await fetchLotsByPart();   // 👈 lot ของ part นี้

//   allRows = lots;
//   console.log("metatest",metatest)
//   console.log("lotstest",lotstest)
//   table?.setData(lotstest);

//   // const { items, meta } = await fetchDetail();
//   // console.log("LOADDDD")
//   // console.log(items,meta)
//   // allRows = items;
//   // fillHeaderMeta(meta);
//   // table?.setData(items);


//   applyFiltersToTable();
// }
async function loadData() {
  const { meta } = await fetchDetail();   // header meta
  const lots = await fetchLotsByPart();   // lot ของ part นี้
  console.log("LOTS",lots)
  allRows = lots;                         // ✅ ตัวแปรที่ประกาศไว้
  fillHeaderMeta(meta);

  table?.setData(lots);
  applyFiltersToTable();
}

// ---- search
function onSearchChange() {
  currentSearch = (inputSearch?.value || "").trim();
  applyFiltersToTable();
}

/* ---------- boot ---------- */
inputSearch?.addEventListener("input", debounce(onSearchChange, 250));

document.addEventListener("DOMContentLoaded", async () => {
  initTopbar();
  initTable();
  await loadData(); // โหลดตารางให้เร็วที่สุด

  // ทำ background tasks ทีหลัง
  setTimeout(async () => {
    await fetchLookups();
    renderFilters();
    await preloadSelectionsIntoUI();
    initMaterialAutocomplete();
    await fetchMaterials();
  }, 50);
});
// document.addEventListener("DOMContentLoaded", async () => {
//   console.log("part-detail");
//   initTopbar?.();

//   initTable();
//   try {
//     await fetchLookups(); // 1) get IDs for process/finish
//     renderFilters(); // 2) checkboxes
//     await loadData(); // 3) table + header
//     await preloadSelectionsIntoUI(); // 4) pre-check boxes

//     // 5) Materials (autocomplete + initial list)
//     initMaterialAutocomplete();
//     await fetchMaterials();
//   } catch (e) {
//     toast?.(e?.message || "Init failed", false);
//   }
// });
