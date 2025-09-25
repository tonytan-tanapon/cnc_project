// /static/js/page-pos.js (inline CRUD + autocomplete + fetch ALL + PO line "View")
// v2 — robust qs, JSON headers, safer ALL loading & cancel

import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/pos",
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
  list: (qs) => `/pos?${qs}`,
};
const PAGED_PER_PAGE = 200; // page size เมื่อ fallback โหลดแบบแบ่งหน้า
const JSON_HEADERS = { "Content-Type": "application/json" };

const UI = { q: "po_q", add: "po_add", table: "po_table" };

/* ===== STATE ===== */
let els = {};
let table = null;
// เก็บ snapshot เดิมของแต่ละ id เพื่อให้ Cancel ย้อนกลับได้แม่นยำ
const origById = new Map();

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};

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
    _dirty: false,
  };
}

function buildPayload(row) {
  return {
    po_number: trim(row.po_number) || null,
    customer_id: row.customer_id ?? null,
    description: row.description ? trim(row.description) : "",
  };
}

/* ===== Customer Autocomplete Editor ===== */
async function fetchCustomers(term) {
  const q = (term || "").trim();
  // เปิดแนะนำ 10 รายการแรกเมื่อยังไม่พิมพ์
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
  // ค้นหาตาม q
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
      success(`${it.code} — ${it.name}`); // commit ค่าให้เซลล์
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

  // ถ้าพิมพ์เอง -> ยังไม่เลือกจากลิสต์ ให้ clear id ไปก่อน
  input.addEventListener("input", () => {
    const row = cell.getRow();
    row.update({ customer_id: null });
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

    { title: "PO No.", field: "po_number", width: 150, editor: "input" },

    // PO line (View only)
    {
      title: "PO line",
      field: "_po_line",
      width: 110,
      headerSort: false,
      hozAlign: "center",
      formatter: (cell) => {
        const id = cell.getRow()?.getData()?.id;
        if (!id) return `<span class="muted">—</span>`;
        const href = `/static/pos-detail.html?id=${encodeURIComponent(id)}`;
        return `<a class="view-link" href="${href}" title="View PO Lines">View</a>`;
      },
      cellClick: (e) => {
        const a = e.target.closest("a.view-link");
        if (a) e.stopPropagation(); // ให้ browser นำทางเอง (รองรับ Ctrl/Cmd-Click)
      },
    },

    {
      title: "Customer",
      field: "customer_disp",
      minWidth: 260,
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
      title: "",
      field: "_actions",
      width: 200,
      hozAlign: "right",
      headerSort: false,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        const show = d._dirty === true || !d.id; // แก้ไขอยู่หรือเป็นแถวใหม่
        return `
          <button class="btn-small" ${
            show ? "" : "style='display:none'"
          } data-act="save">Save</button>
          <button class="btn-small secondary" ${
            show ? "" : "style='display:none'"
          } data-act="cancel">Cancel</button>
          <button class="btn-small btn-danger" data-act="del">Delete</button>
        `;
      },
      cellClick: async (e, cell) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const row = cell.getRow();
        if (btn.dataset.act === "save") await saveRow(row);
        else if (btn.dataset.act === "cancel") await cancelRow(row);
        else if (btn.dataset.act === "del") await deleteRow(row);
      },
    },
  ];
}

