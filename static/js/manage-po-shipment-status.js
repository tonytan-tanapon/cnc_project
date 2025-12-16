import { $, jfetch, toast } from "./api.js";

const API_URL = "/reports/po-shipment-status";

const UI = {
  q: "_q",
  status: "_status",
  reload: "_reload",
  table: "listBody",
};

let els = {};
let table = null;

/* ========== BUILD COLUMNS (Summary per PO) ========== */
function makeColumns() {
  return [
    // { title: "PO ID", field: "po_id", width: 90 },
    {
      title: "PO",
      field: "po_number",
      width: 120,
      formatter: (cell) => {
        const d = cell.getData();
        const poId = d.po_id;
        if (!poId) return cell.getValue() ?? "";

        const href = `/static/manage-pos-detail.html?id=${poId}`;
        return `<a class="po-link" href="${href}" 
              style="color:#2563eb;text-decoration:underline;cursor:pointer;">
              ${cell.getValue() ?? ""}
            </a>`;
      },
      // cellClick: (e, cell) => {
      //   console.log("PO cell clicked");
      //   const d = cell.getData();
      //   const poId = d.po_id;
      //   if (!poId) return;
      //   window.location.href = `/static/manage-pos-detail.html?id=${poId}`;
      // },
      cellClick: (e, cell) => {
        const d = cell.getData();
        const poId = d.po_id;
        if (!poId) return;

        const url = `/static/manage-pos-detail.html?id=${poId}`;

        if (e.ctrlKey || e.metaKey || e.button === 1) {
          window.open(url, "_blank");
          return;
        }

        window.location.href = url;
      },
    },

    { title: "Customer", field: "customer_name", width: 160 },

    {
      title: "QTY",
      field: "total_ordered",
      hozAlign: "right",
      width: 80,
    },

    {
      title: "Ship",
      field: "total_shipped",
      hozAlign: "right",
      width: 80,
    },

    {
      title: "Remain",
      field: "total_remaining",
      hozAlign: "right",
      width: 100,
      formatter: (cell) => {
        const v = cell.getValue();
        return v < 0 ? `<span style="color:#ef4444">${v}</span>` : v;
      },
    },

    {
      title: "Status",
      field: "po_shipment_status",
      width: 150,
      formatter: (cell) => {
        const v = cell.getValue();
        const colors = {
          "Not Shipped": "#ef4444",
          "Partially Shipped": "#f59e0b",
          "Fully Shipped": "#10b981",
        };
        return `<span style="background:${colors[v]};color:white;padding:4px 8px;border-radius:6px;">${v}</span>`;
      },
    },

    {
      title: "% Done",
      field: "shipped_percent",
      width: 130,
      formatter: (cell) => {
        const p = cell.getValue() ?? 0;
        return `
          <div style="width:100%;background:#e5e7eb;border-radius:4px;">
            <div style="width:${p}%;background:#3b82f6;color:white;text-align:center;border-radius:4px;">
              ${p}%
            </div>
          </div>`;
      },
    },

    {
      title: "Last Shipment",
      field: "last_ship_date",
      width: 140,
      formatter: (cell) => {
        const v = cell.getValue();
        return v ? new Date(v).toLocaleDateString() : "";
      },
    },
  ];
}

/* ========== FILTER ========== */
function applyFilter() {
  const q = els[UI.q].value.trim().toLowerCase();
  const status = els[UI.status].value;

  table.clearFilter(true);

  if (q) {
    table.addFilter((row) => {
      const d = row;
      return (
        (d.po_number && d.po_number.toLowerCase().includes(q)) ||
        (d.customer_name && d.customer_name.toLowerCase().includes(q))
      );
    });
  }

  if (status) {
    table.addFilter("po_shipment_status", "=", status);
  }
}

/* ========== LOAD DATA ========== */
async function loadData() {
  els[UI.reload].disabled = true;

  try {
    const data = await jfetch(API_URL);
    table.setData(data);
    applyFilter();
    toast("PO Summary Loaded");
  } catch (err) {
    toast("Load failed: " + err?.message, false);
  }

  els[UI.reload].disabled = false;
}

/* ========== INIT TABLE ========== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No data",
    columns: makeColumns(),
    initialSort: [{ column: "po_number", dir: "asc" }],
  });
}

/* ========== BOOT ========== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));

  initTable();
  loadData();

  els[UI.reload].addEventListener("click", loadData);

  els[UI.q].addEventListener("input", () => {
    clearTimeout(window._flt);
    window._flt = setTimeout(applyFilter, 300);
  });

  els[UI.status].addEventListener("change", applyFilter);
});
