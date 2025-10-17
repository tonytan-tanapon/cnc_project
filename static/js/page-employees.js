// /static/js/page-employees.js — Keyset load + AUTOSAVE + Tab nav + Undo/Redo + Delete-only (fix: waitForTableBuilt)
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/employees",
  byId: (id) => `/employees/${encodeURIComponent(id)}`,
  keyset: (qs) => `/employees/keyset?${qs}`,
};
const JSON_HEADERS = { "Content-Type": "application/json" };
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;
let isBuilt = false;

/* wait for tableBuilt (ป้องกันโหลดก่อน DOM พร้อม) */
function waitForTableBuilt() {
  if (isBuilt) return Promise.resolve();
  return new Promise((resolve) => {
    if (!table) return resolve(); // fallback
    table.on("tableBuilt", () => resolve());
  });
}

/* Keyset paging state */
const KS_LIMIT = 200;
let ksCursor = null; // next_cursor (ไปหน้า "เก่า")
let ksPrevAnchor = null; // prev_cursor (ไว้ทำปุ่มย้อนกลับถ้าจะทำ)
let ksHasMore = true;
let ksKeyword = "";
let ksLoading = false;
let io = null;

/* กันโหลดคิวแรกถ้าโดนเรียกก่อน tableBuilt */
let queuedFirstLoad = null;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;
const suppressAutosaveRows = new WeakSet(); // mute autosave when we mutate from code

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());

function buildPayload(row) {
  return {
    emp_code: row.emp_code ? String(row.emp_code).toUpperCase() : null,
    name: trim(row.name) || null,
    position: row.position ? trim(row.position) : null,
    department: row.department ? trim(row.department) : null,
    email: row.email ? trim(row.email) : null,
    phone: row.phone ? trim(row.phone) : null,
    status: row.status || "active",
  };
}

function normalizeRow(r) {
  return {
    id: r.id ?? r.employee_id ?? r.employeeId ?? null,
    emp_code: r.emp_code ?? r.code ?? "",
    name: r.name ?? "",
    position: r.position ?? "",
    department: r.department ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    status: r.status ?? "active",
  };
}

// แทนที่ safeRowUpdate เดิมทั้งหมด ด้วยอันนี้
function safeRowUpdate(row, obj) {
  try {
    // ถ้ามี editor เปิดอยู่ → ปิดก่อน
    if (table && typeof table.cancelEdit === "function") {
      table.cancelEdit();
    }
  } catch {}

  try {
    if (row && row.getElement && row.getElement()) {
      // update เฉพาะเมื่อ row ยังอยู่ใน DOM
      row.update(obj);
    } else {
      // fallback: ใช้ updateData โดยชี้ด้วย id
      if (obj.id) {
        table?.updateData([{ ...obj }]);
      }
    }
  } catch (e) {
    console.warn("safeRowUpdate failed", e);
  }

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
      `Delete this employee "${
        d.emp_code || d.name || d.id
      }"?\nThis action cannot be undone.`
    )
  )
    return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== Columns ===== */
