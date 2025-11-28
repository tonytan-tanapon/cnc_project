// /static/js/manage-pos.js — AUTOSAVE + Tab nav + Undo/Redo + Delete (+ keyset infinite scroll)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/pos",
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
  keyset: (qs) => `/pos/keyset?${qs}`,
};
const PAGED_PER_PAGE = 500;
const JSON_HEADERS = { "Content-Type": "application/json" };

// ใช้ IDs ตาม template แบบ materials
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;

// table-built guard
let isBuilt = false;
function waitForTableBuilt() {
  if (isBuilt) return Promise.resolve();
  return new Promise((resolve) => {
    if (table) table.on("tableBuilt", () => resolve());
  });
}

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet(); // rows being created
const patchTimers = new Map(); // row -> debounce timer
const PATCH_DEBOUNCE_MS = 350;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
// 🆕 helper สำหรับเด้งไปหน้า detail
const detailUrl = (id) =>
  `/static/manage-pos-detail.html?id=${encodeURIComponent(id)}`;
function goToDetail(id) {
  if (!id) return;
  // หน่วงนิดเดียวให้ Tabulator อัปเดตก่อน (กันกระตุก)
  setTimeout(() => {
    location.href = detailUrl(id);
  }, 0);
}
function normalizeRow(po) {
  const id = po.id;
  const code = po.customer?.code ?? "";
  const name = po.customer?.name ?? "";
  return {
    id,
    po_number: po.po_number ?? "",
    customer_id: po.customer?.id ?? null,
    customer_code: code,
    customer_name: name,
    customer_disp: code || name ? `${code} — ${name}` : "",
    description: po.description ?? "",
    created_at: po.created_at ?? null,
  };
}

function buildPayload(row) {
  return {
    po_number: trim(row.po_number) || null,
    customer_id: row.customer_id ?? null,
    description: row.description ? trim(row.description) : "",
  };
}

function requiredReady(row) {
  return !!trim(row.po_number) && row.customer_id != null;
}

