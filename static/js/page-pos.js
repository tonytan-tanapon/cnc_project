// /static/js/page-pos.js (inline CRUD + autocomplete + infinite scroll + PO line "View")
// v5 — load-on-near-bottom (IntersectionObserver), no auto top-up, bigger page size, cooldown

import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/pos",
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
  list: (qs) => `/pos?${qs}`,
};
// Server allows up to 500; fewer requests = faster feel
const PAGED_PER_PAGE = 500;
const JSON_HEADERS = { "Content-Type": "application/json" };

const UI = { q: "po_q", add: "po_add", table: "po_table" };

/* ===== STATE ===== */
let els = {};
let table = null;
// snapshot เดิมของแต่ละ id เพื่อให้ Cancel ย้อนกลับได้แม่นยำ
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
      success(`${it.code} — ${it.name}`);
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
        if (a) e.stopPropagation();
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
        const show = d._dirty === true || !d.id;
        return `
          <button class="btn-small" ${show ? "" : "style='display:none'"} data-act="save">Save</button>
          <button class="btn-small secondary" ${show ? "" : "style='display:none'"} data-act="cancel">Cancel</button>
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
        method: "PATCH",
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
    // Bind near-bottom loader after Tabulator DOM is ready
    bindIntersectionLoader();
  });

  table.on("cellEdited", (cell) => {
    const row = cell.getRow();
    const d = row.getData();
    if (!d._dirty) row.update({ _dirty: true });
    row.reformat();
  });
}

/* ===== Keyset Infinite Scroll (IntersectionObserver, near-bottom only) ===== */
let cursor = null;        // id ตัวสุดท้ายจากชุดก่อนหน้า
let ksLoading = false;
let ksDone = false;
let ksKeyword = "";
let ksSeq = 0;            // race guard
let io = null;
let lastLoadAt = 0;       // cooldown guard

function getTableHolder() {
  return document.querySelector(`#${UI.table} .tabulator-tableholder`);
}

function bindIntersectionLoader() {
  const holder = getTableHolder();
  const sentinel = document.getElementById("po_sentinel");
  if (!holder || !sentinel) return;

  if (io) io.disconnect();

  io = new IntersectionObserver(
    (entries) => {
      const [e] = entries;
      if (!e.isIntersecting) return;

      const now = Date.now();
      if (now - lastLoadAt < 300) return; // 300ms cooldown
      if (ksLoading || ksDone) return;

      lastLoadAt = now;
      loadKeyset(ksKeyword, cursor);
    },
    {
      root: holder,
      threshold: 0,                   // fire as soon as it peeks in
      rootMargin: "0px 0px 200px 0px" // start ~200px before true bottom
    }
  );

  io.observe(sentinel);
}

async function loadKeyset(keyword = "", afterId = null) {
  if (ksLoading || ksDone) return;
  ksLoading = true;
  const mySeq = ++ksSeq;

  try {
    const usp = new URLSearchParams();
    if (keyword) usp.set("q", keyword);
    if (afterId) usp.set("after_id", String(afterId));
    usp.set("limit", String(PAGED_PER_PAGE));

    const res = await jfetch(`/pos/keyset?${usp.toString()}`);
    if (mySeq !== ksSeq) return; // stale response, ignore

    const items = Array.isArray(res) ? res : res.items ?? [];
    const rows = items.map(normalizeRow);

    if (!afterId) {
      table?.setData(rows);
      origById.clear();
      rows.forEach((r) => r.id && origById.set(r.id, { ...r }));
    } else {
      await table?.addData(rows);
      rows.forEach((r) => r.id && origById.set(r.id, { ...r }));
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
      ksSeq++; // cancel in-flight older requests implicitly
      loadKeyset(ksKeyword, null); // reload first page for new keyword
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
        _dirty: true,
      },
      true // add at top
    );
    row.getCell("po_number")?.edit(true);
    row.reformat();
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindAdd();
  bindSearchKeyset();

  cursor = null;
  ksDone = false;
  ksKeyword = "";
  ksSeq++;
  loadKeyset("", null); // first page (no pre-top-up)
});
