// /static/js/page-materials.js — AUTOSAVE + Tab nav + Undo/Redo
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = { base: "/materials" };
const FETCH_ALL_STRATEGY = "auto"; // "auto" | "all-param" | "paged"
const PAGED_PER_PAGE = 100;

const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };
// === AUTOSAVE GUARDS ===
const createInFlight = new WeakSet();          // rows currently creating (POST)
const patchTimers = new Map();                 // row -> timeout id (debounced PATCH)
const PATCH_DEBOUNCE_MS = 350;

/* ===== STATE ===== */
let els = {};
let table = null;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());

function buildPayload(row) {
  return {
    code:   row.code ? String(row.code).toUpperCase() : null,
    name:   trim(row.name) || null,
    spec:   row.spec ? trim(row.spec) : null,
    uom:    row.uom ? trim(row.uom) : null,
    remark: row.remark ? trim(row.remark) : null,
  };
}
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    // not saved on backend yet → just remove from table
    row.delete();
    return;
  }
  if (!confirm("Delete this material?\nThis action cannot be undone.")) return;

  try {
    await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
      method: "DELETE",
    });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

function normalizeRow(r) {
  return {
    id: r.id ?? r.material_id ?? r.materialId ?? null,
    code: r.code ?? "",
    name: r.name ?? "",
    spec: r.spec ?? "",
    uom: r.uom ?? "",
    remark: r.remark ?? "",
  };
}

/* ===== TABLE COLUMNS ===== */
function makeColumns() {
  return [
    { title: "No.", width: 60, hozAlign: "right", headerHozAlign: "right", headerSort: false, formatter: "rownum" },
    { title: "Code",   field: "code",   width: 110, editor: "input" },
    { title: "Name",   field: "name",   minWidth: 160, editor: "input", validator: "required" },
    { title: "Spec",   field: "spec",   widthGrow: 2, minWidth: 220, maxWidth: 600, editor: "input", cssClass: "wrap" },
    { title: "UoM",    field: "uom",    width: 100, hozAlign: "center", editor: "input" },
    { title: "Remark", field: "remark", widthGrow: 2, minWidth: 220, maxWidth: 600, editor: "input", cssClass: "wrap" },
    {
      title: "Actions",
      field: "_actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      formatter: () => `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: (e, cell) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        if (btn.getAttribute("data-act") === "del") {
          deleteRow(cell.getRow());
        }
      },
    },
  ];
}


/* ===== Tab / Shift+Tab navigation while editing ===== */
function getEditableFieldsLive(tab) {
  return tab
    .getColumns(true) // visible, in display order
    .map((c) => ({ field: c.getField(), def: c.getDefinition() }))
    .filter((c) => c.field && c.def && !!c.def.editor)
    .map((c) => c.field);
}

function focusSiblingEditable(cell, dir /* +1 or -1 */) {
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
  const input = el && el.querySelector("input, textarea, [contenteditable='true']");
  if (input) {
    const v = input.value;
    input.focus();
    if (typeof v === "string") input.setSelectionRange(v.length, v.length);
  }
}

/* ===== AUTOSAVE HANDLER ===== */
// pass { fromHistory: true, revert: () => table.undo()/redo() } when needed
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;

  const row = cell.getRow();
  const d   = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // 1) Client-side rule: name is required
  if (fld === "name" && !trim(newVal)) {
    toast("Name required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  // Build full payload using the latest row data
  const payload = {
    code:   d.code ? String(d.code).toUpperCase() : null,
    name:   trim(d.name) || null,
    spec:   d.spec ? trim(d.spec) : null,
    uom:    d.uom ? trim(d.uom) : null,
    remark: d.remark ? trim(d.remark) : null,
  };

  // 2) CREATE: only when we have no id AND name is present
  // CREATE when no id yet (first valid edit)
if (!d.id) {
  if (!payload.name) return; // don't create until we have a name

  if (createInFlight.has(row)) return;
  createInFlight.add(row);
  try {
    const created = await jfetch(ENDPOINTS.base, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const norm = normalizeRow(created || d);
    row.update({ ...norm });
    toast(`Material "${norm.name}" created`);   // ✅ success message
  } catch (e) {
    if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    toast(e?.message || "Create failed", false); // ✅ error message
  } finally {
    createInFlight.delete(row);
  }
  return;
}

// UPDATE existing (debounced)
if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));

const t = setTimeout(async () => {
  patchTimers.delete(row);
  try {
    const updated = await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const norm = normalizeRow(updated || d);
    row.update({ ...d, ...norm, id: norm.id ?? d.id });
    toast(`Saved changes to "${norm.name}"`);   // ✅ success message
  } catch (e) {
    if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    toast(e?.message || "Save failed", false);  // ✅ error message
  }
}, PATCH_DEBOUNCE_MS);

patchTimers.set(row, t);

}


