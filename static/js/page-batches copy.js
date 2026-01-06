// /static/js/page-batches.js — AUTOSAVE + Tab/Shift+Tab + Undo/Redo + Delete-only
// with Material & Supplier autocompletes (attachAutocomplete), display caches,
// label preservation, and FIRST-LOAD LABEL HYDRATION via batched ID lookups.
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/batches",
  byId: (id) => `/batches/${encodeURIComponent(id)}`,
  // Optional (best): provide a bulk lookup endpoint; we’ll try multiple shapes below.
  // materials: { bulk: "/materials/lookup?ids=", one: (id)=>`/materials/${id}` }
  // suppliers: { bulk: "/suppliers/lookup?ids=", one: (id)=>`/suppliers/${id}` }
};
const DETAIL_PAGE = "./batches-detail.html";
const batchDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

const JSON_HEADERS = { "Content-Type": "application/json" };
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== Pagination (client-emulated "Show All" default) ===== */
const DEFAULT_PAGE_SIZE = true; // true = Show All
const PAGE_SIZE_CHOICES = [20, 50, 100, 200, true];

/* ===== STATE ===== */
let els = {};
let table = null;
let cacheAll = []; // /batches returns an array
let totalItems = 0;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map(); // row -> timeout
const PATCH_DEBOUNCE_MS = 350;
const suppressAutosaveRows = new WeakSet();

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const toDecOrNullStr = (v) => {
  const s = trim(v);
  if (s === "") return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return String(s); // keep as string for backend Decimal
};
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
};
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");

/* ===== DISPLAY CACHES populated by autocomplete/search/pick/lookup ===== */
const matById = new Map(); // id -> {id, code, name, spec}
const supById = new Map(); // id -> {id, code, name}

/* Normalize one record coming from the backend into the row shape we use */
function normalizeRow(r) {
  // related objects if present
  const mat = r.material || null;
  const sup = r.supplier || null;

  // push into caches if we got related objects
  if (mat?.id != null) {
    matById.set(Number(mat.id), {
      id: Number(mat.id),
      code: (mat.code ?? "").toString().toUpperCase(),
      name: mat.name ?? "",
      spec: mat.spec ?? "",
    });
  }
  if (sup?.id != null) {
    supById.set(Number(sup.id), {
      id: Number(sup.id),
      code: (sup.code ?? "").toString().toUpperCase(),
      name: sup.name ?? "",
    });
  }

  const matCode = (mat?.code ?? r.material_code ?? "").toString().toUpperCase();
  const matName = mat?.name ?? r.material_name ?? "";
  const matSpec = mat?.spec ?? r.material_spec ?? "";
  const matDisp =
    r.material_disp ??
    (matCode || matName || matSpec
      ? `${matCode}${matName ? " — " + matName : ""}${
          matSpec ? " (" + matSpec + ")" : ""
        }`
      : "");

  const supCode = (sup?.code ?? r.supplier_code ?? "").toString().toUpperCase();
  const supName = sup?.name ?? r.supplier_name ?? "";
  const supDisp =
    r.supplier_disp ??
    (supCode || supName ? `${supCode}${supName ? " — " + supName : ""}` : "");

  return {
    id: r.id ?? r.batch_id ?? r.batchId ?? null,
    batch_no: r.batch_no ?? "",

    // material
    material_id: r.material_id ?? mat?.id ?? null,
    material_code: matCode,
    material_name: matName,
    material_spec: matSpec,
    material_disp: matDisp,

    // supplier
    supplier_id: r.supplier_id ?? sup?.id ?? null,
    supplier_code: supCode,
    supplier_name: supName,
    supplier_disp: supDisp,

    supplier_batch_no: r.supplier_batch_no ?? "",
    mill_name: r.mill_name ?? "",
    mill_heat_no: r.mill_heat_no ?? "",
    received_at: r.received_at ?? "", // YYYY-MM-DD (string)
    qty_received: r.qty_received ?? "",
    qty_used: r.qty_used ?? "",
    location: r.location ?? "",
    status: r.status ?? "active",
  };
}

