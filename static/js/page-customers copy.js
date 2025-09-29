// /static/js/page-customers.js — AUTOSAVE + Tab nav + Undo/Redo + Delete key
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = { base: "/customers" };
const FETCH_ALL_STRATEGY = "auto"; // "auto" | "all-param" | "paged"
const PAGED_PER_PAGE = 100;
const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet(); // rows currently creating (POST)
const patchTimers = new Map(); // row -> timeout id (debounced PATCH)
const PATCH_DEBOUNCE_MS = 350;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());

function buildPayload(row) {
  return {
    name: trim(row.name) || null,
    code: row.code ? String(row.code).toUpperCase() : null,
    contact: row.contact ? trim(row.contact) : null,
    email: row.email ? trim(row.email) : null,
    phone: row.phone ? trim(row.phone) : null,
    address: row.address ? trim(row.address) : null,
  };
}

function normalizeRow(r) {
  return {
    id: r.id ?? r.customer_id ?? r.customerId ?? null,
    code: r.code ?? "",
    name: r.name ?? "",
    contact: r.contact ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
  };
}

/* ===== TABLE COLUMNS (no Actions col; autosave) ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      width: 60,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: "rownum",
    },
    { title: "Code", field: "code", width: 100, editor: "input" },
    {
      title: "Name",
      field: "name",
      minWidth: 160,
      editor: "input",
      validator: "required",
    },
    { title: "Contact", field: "contact", width: 140, editor: "input" },
    { title: "Email", field: "email", width: 200, editor: "input" },
    { title: "Phone", field: "phone", width: 140, editor: "input" },
    {
      title: "Address",
      field: "address",
      widthGrow: 3,
      minWidth: 220,
      maxWidth: 600,
      editor: "input",
      cssClass: "wrap",
    },
    {
      title: "Actions",
      field: "_actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: () => `
        <div class="row-actions">
          <button class="btn-small btn-danger" data-act="del">Delete</button>
        </div>`,
      cellClick: (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow()); // uses your existing deleteRow(row)
      },
    },
  ];
}

/* ===== Tab / Shift+Tab navigation while editing ===== */
function getEditableFieldsLive(tab) {
  return tab
    .getColumns(true)
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
  const input =
    el && el.querySelector("input, textarea, [contenteditable='true']");
  if (input) {
    const v = input.value;
    input.focus();
    if (typeof v === "string") input.setSelectionRange(v.length, v.length);
  }
}

/* ===== AUTOSAVE ===== */
// call with { fromHistory: true, revert: () => table.undo()/redo() } when invoked by history
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;
  const row = cell.getRow();
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // Required: name
  if (fld === "name" && !trim(newVal)) {
    toast("Name required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  const payload = buildPayload(d);

  // CREATE: only when no id and we have a valid name
  if (!d.id) {
    if (!payload.name) return; // ignore other fields until name present
    if (createInFlight.has(row)) return; // guard duplicate POSTs
    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);
      row.update({ ...norm });
      toast(`Customer "${norm.name}" created`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  // UPDATE: debounce per row to reduce spam
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    try {
      const updated = await jfetch(
        `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
      const norm = normalizeRow(updated || d);
      row.update({ ...d, ...norm, id: norm.id ?? d.id });
      toast(`Saved changes to "${norm.name}"`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) {
        cell.setValue(oldVal, true);
      } else if (typeof revert === "function") {
        revert();
      } else {
        // optional resync
        try {
          const fresh = await jfetch(
            `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`
          );
          const norm = normalizeRow(fresh || d);
          row.update({ ...norm });
        } catch {}
      }
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ===== DELETE (via Delete key) ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) {
    row.delete();
    return;
  }
  if (
    !confirm(
      `Delete customer "${
        d.name || d.code || d.id
      }"?\nThis action cannot be undone.`
    )
  )
    return;
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

/* ===== INIT TABLE ===== */
function initTable() {
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "100%", // fills the panel (your CSS already flexes it)
    columns: makeColumns(),
    placeholder: "No customers",
    reactiveData: true,
    index: "id",
    history: true, // enable undo/redo stack
    selectableRows: 1, // allow selecting a row for Delete key
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
    setTimeout(() => table.redraw(true), 0);
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

  // AUTOSAVE on normal edits
  table.on("cellEdited", (cell) => {
    autosaveCell(cell);
  });

  // AUTOSAVE on undo/redo
  table.on("historyUndo", (action, component) => {
    if (
      action === "cellEdit" &&
      component &&
      typeof component.getRow === "function"
    ) {
      autosaveCell(component, {
        fromHistory: true,
        revert: () => table.redo(),
      });
    }
  });
  table.on("historyRedo", (action, component) => {
    if (
      action === "cellEdit" &&
      component &&
      typeof component.getRow === "function"
    ) {
      autosaveCell(component, {
        fromHistory: true,
        revert: () => table.undo(),
      });
    }
  });

  // Global keys: Undo/Redo + Delete selected row
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? table.redo() : table.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      table.redo();
      return;
    }
    if (e.key === "Delete") {
      const sel = table.getSelectedRows?.();
      if (sel && sel[0]) deleteRow(sel[0]);
    }
  });
}
// put near the top of /static/js/page-customers.js
function injectStylesOnce() {
  if (document.getElementById("cust-actions-css")) return;
  const st = document.createElement("style");
  st.id = "cust-actions-css";
  st.textContent = `
    .row-actions{ display:flex; gap:6px; justify-content:center; }
    .btn-small{ font:inherit; padding:4px 8px; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; cursor:pointer }
    .btn-small:hover{ background:#f1f5f9 }
    .btn-danger{ background:#ef4444; color:#fff; border-color:#dc2626 }
    .btn-danger:hover{ background:#dc2626 }
  `;
  document.head.appendChild(st);
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
        if (
          records.length < (total || records.length) ||
          (pages && pages > 1)
        ) {
          records = await fetchAllByPaging(keyword);
        }
        ok = true;
      } catch {
        if (FETCH_ALL_STRATEGY === "all-param")
          throw new Error("Backend doesn't support all=1");
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
      { code: "", name: "", contact: "", email: "", phone: "", address: "" },
      true
    );
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