function makeColumns() {
  return [
   
    { title: "Code", field: "emp_code", width: 120, editor: "input" },
    {
      title: "Name",
      field: "name",
      minWidth: 160,
      editor: "input",
      validator: "required",
    },
    { title: "Position", field: "position", width: 160, editor: "input" },
    { title: "Department", field: "department", width: 160, editor: "input" },
    { title: "Email", field: "email", width: 220, editor: "input" },
    { title: "Phone", field: "phone", width: 140, editor: "input" },
    {
      title: "Status",
      field: "status",
      width: 120,
      editor: "list",
      editorParams: { values: ["active", "on_leave", "inactive"] },
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

/* ===== Tab / Shift+Tab navigation while editing ===== */
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

/* ===== AUTOSAVE ===== */
function isMethodNotAllowed(err) {
  const msg = (err && (err.message || String(err))) || "";
  const st = err?.status || err?.statusCode;
  return st === 405 || /method not allowed/i.test(msg);
}

// pass { fromHistory: true, revert: () => table.undo()/redo() } when called from history
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;

  const row = cell.getRow();
  if (suppressAutosaveRows.has(row)) return;

  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // name required
  if (fld === "name" && !trim(newVal)) {
    suppressAutosaveRows.add(row);
    try {
      if (!fromHistory) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
    } finally {
      setTimeout(() => suppressAutosaveRows.delete(row), 0);
    }
    toast("Name required", false);
    return;
  }

  const payload = buildPayload(d);

  // CREATE
  if (!d.id) {
    if (!payload.name) return; // wait until name present
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);
      suppressAutosaveRows.add(row);
      try {
        safeRowUpdate(row, { ...norm });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(`Employee "${norm.name}" created`);
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
      const norm = normalizeRow(updated || d);
      suppressAutosaveRows.add(row);
      try {
        safeRowUpdate(row, { ...d, ...norm, id: norm.id ?? d.id });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(`Saved changes to "${norm.name}"`);
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
    data: [],
    columns: makeColumns(),
    placeholder: "No employees",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    requestAnimationFrame(() => table.redraw(true));
    bindIntersectionLoader();

    // ถ้ามีคิวโหลดที่ถูกขอไว้ก่อน tableBuilt ให้ยิงทันที
    if (queuedFirstLoad) {
      const { keyword, cursor } = queuedFirstLoad;
      queuedFirstLoad = null;
      loadKeyset(keyword, cursor);
    }
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

  // autosave hooks
  table.on("cellEdited", (cell) => {
    if (suppressAutosaveRows.has(cell.getRow())) return;
    autosaveCell(cell);
  });
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

  // global keys
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? table.redo() : table.undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      table.redo();
    } else if (e.key === "Delete") {
      const sel = table.getSelectedRows?.();
      if (sel && sel[0]) deleteRow(sel[0]);
    }
  });
}

/* ===== Keyset loader (IntersectionObserver near bottom) ===== */
function getTableHolder() {
  return document.querySelector(`#${UI.table} .tabulator-tableholder`);
}

function bindIntersectionLoader() {
  const holder = getTableHolder();
  const sentinel = document.getElementById("emp_sentinel");
  if (!holder || !sentinel) return;

  if (io) io.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      const [e] = entries;
      if (!e.isIntersecting) return;
      if (ksLoading || !ksHasMore) return;
      loadKeyset(ksKeyword, ksCursor);
    },
    { root: holder, threshold: 0, rootMargin: "0px 0px 200px 0px" }
  );
  io.observe(sentinel);
}

async function loadKeyset(keyword = "", cursor = null) {
  // ถ้า table ยังไม่ build เก็บคิวไว้ แล้วยิงตอน build เสร็จ
  if (!isBuilt) {
    queuedFirstLoad = { keyword, cursor };
    return;
  }
  if (ksLoading) return;
  ksLoading = true;

  try {
    const usp = new URLSearchParams();
    if (keyword) usp.set("q", keyword);
    usp.set("limit", String(KS_LIMIT));
    if (cursor) usp.set("cursor", String(cursor));

    const res = await jfetch(ENDPOINTS.keyset(usp.toString()));
    const items = Array.isArray(res) ? res : res.items ?? [];
    const rows = items.map(normalizeRow);

    if (!cursor) table.setData(rows);
    else await table.addData(rows);

    ksCursor = res?.next_cursor ?? null;
    ksPrevAnchor = res?.prev_cursor ?? null;
    ksHasMore = !!res?.has_more;
  } catch (e) {
    toast("Load failed", false);
  } finally {
    ksLoading = false;
  }
}

/* ===== BINDINGS ===== */
function bindSearchKeyset() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      ksKeyword = box.value.trim();
      ksCursor = null;
      ksHasMore = true;
      loadKeyset(ksKeyword, null); // reload first page
    }, 300);
  });
}

function bindAdd() {
  const btn = els[UI.add];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        emp_code: "",
        name: "",
        position: "",
        department: "",
        email: "",
        phone: "",
        status: "active",
      },
      true
    );
    row.getCell("name")?.edit(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindAdd();
  bindSearchKeyset();

  // initial load — รอ tableBuilt ให้เรียบร้อยก่อน
  ksKeyword = "";
  ksCursor = null;
  ksHasMore = true;

  await waitForTableBuilt();
  loadKeyset("", null);
});