/* ===== SERVER SEARCH (autocomplete) ===== */
async function fetchMaterials(term) {
  const q = (term || "").trim();
  try {
    const res = !q
      ? await jfetch(`/materials/keyset?limit=10`)
      : await jfetch(
          `/materials?q=${encodeURIComponent(q)}&page=1&page_size=10`
        );
    const items = Array.isArray(res) ? res : res.items ?? [];
    const mapped = items
      .map((m) => ({
        id: m.id ?? m.material_id ?? m.mat_id,
        code: (m.code ?? m.material_code ?? "").toString().toUpperCase(),
        name: m.name ?? m.material_name ?? "",
        spec: m.spec ?? m.material_spec ?? "",
      }))
      .filter((x) => x.id != null);
    for (const it of mapped) matById.set(Number(it.id), it);
    return mapped;
  } catch {
    return [];
  }
}

async function fetchSuppliers(term) {
  const q = (term || "").trim();
  try {
    const res = !q
      ? await jfetch(`/suppliers?limit=10`)
      : await jfetch(
          `/suppliers?q=${encodeURIComponent(q)}&page=1&page_size=10`
        );
    const items = Array.isArray(res) ? res : res.items ?? [];
    const mapped = items
      .map((s) => ({
        id: s.id ?? s.supplier_id,
        code: (s.code ?? s.supplier_code ?? "").toString().toUpperCase(),
        name: s.name ?? s.supplier_name ?? "",
      }))
      .filter((x) => x.id != null);
    for (const it of mapped) supById.set(Number(it.id), it);
    return mapped;
  } catch {
    return [];
  }
}

/* ===== Autocomplete Editors (Material & Supplier) ===== */
function materialEditor(cell, onRendered, success, cancel) {
  const start = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = start;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchMaterials,
    getDisplayValue: (it) =>
      it
        ? `${it.code}${it.name ? " — " + it.name : ""}${
            it.spec ? " (" + it.spec + ")" : ""
          }`
        : "",
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b>${
        it.name ? " — " + safe(it.name) : ""
      }${it.spec ? " (" + safe(it.spec) + ")" : ""}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,

    onPick: (it) => {
      // 1) commit the visible cell first => creates a proper history entry
      const label = `${it.code}${it.name ? " — " + it.name : ""}${
        it.spec ? " (" + it.spec + ")" : ""
      }`;
      success(label);

      // 2) then update the backing fields without creating history/autosave loops
      const row = cell.getRow();
      matById.set(Number(it.id), it);
      suppressAutosaveRows.add(row);
      try {
        row.update({
          material_id: it.id,
          material_code: it.code,
          material_name: it.name,
          material_spec: it.spec,
          material_disp: label, // for good measure
        });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }

      // 3) fire save immediately (debounced upstream)
      setTimeout(() => autosaveCell(cell), 0);
    },
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const d = cell.getRow().getData();
      if (!d.material_id && !input.value.trim()) {
        toast("Pick a material from the list", false);
        return;
      }
      // Commit whatever is in the input (history entry)
      success(input.value);
      // Save right away
      setTimeout(() => autosaveCell(cell), 0);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    // User started typing; invalidate until a pick
    const row = cell.getRow();
    suppressAutosaveRows.add(row);
    try {
      row.update({ material_id: null });
    } finally {
      setTimeout(() => suppressAutosaveRows.delete(row), 0);
    }
  });

  return input;
}

function supplierEditor(cell, onRendered, success, cancel) {
  const start = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = start;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchSuppliers,
    getDisplayValue: (it) =>
      it ? `${it.code}${it.name ? " — " + it.name : ""}` : "",
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b>${
        it.name ? " — " + safe(it.name) : ""
      }</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,

    onPick: (it) => {
      // 1) commit the visible cell first (history)
      const label = `${it.code}${it.name ? " — " + it.name : ""}`;
      success(label);

      // 2) update backing fields quietly
      const row = cell.getRow();
      supById.set(Number(it.id), it);
      suppressAutosaveRows.add(row);
      try {
        row.update({
          supplier_id: it.id,
          supplier_code: it.code,
          supplier_name: it.name,
          supplier_disp: label,
        });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }

      // 3) save right away
      setTimeout(() => autosaveCell(cell), 0);
    },
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const d = cell.getRow().getData();
      if (!d.supplier_id && !input.value.trim()) {
        toast("Pick a supplier from the list", false);
        return;
      }
      success(input.value);
      setTimeout(() => autosaveCell(cell), 0);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    const row = cell.getRow();
    suppressAutosaveRows.add(row);
    try {
      row.update({ supplier_id: null });
    } finally {
      setTimeout(() => suppressAutosaveRows.delete(row), 0);
    }
  });

  return input;
}


