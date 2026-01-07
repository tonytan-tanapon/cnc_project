// /static/js/page-parts.js — AUTOSAVE + Tab nav + Undo/Redo + Delete only
import { $, jfetch, showToast as toast } from "./api.js";

const UI = { q: "_q", add: "_add", table: "listBody" };
const DETAIL_PAGE = "./part-detail.html";
const partDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

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
  // ถ้า part_no ว่าง ให้ส่ง null เพื่อให้ backend autogen (ถ้ารองรับ)
  const part_no = trim(row.part_no) || null;
  return {
    part_no,
    name: trim(row.name) || null,
    description: row.description ? trim(row.description) : "",
    uom: row.uom ? trim(row.uom) : null,
    status: row.status || "active",
  };
}

function requiredReady(row) {
  // บังคับอย่างน้อยต้องมี name
  return !!trim(row.name);
}

/* ===== Columns ===== */
function makeColumns() {
  return [
    

    // แยกคอลัมน์ View ออกมาเพื่อยังมีลิงก์ไปหน้า detail
    {
      title: "View",
      field: "_view",
      width: 90,
      headerSort: false,
      hozAlign: "center",
      formatter: (cell) => {
        const id = cell.getRow()?.getData()?.id;
        if (!id) return `<span class="muted">—</span>`;
        return `<a class="view-link" href="${partDetail(
          id
        )}" title="Open detail">View</a>`;
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
      headerSort: false,
      minWidth: 220,
      formatter: (cell) => renderRevisionsInline(cell.getValue()),
      // read-only
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
      cellClick: async (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow());
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
// pass { fromHistory: true, revert: () => table.undo()/redo() } when needed
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;

  const row = cell.getRow();
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // Rule: name required
  if (fld === "name" && !trim(newVal)) {
    toast("Name required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  const payload = buildPayload(d);

  // CREATE: first time only when required fields present
  if (!d.id) {
    if (!requiredReady(d)) return; // wait until name filled
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch("/parts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);
      row.update({ ...norm });
      toast(`Part "${norm.part_no || norm.name}" created`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  // UPDATE: debounced
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    try {
      const updated = await jfetch(`/parts/${encodeURIComponent(d.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(updated || d);
      row.update({ ...d, ...norm, id: norm.id ?? d.id });
      toast(`Saved "${norm.part_no || norm.name}"`);
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
      `Delete this part "${
        d.part_no || d.name || d.id
      }"?\nThis action cannot be undone.`
    )
  )
    return;
  try {
    await jfetch(`/parts/${encodeURIComponent(d.id)}`, { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== TABLE ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    data: [],
    columns: makeColumns(),
    placeholder: "No parts",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,
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

/* ===== FETCH ALL HELPERS ===== */
// พยายาม all=1 ก่อน ถ้า backend รองรับ จะได้เร็ว
async function tryFetchAllParam(keyword = "") {
  const usp = new URLSearchParams();
  usp.set("all", "1");
  usp.set("include", "revisions");
  if (keyword) usp.set("q", keyword);
  const res = await jfetch(`/parts?${usp.toString()}`);
  const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  const total = res?.total ?? items.length;
  return { items, total, pages: res?.pages ?? 1 };
}

const PAGED_PER_PAGE = 200;
async function fetchAllByPaging(keyword = "") {
  const perPage = PAGED_PER_PAGE;
  let page = 1;
  const all = [];
  while (true) {
    const usp = new URLSearchParams();
    usp.set("page", String(page));
    usp.set("page_size", String(perPage));
    usp.set("include", "revisions");
    if (keyword) usp.set("q", keyword);
    const res = await jfetch(`/parts?${usp.toString()}`);
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

    let ok = false;
    try {
      const { items, total, pages } = await tryFetchAllParam(keyword);
      records = items;
      if (records.length < (total || records.length) || (pages && pages > 1)) {
        records = await fetchAllByPaging(keyword);
      }
      ok = true;
    } catch {
      // ถ้า backend ไม่รองรับ all=1 → ถอยไปใช้ paging
    }
    if (!ok) {
      records = await fetchAllByPaging(keyword);
    }

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
  const btn = els[UI.add];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        part_no: "", // เว้นว่างได้ → backend autogen
        name: "",
        uom: "ea",
        description: "",
        status: "active",
        created_at: null,
        revisions: [],
      },
      true
    );
    row.getCell("name")?.edit(true); // กระตุ้น POST
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
  loadAll();
});