/* ===== Row Ops ===== */
async function saveRow(row) {
  const d = row.getData();
  if (!trim(d.po_number)) {
    toast("PO No. is required", false);
    row.getCell("po_number")?.edit(true);
    return;
  }
  if (!d.customer_id) {
    toast("Select Customer", false);
    row.getCell("customer_disp")?.edit(true);
    return;
  }
  const payload = buildPayload(d);
  try {
    if (!d.id) {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeRow(created);
      row.update({ ...normalized, _dirty: false });
      origById.set(normalized.id, normalized);
      toast("PO created");
    } else {
      const updated = await jfetch(ENDPOINTS.byId(d.id), {
        method: "PATCH", // ใช้ PATCH (หรือเปิด PUT ฝั่ง API เพิ่มได้)
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const normalized = normalizeRow(updated);
      row.update({ ...normalized, _dirty: false });
      origById.set(normalized.id, normalized);
      toast("Saved");
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    row.reformat();
  }
}

async function cancelRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
  } else {
    const orig = origById.get(d.id);
    if (orig) row.update({ ...orig, _dirty: false });
    else {
      try {
        const fresh = await jfetch(ENDPOINTS.byId(d.id));
        const norm = normalizeRow(fresh);
        row.update({ ...norm, _dirty: false });
        origById.set(norm.id, norm);
      } catch {
        // ไม่เจอ / โหลดไม่ได้ -> แค่ลบธง dirty
        row.update({ _dirty: false });
      }
    }
  }
  row.reformat();
}

async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm("Delete this PO?\nThis action cannot be undone.")) return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    origById.delete(d.id);
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== Table ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "calc(100vh - 220px)",
    columns: makeColumns(),
    placeholder: "No POs",
    reactiveData: true,
    index: "id",
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
    setTimeout(() => table.redraw(true), 0);
  });

  // ไม่ autosave: แค่ทำให้เป็น dirty เพื่อโชว์ปุ่ม Save/Cancel
  table.on("cellEdited", (cell) => {
    const row = cell.getRow();
    const d = row.getData();
    if (!d._dirty) row.update({ _dirty: true });
    row.reformat();
  });
}

/* ===== Fetch ALL ===== */
function buildPagedQS(page, size, keyword = "") {
  const usp = new URLSearchParams();
  usp.set("page", String(page));
  // ส่งทั้งสองชื่อ param เพื่อรองรับได้กว้าง
  usp.set("per_page", String(size));
  usp.set("page_size", String(size));
  if (keyword) usp.set("q", keyword);
  return usp.toString();
}

async function tryFetchAllParam(keyword = "") {
  // ถ้า API รองรับ ?all=1 ก็ใช้ชุดเดียวจบ
  const usp = new URLSearchParams();
  usp.set("all", "1");
  if (keyword) usp.set("q", keyword);
  const res = await jfetch(ENDPOINTS.list(usp.toString()));
  const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  const total = res?.total ?? items.length;
  return { items, total, pages: res?.pages ?? 1 };
}

async function fetchAllByPaging(keyword = "") {
  const perPage = PAGED_PER_PAGE;
  let page = 1;
  const all = [];
  while (true) {
    const qs = buildPagedQS(page, perPage, keyword);
    const res = await jfetch(ENDPOINTS.list(qs));
    const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
    if (!items?.length) break;
    all.push(...items);
    const pages = res?.pages;
    if (pages && page >= pages) break;
    if (!pages && items.length < perPage) break; // ไม่มี pages -> หมดแล้ว
    page += 1;
  }
  return all;
}

async function loadAll(keyword = "") {
  try {
    let records = [];
    // ลอง all=1 ก่อน
    let usedAllParam = false;
    try {
      const { items, total, pages } = await tryFetchAllParam(keyword);
      records = items;
      usedAllParam = true;
      // ถ้าจำนวนที่ได้ยังไม่ครบ ให้ fallback เป็นแบ่งหน้า
      if (records.length < (total || records.length) || (pages && pages > 1)) {
        records = await fetchAllByPaging(keyword);
      }
    } catch {
      // ไม่น่ารองรับ all=1 -> fallback
    }
    if (!usedAllParam && records.length === 0) {
      records = await fetchAllByPaging(keyword);
    }

    const rows = records.map(normalizeRow);
    table?.setData(rows);
    // snapshot สำหรับ cancel
    origById.clear();
    rows.forEach((r) => r.id && origById.set(r.id, { ...r }));
    table?.redraw(true);
  } catch (e) {
    toast("Load failed", false);
    table?.setData([]);
    origById.clear();
    table?.redraw(true);
  }
}

/* ===== Bindings ===== */
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
        po_number: "",
        customer_id: null,
        customer_disp: "",
        description: "",
        created_at: null,
        _dirty: true,
      },
      true // add ที่ด้านบน
    );
    row.getCell("po_number")?.edit(true);
    row.reformat();
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