/* ===== Formatters that fall back to cache when *_disp is empty ===== */
function fmtMaterialDisp(cell) {
  const d = cell.getRow().getData();
  if (d.material_disp) return safe(d.material_disp);
  const m = matById.get(Number(d.material_id));
  if (!m) return "";
  const label = `${m.code}${m.name ? " — " + m.name : ""}${
    m.spec ? " (" + m.spec + ")" : ""
  }`;
  return safe(label);
}
function fmtSupplierDisp(cell) {
  const d = cell.getRow().getData();
  if (d.supplier_disp) return safe(d.supplier_disp);
  const s = supById.get(Number(d.supplier_id));
  if (!s) return "";
  const label = `${s.code}${s.name ? " — " + s.name : ""}`;
  return safe(label);
}

/* ===== Label Hydration (first load & any reload) ===== */
/* Try to batch fetch labels by IDs. We attempt a few common endpoints and gracefully fall back. */
async function fetchMaterialsByIds(ids) {
  const need = ids.filter((id) => id != null && !matById.has(Number(id)));
  if (!need.length) return;
  const idList = [...new Set(need.map((x) => Number(x)))];

  // Attempt 1: GET /materials/lookup?ids=1,2,3
  try {
    const res = await jfetch(`/materials/lookup?ids=${encodeURIComponent(idList.join(","))}`);
    const arr = Array.isArray(res) ? res : res.items ?? [];
    for (const m of arr) {
      const it = {
        id: m.id ?? m.material_id ?? m.mat_id,
        code: (m.code ?? m.material_code ?? "").toString().toUpperCase(),
        name: m.name ?? m.material_name ?? "",
        spec: m.spec ?? m.material_spec ?? "",
      };
      if (it.id != null) matById.set(Number(it.id), it);
    }
    // If we got anything, we’re good. If not, we’ll fall through to per-id.
    if ([...arr].length) return;
  } catch {}

  // Attempt 2: POST /materials/bulk {ids:[...]} (comment in/out if you support it)
  try {
    const res = await jfetch(`/materials/bulk`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ ids: idList }),
    });
    const arr = Array.isArray(res) ? res : res.items ?? [];
    for (const m of arr) {
      const it = {
        id: m.id ?? m.material_id ?? m.mat_id,
        code: (m.code ?? m.material_code ?? "").toString().toUpperCase(),
        name: m.name ?? m.material_name ?? "",
        spec: m.spec ?? m.material_spec ?? "",
      };
      if (it.id != null) matById.set(Number(it.id), it);
    }
    if ([...arr].length) return;
  } catch {}

  // Attempt 3: GET per-id /materials/{id}
  await Promise.all(
    idList.map(async (id) => {
      if (matById.has(id)) return;
      try {
        const m = await jfetch(`/materials/${encodeURIComponent(id)}`);
        const it = {
          id: m.id ?? m.material_id ?? m.mat_id ?? id,
          code: (m.code ?? m.material_code ?? "").toString().toUpperCase(),
          name: m.name ?? m.material_name ?? "",
          spec: m.spec ?? m.material_spec ?? "",
        };
        matById.set(Number(it.id), it);
      } catch {}
    })
  );
}