/* ===== Customer Autocomplete Editor ===== */
async function fetchCustomers(term) {
  const q = (term || "").trim();
  if (!q) {
    try {
      const res = await jfetch(`/customers/keyset?limit=10`);
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((x) => ({
        id: x.id ?? x.customer_id ?? x.customerId,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    } catch {
      return [];
    }
  }
  try {
    const res = await jfetch(
      `/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`
    );
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({
      id: x.id ?? x.customer_id ?? x.customerId,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    return [];
  }
}

function customerEditor(cell, onRendered, success, cancel) {
  const start = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = start;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchCustomers,
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
        customer_id: it.id,
        customer_code: it.code,
        customer_name: it.name,
        customer_disp: `${it.code} — ${it.name}`,
      });
      success(`${it.code} — ${it.name}`); // triggers cellEdited → autosave
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
      if (!d.customer_id) {
        toast("Pick a customer from the list", false);
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
    row.update({ customer_id: null }); // invalidate until a pick is made
  });

  return input;
}

/* ===== Columns ===== */
function makeColumns() {
  return [
    { title: "PO No.", field: "po_number", width: 110, editor: "input" },
    {
      title: "View",
      field: "_po_line",
      width: 80,
      headerSort: false,
      hozAlign: "center",
      formatter: (cell) => {
        const id = cell.getRow()?.getData()?.id;
        if (!id) return `<span class="muted">—</span>`;
        const href = `/static/manage-pos-detail.html?id=${encodeURIComponent(
          id
        )}`;
        return `<a class="view-link" href="${href}" title="View PO Lines">View</a>`;
      },
      cellClick: (e) => {
        const a = e.target.closest("a.view-link");
        if (a) e.stopPropagation();
      },
    },
    {
      title: "Customer",
      field: "customer_disp",
      minWidth: 120,
      editor: customerEditor,
      headerSort: true,
    },
    {
      title: "Description",
      field: "description",
      minWidth: 220,
      widthGrow: 2,
      editor: "input",
      cssClass: "wrap",
    },
    {
      title: "Created",
      field: "created_at",
      width: 180,
      headerSort: true,
      editor: false,
      formatter: (c) => fmtDate(c.getValue()),
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
// call with { fromHistory: true, revert: () => table.undo()/redo() } when invoked by history
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;
  const row = cell.getRow();
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // Required fields
  if (fld === "po_number" && !trim(newVal)) {
    toast("PO No. is required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }
  if (fld === "customer_disp" && d.customer_id == null) {
    toast("Pick a customer from the list", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
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
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeRow(created);
      row.update({ ...normalized });
      toast("PO created");
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
      const updated = await jfetch(ENDPOINTS.byId(d.id), {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeRow(updated);
      row.update({ ...normalized });
      toast(`Saved PO ${normalized.po_number}`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) {
        cell.setValue(oldVal, true);
      } else if (typeof revert === "function") {
        revert();
      } else {
        // optional resync
        try {
          const fresh = await jfetch(ENDPOINTS.byId(d.id));
          const norm = normalizeRow(fresh);
          row.update({ ...norm });
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
  if (
    !confirm(
      `Delete this PO "${d.po_number || d.id}"?\nThis action cannot be undone.`
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

/* ===== Table ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    responsiveLayout: true, // ✅ ปรับขนาดอัตโนมัติเมื่อจอเล็ก
    resizableColumns: false, // ✅ ป้องกันคอลัมน์ลากยืดได้
    height: "100%",
    data: [],
    columns: makeColumns(),
    placeholder: "No POs",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    requestAnimationFrame(() => table.redraw(true));
    // bindIntersectionLoader(); // after table DOM exists
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

/* ===== Keyset Infinite Scroll (Observer + dynamic sentinel) ===== */
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
  let s = holder.querySelector(".po-sentinel");
  if (!s) {
    s = document.createElement("div");
    s.className = "po-sentinel";
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
      if (now - lastLoadAt < 300) return; // cooldown
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
    if (mySeq !== ksSeq) return; // stale

    const items = Array.isArray(res) ? res : res.items ?? [];
    const rows = items.map(normalizeRow);

    if (!afterId) {
      table.setData(rows);
      ensureSentinel(); // make sure sentinel exists after first paint
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
    toast("Load failed", false);
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
        po_number: "",
        customer_id: null,
        customer_disp: "",
        description: "",
        created_at: null,
      },
      true // add at top
    );
    row.getCell("po_number")?.edit(true);
  });
}

function initCreateForm() {
  const form = document.getElementById("poForm");
  const inputPo = document.getElementById("po_number");
  const inputCustomer = document.getElementById("customer_input");
  const inputDesc = document.getElementById("po_desc");
  const btnClear = document.getElementById("btnClear");

  attachAutocomplete(inputCustomer, {
    fetchItems: fetchCustomers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b> — ${safe(it.name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      inputCustomer.dataset.customerId = it.id;
      inputCustomer.value = `${it.code} — ${it.name}`;
    },
  });

  // ถ้าผู้ใช้ลบข้อความลูกค้า → เคลียร์ id ด้วย เพื่อกันส่งค่าเพี้ยน
  inputCustomer.addEventListener("input", () => {
    if (!trim(inputCustomer.value)) delete inputCustomer.dataset.customerId;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const po_number = trim(inputPo.value);
    const customer_id = inputCustomer.dataset.customerId
      ? Number(inputCustomer.dataset.customerId)
      : null;
    const description = trim(inputDesc.value);

    if (!customer_id) {
      toast("Please select a customer", false);
      return;
    }

    try {
      const payload = { po_number, customer_id, description };
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeRow(created);

      // จะ addData ก็ได้ แต่เราเด้งไปหน้า detail ต่อเลย
      // await table.addData([normalized], true);

      toast(`✅ PO ${normalized.po_number} added`);

      // 🆕 เด้งไปหน้า detail ของ PO ที่เพิ่งสร้าง
      goToDetail(normalized.id);

      // (โค้ดด้านล่างนี้จะไม่ค่อยได้ทำงานเพราะเราย้ายหน้าแล้ว
      //  แต่เก็บไว้ไม่เสียหาย)
      form.reset();
      delete inputCustomer.dataset.customerId;
    } catch (err) {
      toast(err?.message || "Create failed", false);
    }
  });

  btnClear.addEventListener("click", () => {
    form.reset();
    delete inputCustomer.dataset.customerId;
  });
}

/* =========[ OPTIONAL: ปุ่ม +Add Row แค่เพิ่มแถวว่างในตาราง (ไม่บังคับใช้) ]========= */
function bindAddRowButton() {
  const btn = els[UI.add];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    // ใช้เพื่อเพิ่มแถวว่างให้ดูได้ แต่ไม่ได้ยิง backend
    await table.addRow(
      { po_number: "", customer_disp: "", description: "", created_at: null },
      true
    );
  });
}

//const UI = { q: "_q", add: "_add", table: "listBody" };
// id in HTML
// _add, no use any more
/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();

  bindAdd();
  bindSearchKeyset();
  initCreateForm();

  await waitForTableBuilt();
  cursor = null;
  ksDone = false;
  ksKeyword = "";
  ksSeq++;
  loadKeyset("", null);
});
