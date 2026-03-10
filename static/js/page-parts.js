// /static/js/page-parts.js — AUTOSAVE + Tab nav + Undo/Redo + Delete
import { $, jfetch, showToast as toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = { base: "/parts" };
const PAGED_PER_PAGE = 200;

const UI = { q: "_q", add: "_add", table: "listBody" };
const DETAIL_PAGE = "./part-detail.html";
const partDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
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

function renderRevisionsInline(revs) {
  const list = Array.isArray(revs) ? revs : [];
  if (!list.length) return `<span class="muted">—</span>`;
  return list
    .map((r) => {
      const cls = r.is_current ? "rev current" : "rev";
      return `<span class="${cls}" title="Revision ${safe(r.rev)}">${safe(
        r.rev
      )}</span>`;
    })
    .join(`<span class="rev-sep">, </span>`);
}

function normalizeRow(p) {
  return {
    id: p.id,
    part_no: p.part_no ?? "",
    name: p.name ?? "",
    uom: p.uom ?? "ea",
    description: p.description ?? "",
    status: p.status ?? "active",
    created_at: p.created_at ?? null,
    revisions: p.revisions ?? [],
  };
}

function buildPayload(row) {
  return {
    part_no: trim(row.part_no) || null,
    name: trim(row.name) || null,
    description: row.description ? trim(row.description) : "",
    uom: row.uom ? trim(row.uom) : null,
    status: row.status || "active",
  };
}

function requiredReady(row) {
  return !!trim(row.name);
}

/* ===== COLUMNS ===== */
function makeColumns() {
  return [
    {
      title: "View",
      width: 90,
      hozAlign: "center",
      headerSort: false,
      formatter: (cell) => {
        const id = cell.getRow()?.getData()?.id;
        if (!id) return `<span class="muted">—</span>`;
        return `<a class="view-link" href="${partDetail(id)}">View</a>`;
      },
      cellClick: (e) => {
        const a = e.target.closest("a.view-link");
        if (a) e.stopPropagation();
      },
    },

    { title: "Part No.", field: "part_no", width: 160, editor: "input" },

    {
      title: "Name",
      field: "name",
      minWidth: 200,
      editor: "input",
      validator: "required",
    },

    {
      title: "Revisions",
      field: "revisions",
      minWidth: 220,
      headerSort: false,
      formatter: (cell) => renderRevisionsInline(cell.getValue()),
    },

    { title: "UoM", field: "uom", width: 90, editor: "input" },

    {
      title: "Description",
      field: "description",
      minWidth: 240,
      widthGrow: 2,
      editor: "input",
      cssClass: "wrap",
    },

    {
      title: "Status",
      field: "status",
      width: 120,
      editor: "list",
      editorParams: { values: ["active", "inactive"] },
    },

    {
      title: "Created",
      field: "created_at",
      width: 180,
      formatter: (c) => fmtDate(c.getValue()),
    },

    {
      title: "Actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: () =>
        `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (btn) deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== TAB NAV ===== */
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
  const curIdx = fields.indexOf(curField);
  if (curIdx === -1) return;

  const rows = tab.getRows();
  const rowIdx = rows.indexOf(row);

  let nextFieldIdx = curIdx + dir;
  let nextRowIdx = rowIdx;

  if (nextFieldIdx >= fields.length) {
    nextFieldIdx = 0;
    nextRowIdx = Math.min(rowIdx + 1, rows.length - 1);
  } else if (nextFieldIdx < 0) {
    nextFieldIdx = fields.length - 1;
    nextRowIdx = Math.max(rowIdx - 1, 0);
  }

  const targetCell = rows[nextRowIdx]?.getCell(fields[nextFieldIdx]);
  if (!targetCell) return;

  targetCell.edit(true);
  const input = targetCell.getElement()?.querySelector("input");
  if (input) {
    const v = input.value;
    input.focus();
    input.setSelectionRange(v.length, v.length);
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

  if (fld === "name" && !trim(newVal)) {
    toast("Name required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else revert?.();
    return;
  }

  const payload = buildPayload(d);

  // CREATE
  if (!d.id) {
    if (!requiredReady(d)) return;
    if (createInFlight.has(row)) return;

    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      row.update(normalizeRow(created));
      toast(`Part "${created.part_no || created.name}" created`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else revert?.();
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
        `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
      row.update(normalizeRow(updated));
      toast(`Saved "${updated.part_no || updated.name}"`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else revert?.();
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);

  patchTimers.set(row, t);
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) return row.delete();

  if (!confirm(`Delete "${d.part_no || d.name}"?`)) return;

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

/* ===== TABLE INIT ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",          // ✅ same technique as Materials page
    columns: makeColumns(),
    placeholder: "No parts",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,
  });

  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const input = cell
        .getElement()
        ?.querySelector("input, textarea, [contenteditable]");
      if (!input) return;

      const handler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        }
      };

      input.addEventListener("keydown", handler);
      input.addEventListener("blur", () =>
        input.removeEventListener("keydown", handler)
      );
    }, 0);
  });

  table.on("cellEdited", (cell) => autosaveCell(cell));

  table.on("historyUndo", (action, component) => {
    if (action === "cellEdit")
      autosaveCell(component, { fromHistory: true, revert: () => table.redo() });
  });

  table.on("historyRedo", (action, component) => {
    if (action === "cellEdit")
      autosaveCell(component, { fromHistory: true, revert: () => table.undo() });
  });
}

/* ===== FETCH ===== */
async function fetchAllByPaging(keyword = "") {
  let page = 1;
  const all = [];

  while (true) {
    const usp = new URLSearchParams({
      page,
      page_size: PAGED_PER_PAGE,
      include: "revisions",
    });
    if (keyword) usp.set("q", keyword);

    const res = await jfetch(`${ENDPOINTS.base}?${usp}`);
    const items = res?.items ?? [];
    console.log(items)

    if (!items.length) break;
    all.push(...items);

    if (items.length < PAGED_PER_PAGE) break;
    page++;
  }

  return all;
}

/* ===== LOAD ===== */
async function loadAll(keyword = "") {
  try {
    const records = await fetchAllByPaging(keyword);
    table.setData(records.map(normalizeRow));
    table.redraw(true);
  } catch {
    toast("Load failed", false);
    table.setData([]);
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
  const btn = els[UI.add];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        part_no: "",
        name: "",
        uom: "ea",
        description: "",
        status: "active",
        revisions: [],
      },
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