async function fetchSuppliersByIds(ids) {
  const need = ids.filter((id) => id != null && !supById.has(Number(id)));
  if (!need.length) return;
  const idList = [...new Set(need.map((x) => Number(x)))];

  // Attempt 1: GET /suppliers/lookup?ids=1,2,3
  try {
    const res = await jfetch(`/suppliers/lookup?ids=${encodeURIComponent(idList.join(","))}`);
    const arr = Array.isArray(res) ? res : res.items ?? [];
    for (const s of arr) {
      const it = {
        id: s.id ?? s.supplier_id,
        code: (s.code ?? s.supplier_code ?? "").toString().toUpperCase(),
        name: s.name ?? s.supplier_name ?? "",
      };
      if (it.id != null) supById.set(Number(it.id), it);
    }
    if ([...arr].length) return;
  } catch {}

  // Attempt 2: POST /suppliers/bulk {ids:[...]} (comment in/out if you support it)
  try {
    const res = await jfetch(`/suppliers/bulk`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ ids: idList }),
    });
    const arr = Array.isArray(res) ? res : res.items ?? [];
    for (const s of arr) {
      const it = {
        id: s.id ?? s.supplier_id,
        code: (s.code ?? s.supplier_code ?? "").toString().toUpperCase(),
        name: s.name ?? s.supplier_name ?? "",
      };
      if (it.id != null) supById.set(Number(it.id), it);
    }
    if ([...arr].length) return;
  } catch {}

  // Attempt 3: GET per-id /suppliers/{id}
  await Promise.all(
    idList.map(async (id) => {
      if (supById.has(id)) return;
      try {
        const s = await jfetch(`/suppliers/${encodeURIComponent(id)}`);
        const it = {
          id: s.id ?? s.supplier_id ?? id,
          code: (s.code ?? s.supplier_code ?? "").toString().toUpperCase(),
          name: s.name ?? s.supplier_name ?? "",
        };
        supById.set(Number(it.id), it);
      } catch {}
    })
  );
}

/* Hydrate labels for a page worth of rows (run inside ajaxRequestFunc before returning) */
async function ensureLabelsForRows(rows) {
  const matIds = [];
  const supIds = [];
  for (const r of rows) {
    if (!r.material_disp && r.material_id != null) matIds.push(r.material_id);
    if (!r.supplier_disp && r.supplier_id != null) supIds.push(r.supplier_id);
  }
  await Promise.all([fetchMaterialsByIds(matIds), fetchSuppliersByIds(supIds)]);

  // Fill in display fields using caches (don’t trigger autosave; we’re editing pre-render objects)
  for (const r of rows) {
    if (!r.material_disp && r.material_id != null) {
      const m = matById.get(Number(r.material_id));
      if (m) {
        r.material_disp = `${m.code}${m.name ? " — " + m.name : ""}${
          m.spec ? " (" + m.spec + ")" : ""
        }`;
      }
    }
    if (!r.supplier_disp && r.supplier_id != null) {
      const s = supById.get(Number(r.supplier_id));
      if (s) {
        r.supplier_disp = `${s.code}${s.name ? " — " + s.name : ""}`;
      }
    }
  }
}

/* ===== Payload Builders ===== */
function buildCreatePayload(d) {
  const rawBatch = trim(d.batch_no).toUpperCase();
  const autogen =
    rawBatch === "" || rawBatch === "AUTO" || rawBatch === "AUTOGEN";
  const qty = toDecOrNullStr(d.qty_received);

  return {
    batch_no: autogen ? "AUTO" : rawBatch,
    material_id: d.material_id ? Number(d.material_id) : null,
    supplier_id: d.supplier_id ? Number(d.supplier_id) : null,
    supplier_batch_no: trim(d.supplier_batch_no) || null,
    mill_name: trim(d.mill_name) || null,
    mill_heat_no: trim(d.mill_heat_no) || null,
    received_at: trim(d.received_at) || null,
    qty_received: qty,
    location: trim(d.location) || null,
    status: d.status || "active",
  };
}
function buildUpdatePayload(d) {
  const qty = toDecOrNullStr(d.qty_received);
  return {
    batch_no: trim(d.batch_no) || null,
    material_id: d.material_id ? Number(d.material_id) : null,
    supplier_id: d.supplier_id ? Number(d.supplier_id) : null,
    supplier_batch_no: trim(d.supplier_batch_no) || null,
    mill_name: trim(d.mill_name) || null,
    mill_heat_no: trim(d.mill_heat_no) || null,
    received_at: trim(d.received_at) || null,
    qty_received: qty,
    qty_used: toDecOrNullStr(d.qty_used),
    location: trim(d.location) || null,
    status: d.status || "active",
  };
}

