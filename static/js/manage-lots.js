// /static/js/manage-parts-lots.js
import { $, jfetch, showToast as toast, initTopbar } from "./api.js";

// ---------- helpers ----------
function fmtQty(v) {
  if (v == null) return "";
  return Number(v).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleDateString();
}

let table = null;
let allRows = [];

// ---------------------------------------------------------------------
// LOAD ALL LOTS (ทุก Part ทุก Lot)
// ---------------------------------------------------------------------
async function fetchAllLots() {
  try {
    // ดึงครั้งเดียว 5000 records พอ (หรือจะทำ keyset ก็ได้)
    const res = await jfetch("/lots?page=1&per_page=100");

    if (!res?.items) return [];

    // แปลง ProductionLotOut → ให้เข้ากับ table columns ที่ Tony ใช้ใน part-detail
    const rows = res.items.map((lot) => ({
      lot_id: lot.id,
      lot_no: lot.lot_no,
      lot_qty: lot.planned_qty,
      lot_due_date: lot.finished_at,

      // ⭐ NEW
      part_no: lot.part?.part_no || "",
      part_name: lot.part?.name || "",

      po_id: lot.po?.id || null,
      po_number: lot.po?.po_number || null,
      qty: lot.po?.qty || null,
      po_due_date: lot.po_due_date || null,
      ship_qty: lot.shipped_qty || null,
    }));

    return rows;
  } catch (err) {
    toast("Failed to load lots: " + err.message, false);
    return [];
  }
}

// ---------------------------------------------------------------------
// TABLE
// ---------------------------------------------------------------------
function initTable() {
  table = new Tabulator("#p_table", {
    layout: "fitColumns",
    height: "auto",
    placeholder: "No rows",
    index: "lot_no",
    pagination: false,

    columns: [
      {
        title: "Lot Number",
        field: "lot_no",
        minWidth: 120,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          if (!row.lot_id) return row.lot_no;

          return `
            <a href="/static/lot-detail.html?lot_id=${row.lot_id}"
               style="color:#2563eb; text-decoration:underline">
               ${row.lot_no}
            </a>`;
        },
        cellClick: (e, cell) => {
          e.preventDefault();
          const lotId = cell.getRow().getData().lot_id;
          if (!lotId) return toast("No lot ID found", false);
          window.location.href =
            `/static/lot-detail.html?lot_id=${encodeURIComponent(lotId)}`;
        },
      },
      {
        title: "Part No",
        field: "part_no",
        minWidth: 140,
      },

      {
        title: "Part Name",
        field: "part_name",
        minWidth: 200,
      },

      {
        title: "PO No",
        width: 100,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          if (!row.po_id) return row.po_number || "—";
          return `
            <a href="/static/manage-pos-detail.html?id=${row.po_id}"
               style="color:#2563eb; text-decoration:underline">
               ${row.po_number}
            </a>`;
        },
        cellClick: (e, cell) => {
          e.preventDefault();
          const poId = cell.getRow().getData().po_id;
          if (!poId) return toast("No PO ID found", false);
          window.location.href =
            `/static/manage-pos-detail.html?id=${encodeURIComponent(poId)}`;
        },
      },

      { title: "Prod Qty", field: "lot_qty", width: 100, hozAlign: "right", formatter: (c) => fmtQty(c.getValue()) },
      { title: "Prod allocate", field: "lot_qty", width: 100, hozAlign: "right", formatter: (c) => fmtQty(c.getValue()) },

      {
        title: "Prod Date",
        field: "lot_due_date",
        minWidth: 100,
        sorter: "date",
        formatter: (c) => fmtDate(c.getValue()),
      },

      { title: "PO Qty", field: "qty", width: 110, hozAlign: "right", formatter: (c) => fmtQty(c.getValue()) },

      {
        title: "PO Date",
        field: "po_due_date",
        minWidth: 130,
        sorter: "date",
        formatter: (c) => fmtDate(c.getValue()),
      },

      {
        title: "Ship Qty",
        field: "ship_qty",
        width: 110,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      {
        title: "Travelers",
        width: 120,
        formatter: (cell) => {
          const lotId = cell.getRow().getData().lot_id;
          if (!lotId) return "—";
          return `<a href="#" style="color:#2563eb; text-decoration:underline">Travelers</a>`;
        },
        cellClick: async (e, cell) => {
          e.preventDefault();
          const lotId = cell.getRow().getData().lot_id;
          if (!lotId) return toast("No lot ID found", false);

          try {
            const res = await fetch(
              `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/material-id`
            );
            const data = await res.json();
            if (!data.traveler_id) return toast("Traveler not found", false);

            window.location.href =
              `/static/traveler-detail.html?id=${data.traveler_id}`;
          } catch (err) {
            toast("Failed to load traveler", false);
          }
        },
      },

      {
        title: "Materials",
        width: 120,
        formatter: (cell) => {
          const lotId = cell.getRow().getData().lot_id;
          if (!lotId) return "—";
          return `<a href="/static/manage-lot-materials.html?lot_id=${lotId}"
                    style="color:#2563eb; text-decoration:underline">Materials</a>`;
        },
      },

      {
        title: "Shippments",
        width: 120,
        formatter: (cell) => {
          const lotId = cell.getRow().getData().lot_id;
          if (!lotId) return "—";
          return `<a href="/static/manage-lot-shippments.html?lot_id=${lotId}"
                    style="color:#2563eb; text-decoration:underline">Shippments</a>`;
        },
      },

      { title: "FAIR", field: "", minWidth: 50 },
      { title: "*Remark Product Control", field: "", minWidth: 100 },
      { title: "Tracking no.", field: "", minWidth: 100 },
      { title: "Real Shipped Date", field: "", minWidth: 100 },
      { title: "INCOMING STOCK", field: "", minWidth: 100 },
    ],
  });
}

// ---------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTopbar?.();
  initTable();

  allRows = await fetchAllLots();
  table.setData(allRows);
});
