// /static/js/page-batches.js — AUTOSAVE + Tab/Shift+Tab + Undo/Redo + Delete-only
// with Material & Supplier autocompletes, display caches, label preservation,
// and FIRST-LOAD LABEL HYDRATION via batched ID lookups.

import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/batches",
  byId: (id) => `/batches/${encodeURIComponent(id)}`,
};

const DETAIL_PAGE = "./batches-detail.html";
const batchDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

const JSON_HEADERS = { "Content-Type": "application/json" };
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== Pagination ===== */
const DEFAULT_PAGE_SIZE = true; // true = Show All
const PAGE_SIZE_CHOICES = [20, 50, 100, 200, true];

/* ===== STATE ===== */
let els = {};
let table = null;
let cacheAll = [];
let totalItems = 0;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;
const suppressAutosaveRows = new WeakSet();

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const toDecOrNullStr = (v) => {
  const s = trim(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : String(s);
};
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
};
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");

/* ===== DISPLAY CACHES ===== */
const matById = new Map();
const supById = new Map();

/* ===== NORMALIZER ===== */
function normalizeRow(r) {
  const mat = r.material || null;
const sup = r.supplier || null;

const matDisp =
  r.material_disp ||
  (mat
    ? `${mat.code}${mat.name ? " — " + mat.name : ""}${
        mat.spec ? " (" + mat.spec + ")" : ""
      }`
    : "");

const supDisp =
  r.supplier_disp ||
  (sup ? `${sup.code}${sup.name ? " — " + sup.name : ""}` : "");

  return {
    id: r.id ?? r.batch_id ?? null,
    batch_no: r.batch_no ?? "",

    material_id: r.material_id ?? mat?.id ?? null,
    material_disp: matDisp,

    supplier_id: r.supplier_id ?? sup?.id ?? null,
    supplier_disp: supDisp,

    supplier_batch_no: r.supplier_batch_no ?? "",
    mill_name: r.mill_name ?? "",
    mill_heat_no: r.mill_heat_no ?? "",
    received_at: r.received_at ?? "",
    qty_received: r.qty_received ?? "",
    qty_used: r.qty_used ?? "",
    location: r.location ?? "",
    status: r.status ?? "active",
  };
}

/* ===== SERVER SEARCH ===== */
async function fetchMaterials(term) {
  const q = (term || "").trim();
  try {
    const res = await jfetch(
  q ? `/materials?q=${encodeURIComponent(q)}` : `/materials?limit=10`
);

   
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((m) => ({
      id: m.id ?? m.material_id,
      code: (m.code ?? "").toUpperCase(),
      name: m.name ?? "",
      spec: m.spec ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchSuppliers(term) {
  const q = (term || "").trim();
  try {
    const res = await jfetch(
      q ? `/suppliers?q=${encodeURIComponent(q)}&page=1&page_size=10` : `/suppliers?limit=10`
    );

    
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((s) => ({
      id: s.id ?? s.supplier_id,
      code: (s.code ?? "").toUpperCase(),
      name: s.name ?? "",
    }));
  } catch {
    return [];
  }
}

/* ===== AUTOCOMPLETE EDITORS ===== */
function materialEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.className = "tabulator-editing";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchMaterials,
    getDisplayValue: (it) =>
      it
        ? `${it.code}${it.name ? " — " + it.name : ""}${
            it.spec ? " (" + it.spec + ")" : ""
          }`
        : "",
    onPick: (it) => {
      success(
        `${it.code}${it.name ? " — " + it.name : ""}${
          it.spec ? " (" + it.spec + ")" : ""
        }`
      );

      const row = cell.getRow();
      matById.set(it.id, it);
      suppressAutosaveRows.add(row);
      row.update({ material_id: it.id, material_disp: input.value });
      setTimeout(() => suppressAutosaveRows.delete(row), 0);

      setTimeout(() => autosaveCell(cell), 0);
    },
  });

  onRendered(() => input.focus());
  return input;
}

function supplierEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.className = "tabulator-editing";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchSuppliers,
    getDisplayValue: (it) =>
      it ? `${it.code}${it.name ? " — " + it.name : ""}` : "",
    onPick: (it) => {
      success(`${it.code}${it.name ? " — " + it.name : ""}`);

      const row = cell.getRow();
      supById.set(it.id, it);
      suppressAutosaveRows.add(row);
      row.update({ supplier_id: it.id, supplier_disp: input.value });
      setTimeout(() => suppressAutosaveRows.delete(row), 0);

      setTimeout(() => autosaveCell(cell), 0);
    },
  });

  onRendered(() => input.focus());
  return input;
}

/* ===== PAYLOAD BUILDERS ===== */
function buildCreatePayload(d) {
  return {
    batch_no: trim(d.batch_no) || "AUTO",
    material_id: Number(d.material_id) || null,
    supplier_id: Number(d.supplier_id) || null,
    supplier_batch_no: trim(d.supplier_batch_no) || null,
    mill_name: trim(d.mill_name) || null,
    mill_heat_no: trim(d.mill_heat_no) || null,
    received_at: trim(d.received_at) || null,
    qty_received: toDecOrNullStr(d.qty_received),
    location: trim(d.location) || null,
    status: d.status || "active",
  };
}

