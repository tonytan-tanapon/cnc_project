// /static/js/page-batches.js — AUTOSAVE + Tab/Shift+Tab + Undo/Redo + Delete-only
// UI ids: _q (search), _add (add), listBody (table)

import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/batches",
  byId: (id) => `/batches/${encodeURIComponent(id)}`,
};
const DETAIL_PAGE = "./batches-detail.html"; // ถ้าไม่มีหน้า detail จะปล่อยลิงก์ไว้เฉยๆ
const batchDetail = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

const JSON_HEADERS = { "Content-Type": "application/json" };
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== Pagination (Show All as default; ทำ emulation ฝั่ง client จาก /batches ที่ส่ง list ตรง) ===== */
const DEFAULT_PAGE_SIZE = true; // true = Show All
const PAGE_SIZE_CHOICES = [20, 50, 100, 200, true];

/* ===== STATE ===== */
let els = {};
let table = null;
let cacheAll = []; // เก็บผล /batches ทั้งหมด
let totalItems = 0;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet(); // rows ที่กำลัง POST
const patchTimers = new Map(); // row -> timeout
const PATCH_DEBOUNCE_MS = 350;
const suppressAutosaveRows = new WeakSet(); // กันวน loop ตอน setValue/update จากโค้ด

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const toDecOrNullStr = (v) => {
  const s = trim(v);
  if (s === "") return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return String(s); // เก็บเป็น string เพื่อ backend Decimal
};
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
};

function normalizeRow(r) {
  return {
    id: r.id ?? r.batch_id ?? r.batchId ?? null,
    batch_no: r.batch_no ?? "",
    material_id: r.material_id ?? null,
    supplier_id: r.supplier_id ?? null,
    supplier_batch_no: r.supplier_batch_no ?? "",
    mill_name: r.mill_name ?? "",
    mill_heat_no: r.mill_heat_no ?? "",
    received_at: r.received_at ?? "", // keep as string (YYYY-MM-DD)
    qty_received: r.qty_received ?? "", // string number/decimal
    qty_used: r.qty_used ?? "", // optional
    location: r.location ?? "",
    status: r.status ?? "active",
  };
}

/* สร้าง payload สำหรับสร้าง/อัปเดต */
function buildCreatePayload(d) {
  // rule: ต้องมี material_id และ qty_received > 0; batch_no ว่าง = AUTO
  const rawBatch = trim(d.batch_no).toUpperCase();
  const autogen =
    rawBatch === "" || rawBatch === "AUTO" || rawBatch === "AUTOGEN";
  const qty = toDecOrNullStr(d.qty_received);

  return {
    material_id: d.material_id ? Number(d.material_id) : null,
    batch_no: autogen ? "AUTO" : rawBatch,
    supplier_id: d.supplier_id ? Number(d.supplier_id) : null,
    supplier_batch_no: trim(d.supplier_batch_no) || null,
    mill_name: trim(d.mill_name) || null,
    mill_heat_no: trim(d.mill_heat_no) || null,
    received_at: trim(d.received_at) || null,
    qty_received: qty, // string
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

/* สร้างได้เมื่อฟิลด์จำเป็นครบ */
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
      `Delete this batch "${
        d.batch_no || d.id
      }"?\nThis action cannot be undone.`
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
      title: "No.",
      field: "_rowno",
      width: 70,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: (cell) => {
        const pos = cell.getRow().getPosition(true);
        const cur = table.getPage() || 1;
        const ps = table.getPageSize();
        const eff = ps === true ? totalItems || table.getDataCount() : ps || 1;
        return (cur - 1) * eff + pos;
      },
    },
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
          ? `<a class="code-link" href="${batchDetail(rid)}">${txt}</a>`
          : txt;
      },
      cellClick: (e, cell) => {
        const a = e.target.closest("a.code-link");
        if (a) {
          e.stopPropagation();
          location.href = a.href;
        }
      },
    },
    { title: "Material ID", field: "material_id", width: 120, editor: "input" },
    { title: "Supplier ID", field: "supplier_id", width: 120, editor: "input" },
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
      title: "Qty Recv",
      field: "qty_received",
      width: 110,
      hozAlign: "right",
      editor: "input",
    },
    {
      title: "Qty Used",
      field: "qty_used",
      width: 100,
      hozAlign: "right",
      editor: "input",
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

  // validate minimal rules
  if (fld === "material_id" || fld === "qty_received") {
    // ไม่ block ระหว่างพิมพ์ แต่จะ block ตอน POST ถ้าไม่ครบ
  }

  // CREATE
  if (!d.id) {
    const payload = buildCreatePayload(d);
    if (!requiredReady(d)) return; // รอจนกรอกครบ material_id + qty_received > 0

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

      toast(`Batch "${norm.batch_no || norm.id}" created`);

      // sync cache
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

      const norm = normalizeRow(updated || d);
      suppressAutosaveRows.add(row);
      try {
        safeRowUpdate(row, { ...d, ...norm, id: norm.id ?? d.id });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }

      // sync cache
      const idx = cacheAll.findIndex((x) => (x.id ?? x.batch_id) === norm.id);
      if (idx >= 0) cacheAll[idx] = updated;

      toast(`Saved "${norm.batch_no || norm.id}"`);
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
    paginationSize: DEFAULT_PAGE_SIZE, // true = Show All
    paginationSizeSelector: PAGE_SIZE_CHOICES,
    paginationCounter: "rows",

    ajaxURL: ENDPOINTS.base,
    ajaxRequestFunc: async (_url, _cfg, params) => {
      const page = params.page || 1;
      const showAll = params.size === true;
      const size = showAll ? 0 : Number(params.size) || 50;

      if (!cacheAll.length) {
        const list = await jfetch(ENDPOINTS.base); // backend รีเทิร์นเป็น list ตรง
        cacheAll = Array.isArray(list) ? list : list?.items ?? [];
      }

      const keyword = (els[UI.q]?.value || "").trim().toLowerCase();
      const filtered = keyword
        ? cacheAll.filter(
            (x) =>
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
        material_id: null,
        supplier_id: null,
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
    // ให้เริ่มที่ material_id ก่อน
    row.getCell("material_id")?.edit(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
  // ปล่อยให้ Tabulator ยิง ajaxRequestFunc เอง
});
