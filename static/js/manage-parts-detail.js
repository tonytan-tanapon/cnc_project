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

// ---- styles (once)
(() => {
  if (!document.getElementById("parts-detail-styles")) {
    const st = document.createElement("style");
    st.id = "parts-detail-styles";
    st.textContent = `
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.04);margin-bottom:12px}
      .card .hd{padding:12px 14px;border-bottom:1px solid #eef2f7;font-weight:700}
      .card .bd{padding:12px 14px}
      .fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .f .lab{font-size:12px;color:#64748b;margin-bottom:4px}
      .f .val{font-size:16px;font-weight:600}
      .filters{display:flex;flex-wrap:wrap;align-items:center;gap:16px}
      .fg{border:none;padding:0;background:transparent}
      .ttl-inline{font-weight:700;margin-right:8px;font-size:13px;color:#0f172a}
      .chips{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
      .chip{display:inline-flex;align-items:center;gap:6px;padding:0;margin:0;background:transparent;border:none;white-space:nowrap}
      .chip input{margin-right:6px}
      .fg input[type="text"]{width:320px;max-width:40vw;height:32px;border:1px solid #e5e7eb;border-radius:8px;padding:4px 8px}
      .tabulator .tabulator-footer{display:none}

      /* header grid: left=Part detail, right=Materials */
      .header-grid{display:grid;grid-template-columns:1.5fr .9fr;gap:12px}
      .mat-card .hd{display:flex;justify-content:space-between;align-items:center}
      .mat-row{display:flex;gap:8px;align-items:center;margin-top:8px; position: relative; overflow: visible;}
      .mat-row input[type="text"]{flex:1;height:32px;border:1px solid #e5e7eb;border-radius:8px;padding:4px 8px}
      .btn{border:1px solid #e5e7eb;background:#0ea5e9;color:#fff;border-radius:8px;padding:6px 10px;font-weight:600;cursor:pointer}
      .chips-wrap{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
      .chip--pill{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc}
      .chip--pill .x{cursor:pointer;font-weight:700;line-height:1}

      /* Prevent AC menu from being clipped */
      .header-grid, .mat-card, .mat-card .bd { overflow: visible; }

      /* Common autocomplete class names layered high */
      .ac-menu, .ac-list, .autocomplete-menu { position: absolute; z-index: 99999; }
    `;
    document.head.appendChild(st);
  }
})();

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
function ensureHeaderCard() {
  let wrap = document.getElementById("p_header");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.id = "p_header";
  wrap.className = "card";
  wrap.innerHTML = `
   
      <div class="header-grid">
        <!-- LEFT: Part meta + Filters -->
       
          <div class="bd">
            <div class="fields">
              <div class="f"><div class="lab">Part No</div>   <div id="h_part_no"   class="val">—</div></div>
              <div class="f"><div class="lab">Part Name</div> <div id="h_part_name" class="val">—</div></div>
              <div class="f"><div class="lab">Revision</div>  <div id="h_part_rev"  class="val">—</div></div>
              <div class="f"><div class="lab">Customer</div>  <div id="h_customer"  class="val">—</div></div>
            </div>
          </div>
          <div class="hd">Filters</div>
          <div class="bd">
            <div id="filters_panel" class="filters">
              <!-- Cutting & Heat -->
              <div class="fg" id="fg_basic">
                <div class="chips">
                  <label class="chip"><input type="checkbox" id="g_cutting"><span>Cutting</span></label>
                  <label class="chip"><input type="checkbox" id="g_heat"><span>Heat Treating & Stress Relieve</span></label>
                </div>
              </div>
              <!-- Manufacturing Processes group -->
              <div class="fg" id="fg_mproc">
                <div class="chips">
                  <span class="ttl-inline">Manufacturing Processes</span>
                  <span id="g_mproc"></span>
                </div>
              </div>
              <!-- Chemical Finishing group -->
              <div class="fg" id="fg_chem">
                <div class="chips">
                  <span class="ttl-inline">Chemical Finishing</span>
                  <span id="g_chem"></span>
                </div>
              </div>
              <!-- Other -->
              <div class="fg" id="fg_other">
                <div class="chips">
                  <span class="ttl-inline">Other</span>
                  <textarea id="g_other_text" 
                            placeholder="Type other process / keyword..." 
                            rows="4"></textarea>
                </div>
              </div>
            </div>
          </div>
      

        <!-- RIGHT: Materials -->
        <div class="card mat-card">
          <div class="hd"><span>Materials</span></div>
          <div class="bd">
            <div class="mat-row">
              <input type="text" id="mat_ac_input" placeholder="Search material by code or name…" />
              <button class="btn" id="mat_add_btn" title="Add selected material">Add</button>
            </div>
            <div id="mat_list" class="chips-wrap"></div>
          </div>
        </div>
      </div>
   
  `;

  const anchor = inputSearch?.closest(".toolbar") || inputSearch || tableMount;
  if (anchor?.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
  else if (tableMount?.parentNode)
    tableMount.parentNode.insertBefore(wrap, tableMount);
  else document.body.prepend(wrap);
  return wrap;
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
      <span>${
        m.code ? `<strong>${safeText(m.code)}</strong> — ` : ""
      }${safeText(m.name ?? "")}</span>
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

  const getDisplayValue = (m) =>
    m?.code ? `${m.code} — ${m.name ?? ""}` : m?.name ?? "";
  const renderItem = (m) =>
    `${m?.code ? `<strong>${safeText(m.code)}</strong> — ` : ""}${safeText(
      m?.name ?? ""
    )}`;

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
      await addMaterialById(m.id);
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

  // find IDs for "Cutting" and "Heat Treating & Stress Relieve"
  idCutting =
    (lookups.processes.find((p) => p.name === "Cutting") || {}).id || null;
  idHeat =
    (
      lookups.processes.find(
        (p) => p.name === "Heat Treating & Stress Relieve"
      ) || {}
    ).id || null;
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

  try {
    const data = await jfetch(`/part-selections/${part_id}`); // { process_ids:[], finish_ids:[], others:[] }

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
  console.log(res);
  const items = Array.isArray(res?.items) ? res.items : [];
  const meta = res?.meta ?? null;
  return { items, meta };
}

// ---- Tabulator
function initTable() {
  if (!tableMount) return;
  /* global Tabulator */
  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "auto",
    placeholder: "No rows",
    index: "lot_no",
    // groupBy: "po_number",
    pagination: false,
    columns: [
      {
        title: "Lot Number",
        field: "lot_no",
        minWidth: 120,
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
        title: "PO No",
        width: 100,
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
        title: "Prod Qty",
        field: "lot_qty",
        width: 100,
        hozAlign: "right",
        headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue()),
      },
      {
        title: "Prod allocate",
        field: "lot_qty",
        width: 100,
        hozAlign: "right",
        headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue()),
      },
      {
        title: "Prod Date",
        field: "lot_due_date",
        minWidth: 100,
        sorter: "date",
        formatter: (cell) => fmtDate(cell.getValue()),
      },
      {
        title: "PO Qty",
        field: "qty",
        width: 110,
        hozAlign: "right",
        headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue()),
      },
      {
        title: "PO Date",
        field: "po_due_date",
        minWidth: 130,
        sorter: "date",
        formatter: (cell) => fmtDate(cell.getValue()),
      },
      {
        title: "Ship Qty",
        field: "qty",
        width: 110,
        hozAlign: "right",
        headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue()),
      },
      {
        title: "Materials",
        width: 110,
        formatter: () =>
          `<button class="btn-mini btn-primary">Materials</button>`,
        cellClick: (e, cell) => {
          const row = cell.getRow().getData();
          const lotId = row.lot_id; // ✅ available now
          if (!lotId) return toast("No lot ID found", false);

          window.location.href = `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
            lotId
          )}`;
        },
      },

      {
        title: "Travelers",
        field: "travelers",
        width: 120,
        hozAlign: "center",
        headerSort: false,
        formatter: () =>
          `<button class="btn-mini btn-primary" data-act="travelers">travelers</button>`,
        cellClick: async (e, cell) => {
          console.log("End");
          const row = cell.getRow().getData();
          const lotId = row.lot_id;
          if (!lotId) return toast("No lot ID found", false);

          try {
            // ✅ call server to get material id
            const res = await fetch(
              `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/material-id`
            );
            console.log("Response status:", res.status);

            if (!res.ok) throw new Error("Server error");

            // 🧠 Parse response body
            const data = await res.json();
            console.log("✅ Data from server:", data);

            if (!data.traveler_id) {
              toast("❌ Material ID not found", false);
              return;
            }

            // Optional delay (for UX smoothness)
            await new Promise((r) => setTimeout(r, 300));

            // Redirect using material ID
            window.location.href = `/static/traveler-detail.html?id=${encodeURIComponent(
              data.traveler_id
            )}`;
          } catch (err) {
            toast("⚠️ Failed to fetch material id", false);
            console.error(err);
          }
        },
      },
      {
        title: "Shippments",
        field: "shippments",
        width: 120,
        hozAlign: "center",
        headerSort: false,
        formatter: () =>
          `<button class="btn-mini btn-primary" data-act="shippments">shippments</button>`,
        cellClick: (e, cell) => {
          const row = cell.getRow().getData();
          const lotId = row.lot_id; // ✅ available now
          if (!lotId) return toast("No lot ID found", false);

          window.location.href = `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
            lotId
          )}`;
        },
      },
      // placeholders...
      {
        title: "FAIR",
        field: "",
        minWidth: 50,
        headerSort: false,
        formatter: () => "",
      },
      {
        title: "*Remark Product Control",
        field: "",
        minWidth: 100,
        headerSort: false,
        formatter: () => "",
      },
      {
        title: "Tracking no.",
        field: "",
        minWidth: 100,
        headerSort: false,
        formatter: () => "",
      },
      {
        title: "Real Shipped Date",
        field: "",
        minWidth: 100,
        headerSort: false,
        formatter: () => "",
      },
      {
        title: "INCOMING STOCK",
        field: "",
        minWidth: 100,
        headerSort: false,
        formatter: () => "",
      },
    ],
  });
}

// ---- load header meta (no side-effects)
function fillHeaderMeta(meta) {
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

// ---- load
async function loadData() {
  const { items, meta } = await fetchDetail();
  allRows = items;
  fillHeaderMeta(meta);
  table?.setData(items);
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
  console.log("part-detail");
  initTopbar?.();
  ensureHeaderCard();
  initTable();
  try {
    await fetchLookups(); // 1) get IDs for process/finish
    renderFilters(); // 2) checkboxes
    await loadData(); // 3) table + header
    await preloadSelectionsIntoUI(); // 4) pre-check boxes

    // 5) Materials (autocomplete + initial list)
    initMaterialAutocomplete();
    await fetchMaterials();
  } catch (e) {
    toast?.(e?.message || "Init failed", false);
  }
});
