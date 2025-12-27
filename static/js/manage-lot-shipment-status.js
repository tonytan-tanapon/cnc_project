import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const API_URL = "/reports/shipment-status";
const UI = {
  q: "_q",
  lotStatus: "_lot_status",
  duedays: "_duedays",
  reload: "_reload",
  table: "listBody",
};

let els = {};
let table = null;

/* ===== Copy helper ===== */
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
    /* ===== COPY SUMMARY ===== */
    {
      title: "Copy",
      width: 70,
      hozAlign: "center",
      formatter: () => `
        <button style="
          padding:4px 8px;
          background:#e5e7eb;
          border-radius:6px;
          font-size:12px;
          cursor:pointer;
        ">Copy</button>
      `,
      cellClick: (e, cell) => {
        const d = cell.getRow().getData();
        const text = [
          d.po_number ? `PO#${d.po_number}` : null,
          d.part_no ? `Part#${d.part_no}` : null,
          d.lot_no ? `LOT#${d.lot_no}` : null,
        ].filter(Boolean).join(",");
        copyWithFeedback(e.target, text, "Copied summary");
      },
    },

    /* ===== LOT ===== */
    {
      title: "Lot",
      field: "lot_no",
      width: 80,
      sorter: (a, b) => {
        const na = Number((a || "").match(/\d+/)?.[0] || 0);
        const nb = Number((b || "").match(/\d+/)?.[0] || 0);
        return na - nb;
      },
      formatter: (cell) => {
        const d = cell.getRow().getData();
        if (!d.lot_id) return cell.getValue() ?? "";
        return `
          <div style="display:flex;gap:6px;align-items:center;">
            <a class="link"
              href="/static/lot-detail.html?lot_id=${d.lot_id}">
              ${cell.getValue()}
            </a>
            <span class="copy-lot" style="cursor:pointer;">📋</span>
          </div>
        `;
      },
      cellClick: (e, cell) => {
        if (!e.target.classList.contains("copy-lot")) return;
        e.preventDefault();
        e.stopPropagation();
        copyWithFeedback(e.target, cell.getValue(), "Copied Lot");
      },
    },

    /* ===== PO ===== */
    {
      title: "PO",
      field: "po_number",
      width: 90,
      formatter: (cell) => {
        const d = cell.getData();
        if (!d.po_id) return cell.getValue() ?? "";
        return `
          <div style="display:flex;gap:6px;align-items:center;">
            <a class="link"
              href="/static/manage-pos-detail.html?id=${d.po_id}">
              ${cell.getValue()}
            </a>
            <span class="copy-po" style="cursor:pointer;">📋</span>
          </div>
        `;
      },
      cellClick: (e, cell) => {
        if (!e.target.classList.contains("copy-po")) return;
        e.preventDefault();
        e.stopPropagation();
        copyWithFeedback(e.target, cell.getValue(), "Copied PO");
      },
    },

    { title: "Cust", field: "customer_code", width: 80 },

    /* ===== PART ===== */
    {
      title: "Part",
      field: "part_no",
      width: 150,
      formatter: (cell) => {
        const d = cell.getData();
        const rev = d.revision ? ` (${d.revision})` : "";
        const label = `${d.part_no ?? ""}${rev}`;
        return `
          <div style="display:flex;gap:6px;align-items:center;">
            ${d.part_id
            ? `<a class="link"
                    href="/static/manage-part-detail.html
                    ?part_id=${d.part_id}
                    &part_revision_id=${d.part_revision_id ?? ""}
                    &customer_id=${d.customer_id ?? ""}">
                    ${label}
                 </a>`
            : `<span>${label}</span>`}
            <span class="copy-part" style="cursor:pointer;">📋</span>
          </div>
        `;
      },
      cellClick: (e, cell) => {
        if (!e.target.classList.contains("copy-part")) return;
        e.preventDefault();
        e.stopPropagation();
        const d = cell.getRow().getData();
        const rev = d.revision ? ` (${d.revision})` : "";
        copyWithFeedback(e.target, `${d.part_no ?? ""}${rev}`, "Copied Part");
      },
    },

    /* ===== PART NAME ===== */
    {
      title: "Part Name",
      field: "part_name",
      width: 160,
      formatter: (cell) => `
        <div style="display:flex;gap:6px;align-items:center;">
          <span>${cell.getValue() ?? ""}</span>
          <span class="copy-pname" style="cursor:pointer;">📋</span>
        </div>
      `,
      cellClick: (e, cell) => {
        if (!e.target.classList.contains("copy-pname")) return;
        e.preventDefault();
        e.stopPropagation();
        copyWithFeedback(e.target, cell.getValue(), "Copied Part Name");
      },
    },

    /* ===== DUE DATE ===== */
    {
      title: "Due",
      field: "po_line_due_date",
      width: 90,
      formatter: (cell) => {
        const v = cell.getValue();
        if (!v) return "";
        const d = new Date(v);
        return `${String(d.getMonth() + 1).padStart(2, "0")}/
                ${String(d.getDate()).padStart(2, "0")}/
                ${String(d.getFullYear()).slice(-2)}`;
      },
    },

    /* ===== DAYS LEFT (PO LEVEL) ===== */
    {
      title: "Left",
      field: "days_left",
      width: 90,
      hozAlign: "center",
      sorter: "number",
      formatter: (cell) => {
        const r = cell.getRow().getData();

        if (r.po_remaining_qty === 0) {
          return `<span style="
            background:#10b981;
            color:white;
            padding:4px 10px;
            border-radius:999px;
            font-weight:600;">
            Completed
          </span>`;
        }

        const days = cell.getValue();
        if (days == null) return "";

        const color =
          days < 0 ? "#ef4444" :
            days <= 3 ? "#f59e0b" :
              "#10b981";

        const text =
          days < 0 ? `${Math.abs(days)}d OD` : `${days}d left`;

        return `<span style="
          background:${color};
          color:white;
          padding:4px 8px;
          border-radius:8px;">
          ${text}
        </span>`;
      },
    },

    /* ===== PO QTY ===== */
   
 {
      title: "Ship",
      width: 90,

      formatter: (cell) => cell.getRow().getData().lot_shipped_qty ?? 0,
    },
   {
  title: "Ship/PO(Rem)",
  width: 170,
  hozAlign: "center",
  formatter: (cell) => {
    const r = cell.getRow().getData();

    const shipped = r.po_shipped_total ?? 0;
    const total   = r.po_qty_total ?? 0;
    const remain  = r.po_remaining_qty ?? (total - shipped);

    // สีตามสถานะ
    let bg = "#6b7280"; // gray
    if (shipped === 0) bg = "#ef4444";              // not shipped
    else if (remain > 0) bg = "#f59e0b";            // partial
    else if (remain === 0) bg = "#10b981";          // complete
    else bg = "#7c3aed";                             // overship

    // format remain
    const remText =
      remain < 0 ? `-${Math.abs(remain)}` : remain;

    return `
      <span style="
        background:${bg};
        color:white;
        padding:4px 10px;
        border-radius:8px;
        font-weight:600;
        display:inline-block;
        min-width:120px;
        text-align:center;
      ">
        ${shipped} / ${total} (${remText})
      </span>
    `;
  },
} ,

    /* ===== LOT STATUS ===== */
    {
      title: "Lot Status",
      field: "lot_status",
      width: 120,
      formatter: (cell) => {
        const v = cell.getValue();
        const colors = {
          not_start: "#6b7280",
          in_process: "#3b82f6",
          hold: "#f59e0b",
          completed: "#10b981",
          canceled: "#ef4444",
        };
        return `<span style="
          background:${colors[v]};
          color:white;
          padding:4px 8px;
          border-radius:6px;
          font-weight:600;">
          ${v}
        </span>`;
      },
    },

    /* ===== LAST SHIPPED ===== */
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
      d.part_no?.toLowerCase().includes(q) ||
      d.lot_no?.toLowerCase().includes(q) ||
      d.customer_name?.toLowerCase().includes(q) ||
      d.po_number?.toLowerCase().includes(q)
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
      table.addFilter((d) => d.days_left >= 0 && d.days_left <= limit);
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

/* ===== Init ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No data",
    columns: makeColumns(),
    initialSort: [{ column: "days_left", dir: "asc" }],
  });
}

document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  loadData();

  els[UI.reload].addEventListener("click", loadData);
  els[UI.q].addEventListener("input", () => {
    clearTimeout(window._flt);
    window._flt = setTimeout(applyFilter, 300);
  });
  els[UI.duedays].addEventListener("change", applyFilter);
  els[UI.lotStatus].addEventListener("change", applyFilter);
});
