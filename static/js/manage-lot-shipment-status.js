import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const API_URL = "/reports/shipment-status";
const UI = {
  q: "_q",
  lotStatus: "_lot_status", // ⭐ เพิ่มตัวกรอง Lot Status
  status: "_status",
  duedays: "_duedays",
  reload: "_reload",
  table: "listBody",
};

let els = {};
let table = null;

/* ===== Build columns ===== */
function makeColumns() {
  return [
    {
      title: "Lot No",
      field: "lot_no",
      width: 120,
      sorter: (a, b) => {
        if (!a) a = "";
        if (!b) b = "";
        const na = Number((a.match(/\d+/) || [0])[0]);
        const nb = Number((b.match(/\d+/) || [0])[0]);
        return na - nb;
      },
      formatter: (cell) => {
        const d = cell.getData();
        const lotId = d.lot_id;
        if (!lotId) return cell.getValue() ?? "";
        const href = `/static/lot-detail.html?lot_id=${lotId}`;
        return `<a class="link" href="${href}">${cell.getValue() ?? ""}</a>`;
      },
    },

    {
      title: "Part No",
      field: "part_no",
      width: 120,
      formatter: (cell) => {
        const d = cell.getData();
        if (!d.part_id) return cell.getValue() ?? "";
        const href = `/static/manage-part-detail.html?part_id=${d.part_id}&part_revision_id=${d.part_revision_id}&customer_id=${d.customer_id}`;
        return `<a href="${href}" class="part-link" style="color:#2563eb;text-decoration:underline;">${cell.getValue()}</a>`;
      },
    },

    /* =======================
       Lot Status (Editable)
       ======================= */
    {
      title: "Lot Status",
      field: "status",
      width: 140,
      editor: "select",
      editorParams: {
        values: {
          not_start: "Not Start",
          in_process: "In Process",
          hold: "Hold",
          completed: "Completed",
          shipped: "Shipped",
          canceled: "Canceled",
        },
      },
      formatter: (cell) => {
        const v = cell.getValue();
        const colors = {
          not_start: "#6b7280",
          in_process: "#3b82f6",
          hold: "#f59e0b",
          completed: "#10b981",
          shipped: "#0ea5e9",
          canceled: "#ef4444",
        };
        const labels = {
          not_start: "Not Start",
          in_process: "In Process",
          hold: "Hold",
          completed: "Completed",
          shipped: "Shipped",
          canceled: "Canceled",
        };
        return `<span style="background:${
          colors[v]
        };color:white;padding:4px 8px;border-radius:6px;font-weight:600;">${
          labels[v] || v
        }</span>`;
      },

      /* ⭐ PATCH Handler */
      cellEdited: async (cell) => {
        const row = cell.getRow().getData();
        const lotId = row.lot_id;
        const newStatus = cell.getValue();

        try {
          const updated = await jfetch(`lots/${lotId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });

          // ⭐ อัปเดตเฉพาะแถว
          cell.getRow().update(updated);

          // ⭐ reapply filter เผื่อผู้ใช้ใช้ filter อยู่
          applyFilter();

          toast("Status updated");
        } catch (err) {
          toast("Update failed: " + err?.message, false);
        }
      },
    },

    { title: "Part Name", field: "part_name", widthGrow: 2 },
    { title: "Rev", field: "revision", width: 80, hozAlign: "center" },
    { title: "PO No", field: "po_number", width: 120 },
    { title: "Customer", field: "customer_name", widthGrow: 1 },

    // Due Date
    {
      title: "Due Date",
      field: "due_date",
      width: 120,
      formatter: (cell) => {
        const v = cell.getValue();
        if (!v) return "";
        const d = new Date(v);
        return d.toLocaleDateString();
      },
    },

    // Days Left
    {
      title: "Days Left",
      field: "days_left",
      width: 120,
      hozAlign: "center",
      mutator: (value, data) => {
        const v = data.due_date;
        if (!v) return null;
        const due = new Date(v);
        const now = new Date();
        return Math.ceil((due - now) / 86400000);
      },
      formatter: (cell) => {
        const days = cell.getValue();
        if (days == null) return "";
        const color = days < 0 ? "#ef4444" : days <= 3 ? "#f59e0b" : "#10b981";
        const text = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`;
        return `<span style="background:${color};color:white;padding:4px 8px;border-radius:8px;">${text}</span>`;
      },
    },

    { title: "Planned", field: "planned_qty", width: 100, hozAlign: "right" },
    { title: "Shipped", field: "qty_shipped", width: 100, hozAlign: "right" },
    { title: "Remain", field: "qty_remaining", width: 100, hozAlign: "right" },

    {
      title: "Status",
      field: "shipment_status",
      width: 150,
      formatter: (cell) => {
        const v = cell.getValue();
        const color =
          v === "Fully Shipped"
            ? "#10b981"
            : v === "Partially Shipped"
            ? "#f59e0b"
            : "#ef4444";
        return `<span style="background:${color};color:white;padding:4px 8px;border-radius:6px;">${v}</span>`;
      },
    },

    {
      title: "Shipped Date",
      field: "last_ship_date",
      width: 160,
      formatter: (c) => {
        const v = c.getValue();
        if (!v) return "";
        return new Date(v).toLocaleDateString();
      },
    },
  ];
}

/* ===== Apply Filter ===== */
function applyFilter() {
  const q = els[UI.q].value.trim().toLowerCase();
  const status = els[UI.status].value;
  const lotStatus = els[UI.lotStatus].value; // ⭐ field "status"
  const duedaysVal = els[UI.duedays].value;

  table.clearFilter(true);

  // search
  if (q) {
    table.addFilter((row) => {
      const d = row;
      return (
        (d.part_no && d.part_no.toLowerCase().includes(q)) ||
        (d.lot_no && d.lot_no.toLowerCase().includes(q)) ||
        (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
        (d.po_number && d.po_number.toLowerCase().includes(q))
      );
    });
  }

  // shipment status filter
  if (status) {
    table.addFilter("shipment_status", "=", status);
  }

  // ⭐ Lot Status filter
  if (lotStatus) {
    table.addFilter("status", "=", lotStatus);
  }

  // due date filter
  if (duedaysVal) {
    const now = new Date();
    if (duedaysVal === "gt90") {
      table.addFilter((d) => {
        const diff = (new Date(d.due_date) - now) / 86400000;
        return diff > 90;
      });
    } else {
      const limit = Number(duedaysVal);
      table.addFilter((d) => {
        const diff = (new Date(d.due_date) - now) / 86400000;
        return diff >= 0 && diff <= limit;
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
    toast("Data loaded");
  } catch (err) {
    toast("Load failed: " + err?.message, false);
  }
  els[UI.reload].disabled = false;
}

/* ===== Init Table ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No data",
    columns: makeColumns(),
    initialSort: [{ column: "lot_no", dir: "asc" }],
  });
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));

  initTable();

  loadData();

  // ⭐ remove the buggy default filter
  // table.setFilter(...); → ลบทิ้ง

  // UI events
  els[UI.reload].addEventListener("click", loadData);
  els[UI.q].addEventListener("input", () => {
    clearTimeout(window._flt);
    window._flt = setTimeout(applyFilter, 300);
  });

  els[UI.status].addEventListener("change", applyFilter);
  els[UI.duedays].addEventListener("change", applyFilter);
  els[UI.lotStatus].addEventListener("change", applyFilter); // ⭐ ใช้งานจริง
});
