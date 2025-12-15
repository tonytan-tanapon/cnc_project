import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const API_URL = "/reports/shipment-status";
const UI = {
  q: "_q",
  lotStatus: "_lot_status", // ⭐ เพิ่มตัวกรอง Lot Status
  // status: "_status",
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
      title: "Lot",
      field: "lot_no",
      width: 100,
      sorter: (a, b) => {
        if (!a) a = "";
        if (!b) b = "";
        const na = Number((a.match(/\d+/) || [0])[0]);
        const nb = Number((b.match(/\d+/) || [0])[0]);
        return na - nb;
      },
      formatter: (cell) => {
        const d = cell.getData();
        if (!d.lot_id) return cell.getValue() ?? "";
        return `<a class="link" href="/static/lot-detail.html?lot_id=${d.lot_id}">
          ${cell.getValue() ?? ""}
        </a>`;
      },
    },

     {
      title: "PO",
      field: "po_number",
      width: 100,
     
      formatter: (cell) => {
        const d = cell.getData();
        if (!d.po_id) return cell.getValue() ?? "";
        return ` <a
        class="link"
        href="/static/manage-pos-detail.html?id=${d.po_id}"
      >
          ${cell.getValue() ?? ""}
        </a>`;
      },
    },



{
  title: "Part",
  field: "part_no",
  width: 120,
  formatter: (cell) => {
    const d = cell.getData();
    const rev = d.revision ? ` (${d.revision})` : "";

    if (!d.part_id) return `${d.part_no ?? ""}${rev}`;

    const url =
      `/static/manage-part-detail.html` +
      `?part_id=${d.part_id}` +
      `&part_revision_id=${d.part_revision_id ?? ""}` +
      `&customer_id=${d.customer_id ?? ""}`;

    return `
      <a class="link" href="${url}">
        ${d.part_no ?? ""}${rev}
      </a>
    `;
  },
},




    { title: "Part Name", field: "part_name", width: 140 },
    { title: "Cust", field: "customer_code", width: 80 },

    {
  title: "Due Date",
  field: "lot_po_date",
  width: 120,
  formatter: (cell) => {
    const v = cell.getValue();
    return v ? new Date(v + "T00:00:00").toLocaleDateString() : "";
  },
},

    {
  title: "Days Left",
  field: "days_left",
  width: 120,
  hozAlign: "center",
  sorter: "number",        // ⭐ สำคัญ
  formatter: (cell) => {
    const days = cell.getValue();
    if (days == null) return "";
    const color =
      days < 0 ? "#ef4444" :
      days <= 3 ? "#f59e0b" :
      "#10b981";

    const text =
      days < 0 ? `${Math.abs(days)}d OD` :
      `${days}d left`;

    return `<span style="background:${color};
      color:white;padding:4px 8px;border-radius:8px;">
      ${text}
    </span>`;
  },
},


    {
      title: "PO / Ship / Remain",
      field: "qty_ordered",
      width: 180,
      formatter: (cell) => {
        const r = cell.getRow().getData();
        return `${r.qty_ordered ?? 0} / ${r.lot_shipped_qty ?? 0} / ${r.lot_remaining_qty ?? 0}`;
      },
    },

    {
      title: "Lot Status",
      field: "lot_status",
      width: 120,
      editor: "select",
      editorParams: {
        values: {
          not_start: "Not Start",
          in_process: "In Process",
          completed: "Completed",
       
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
        return `<span style="background:${colors[v]};
          color:white;padding:4px 8px;border-radius:6px;font-weight:600;">
          ${v}
        </span>`;
      },
    },

    {
      title: "Shipped Date",
      field: "lot_last_ship_date",
      width: 160,
      formatter: (cell) => {
        const v = cell.getValue();
        return v ? new Date(v).toLocaleDateString() : "";
      },
    },
  ];
}


/* ===== Apply Filter ===== */
function applyFilter() {
  const q = els[UI.q].value.trim().toLowerCase();
  const lotStatus = els[UI.lotStatus].value;
  const duedaysVal = els[UI.duedays].value;

  table.clearFilter(true);

  if (q) {
    table.addFilter((d) =>
      (d.part_no && d.part_no.toLowerCase().includes(q)) ||
      (d.lot_no && d.lot_no.toLowerCase().includes(q)) ||
      (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
      (d.po_number && d.po_number.toLowerCase().includes(q))
    );
  }

  if (lotStatus) {
    table.addFilter("lot_status", "=", lotStatus);
  }

  if (duedaysVal) {
    if (duedaysVal === "gt90") {
      table.addFilter((d) => d.days_left > 90);
    } else {
      const limit = Number(duedaysVal);
      table.addFilter(
        (d) => d.days_left >= 0 && d.days_left <= limit
      );
    }
  }
}


/* ===== Load Data ===== */
async function loadData() {
  els[UI.reload].disabled = true;
  try {
    const res = await jfetch(API_URL);

    console.log("Shipment status data loaded:", res);
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
    initialSort: [
      { column: "days_left", dir: "asc" }, // ⭐ น้อย → มาก
    ],
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

  // els[UI.status].addEventListener("change", applyFilter);
  els[UI.duedays].addEventListener("change", applyFilter);
  els[UI.lotStatus].addEventListener("change", applyFilter); // ⭐ ใช้งานจริง
});
