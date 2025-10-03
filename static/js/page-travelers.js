// /static/js/page-travelers.js — AUTOSAVE + Tab nav + Undo/Redo + Delete only
// + Remote pagination with "Show All" default (all=1) for fast, load-all behavior
import { $, jfetch, showToast as toast } from "./api.js";

const UI = { q: "_q", add: "_add", table: "listBody" };
const DETAIL_PAGE = "./traveler-detail.html";
const travelerDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

/* ===== Remote pagination defaults ===== */
const DEFAULT_PAGE_SIZE = true; // true = Show All (โหลดทั้งหมด)
const PAGE_SIZE_CHOICES = [20, 50, 100, 200, true]; // true = Show All
let totalItems = 0;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet(); // rows creating (POST)
const patchTimers = new Map(); // row -> timeout (debounced PATCH)
const PATCH_DEBOUNCE_MS = 350;

/* ===== STATE ===== */
let els = {};
let table = null;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const safe = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
};

function normalizeRow(t) {
  // t is ShopTravelerOut
  // expect: { id, lot_id, status, notes, created_at, created_by_id, lot:{lot_code, lot_no, due_date?} }
  const lot = t?.lot || {};
  return {
    id: t.id,
    lot_id: t.lot_id ?? null,
    lot_code: lot.lot_code ?? "",
    lot_no: lot.lot_no ?? "",
    due_date: lot.due_date ?? null,
    status: t.status ?? "open",
    notes: t.notes ?? "",
    created_by_id: t.created_by_id ?? null,
    created_at: t.created_at ?? null,
  };
}

function buildPayload(row) {
  // POST/PATCH payload for ShopTraveler
  // Minimal required for POST: lot_id
  return {
    lot_id: row.lot_id ?? null,
    status: row.status || "open",
    notes: row.notes ? trim(row.notes) : null,
    created_by_id:
      row.created_by_id === "" || row.created_by_id == null
        ? null
        : Number(row.created_by_id),
  };
}

function requiredReady(row) {
  // ต้องมี lot_id ก่อนจึงจะ POST
  return row.lot_id != null && String(row.lot_id).trim() !== "";
}

/* ===== COLUMNS ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      field: "_rowno",
      width: 70,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: (cell) => {
        const pos = cell.getRow().getPosition(true);
        const curPage = table.getPage() || 1;
        const ps = table.getPageSize();
        const eff = ps === true ? totalItems || table.getDataCount() : ps || 1;
        return (curPage - 1) * eff + pos;
      },
    },
    {
      title: "Steps",
      field: "id",
      width: 90,
      headerSort: false,
      hozAlign: "center",
      formatter: (cell) => {
        const id = cell.getValue();
        if (!id) return `<span class="muted">—</span>`;
        return `<a class="view-link" href="${travelerDetail(
          id
        )}" title="Open detail">View</a>`;
      },
      cellClick: (e) => {
        const a = e.target.closest("a.view-link");
        if (a) e.stopPropagation();
      },
    },
    { title: "Lot ID", field: "lot_id", width: 110, editor: "input" },
    {
      title: "Lot Code",
      field: "lot_code",
      width: 160,
      headerSort: true,
      // read-only (comes from relation)
      formatter: (c) => safe(c.getValue()),
    },
    {
      title: "Lot No",
      field: "lot_no",
      width: 140,
      headerSort: true,
      formatter: (c) => safe(c.getValue()),
    },
    {
      title: "Due",
      field: "due_date",
      headerSort: true,
      formatter: (cell) => fmtDate(cell.getValue()),
    },
    {
      title: "Status",
      field: "status",
      width: 130,
      editor: "select",
      editorParams: {
        values: {
          open: "open",
          in_progress: "in_progress",
          hold: "hold",
          closed: "closed",
          canceled: "canceled",
        },
      },
    },
    { title: "Notes", field: "notes", editor: "textarea" },
    {
      title: "Created By",
      field: "created_by_id",
      width: 120,
      editor: "input", // change to autocomplete if you wire employees
    },
    {
      title: "Created At",
      field: "created_at",
      headerSort: true,
      formatter: (cell) => fmtDate(cell.getValue()),
    },
  ];
}

/* ===== Tab / Shift+Tab ===== */
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

  const rows = tab.getRows();
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
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // Rule: lot_id required for CREATE
  if (fld === "lot_id" && !requiredReady({ ...d, lot_id: newVal })) {
    toast("Lot ID required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  const payload = buildPayload(d);

  // CREATE
  if (!d.id) {
    if (!requiredReady(d)) return; // wait until lot_id filled
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch("/travelers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);

      row.update({ ...norm });
      row.getCell("id")?.reformat();
      requestAnimationFrame(() => table?.redraw(true));

      toast(`Traveler #${norm.id} created`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
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
    try {
      const updated = await jfetch(`/travelers/${encodeURIComponent(d.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(updated || d);

      row.update({ ...d, ...norm, id: norm.id ?? d.id });
      row.getCell("id")?.reformat();
      requestAnimationFrame(() => table?.redraw(true));

      toast(`Saved traveler #${norm.id}`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
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
      `Delete traveler #${d.id}${
        d.lot_code ? ` (lot ${d.lot_code})` : ""
      }?\nThis action cannot be undone.`
    )
  )
    return;
  try {
    await jfetch(`/travelers/${encodeURIComponent(d.id)}`, { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== TABLE (Remote pagination, Show All default) ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No travelers",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,

    pagination: true,
    paginationMode: "remote",
    paginationSize: DEFAULT_PAGE_SIZE, // true = Show All
    paginationSizeSelector: PAGE_SIZE_CHOICES, // [20,50,100,200,true]
    paginationCounter: "rows",

    ajaxURL: "/travelers",
    ajaxRequestFunc: async (_url, _config, params) => {
      const page = params.page || 1;
      const showAll = params.size === true;
      const size = showAll ? DEFAULT_PAGE_SIZE : Number(params.size) || 50;

      const keyword = (els[UI.q]?.value || "").trim();
      const usp = new URLSearchParams();
      // backend returns full list, we'll client-paginate when needed
      if (showAll) usp.set("all", "1");
      if (keyword) usp.set("q", keyword);
      usp.set("_", String(Date.now()));

      const res = await jfetch(`/travelers?${usp.toString()}`);
      const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
      totalItems = Number(res?.total ?? items.length);

      const rows = items.map(normalizeRow);

      // If not showAll, simulate server paging to keep Tabulator happy
      let pageRows = rows;
      if (!showAll) {
        const start = (page - 1) * size;
        pageRows = rows.slice(start, start + size);
      }
      const last_page = showAll
        ? 1
        : Math.max(1, Math.ceil((totalItems || rows.length) / (size || 1)));
      return { data: pageRows, last_page };
    },

    columns: makeColumns(),
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
  });

  // Tab / Shift+Tab
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
  table.on("cellEdited", (cell) => autosaveCell(cell));
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

  // Global keys
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

/* ===== BINDINGS ===== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      table?.setPage(1);
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
        lot_id: null,
        lot_code: "",
        lot_no: "",
        due_date: null,
        status: "open",
        notes: "",
        created_by_id: null,
        created_at: null,
      },
      true
    );
    row.getCell("lot_id")?.edit(true); // ต้องกรอก lot_id เพื่อ POST
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
});
