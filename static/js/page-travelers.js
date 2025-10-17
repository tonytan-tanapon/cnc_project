// /static/js/page-travelers.js — AUTOSAVE + Tab nav + Undo/Redo + Delete
// + Remote pagination (Show All default) + Lot autocomplete + robust error revert/resync
import { $, jfetch, showToast as toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const API_BASE = "/api/v1";

const UI = { q: "_q", add: "_add", table: "listBody" };
const DETAIL_PAGE = "./traveler-detail.html";
const travelerDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

const DEFAULT_PAGE_SIZE = true;
const PAGE_SIZE_CHOICES = [20, 50, 100, 200, true];
let totalItems = 0;

const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;
const suppressAutosaveRows = new WeakSet();

let els = {};
let table = null;

/* ========== HELPERS ========== */
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
  return isNaN(d) ? String(v) : d.toLocaleDateString();
};
const toISODate = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Re-sync one row from server
async function resyncRow(id) {
  if (!id) return;
  try {
    const fresh = await jfetch(
      `${API_BASE}/travelers/${encodeURIComponent(id)}`
    );
    const norm = normalizeRow(fresh || {});
    if (table?.getRow?.(id)) {
      const row = table.getRow(id);
      suppressAutosaveRows.add(row);
      try {
        await table.updateOrAddData([norm], "id");
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
    }
  } catch {}
}

// ✔️ FIX: ใช้ t (ไม่ใช่ raw) และเติม lot_no/due map ให้ครบ
function normalizeRow(t) {
  const lot = t?.lot || {};
  const due =
    t.production_due_date ??
    t.due_date ??
    lot.production_due_date ??
    lot.due_date ??
    null;

  return {
    id: t.id,
    traveler_no: t.traveler_no || "",
    lot_id: t.lot_id ?? lot.id ?? null,
    lot_no: t.lot_no ?? lot.lot_no ?? "",
    // แสดงในตารางด้วยชื่อ due_date แต่ส่งกลับไปเป็น production_due_date
    due_date: due,
    status: t.status ?? "open",
    notes: t.notes ?? "",
    created_by_id: t.created_by_id ?? null,
    created_at: t.created_at ?? null,
    production_due_date: t.production_due_date ?? null,
  };
}

function buildPayload(row) {
  return {
    lot_id: row.lot_id ?? null,
    traveler_no: row.traveler_no || null,
    status: row.status || "open",
    notes: row.notes ? trim(row.notes) : null,
    created_by_id:
      row.created_by_id === "" || row.created_by_id == null
        ? null
        : Number(row.created_by_id),
    // map จากคอลัมน์ due_date → production_due_date (ชนิด Date ใน DB)
    production_due_date: toISODate(row.due_date),
  };
}

function requiredReady(row) {
  return row.lot_id != null && String(row.lot_id).trim() !== "";
}

/* ========== Lots Autocomplete ========== */
async function fetchLots(term) {
  const q = (term || "").trim();
  try {
    const usp = new URLSearchParams();
    usp.set("limit", "10");
    if (q) usp.set("q", q);
    const res = await jfetch(`${API_BASE}/lots/keyset?${usp.toString()}`);
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items
      .map((x) => ({
        id: x.id ?? x.lot_id ?? null,
        lot_no: x.lot_no ?? "",
        lot_code: x.lot_code ?? "",
        due_date: x.production_due_date ?? x.due_date ?? null,
      }))
      .filter((it) => it.id != null);
  } catch {
    return [];
  }
}

function lotEditor(cell, onRendered, success, cancel) {
  const start = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = start;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchLots,
    getDisplayValue: (it) => (it ? `${it.lot_no}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.lot_no)}</b>${
        it.lot_code ? " — " + safe(it.lot_code) : ""
      }${
        it.due_date
          ? ` <span class="muted">(${safe(
              new Date(it.due_date).toLocaleDateString()
            )})</span>`
          : ""
      }</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      const row = cell.getRow();
      suppressAutosaveRows.add(row);
      try {
        row.update({
          lot_id: it.id,
          lot_no: it.lot_no,
          due_date: it.due_date ?? null,
        });
      } finally {
        setTimeout(() => {
          suppressAutosaveRows.delete(row);
          success(it.lot_no);
          setTimeout(() => autosaveCell(cell), 0);
        }, 0);
      }
    },
    onError: (err) => console.error("[autocomplete:lots]", err),
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const d = cell.getRow().getData();
      if (!d.lot_id) {
        toast("Pick a lot from the list", false);
        return;
      }
      success(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    const row = cell.getRow();
    suppressAutosaveRows.add(row);
    try {
      row.update({ lot_id: null });
    } finally {
      setTimeout(() => suppressAutosaveRows.delete(row), 0);
    }
  });

  return input;
}

function dateEditor(cell, onRendered, success, cancel) {
  const toISO = (v) => {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
    const d = new Date(v);
    if (isNaN(d)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const startISO = toISO(cell.getValue());
  const input = document.createElement("input");
  input.type = "date";
  input.className = "tabulator-editing";
  input.style.width = "100%";
  input.value = startISO;

  if (input.type !== "date") {
    input.type = "text";
    input.placeholder = "YYYY-MM-DD";
    input.pattern = "\\d{4}-\\d{2}-\\d{2}";
  }

  onRendered(() => {
    input.focus();
    input.showPicker?.();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      success(input.value || "");
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("change", () => success(input.value || ""));
  input.addEventListener("blur", () => success(input.value || ""));

  return input;
}

/* ========== COLUMNS ========== */
function makeColumns() {
  return [
    
    {
      title: "Traveler No",
      field: "traveler_no",
      editor: "input",
      headerFilter: true,
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
    {
      title: "Lot No",
      field: "lot_no",
      width: 140,
      headerSort: true,
      editor: lotEditor,
      formatter: (c) => safe(c.getValue()),
      headerTooltip: "Pick a lot to link this traveler",
    },
    {
      title: "Production Due Date",
      field: "due_date",
      width: 180,
      editor: dateEditor,
      validator: ["string"],
      formatter: (cell) => fmtDate(cell.getValue()),
      headerTooltip: "YYYY-MM-DD",
    },
    {
      title: "Status",
      field: "status",
      width: 130,
      editor: "list", // (Tabulator v6) แทน select
      editorParams: {
        values: ["open", "in_progress", "hold", "closed", "canceled"],
      },
    },
    { title: "Notes", field: "notes", editor: "textarea" },
    {
      title: "Created By",
      field: "created_by_id",
      width: 120,
      editor: "input",
    },
    {
      title: "Created At",
      field: "created_at",
      headerSort: true,
      formatter: (c) => fmtDate(c.getValue()),
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
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow());
      },
    },
  ];
}

/* ========== AUTOSAVE ========== */
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;

  const row = cell.getRow();
  if (suppressAutosaveRows.has(row)) return;

  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  if (
    fld === "lot_no" &&
    (d.lot_id == null || String(d.lot_id).trim() === "")
  ) {
    toast("Pick a lot from the list", false);
    if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  if (fld === "due_date" && newVal != null) {
    const iso = toISODate(newVal);
    if (newVal !== "" && !iso) {
      toast("Invalid date. Use YYYY-MM-DD", false);
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      return;
    }
  }

  const payload = buildPayload(d);

  // CREATE
  if (!d.id) {
    if (!requiredReady(d)) return;
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch(`${API_BASE}/travelers`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);

      suppressAutosaveRows.add(row);
      try {
        row.update({ ...norm });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      requestAnimationFrame(() => table?.redraw(true));
      toast(`Traveler #${norm.id} created`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      await resyncRow(d.id);
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
      const updated = await jfetch(
        `${API_BASE}/travelers/${encodeURIComponent(d.id)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );
      const norm = normalizeRow(updated || d);

      suppressAutosaveRows.add(row);
      try {
        row.update({ ...d, ...norm, id: norm.id ?? d.id });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      requestAnimationFrame(() => table?.redraw(true));
      toast(`Saved traveler #${norm.id}`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) {
        suppressAutosaveRows.add(row);
        try {
          cell.setValue(oldVal, true);
        } finally {
          setTimeout(() => suppressAutosaveRows.delete(row), 0);
        }
      } else if (typeof revert === "function") {
        revert();
      }
      await resyncRow(d.id);
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ========== DELETE ========== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    return;
  }
  if (
    !confirm(
      `Delete traveler #${d.id}${
        d.lot_no ? ` (lot ${d.lot_no})` : ""
      }?\nThis action cannot be undone.`
    )
  )
    return;
  try {
    await jfetch(`${API_BASE}/travelers/${encodeURIComponent(d.id)}`, {
      method: "DELETE",
    });
    row.delete();
    toast("Deleted");
  } catch (e) {
    await resyncRow(d.id);
    toast(e?.message || "Delete failed", false);
  }
}

/* ========== TABLE ========== */
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
    paginationSize: DEFAULT_PAGE_SIZE,
    paginationSizeSelector: PAGE_SIZE_CHOICES,
    paginationCounter: "rows",

    ajaxURL: `${API_BASE}/travelers`,
    ajaxRequestFunc: async (_url, _config, params) => {
      const page = params.page || 1;
      const showAll = params.size === true;
      const size = showAll ? DEFAULT_PAGE_SIZE : Number(params.size) || 50;

      const keyword = (els[UI.q]?.value || "").trim();
      const usp = new URLSearchParams();
      if (showAll) usp.set("all", "1");
      if (keyword) usp.set("q", keyword);
      usp.set("_", String(Date.now()));

      const res = await jfetch(`${API_BASE}/travelers?${usp.toString()}`);
      const items = Array.isArray(res) ? res : res?.items ?? res ?? [];
      totalItems = Number(res?.total ?? items.length);

      const rows = items.map(normalizeRow);

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

  // Autosave hooks + Undo/Redo safety
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

/* ========== Tab utils ========== */
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

/* ========== BOOT ========== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
});

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
        traveler_no: "", // สามารถให้ backend autogen ได้ถ้าไม่ได้กรอก
        lot_id: null,
        lot_no: "",
        due_date: null,
        status: "open",
        notes: "",
        created_by_id: null,
        created_at: null,
      },
      true
    );
    row.getCell("lot_no")?.edit(true);
  });
}
