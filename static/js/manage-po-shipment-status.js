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
      width: 100,
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
    {
  title: "Part",
  field: "part_nos",
  width: 180,

  formatter: (cell) => {
    const d = cell.getRow().getData();
    if (!d.part_nos || !d.part_ids) return "";

    const partNos = d.part_nos.split(",").map(s => s.trim());
    const partIds = d.part_ids.split(",").map(s => s.trim());
    const revIds  = d.revision_ids
      ? d.revision_ids.split(",").map(s => s.trim())
      : [];

    return `
      <div style="
        font-size:12px;
        line-height:1.35;
        white-space:normal;
        display:flex;
        flex-direction:column;
        gap:2px;
      ">
        ${partNos.map((pn, i) => {
          const pid = partIds[i];
          const rid = revIds[i] ?? "";
          return `
            <a class="link"
               href="/static/manage-part-detail.html
                 ?part_id=${encodeURIComponent(pid)}
                 &part_revision_id=${encodeURIComponent(rid)}
                 &customer_id=${encodeURIComponent(d.customer_id)}">
              ${pn}
            </a>
          `;
        }).join("")}
      </div>
    `;
  },
}   ,

{
  title: "PO / Ship",
  hozAlign: "center",
  formatter: (cell) => {
    const r = cell.getRow().getData();
    return `
      <span style="font-weight:600;">
        ${r.total_shipped_qty} / ${r.total_po_qty}
      </span>
    `;
  }
}
,


    { title: "Customer", field: "customer_code", width: 100 },

    {
      title: "QTY",
      field: "total_ordered",
      hozAlign: "right",
      width: 100,
    },

    {
      title: "Ship",
      field: "total_shipped",
      hozAlign: "right",
      width: 100,
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
  width: 110,
  formatter: (cell) => {
    const v = cell.getValue();

    const labelMap = {
      "Not Shipped": "Pending",
      "Partially Shipped": "Partial",
      "Fully Shipped": "Completed",
    };

    const colorMap = {
      "Not Shipped": "#ef4444",       // red
      "Partially Shipped": "#f59e0b", // orange
      "Fully Shipped": "#10b981",     // green
    };

    const label = labelMap[v] ?? v;
    const bg = colorMap[v] ?? "#6b7280";

    return `
      <span style="
        background:${bg};
        color:white;
        padding:4px 10px;
        border-radius:6px;
        font-weight:600;
        display:inline-block;
        min-width:90px;
        text-align:center;
      ">
        ${label}
      </span>
    `;
  },
}
,

    {
      title: "% Done",
      field: "shipped_percent",
      width: 80,
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
      width: 100,
      formatter: (cell) => formatMMDDYY(cell.getValue()),
    },
    {
      title: "Next Due",
      field: "next_due_date",
      width: 100,
      formatter: (cell) => formatMMDDYY(cell.getValue()),
    },
 {
  title: "Days Left",
  field: "days_to_next_due",
  width: 110,
  // hozAlign: "center",
  formatter: (cell) => {
    let v = cell.getValue();
    if (v == null) return "";

    // ✅ safety: ตรวจ ms เฉพาะกรณีผิดปกติจริง
    if (Math.abs(v) > 36500) {
      v = Math.round(v / (1000 * 60 * 60 * 24));
    }

    const abs = Math.abs(v);
    let text = "";
    let bg = "#10b981"; // green

    // helper: แปลง days → months/days
    const formatMonthDay = (days) => {
      const m = Math.floor(days / 30);
      const d = days % 30;
      return d === 0 ? `${m} mo` : `${m} mo ${d} d`;
    };

    if (v < 0) {
      // overdue
      if (abs > 30) {
        text = `${formatMonthDay(abs)}`;
      } else {
        text = `${abs}`;
      }
      bg = "#ef4444"; // red
    } else if (v === 0) {
      text = "Today";
      bg = "#f59e0b"; // orange
    } else {
      // future
      if (v > 30) {
        text = formatMonthDay(v);
      } else {
        text = v;
      }

      if (v <= 3) {
        bg = "#f59e0b"; // orange
      }
    }

    return `
      <span style="
        background:${bg};
        color:white;
        padding:4px 10px;
        border-radius:6px;
        font-weight:600;
        display:inline-block;
        min-width:90px;
        text-align:center;
      ">
        ${text}
      </span>
    `;
  },
}
,

 {
      title: "Next Due Status",
      field: "next_due_status",
      width: 100,
      
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


const formatMMDDYY = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
};
/* ========== LOAD DATA ========== */
async function loadData() {
  els[UI.reload].disabled = true;

  try {
    const data = await jfetch(API_URL);
    console.log("PO Summary data:", data);
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
