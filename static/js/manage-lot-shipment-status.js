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
          d.lot_no ? `${d.lot_no}` : null,
        ]
          .filter(Boolean)
          .join(",");
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
            ${
              d.part_id
                ? `<a class="link"
                    href="/static/manage-part-detail.html?part_id=${
                      d.part_id
                    }&part_revision_id=${
                    d.part_revision_id ?? ""
                  }&customer_id=${d.customer_id ?? ""}">${label}
                 </a>`
                : `<span>${label}</span>`
            }
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
        const days = cell.getValue();

        // ---- normalize status ----
        const lotStatus = String(r.lot_status ?? "").toLowerCase();

        // 1️⃣ PO completed
        // 1️⃣ PO completed (highest priority)
        if (r.po_remaining_qty === 0) {
          return `
        <span title="PO Completed" style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          background:#10b981;
          color:white;
          width:34px;
          height:24px;
          border-radius:999px;
          font-weight:700;
        ">
          ✔
        </span>
      `;
        }

        // 2️⃣ Lot completed
        if (lotStatus === "completed") {
          if (r.po_remaining_qty > 0) {
            return `
        <span title="PO remain" style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          background:#10b981;
          color:white;
          width:34px;
          height:24px;
          border-radius:999px;
          font-weight:700;
        ">
          X
        </span>
      `;
          }
          return `
        <span title="Lot Completed" style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          background:#9ca3af;
          color:white;
          width:34px;
          height:24px;
          border-radius:999px;
          font-weight:700;
        ">
          O
        </span>
      `;
        }
        // ✓
        // 3️⃣ Normal due logic
        if (days == null) return "";

        const color = days < 0 ? "#ef4444" : days <= 3 ? "#f59e0b" : "#10b981";

        const text = days < 0 ? `${Math.abs(days)}d OD` : `${days}d left`;

        return `<span style="
      background:${color};
      color:white;
      padding:4px 8px;
      border-radius:8px;
      font-weight:600;
    ">
      ${text}
    </span>`;
      },
    },

    /* ===== PO QTY ===== */

    //  {
    //       title: "Ship",
    //       width: 90,

    //       formatter: (cell) => cell.getRow().getData().lot_shipped_qty ?? 0,

    //       http://100.88.56.126:9000/static/manage-lot-shippments.html?lot_id=2
    //     },
    {
      title: "LOT<br>QTY",
      width: 80,
      field: "lot_planned_ship_qty",
    },
    {
      title: "Ship",
      width: 150,
      field: "lot_shipped_qty",
      hozAlign: "center",
      headerHozAlign: "center",

      formatter: (cell) => {
        const r = cell.getRow().getData();
        const lotId = r.lot_id;
        const shipped = r.lot_shipped_qty ?? 0;

        if (!lotId) return shipped;

        return `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        white-space:nowrap;
      ">
        <span style="font-weight:600;">
          ${shipped}
        </span>
         <!-- Materials -->
        <a
          href="/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
            lotId
          )}"
          title="Materials"
          style="text-decoration:none;"
          target="_blank"
        >
          🔩
        </a>
        <!-- Traveler -->
        <a
          href="/static/traveler-detail.html?lot_id=${encodeURIComponent(
            lotId
          )}"
          title="Traveler"
          style="text-decoration:none;"
          target="_blank"
        >
          🧾
        </a>

       

        <!-- Shipment -->
        <a
          href="/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
            lotId
          )}"
          title="Shipment"
          style="text-decoration:none;"
          target="_blank"
        >
          📦
        </a>
      </div>
    `;
      },
    },
    // {
    //   title: "Ship",
    //   width: 110,
    //   field: "lot_shipped_qty",
    //   hozAlign: "center",

    //   formatter: (cell) => {
    //     const d = cell.getRow().getData();
    //     const shipped = d.lot_shipped_qty ?? 0;

    //     if (!d.lot_id) return shipped;

    //     const url = `http://100.88.56.126:9000/static/manage-lot-shippments.html?lot_id=${d.lot_id}`;

    //     return `
    //       <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
    //         <span>${shipped}</span>
    //         <a href="${url}"
    //            target="_blank"
    //            title="Open shipment"
    //            style="text-decoration:none; font-size:14px;">
    //            📦
    //         </a>
    //       </div>
    //     `;
    //   }
    // },
    {
      title: "Ship/PO(Rem)",
      width: 170,
      hozAlign: "center",
      formatter: (cell) => {
        const r = cell.getRow().getData();

        const shipped = r.po_shipped_total ?? 0;
        const total = r.po_qty_total ?? 0;
        const remain = r.po_remaining_qty ?? total - shipped;

        // สีตามสถานะ
        let bg = "#6b7280"; // gray
        if (shipped === 0) bg = "#ef4444"; // not shipped
        else if (remain > 0) bg = "#f59e0b"; // partial
        else if (remain === 0) bg = "#10b981"; // complete
        else bg = "#7c3aed"; // overship

        // format remain
        const remText = remain < 0 ? `-${Math.abs(remain)}` : remain;

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
    },

    // /* ===== LOT STATUS ===== */
    // {
    //   title: "Lot Status",
    //   field: "lot_status",
    //   width: 120,
    //   formatter: (cell) => {
    //     const v = cell.getValue();
    //     const colors = {
    //       not_start: "#6b7280",
    //       in_process: "#3b82f6",
    //       hold: "#f59e0b",
    //       completed: "#10b981",
    //       canceled: "#ef4444",
    //     };
    //     return `<span style="
    //       background:${colors[v]};
    //       color:white;
    //       padding:4px 8px;
    //       border-radius:6px;
    //       font-weight:600;">
    //       ${v}
    //     </span>`;
    //   },
    // },

    {
      title: "Lot Status",
      field: "lot_status",
      width: 150,
      hozAlign: "center",

      editor: "select",
      editorParams: {
        values: {
          not_start: "Not Start",
          in_process: "In Process",
          hold: "Hold",
          completed: "Completed",
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
          canceled: "#ef4444",
        };

        return `<span style="
      background:${colors[v] || "#6b7280"};
      color:white;
      padding:4px 8px;
      border-radius:6px;
      font-weight:600;
      display:inline-block;
      min-width:90px;
      text-align:center;
    ">
      ${v ?? ""}
    </span>`;
      },

      cellEdited: async (cell) => {
        const newStatus = cell.getValue();
        const oldStatus = cell.getOldValue();
        const row = cell.getRow().getData();

        if (newStatus === oldStatus) return;

        try {
          await jfetch(`/api/v1/lots/${row.lot_id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });

          toast("Lot status updated", true);
        } catch (err) {
          toast("Update failed", false);
          // rollback
          cell.setValue(oldStatus, true);
          console.error(err);
        }
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
    table.addFilter(
      (d) =>
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
    console.log(res);
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
