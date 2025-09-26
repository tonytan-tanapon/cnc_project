// /static/js/page-customers.js — inline CRUD + per-row Save/Cancel
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = { base: "/customers" };
const FETCH_ALL_STRATEGY = "auto"; // "auto" | "all-param" | "paged"
const PAGED_PER_PAGE = 100;

const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());

function buildPayload(row) {
  return {
    name: trim(row.name) || null,
    code: row.code ? String(row.code).toUpperCase() : null,
    contact: row.contact ? trim(row.contact) : null,
    email: row.email ? trim(row.email) : null,
    phone: row.phone ? trim(row.phone) : null,
    address: row.address ? trim(row.address) : null,
  };
}

function normalizeRow(r) {
  return {
    id: r.id ?? r.customer_id ?? r.customerId ?? null,
    code: r.code ?? "",
    name: r.name ?? "",
    contact: r.contact ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
    _dirty: false,
  };
}
function setDirtyClass(row, on) {
  const el = typeof row.getElement === "function" ? row.getElement() : null;
  if (el && el.classList) {
    if (on) el.classList.add("is-dirty");
    else el.classList.remove("is-dirty");
  }
}

/* ===== ROW OPS ===== */
async function saveRow(row) {
  const d = row.getData();
  if (!trim(d.name)) {
    toast("Name required", false);
    row.getCell("name")?.edit(true);
    return;
  }
  const payload = buildPayload(d);

  try {
    if (!d.id) {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);
      row.update({ ...norm, _dirty: false });
      toast("Created");
    } else {
      const updated = await jfetch(
        `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
      const norm = normalizeRow(updated || d);
      row.update({ ...d, ...norm, id: norm.id ?? d.id, _dirty: false });
      toast("Saved");
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    setDirtyClass(row, false);
    row.reformat();
    table?.redraw(true);
  }
}

async function cancelRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    return;
  } else {
    try {
      const fresh = await jfetch(
        `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`
      );
      const norm = normalizeRow(fresh || d);
      row.update({ ...norm, _dirty: false });
    } catch {
      row.update({ _dirty: false });
    }
  }
  setDirtyClass(row, false);
  row.reformat();
  table?.redraw(true);
}

async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    table?.redraw(true);
    return;
  }
  if (!confirm("Delete this customer?\nThis action cannot be undone.")) return;
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

/* ===== TABLE ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      width: 60,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: "rownum",
    },
    { title: "Code", field: "code", width: 80, editor: "input" },
    {
      title: "Name",
      field: "name",
      minWidth: 160,
      editor: "input",
      validator: "required",
    },
    { title: "Contact", field: "contact", width: 130, editor: "input" },
    { title: "Email", field: "email", width: 180, editor: "input" },
    { title: "Phone", field: "phone", width: 140, editor: "input" },
    {
      title: "Address",
      field: "address",
      widthGrow: 3,
      minWidth: 220,
      maxWidth: 600,
      editor: "input",
      cssClass: "wrap",
    },
    {
      title: "Actions",
      field: "_actions",
      width: 200,
      hozAlign: "right",
      headerSort: false,
      cssClass: "actions-cell", // <<< กันถูกตัดปุ่ม
      formatter: (cell) => {
        const d = cell.getRow().getData();
        const show = d._dirty === true || !d.id;
        return `
    <div class="row-actions">
      <button class="btn-small btn-primary" ${
        show ? "" : "style='display:none'"
      } data-act="save">Save</button>
      <button class="btn-small btn-secondary" ${
        show ? "" : "style='display:none'"
      } data-act="cancel">Cancel</button>
      <button class="btn-small btn-danger" data-act="del">Delete</button>
    </div>`;
      },
      cellClick: async (e, cell) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const row = cell.getRow();
        const act = btn.getAttribute("data-act");
        if (act === "save") return saveRow(row);
        if (act === "cancel") return cancelRow(row);
        if (act === "del") return deleteRow(row);
      },
    },
  ];
}

function initTable() {
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "100%", // <<< สูงเต็ม container
    columns: makeColumns(),
    placeholder: "No customers",
    reactiveData: true,
    index: "id",
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
    setTimeout(() => table.redraw(true), 0);
  });

  // mark dirty แล้วให้ user กด Save เอง
  table.on("cellEdited", (cell) => {
    const row = cell.getRow();
    const d = row.getData();
    if (!d._dirty) {
      row.update({ _dirty: true });
      setDirtyClass(row, true);
    }
    row.reformat();
  });
}

/* ===== FETCH ALL HELPERS ===== */
async function tryFetchAllParam(keyword = "") {
  const usp = new URLSearchParams();
  usp.set("all", "1");
  if (keyword) usp.set("q", keyword);
  const res = await jfetch(`${ENDPOINTS.base}?${usp.toString()}`);
  const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  const total = res?.total ?? items.length;
  return { items, total, pages: res?.pages ?? 1 };
}

async function fetchAllByPaging(keyword = "") {
  const perPage = PAGED_PER_PAGE;
  let page = 1;
  const all = [];
  while (true) {
    const usp = new URLSearchParams();
    usp.set("page", String(page));
    usp.set("per_page", String(perPage));
    if (keyword) usp.set("q", keyword);
    const res = await jfetch(`${ENDPOINTS.base}?${usp.toString()}`);
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

    if (FETCH_ALL_STRATEGY === "all-param" || FETCH_ALL_STRATEGY === "auto") {
      let ok = false;
      try {
        const { items, total, pages } = await tryFetchAllParam(keyword);
        records = items;
        if (
          records.length < (total || records.length) ||
          (pages && pages > 1)
        ) {
          records = await fetchAllByPaging(keyword);
        }
        ok = true;
      } catch {
        if (FETCH_ALL_STRATEGY === "all-param")
          throw new Error("Backend doesn't support all=1");
      }
      if (ok) {
        table?.setData(records.map(normalizeRow));
        table?.redraw(true);
        return;
      }
    }

    records = await fetchAllByPaging(keyword);
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
  const btn = els[UI.btnAdd];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        code: "",
        name: "",
        contact: "",
        email: "",
        phone: "",
        address: "",
        _dirty: true,
      },
      true
    );
    setDirtyClass(row, true);
    row.reformat();
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