function buildUpdatePayload(d) {
  return {
    batch_no: trim(d.batch_no) || null,
    material_id: Number(d.material_id) || null,
    supplier_id: Number(d.supplier_id) || null,
    supplier_batch_no: trim(d.supplier_batch_no) || null,
    mill_name: trim(d.mill_name) || null,
    mill_heat_no: trim(d.mill_heat_no) || null,
    received_at: trim(d.received_at) || null,
    qty_received: toDecOrNullStr(d.qty_received),
    qty_used: toDecOrNullStr(d.qty_used),
    location: trim(d.location) || null,
    status: d.status || "active",
  };
}

/* ===== VALIDATION ===== */
function requiredReady(d) {
  return Number(d.material_id) > 0 && Number(d.qty_received) > 0;
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) return row.delete();

  if (!confirm(`Delete batch "${d.batch_no}"?`)) return;

  await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
  row.delete();
  toast("Deleted");
}

/* ===== COLUMNS ===== */
function makeColumns() {
  return [
    {
      title: "Batch No",
      field: "batch_no",
      width: 160,
      editor: "input",
      formatter: (c) => {
        const d = c.getRow().getData();
        return d.id
          ? `<a class="code-link" href="${batchDetail(d.id)}">${safe(
              d.batch_no
            )}</a>`
          : safe(d.batch_no);
      },
    },
    {
      title: "Material",
      field: "material_disp",
      width: 280,
      editor: materialEditor,
    },
    {
      title: "#Receive",
      field: "qty_received",
      width: 110,
      hozAlign: "right",
      editor: "input",
    },
    {
      title: "Supplier",
      field: "supplier_disp",
      width: 260,
      editor: supplierEditor,
    },
    { title: "Supplier Batch", field: "supplier_batch_no", width: 160, editor: "input" },
    { title: "Mill", field: "mill_name", width: 140, editor: "input" },
    { title: "Heat No", field: "mill_heat_no", width: 120, editor: "input" },
    {
      title: "Received",
      field: "received_at",
      width: 140,
      editor: "input",
      formatter: (c) => fmtDate(c.getValue()),
    },
    { title: "Location", field: "location", width: 140, editor: "input" },
    {
      title: "Status",
      field: "status",
      width: 120,
      editor: "list",
      editorParams: { values: ["active", "hold", "inactive"] },
    },
    {
      title: "Actions",
      width: 120,
      formatter: () =>
        `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: (e, cell) => {
        if (e.target.closest("button[data-act]")) deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== AUTOSAVE ===== */
async function autosaveCell(cell) {
  const row = cell.getRow();
  if (suppressAutosaveRows.has(row)) return;

  const d = row.getData();

  if (!d.id) {
    if (!requiredReady(d)) return;
    if (createInFlight.has(row)) return;

    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(buildCreatePayload(d)),
      });

      row.update(normalizeRow(created));
      toast("Batch created");
    } catch (e) {
      toast("Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));

  patchTimers.set(
    row,
    setTimeout(async () => {
      try {
        const updated = await jfetch(ENDPOINTS.byId(d.id), {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(buildUpdatePayload(d)),
        });

        row.update(normalizeRow(updated));
        toast("Saved");
      } catch {
        toast("Save failed", false);
      }
    }, PATCH_DEBOUNCE_MS)
  );
}

/* ===== TABLE INIT ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No batches",
    reactiveData: true,
    index: "id",
    history: true,
    pagination: true,
    paginationMode: "remote",
    paginationSize: DEFAULT_PAGE_SIZE,
    paginationSizeSelector: PAGE_SIZE_CHOICES,
    ajaxURL: ENDPOINTS.base,
    ajaxRequestFunc: async () => {
  const q = els[UI.q]?.value?.trim();

  const url = q
    ? `${ENDPOINTS.base}?q=${encodeURIComponent(q)}&all=1`
    : `${ENDPOINTS.base}?all=1`;

  const list = await jfetch(url);
  cacheAll = Array.isArray(list) ? list : list.items ?? [];
  console.log(cacheAll)

  const rows = cacheAll.map(normalizeRow);
  return { data: rows, last_page: 1 };
},
    columns: makeColumns(),
  });

  table.on("cellEdited", autosaveCell);
}

/* ===== BINDINGS ===== */
function bindSearch() {
  els[UI.q]?.addEventListener("input", () => table.replaceData());
}

function bindAdd() {
  els[UI.add]?.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        batch_no: "",
        material_id: null,
        material_disp: "",
        supplier_id: null,
        supplier_disp: "",
        qty_received: "",
        location: "",
        status: "active",
      },
      true
    );
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
