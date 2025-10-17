import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const API_URL = "/reports/shipment-status";
const UI = { q: "_q", status: "_status", duedays: "_duedays", reload: "_reload", table: "listBody" };

let els = {};
let table = null;

/* ===== Build columns ===== */
function makeColumns() {
  return [
    { title: "Lot No", field: "lot_no", width: 120 },
    { title: "Part No", field: "part_no",  width: 120 },
    { title: "Part Name", field: "part_name", widthGrow: 2, cssClass: "wrap" },
    { title: "Rev", field: "revision", width: 80, hozAlign: "center" },
    { title: "PO No", field: "po_number", width: 120 },
    { title: "Customer", field: "customer_name", widthGrow: 1 },

    // === Due Date column ===
    {
      title: "Due Date",
      field: "due_date",
      width: 120,
      sorter: (a, b) => new Date(a) - new Date(b),
      formatter: (cell) => {
        const v = cell.getValue();
        if (!v) return "";
        const d = new Date(v);
        return isNaN(d) ? v : d.toLocaleDateString();
      },
    },

    // === Days Left (sortable) ===
    {
      title: "Days Left",
      field: "days_left",
      width: 120,
      hozAlign: "center",
      sorter: "number",
      sorterParams: { alignEmptyValues: "bottom" },
      mutator: (value, data) => {
        // compute numeric days_left for sorting
        const v = data.due_date;
        if (!v) return null;
        const due = new Date(v);
        if (isNaN(due)) return null;
        const now = new Date();
        return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      },
      formatter: (cell) => {
        const daysLeft = cell.getValue();
        if (daysLeft == null) return "";
        const color =
          daysLeft < 0 ? "#ef4444" : daysLeft <= 3 ? "#f59e0b" : "#10b981";
        const label =
          daysLeft < 0
            ? `${Math.abs(daysLeft)}d overdue`
            : `${daysLeft}d left`;
        return `<span style="background:${color};color:#fff;padding:4px 8px;border-radius:8px;font-weight:600;">${label}</span>`;
      },
    },

    { title: "Planned", field: "planned_qty", hozAlign: "right", width: 100 },
    { title: "Shipped", field: "qty_shipped", hozAlign: "right", width: 100 },
    { title: "Remain", field: "qty_remaining", hozAlign: "right", width: 100 },
    {
      title: "Status",
      field: "shipment_status",
      width: 150,
      hozAlign: "center",
      formatter: (cell) => {
        const v = cell.getValue();
        const color =
          v === "Fully Shipped"
            ? "#10b981"
            : v === "Partially Shipped"
            ? "#f59e0b"
            : "#ef4444";
        return `<span style="background:${color};color:#fff;padding:4px 8px;border-radius:8px;font-weight:600;">${v}</span>`;
      },
    },
    {
      title: "Last Ship",
      field: "last_ship_date",
      width: 160,
      sorter: (a, b) => new Date(a) - new Date(b),
      formatter: (c) => {
        const v = c.getValue();
        return v ? new Date(v).toLocaleDateString() : "";
      },
    },
  ];
}

/* ===== Apply Filter ===== */
function applyFilter() {
  const q = els[UI.q].value.trim().toLowerCase();
  const status = els[UI.status].value;
  const duedaysVal = els[UI.duedays].value;

  table.clearFilter(true);

  // text search
  if (q) {
    table.addFilter((data) => {
      const d = typeof data.getData === "function" ? data.getData() : data;
      return (
        (d.part_no && d.part_no.toLowerCase().includes(q)) ||
        (d.lot_no && d.lot_no.toLowerCase().includes(q)) ||
        (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
        (d.po_number && d.po_number.toLowerCase().includes(q))
      );
    });
  }

  // status filter
  if (status) {
    table.addFilter("shipment_status", "=", status);
  }

  // due date filter (7/30/60/90 or >90)
  if (duedaysVal) {
    const now = new Date();
    if (duedaysVal === "gt90") {
      table.addFilter((data) => {
        const d = new Date(data.due_date);
        if (isNaN(d)) return false;
        const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
        return diff > 90;
      });
    } else {
      const duedays = parseInt(duedaysVal);
      table.addFilter((data) => {
        const d = new Date(data.due_date);
        if (isNaN(d)) return false;
        const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
        return diff <= duedays && diff >= 0;
      });
    }
  }
}

/* ===== Load Data ===== */
async function loadData() {
  els[UI.reload].disabled = true;
  try {
    const res = await jfetch(API_URL);
    table.setData(res);
    applyFilter();
    toast("✅ Data loaded");
  } catch (err) {
    toast("❌ Load failed: " + (err?.message || err), false);
  } finally {
    els[UI.reload].disabled = false;
  }
}

/* ===== Init Table ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No data",
    groupBy: "part_no",
    groupHeader: (value, count) => `${value} (${count} orders)`,
    columns: makeColumns(),
  });
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  loadData();

  els[UI.reload].addEventListener("click", loadData);
  els[UI.q].addEventListener("input", () => {
    clearTimeout(window._flt);
    window._flt = setTimeout(applyFilter, 400);
  });
  els[UI.status].addEventListener("change", applyFilter);
  els[UI.duedays].addEventListener("change", applyFilter);
});
