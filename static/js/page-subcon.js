// /static/js/page-subcon.js — safe boot, guards, keyset scroll, autosave create

import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/subcon/orders",
  byId: (id) => `/subcon/orders/${encodeURIComponent(id)}`,
  keyset: (qs) => `/subcon/keyset?${qs}`,
};
const PAGED_PER_PAGE = 500;
const JSON_HEADERS = { "Content-Type": "application/json" };

/* ===== UI ids ===== */
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;
let isBuilt = false;
function waitForTableBuilt() {
  if (isBuilt) return Promise.resolve();
  return new Promise((resolve) => {
    if (table) table.on("tableBuilt", () => resolve());
  });
}

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDateTime = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleDateString();
};
const numOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* supplier autocomplete */
async function fetchSuppliers(term) {
  const q = (term || "").trim();
  try {
    const usp = new URLSearchParams();
    if (q) usp.set("q", q);
    usp.set("page", "1");
    usp.set("page_size", "10");
    // แนะนำให้ backend มี /suppliers ที่ query ได้
    const res = await jfetch(`/suppliers?${usp.toString()}`);
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({
      id: x.id,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    return [];
  }
}

/* ===== normalizers ===== */
function normalizeOrder(o) {
  const sup = o.supplier || {};
  return {
    id: o.id,
    ref_no: o.ref_no ?? "",
    supplier_id: sup.id ?? o.supplier_id ?? null,
    supplier_code: sup.code ?? "",
    supplier_name: sup.name ?? "",
    supplier_disp:
      sup.code || sup.name ? `${sup.code ?? ""} — ${sup.name ?? ""}` : "",
    status: o.status ?? "",
    due_date: o.due_date ?? null,
    created_at: o.created_at ?? null,
    notes: o.notes ?? "",
  };
}

function buildPayload(row) {
  const payload = {};
  if (row.supplier_id != null) payload.supplier_id = row.supplier_id;
  if (trim(row.ref_no)) payload.ref_no = trim(row.ref_no);
  if (row.due_date) payload.due_date = row.due_date;
  if (trim(row.notes)) payload.notes = trim(row.notes);
  return payload;
}

function requiredReady(row) {
  return row.supplier_id != null; // สร้างได้เมื่อเลือก supplier แล้ว
}

/* ===== Supplier Editor ===== */
function supplierEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchSuppliers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b> — ${safe(it.name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      const row = cell.getRow();
      row.update({
        supplier_id: it.id,
        supplier_code: it.code,
        supplier_name: it.name,
        supplier_disp: `${it.code} — ${it.name}`,
      });
      success(`${it.code} — ${it.name}`); // trigger cellEdited → autosave
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
      if (!d.supplier_id) {
        toast("Pick a supplier from the list", false);
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
    row.update({ supplier_id: null }); // invalidate until a pick is made
  });

  return input;
}

/* ===== Columns ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      width: 70,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: "rownum",
    },
    {
      title: "Ref No.",
      field: "ref_no",
      width: 160,
      editor: "input",
    },
    {
      title: "Supplier",
      field: "supplier_disp",
      minWidth: 260,
      editor: supplierEditor,
      headerSort: true,
    },
    {
      title: "Status",
      field: "status",
      width: 140,
      editor: false,
    },
    {
      title: "Due",
      field: "due_date",
      width: 140,
      editor: "date",
      formatter: (c) => fmtDate(c.getValue()),
    },
    {
      title: "Created",
      field: "created_at",
      width: 180,
      editor: false,
      formatter: (c) => fmtDateTime(c.getValue()),
    },
    {
      title: "Notes",
      field: "notes",
      minWidth: 220,
      widthGrow: 2,
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
      cellClick: async (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== AUTOSAVE ===== */
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;
  const row = cell.getRow();
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  if (fld === "supplier_disp" && d.supplier_id == null) {
    toast("Pick a supplier from the list", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  const payload = buildPayload(d);

  // CREATE
  if (!d.id) {
    if (!requiredReady(d)) return; // wait until supplier picked
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          supplier_id: d.supplier_id,
          ref_no: trim(d.ref_no) || null,
          due_date: d.due_date || null,
          notes: trim(d.notes || "") || null,
          lines: [], // create header-only
        }),
      });
      const normalized = normalizeOrder(created);
      row.update({ ...normalized });
      toast("Subcon order created");
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  // UPDATE (debounced per-row)
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    try {
      const updated = await jfetch(ENDPOINTS.byId(d.id), {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeOrder(updated);
      row.update({ ...normalized });
      toast(`Saved #${normalized.id}`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) {
        cell.setValue(oldVal, true);
      } else if (typeof revert === "function") {
        revert();
      } else {
        try {
          const fresh = await jfetch(ENDPOINTS.byId(d.id));
          row.update(normalizeOrder(fresh));
        } catch {}
      }
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm(`Delete subcon order #${d.id}?`)) return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== Table ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    data: [],
    columns: makeColumns(),
    placeholder: "No subcon orders",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    requestAnimationFrame(() => table.redraw(true));
    bindIntersectionLoader();
  });

  // Tab/Shift+Tab nav
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
    if (action === "cellEdit" && component?.getRow) {
      autosaveCell(component, {
        fromHistory: true,
        revert: () => table.redo(),
      });
    }
  });
  table.on("historyRedo", (action, component) => {
    if (action === "cellEdit" && component?.getRow) {
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

/* ===== Editable nav helpers ===== */
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

/* ===== Keyset Infinite Scroll ===== */
let cursor = null;
let ksLoading = false;
let ksDone = false;
let ksKeyword = "";
let ksSeq = 0;
let io = null;
let lastLoadAt = 0;

function getTableHolder() {
  return document.querySelector(`#${UI.table} .tabulator-tableholder`);
}
function ensureSentinel() {
  const holder = getTableHolder();
  if (!holder) return null;
  let s = holder.querySelector(".sc-sentinel");
  if (!s) {
    s = document.createElement("div");
    s.className = "sc-sentinel";
    s.style.height = "1px";
    s.style.width = "100%";
    holder.appendChild(s);
  }
  return s;
}
function bindIntersectionLoader() {
  const holder = getTableHolder();
  const sentinel = ensureSentinel();
  if (!holder || !sentinel) return;
  if (io) io.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      const [e] = entries;
      if (!e.isIntersecting) return;
      const now = Date.now();
      if (now - lastLoadAt < 300) return;
      if (ksLoading || ksDone) return;
      lastLoadAt = now;
      loadKeyset(ksKeyword, cursor);
    },
    { root: holder, threshold: 0, rootMargin: "0px 0px 200px 0px" }
  );
  io.observe(sentinel);
}

async function loadKeyset(keyword = "", afterId = null) {
  await waitForTableBuilt();
  if (ksLoading || ksDone) return;
  ksLoading = true;
  const mySeq = ++ksSeq;

  try {
    const usp = new URLSearchParams();
    if (keyword) usp.set("q", keyword);
    if (afterId) usp.set("after_id", String(afterId));
    usp.set("limit", String(PAGED_PER_PAGE));

    const res = await jfetch(ENDPOINTS.keyset(usp.toString()));
    if (mySeq !== ksSeq) return; // stale async

    const items = Array.isArray(res) ? res : res.items ?? [];
    const rows = items.map(normalizeOrder);

    if (!afterId) {
      table.setData(rows);
      ensureSentinel();
    } else {
      await table.addData(rows);
    }

    cursor = res?.next_cursor ?? null;
    if (typeof res?.has_more === "boolean") {
      ksDone = !res.has_more;
    } else {
      ksDone = !cursor || rows.length === 0;
    }
  } catch (e) {
    toast(e?.message || "Load failed", false);
    // กัน request รัว: mark done ชั่วคราว
    ksDone = true;
  } finally {
    ksLoading = false;
  }
}

function bindSearchKeyset() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      ksKeyword = box.value.trim();
      cursor = null;
      ksDone = false;
      ksSeq++; // cancel older requests
      loadKeyset(ksKeyword, null);
    }, 300);
  });
}

function bindAdd() {
  const btn = els[UI.add];
  if (!btn) return; // ✅ guard ปุ่มไม่อยู่
  btn.addEventListener("click", async () => {
    if (!table) return;
    const row = await table.addRow(
      {
        ref_no: "",
        supplier_id: null,
        supplier_disp: "",
        status: "open",
        due_date: null,
        notes: "",
        created_at: null,
      },
      true
    );
    // โฟกัสไปคอลัมน์ supplier ให้เลือกก่อน
    row.getCell("supplier_disp")?.edit(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  // map elements (บางครั้งหน้าอื่นอาจใช้ id ซ้ำ ตรวจสอบก่อน)
  els[UI.q] = document.getElementById(UI.q) || null;
  els[UI.add] = document.getElementById(UI.add) || null;

  const mount = document.getElementById(UI.table);
  if (!mount) {
    console.warn("[subcon] #listBody not found; abort init.");
    return;
  }

  initTable();
  bindAdd();
  bindSearchKeyset();

  await waitForTableBuilt();
  cursor = null;
  ksDone = false;
  ksKeyword = "";
  ksSeq++;
  loadKeyset("", null);
});
