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


function copyWithFeedback(icon, text, msg = "Copied") {
  if (!text) return;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);

  const old = icon.textContent;
  icon.textContent = "✅";
  icon.style.pointerEvents = "none";

  setTimeout(() => {
    icon.textContent = old || "📋";
    icon.style.pointerEvents = "";
  }, 1200);

  toast?.success?.(msg);
}


/* ===== Build columns ===== */
function makeColumns() {
  return [
    {
      title: "Copy",
      field: "copy",
      width: 70,
      hozAlign: "center",
      formatter: () => {
        return `
      <button
        style="
          padding:4px 8px;
          background:#e5e7eb;
          border-radius:6px;
          font-size:12px;
          cursor:pointer;
        "
      >
        Copy
      </button>
    `;
      },
      cellClick: (e, cell) => {
        const d = cell.getRow().getData();

        const text = [
    d.po_number ? `PO#${d.po_number}` : null,
    d.part_no ? `Part#${d.part_no}` : null,
    d.lot_no ? `LOT#${d.lot_no}` : null,
  ]
          .filter(Boolean)
          .join(",");

        // ✅ Fallback copy (WORKS EVERYWHERE)
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);

        console.log("Copied:", text);
        toast?.success?.("Copied!");
      },

    },

    {
  title: "Lot",
  field: "lot_no",
  width: 100,

  // sort ตามเลขใน lot
  sorter: (a, b) => {
    if (!a) a = "";
    if (!b) b = "";
    const na = Number((a.match(/\d+/) || [0])[0]);
    const nb = Number((b.match(/\d+/) || [0])[0]);
    return na - nb;
  },

  formatter: (cell) => {
    const d = cell.getRow().getData();
    const lotNo = cell.getValue() ?? "";

    if (!d.lot_id) return lotNo;

    return `
      <div class="lot-cell" style="display:flex;gap:6px;align-items:center;">
        <a class="link"
           href="/static/lot-detail.html?lot_id=${d.lot_id}"
           style="color:#2563eb;text-decoration:underline;">
          ${lotNo}
        </a>
        <span
          class="copy-lot"
          title="Copy Lot No"
          style="cursor:pointer;"
        >
          📋
        </span>
      </div>
    `;
  },

  cellClick: (e, cell) => {
    // copy เฉพาะตอนคลิก icon
    if (!e.target.classList.contains("copy-lot")) return;

    e.preventDefault();
    e.stopPropagation();

    const d = cell.getRow().getData();
    const icon = e.target;

    const text = d.lot_no ?? "";
    if (!text) return;

    // 🔒 SAFE COPY (no Clipboard API)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);

    // ✅ เปลี่ยน icon → check
    const oldIcon = icon.textContent;
    icon.textContent = "✅";

    // disable คลิกชั่วคราว กัน spam
    icon.style.pointerEvents = "none";

    // กลับเป็น 📋 หลัง 1.2 วิ
    setTimeout(() => {
      icon.textContent = oldIcon || "📋";
      icon.style.pointerEvents = "";
    }, 1200);

    toast?.success?.("Copied Lot No");
  },
}
,
    {
  title: "PO",
  field: "po_number",
  width: 110,

  formatter: (cell) => {
    const d = cell.getData();
    const po = cell.getValue() ?? "";
    if (!d.po_id) return po;

    return `
      <div style="display:flex;gap:6px;align-items:center;">
        <a class="link"
           href="/static/manage-pos-detail.html?id=${d.po_id}">
          ${po}
        </a>
        <span class="copy-po" style="cursor:pointer;" title="Copy PO">📋</span>
      </div>
    `;
  },

  cellClick: (e, cell) => {
    if (!e.target.classList.contains("copy-po")) return;
    e.preventDefault();
    e.stopPropagation();

    const d = cell.getRow().getData();
    copyWithFeedback(e.target, d.po_number, "Copied PO");
  },
}
,

    { title: "Cust", field: "customer_code", width: 80 },

{
  title: "Part",
  field: "part_no",
  width: 150,

  formatter: (cell) => {
    const d = cell.getData();
    const rev = d.revision ? ` (${d.revision})` : "";
    const label = `${d.part_no ?? ""}${rev}`;

    if (!d.part_id) {
      return `
        <div style="display:flex;gap:6px;align-items:center;">
          <span>${label}</span>
          <span class="copy-part" style="cursor:pointer;" title="Copy Part">📋</span>
        </div>
      `;
    }

    const url =
      `/static/manage-part-detail.html` +
      `?part_id=${d.part_id}` +
      `&part_revision_id=${d.part_revision_id ?? ""}` +
      `&customer_id=${d.customer_id ?? ""}`;

    return `
      <div style="display:flex;gap:6px;align-items:center;">
        <a class="link" href="${url}">${label}</a>
        <span class="copy-part" style="cursor:pointer;" title="Copy Part">📋</span>
      </div>
    `;
  },

  cellClick: (e, cell) => {
    if (!e.target.classList.contains("copy-part")) return;
    e.preventDefault();
    e.stopPropagation();

    const d = cell.getRow().getData();
    const rev = d.revision ? ` (${d.revision})` : "";
    copyWithFeedback(
      e.target,
      `${d.part_no ?? ""}${rev}`,
      "Copied Part"
    );
  },
}
,



    {
  title: "Part Name",
  field: "part_name",
  width: 160,
  formatter: (cell) => {
    const v = cell.getValue() ?? "";
    return `
      <div style="display:flex;gap:6px;align-items:center;">
        <span>${v}</span>
        <span class="copy-pname" style="cursor:pointer;" title="Copy Part Name">📋</span>
      </div>
    `;
  },
  cellClick: (e, cell) => {
    if (!e.target.classList.contains("copy-pname")) return;
    e.preventDefault();
    e.stopPropagation();
    copyWithFeedback(e.target, cell.getValue(), "Copied Part Name");
  },
}
,
    // "2023-10-09T00:00:00-07:00"
    {
      title: "Due Date",
      field: "po_line_due_date",
      width: 120,  
   formatter: (cell) => {
  const v = cell.getValue();
  if (!v) return "";

  const d = new Date(v);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${mm}/${dd}/${yy}`;
},
    },

    {
      title: "Days Left",
      field: "days_left",
      width: 120,
      hozAlign: "center",
      sorter: "number",
      formatter: (cell) => {
        const row = cell.getRow().getData();

        // 🚫 Hide if lot is complete
        if (row.lot_status === "completed") return `
        <span style="
          background:#10b981;
          color:white;
          padding:4px 10px;
          border-radius:999px;
          font-weight:600;
        ">
          Shipped
        </span>
      `;

        const days = cell.getValue();
        if (days == null) return "";

        const color =
          days < 0 ? "#ef4444" :
            days <= 3 ? "#f59e0b" :
              "#10b981";

        const text =
          days < 0 ? `${Math.abs(days)}d OD` :
            `${days}d left`;

        return `
      <span style="
        background:${color};
        color:white;
        padding:4px 8px;
        border-radius:8px;
      ">
        ${text}
      </span>
    `;
      },
    },


    //     {
    //   title: "PO | Ship | Remain",
    //   width: 200,
    //   formatter: (cell) => {
    //     const r = cell.getRow().getData();

    //     return `
    //       <div class="qty-grid">
    //         <span>${r.qty_ordered ?? 0} | </span>
    //         <span>${r.lot_shipped_qty ?? 0} |</span>
    //         <span>${r.lot_remaining_qty ?? 0}</span>
    //       </div>
    //     `;
    //   },
    // },

    {
      title: "PO",
      width: 80,
      formatter: (cell) => {
        const r = cell.getRow().getData();

        return `
      ${r.qty_ordered ?? 0}`;
      },
    },
    {
      title: "Ship",
      width: 80,
      formatter: (cell) => {
        const r = cell.getRow().getData();

        return `
      
        ${r.lot_shipped_qty ?? 0} 
       
    `;
      },
    },
    {
      title: "Rem.",
      width: 80,
      formatter: (cell) => {
        const r = cell.getRow().getData();

        return `
     
        ${r.lot_remaining_qty ?? 0}
      
    `;
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
