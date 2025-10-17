// /static/js/manage-shipments.js
import { $, jfetch, toast } from "./api.js";

const ENDPOINTS = {
  base: "/customer_shipments",
  byId: (id) => `/customer_shipments/${encodeURIComponent(id)}`,
  keyset: (qs) => `/customer_shipments/keyset?${qs}`,
};
const JSON_HEADERS = { "Content-Type": "application/json" };
const PAGE_SIZE = 200;

const UI = { q: "_q", add: "_add", table: "listBody" };
let els = {};
let table = null;
let isBuilt = false;

/* ===== Helpers ===== */
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};

function normalizeRow(s) {
  const id = s.id;
  const po_no = s.po?.po_number ?? "";
  return {
    id,
    po_id: s.po?.id ?? null,
    po_number: po_no,
    ship_to: s.ship_to ?? "",
    carrier: s.carrier ?? "",
    tracking_no: s.tracking_no ?? "",
    package_no: s.package_no ?? "",
    shipped_at: s.shipped_at ?? null,
  };
}

function buildPayload(r) {
  return {
    po_id: r.po_id ?? null,
    ship_to: r.ship_to?.trim() || null,
    carrier: r.carrier?.trim() || null,
    tracking_no: r.tracking_no?.trim() || null,
    package_no: r.package_no?.trim() || null,
    shipped_at: r.shipped_at ?? null,
  };
}

/* ===== Columns ===== */
function makeColumns() {
  return [
    { title: "Shipment ID", field: "id", width: 90, hozAlign: "right" },
    {
      title: "PO No.",
      field: "po_number",
      width: 150,
      headerSort: true,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        if (!d.po_id) return `<span class="muted">—</span>`;
        const href = `/static/manage-pos-detail.html?id=${encodeURIComponent(
          d.po_id
        )}`;
        return `<a href="${href}" class="view-link">${d.po_number}</a>`;
      },
    },
    {
      title: "Ship To",
      field: "ship_to",
      minWidth: 180,
      editor: "input",
      headerSort: true,
    },
    {
      title: "Carrier",
      field: "carrier",
      minWidth: 140,
      editor: "input",
      headerSort: true,
    },
    {
      title: "Tracking No.",
      field: "tracking_no",
      minWidth: 150,
      editor: "input",
    },
    {
      title: "Package No.",
      field: "package_no",
      minWidth: 120,
      editor: "input",
    },
    {
      title: "Shipped At",
      field: "shipped_at",
      width: 180,
      editor: false,
      formatter: (c) => fmtDate(c.getValue()),
    },
    {
      title: "Items",
      field: "_items",
      width: 100,
      hozAlign: "center",
      headerSort: false,
      formatter: (cell) => {
        const id = cell.getRow()?.getData()?.id;
        if (!id) return `<span class="muted">—</span>`;
        const href = `/static/manage-shipment-items.html?shipment_id=${encodeURIComponent(
          id
        )}`;
        return `<a href="${href}" class="view-link">View</a>`;
      },
    },
    {
      title: "Actions",
      field: "_actions",
      width: 100,
      hozAlign: "center",
      headerSort: false,
      formatter: () =>
        `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: (e, cell) => {
        if (e.target.closest("[data-act='del']")) deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== Autosave ===== */
async function autosaveCell(cell) {
  const row = cell.getRow();
  const d = row.getData();
  const payload = buildPayload(d);

  if (!d.id) {
    // CREATE
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      row.update(normalizeRow(created));
      toast("Shipment created");
    } catch (e) {
      toast("Create failed: " + e.message, false);
    }
    return;
  }

  // UPDATE
  try {
    const updated = await jfetch(ENDPOINTS.byId(d.id), {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    row.update(normalizeRow(updated));
    toast("Saved");
  } catch (e) {
    toast("Save failed: " + e.message, false);
  }
}

/* ===== Delete ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm(`Delete shipment ${d.id}?`)) return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast("Delete failed: " + e.message, false);
  }
}

/* ===== Table ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    index: "id",
    columns: makeColumns(),
    placeholder: "No shipments",
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    bindIntersectionLoader();
  });
  table.on("cellEdited", (cell) => autosaveCell(cell));
}

/* ===== Infinite Scroll ===== */
let cursor = null;
let ksLoading = false;
let ksDone = false;
async function loadKeyset(afterId = null) {
  if (ksLoading || ksDone) return;
  ksLoading = true;
  try {
    const usp = new URLSearchParams({ limit: PAGE_SIZE });
    if (afterId) usp.set("after_id", String(afterId));
    const res = await jfetch(ENDPOINTS.keyset(usp.toString()));
    const items = Array.isArray(res) ? res : res.items ?? [];
    const rows = items.map(normalizeRow);
    if (!afterId) table.setData(rows);
    else table.addData(rows);
    cursor = res?.next_cursor ?? null;
    ksDone = !cursor || rows.length === 0;
  } catch (e) {
    toast("Load failed", false);
  } finally {
    ksLoading = false;
  }
}

function bindIntersectionLoader() {
  const holder = document.querySelector(`#${UI.table} .tabulator-tableholder`);
  const sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  holder.appendChild(sentinel);
  new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !ksLoading && !ksDone) loadKeyset(cursor);
    },
    { root: holder, rootMargin: "0px 0px 200px 0px" }
  ).observe(sentinel);
}

/* ===== Add ===== */
function bindAdd() {
  els[UI.add].addEventListener("click", async () => {
    const row = await table.addRow(
      {
        po_number: "",
        ship_to: "",
        carrier: "",
        tracking_no: "",
        package_no: "",
        shipped_at: null,
      },
      true
    );
    row.getCell("ship_to").edit(true);
  });
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindAdd();
  await loadKeyset();
});