/* ===== Validation ===== */
function requiredReady(d) {
  const mid = d.material_id ? Number(d.material_id) : 0;
  const qty = Number(d.qty_received);
  return Number.isInteger(mid) && mid > 0 && !Number.isNaN(qty) && qty > 0;
}

function isMethodNotAllowed(err) {
  const msg = (err && (err.message || String(err))) || "";
  const st = err?.status || err?.statusCode;
  return st === 405 || /method not allowed/i.test(msg);
}

function safeRowUpdate(row, obj) {
  try {
    table?.cancelEdit?.();
  } catch {}
  try {
    if (row?.getElement?.()) row.update(obj);
    else if (obj?.id != null) table?.updateData([{ ...obj }]);
  } catch {}
  requestAnimationFrame(() => {
    try {
      row?.reformat?.();
    } catch {}
    try {
      table?.redraw(true);
    } catch {}
  });
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    return;
  }
  if (
    !confirm(
      `Delete this batch "${d.batch_no || d.id}"?\nThis action cannot be undone.`
    )
  )
    return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
    cacheAll = cacheAll.filter((x) => (x.id ?? x.batch_id) !== d.id);
    table?.replaceData();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== Columns ===== */
function makeColumns() {
  return [
   
    {
      title: "Batch No",
      field: "batch_no",
      width: 160,
      editor: "input",
      formatter: (cell) => {
        const d = cell.getRow().getData();
        const rid = d?.id;
        const txt = d?.batch_no ?? "";
        return rid
          ? `<a class="code-link" href="${batchDetail(rid)}">${safe(txt)}</a>`
          : safe(txt);
      },
      cellClick: (e) => {
        const a = e.target.closest("a.code-link");
        if (a) {
          e.stopPropagation();
          location.href = a.href;
        }
      },
    },

    // Material (display string; we store material_id in row state)
    {
      title: "Material",
      field: "material_disp",
      width: 280,
      headerSort: true,
      editor: materialEditor,
      formatter: fmtMaterialDisp,
    },

    {
      title: "#Receive",
      field: "qty_received",
      width: 110,
      hozAlign: "right",
      editor: "input",
    },

    // Supplier (display string; we store supplier_id in row state)
    {
      title: "Supplier",
      field: "supplier_disp",
      width: 260,
      headerSort: true,
      editor: supplierEditor,
      formatter: fmtSupplierDisp,
    },

    {
      title: "Supplier Batch",
      field: "supplier_batch_no",
      width: 160,
      editor: "input",
    },
    { title: "Mill", field: "mill_name", width: 140, editor: "input" },
    { title: "Heat No", field: "mill_heat_no", width: 120, editor: "input" },
    {
      title: "Received",
      field: "received_at",
      width: 140,
      editor: "input",
      formatter: (c) => fmtDate(c.getValue()),
    },
    {
      title: "Location",
      field: "location",
      width: 140,
      editor: "input",
      cssClass: "wrap",
    },
    {
      title: "Status",
      field: "status",
      width: 120,
      editor: "list",
      editorParams: { values: ["active", "hold", "inactive"] },
    },
    {
      title: "Actions",
      field: "_actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: () =>
        `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: (e, cell) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        if (btn.getAttribute("data-act") === "del") deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== Tab / Shift+Tab navigation ===== */
function getEditableFieldsLive(tab) {
  return tab
    .getColumns(true)
    .map((c) => ({ field: c.getField(), def: c.getDefinition() }))
    .filter((c) => c.field && c.def && !!c.def.editor)
    .map((c) => c.field);
}
function focusSiblingEditable(cell, dir) {
  const row = cell.getRow();
  const tab = row.getTable();
  const fields = getEditableFieldsLive(tab);

  const curField = cell.getField();
  const curFieldIdx = fields.indexOf(curField);
  if (curFieldIdx === -1) return;

  const rows = tab.getRows(); // visual order
  const curRowIdx = rows.indexOf(row);

  let nextFieldIdx = curFieldIdx + dir;
  let nextRowIdx = curRowIdx;

  if (nextFieldIdx >= fields.length) {
    nextFieldIdx = 0;
    nextRowIdx = Math.min(curRowIdx + 1, rows.length - 1);
  } else if (nextFieldIdx < 0) {
    nextFieldIdx = fields.length - 1;
    nextRowIdx = Math.max(curRowIdx - 1, 0);
  }

  const targetRow = rows[nextRowIdx];
  if (!targetRow) return;

  const targetField = fields[nextFieldIdx];
  const targetCell = targetRow.getCell(targetField);
  if (!targetCell) return;

  targetCell.edit(true);
  const el = targetCell.getElement();
  const input =
    el && el.querySelector("input, textarea, [contenteditable='true']");
  if (input) {
    const v = input.value;
    input.focus();
    if (typeof v === "string") input.setSelectionRange(v.length, v.length);
  }
}

/* ===== AUTOSAVE ===== */
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;
  const row = cell.getRow();
  if (suppressAutosaveRows.has(row)) return;

  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // Required picks when editing display fields
  if (fld === "material_disp" && d.material_id == null) {
    toast("Pick a material from the list", false);
    if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }
  if (fld === "supplier_disp" && d.supplier_id == null) {
    toast("Pick a supplier from the list", false);
    if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  // CREATE
  if (!d.id) {
    const payload = buildCreatePayload(d);
    if (!requiredReady(d)) return; // need material_id + qty_received > 0

    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeRow(created || d);

      // preserve / rebuild display labels
      const keepMat =
        normalized.material_disp ||
        d.material_disp ||
        (() => {
          const mm = matById.get(Number(normalized.material_id));
          return mm
            ? `${mm.code}${mm.name ? " — " + mm.name : ""}${
                mm.spec ? " (" + mm.spec + ")" : ""
              }`
            : "";
        })();
      const keepSup =
        normalized.supplier_disp ||
        d.supplier_disp ||
        (() => {
          const ss = supById.get(Number(normalized.supplier_id));
          return ss ? `${ss.code}${ss.name ? " — " + ss.name : ""}` : "";
        })();

      suppressAutosaveRows.add(row);
      try {
        row.update({
          ...normalized,
          material_disp: keepMat,
          supplier_disp: keepSup,
        });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }

      toast(`Batch "${normalized.batch_no || normalized.id}" created`);

      // sync client cache and repaint
      cacheAll.push(created);
      totalItems = cacheAll.length;
      table?.replaceData();
    } catch (e) {
      suppressAutosaveRows.add(row);
      try {
        if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  // UPDATE (debounced)
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    const payload = buildUpdatePayload(d);

    try {
      let updated;
      try {
        updated = await jfetch(ENDPOINTS.byId(d.id), {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(payload),
        });
      } catch (err) {
        if (isMethodNotAllowed(err)) {
          updated = await jfetch(ENDPOINTS.byId(d.id), {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
          });
        } else {
          throw err;
        }
      }

      const normalized = normalizeRow(updated || d);

      const keepMat =
        normalized.material_disp ||
        d.material_disp ||
        (() => {
          const mm = matById.get(Number(normalized.material_id));
          return mm
            ? `${mm.code}${mm.name ? " — " + mm.name : ""}${
                mm.spec ? " (" + mm.spec + ")" : ""
              }`
            : "";
        })();
      const keepSup =
        normalized.supplier_disp ||
        d.supplier_disp ||
        (() => {
          const ss = supById.get(Number(normalized.supplier_id));
          return ss ? `${ss.code}${ss.name ? " — " + ss.name : ""}` : "";
        })();

      suppressAutosaveRows.add(row);
      try {
        safeRowUpdate(row, {
          ...d,
          ...normalized,
          id: normalized.id ?? d.id,
          material_disp: keepMat,
          supplier_disp: keepSup,
        });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }

      // optional: update cache
      const idx = cacheAll.findIndex(
        (x) => (x.id ?? x.batch_id) === (normalized.id ?? d.id)
      );
      if (idx >= 0) cacheAll[idx] = updated;

      toast(`Saved "${normalized.batch_no || normalized.id}"`);
    } catch (e) {
      suppressAutosaveRows.add(row);
      try {
        if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ===== TABLE ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No batches",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,

    pagination: true,
    paginationMode: "remote",
    paginationSize: DEFAULT_PAGE_SIZE,
    paginationSizeSelector: PAGE_SIZE_CHOICES,
    paginationCounter: "rows",

    ajaxURL: ENDPOINTS.base,
    ajaxRequestFunc: async (_url, _cfg, params) => {
      const page = params.page || 1;
      const showAll = params.size === true;
      const size = showAll ? 0 : Number(params.size) || 50;

      if (!cacheAll.length) {
        const list = await jfetch(ENDPOINTS.base); // backend returns list
        cacheAll = Array.isArray(list) ? list : list?.items ?? [];
      }

      const keyword = (els[UI.q]?.value || "").trim().toLowerCase();
      const filtered = keyword
        ? cacheAll.filter((x) =>
            (x.batch_no ?? "").toLowerCase().includes(keyword) ||
            (x.supplier_batch_no ?? "").toLowerCase().includes(keyword) ||
            (x.mill_heat_no ?? "").toLowerCase().includes(keyword)
          )
        : cacheAll;

      totalItems = filtered.length;

      const start = showAll ? 0 : (page - 1) * size;
      const end = showAll ? filtered.length : start + size;
      const pageItems = filtered.slice(start, end);
      const rows = pageItems.map(normalizeRow);

      /* >>> FIRST-LOAD LABEL HYDRATION <<< */
      await ensureLabelsForRows(rows);

      const last_page = showAll
        ? 1
        : Math.max(1, Math.ceil((totalItems || rows.length) / (size || 1)));
      return { data: rows, last_page };
    },

    columns: makeColumns(),
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
  });

  // Tab / Shift+Tab while editing
  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const el = cell.getElement();
      const input =
        el && el.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;
      const handler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function")
            e.stopImmediatePropagation();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        }
      };
      input.addEventListener("keydown", handler);
      input.addEventListener(
        "blur",
        () => input.removeEventListener("keydown", handler),
        { once: true }
      );
    }, 0);
  });

  // Autosave hooks
  table.on("cellEdited", (cell) => {
    if (suppressAutosaveRows.has(cell.getRow())) return;
    autosaveCell(cell);
  });
  table.on("historyUndo", (action, comp) => {
    if (action === "cellEdit" && comp && typeof comp.getRow === "function") {
      autosaveCell(comp, { fromHistory: true, revert: () => table.redo() });
    }
  });
  table.on("historyRedo", (action, comp) => {
    if (action === "cellEdit" && comp && typeof comp.getRow === "function") {
      autosaveCell(comp, { fromHistory: true, revert: () => table.undo() });
    }
  });

  // Global keys (undo/redo)
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? table.redo() : table.undo();
    } else if (e.key.toLowerCase() === "y") {
      e.preventDefault();
      table.redo();
    }
  });
}

/* ===== BINDINGS ===== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      table?.setPage(1);
      table?.replaceData();
    }, 300);
  });
}
function bindAdd() {
  const btn = els[UI.add];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        id: null,
        batch_no: "",
        // material fields
        material_id: null,
        material_code: "",
        material_name: "",
        material_spec: "",
        material_disp: "",
        // supplier fields
        supplier_id: null,
        supplier_code: "",
        supplier_name: "",
        supplier_disp: "",
        supplier_batch_no: "",
        mill_name: "",
        mill_heat_no: "",
        received_at: "",
        qty_received: "",
        qty_used: "",
        location: "",
        status: "active",
      },
      true
    );
    // focus the Material cell to start picking
    row.getCell("material_disp")?.edit(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
});