/* ===== INIT ===== */
function initTable() {
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "100%",
    columns: makeColumns(),
    placeholder: "No materials",
    reactiveData: true,
    index: "id",
    history: true, // enable undo/redo stack
    // keybindings: false,
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
    setTimeout(() => table.redraw(true), 0);
  });

  // Tab / Shift+Tab while editing
  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const el = cell.getElement();
      const input = el && el.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;

      const handler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        }
      };

      input.addEventListener("keydown", handler);
      input.addEventListener("blur", () => input.removeEventListener("keydown", handler), { once: true });
    }, 0);
  });

  // AUTOSAVE on normal edits
  table.on("cellEdited", (cell) => {
    autosaveCell(cell);
  });

  // ✅ AUTOSAVE on undo
  table.on("historyUndo", (action, component /* cell/row/column */, data) => {
    if (action === "cellEdit" && component && typeof component.getRow === "function") {
      // If save fails, redo to restore previous UI state
      autosaveCell(component, { fromHistory: true, revert: () => table.redo() });
    }
  });

  // ✅ AUTOSAVE on redo
  table.on("historyRedo", (action, component, data) => {
    if (action === "cellEdit" && component && typeof component.getRow === "function") {
      // If save fails, undo to restore previous UI state
      autosaveCell(component, { fromHistory: true, revert: () => table.undo() });
    }
  });

  // Optional: global keys for undo/redo
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


/* ===== FETCH ALL HELPERS ===== */
async function tryFetchAllParam(keyword = "") {
  const usp = new URLSearchParams();
  usp.set("all", "1");
  if (keyword) usp.set("q", keyword);
  const res = await jfetch(`${ENDPOINTS.base}?${usp.toString()}`);
  const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  const total = res?.total ?? items.length;
  return { items, total, pages: res?.pages ?? 1 };
}

async function fetchAllByPaging(keyword = "") {
  const perPage = PAGED_PER_PAGE;
  let page = 1;
  const all = [];
  while (true) {
    const usp = new URLSearchParams();
    usp.set("page", String(page));
    usp.set("per_page", String(perPage));
    if (keyword) usp.set("q", keyword);
    const res = await jfetch(`${ENDPOINTS.base}?${usp.toString()}`);
    const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
    if (!items?.length) break;
    all.push(...items);
    const pages = res?.pages;
    if (pages && page >= pages) break;
    if (!pages && items.length < perPage) break;
    page += 1;
  }
  return all;
}

/* ===== LOAD ALL ===== */
async function loadAll(keyword = "") {
  try {
    let records = [];

    if (FETCH_ALL_STRATEGY === "all-param" || FETCH_ALL_STRATEGY === "auto") {
      let ok = false;
      try {
        const { items, total, pages } = await tryFetchAllParam(keyword);
        records = items;
        if (records.length < (total || records.length) || (pages && pages > 1)) {
          records = await fetchAllByPaging(keyword);
        }
        ok = true;
      } catch {
        if (FETCH_ALL_STRATEGY === "all-param") throw new Error("Backend doesn't support all=1");
      }
      if (ok) {
        table?.setData(records.map(normalizeRow));
        table?.redraw(true);
        return;
      }
    }

    records = await fetchAllByPaging(keyword);
    table?.setData(records.map(normalizeRow));
    table?.redraw(true);
  } catch (e) {
    toast("Load failed", false);
    table?.setData([]);
    table?.redraw(true);
  }
}

/* ===== BINDINGS ===== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => loadAll(box.value), 300);
  });
}

function bindAdd() {
  const btn = els[UI.btnAdd];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      { code: "", name: "", spec: "", uom: "", remark: "" },
      true
    );
    // start editing "name" to encourage valid create
    row.getCell("name")?.edit(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
  loadAll();
});
