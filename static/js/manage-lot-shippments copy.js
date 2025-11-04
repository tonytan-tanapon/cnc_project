// /static/js/manage-lot-shippments.js
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const lotId = new URLSearchParams(location.search).get("lot_id");
if (!lotId) {
  toast("Missing lot_id in URL", false);
  throw new Error("Missing lot_id");
}

const ENDPOINTS = {
  lotHeader: `/api/v1/lot-shippments/lot/${encodeURIComponent(lotId)}/header`,
  lotShipments: `/api/v1/lot-shippments/${encodeURIComponent(lotId)}`,
  createShipment: `/api/v1/lot-shippments`,
  shipmentHistory: `/api/v1/lot-shippments/history/${encodeURIComponent(
    lotId
  )}`,
  partInventory: `/api/v1/lot-shippments/lot/${encodeURIComponent(
    lotId
  )}/part-inventory/all`, // ✅ new endpoint (ทุก lot ของ part เดียวกัน)
  allocatePart: `/api/v1/lot-shippments/allocate-part`, // ✅ new
  returnPart: `/api/v1/lot-shippments/return-part`, // ✅ new
};

/* ===== STATE ===== */
let tablePart = null;
let tableShipment = null;

/* ===== LOAD PART INVENTORY ===== */
async function loadPartInventory() {
  try {
    const data = await jfetch(ENDPOINTS.partInventory);
    tablePart.setData(data); // ✅ now an array of many lots
  } catch (err) {
    console.error("❌ loadPartInventory:", err);
    toast("Failed to load part inventory", false);
  }
}

/* ===== INIT PART TABLE ===== */
function initPartTable() {
  console.log("Initializing part inventory table...");
  tablePart = new Tabulator("#partTable", {
    layout: "fitColumns",
    placeholder: "No part inventory data",
    columns: [
      { title: "Lot No", field: "lot_no", width: 120 }, // ✅ added
      { title: "Part No", field: "part_no" },
      { title: "Planned Qty", field: "planned_qty", hozAlign: "right" },
      { title: "Shipped Qty", field: "shipped_qty", hozAlign: "right" },
      { title: "Available", field: "available_qty", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80, hozAlign: "center" },

      // ✅ NEW: user editable quantity column
      {
        title: "QTY",
        field: "qty_input",
        editor: "number",
        hozAlign: "right",
        width: 100,
        editorParams: { step: "0.01", min: 0 },
      },
      {
        title: "Progress",
        field: "progress_percent",
        hozAlign: "right",
        formatter: (cell) => {
          const v = cell.getValue() || 0;
          const bar = `<div style="background:#e5e7eb;border-radius:4px;height:8px;position:relative;">
      <div style="background:#10b981;width:${v}%;height:100%;border-radius:4px;"></div>
    </div>`;
          return `${v}%<br>${bar}`;
        },
      },
      {
        title: "Action",
        formatter: (cell) => {
          const row = cell.getRow().getData();
          // ถ้ามี source_lot_ids แสดงว่ามาจาก shipment → ปุ่ม Return
          if (Array.isArray(row.source_lot_ids)) {
            return `<button class="btn-mini btn-red" data-act="return">Return</button>`;
          }
          // ถ้ามี available_qty แสดงว่ามาจาก part inventory → ปุ่ม Allocate
          if (row.available_qty != null) {
            return `<button class="btn-mini btn-green" data-act="allocate">Allocate</button>`;
          }
          return "";
        },
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const act = e.target.dataset.act;

          try {
            // === ✅ Allocate (จาก part inventory) ===
            if (act === "allocate") {
              const qtyValue = Number(row.qty_input || 0);
              if (qtyValue <= 0) {
                toast("⚠️ Invalid quantity to allocate", false);
                return;
              }

              await jfetch(ENDPOINTS.allocatePart, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source_lot_id: Number(row.lot_id),
                  target_lot_id: Number(lotId),
                  qty: qtyValue,
                }),
              });

              toast(`✅ Allocated ${qtyValue} pcs from lot ${row.lot_no}`);
            }

            // === ✅ Return (จาก shipment record) ===
            if (act === "return") {
              const qtyValue = Number(row.qty || 0);
              const source_lot_id = Array.isArray(row.source_lot_ids)
                ? row.source_lot_ids[0]
                : null;

              if (!source_lot_id) {
                toast("❌ Missing source_lot_id in shipment record", false);
                console.warn("Shipment row missing source_lot_ids:", row);
                return;
              }

              if (qtyValue <= 0) {
                toast("⚠️ Invalid quantity to return", false);
                return;
              }

              await jfetch(ENDPOINTS.returnPart, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source_lot_id: source_lot_id,
                  target_lot_id: Number(lotId),
                  qty: qtyValue,
                }),
              });

              toast(`↩️ Returned ${qtyValue} parts from lot ${source_lot_id}`);
            }

            // === Reload after success ===
            await Promise.all([
              loadPartInventory(),
              loadShipmentTable(),
              loadLotHeader(),
            ]);
          } catch (err) {
            console.error("❌ Action failed:", err);
            toast(err?.message || "Action failed", false);
          }
        },
      },
    ],
  });

  loadPartInventory();
}

/* ===== LOAD LOT HEADER ===== */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    const hdr = document.getElementById("lotHeader");
    hdr.innerHTML = `
      <div class="lot-grid">
        <div><b>Lot No:</b> ${lot.lot_no}</div>
        <div><b>Part No:</b> ${lot.part?.part_no ?? "-"}</div>
        <div><b>Planned Qty:</b> ${lot.planned_qty ?? "?"}</div>
        <div><b>Finished Qty:</b> ${lot.finished_qty ?? "-"}</div>
        <div><b>Status:</b> ${lot.status ?? "-"}</div>
        <div><b>Due Date:</b> ${
          lot.due_date ? new Date(lot.due_date).toLocaleDateString() : "-"
        }</div>
      </div>
    `;
    document.title = `Lot ${lot.lot_no} · Shipments`;
  } catch (err) {
    console.error("❌ loadLotHeader:", err);
    toast("Failed to load lot info", false);
  }
}

/* ===== INIT SHIPMENT TABLE ===== */
function initShipmentTable() {
  tableShipment = new Tabulator("#shipmentTable", {
    layout: "fitColumns",
    placeholder: "No shipment data",
    columns: [
      { title: "ID", field: "id", visible: false },
      { title: "Shipment No", field: "shipment_no" },
      {
        title: "Date",
        field: "date",
        formatter: (cell) => new Date(cell.getValue()).toLocaleDateString(),
      },
      { title: "Customer", field: "customer_name" },
      { title: "Qty", field: "qty", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80, hozAlign: "center" },
      {
        title: "Status",
        field: "status",
        editor: "select", // ✅ ให้แก้ไขได้
        editorParams: {
          values: {
            pending: "Pending",
            shipped: "Shipped",
            cancelled: "Cancelled",
          },
        },
        formatter: (cell) => {
          const val = cell.getValue();
          let color = "#9ca3af"; // gray as default
          if (val === "pending") color = "#fbbf24"; // yellow
          else if (val === "shipped") color = "#22c55e"; // green
          else if (val === "cancelled") color = "#ef4444"; // red
          return `<span style="
      background:${color};
      color:#fff;
      padding:3px 8px;
      border-radius:6px;
      font-size:13px;
      text-transform:capitalize;
    ">${val || "-"}</span>`;
        },
        cellEdited: async (cell) => {
          const row = cell.getRow().getData();
          const newStatus = cell.getValue();
          try {
            await jfetch(`/api/v1/lot-shippments/${row.id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus }),
            });
            toast(`✅ Updated to ${newStatus}`);
          } catch (err) {
            toast(err?.message || "Failed to update status", false);
            cell.restoreOldValue(); // rollback on fail
          }
        },
      },

      {
        title: "Action",
        formatter: () =>
          `<button class="btn-mini btn-red" data-act="return">Return</button>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const qtyValue = Number(row.qty || 0);

          // ✅ ใช้ source_lot_ids จาก backend
          const source_lot_id = Array.isArray(row.source_lot_ids)
            ? row.source_lot_ids[0]
            : null;

          if (!source_lot_id) {
            toast("❌ Missing source_lot_id in shipment record", false);
            console.warn("Shipment row missing source_lot_ids:", row);
            return;
          }

          if (qtyValue <= 0) {
            toast("⚠️ Invalid quantity to return", false);
            return;
          }

          try {
            await jfetch(ENDPOINTS.returnPart, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source_lot_id: source_lot_id,
                target_lot_id: Number(lotId),
                qty: qtyValue,
              }),
            });

            toast(`↩️ Returned ${qtyValue} parts from lot ${source_lot_id}`);

            await Promise.all([
              loadPartInventory(),
              loadShipmentTable(),
              loadLotHeader(),
            ]);
          } catch (err) {
            console.error("❌ Return failed:", err);
            toast(err?.message || "Return failed", false);
          }
        },
      },
    ],
  });

  loadShipmentTable();
}

/* ===== LOAD SHIPMENT TABLE ===== */
async function loadShipmentTable() {
  try {
    const res = await jfetch(ENDPOINTS.lotShipments);
    tableShipment.setData(res);
  } catch (err) {
    console.error("❌ loadShipmentTable:", err);
    toast(err?.message || "Failed to load shipments", false);
  }
}

/* ===== TOOLBAR ACTIONS ===== */
function initToolbar() {
  const btnCreateShipment = document.getElementById("btnCreateShipment");
  const btnViewHistory = document.getElementById("btnViewHistory");

  if (!btnCreateShipment || !btnViewHistory) {
    console.warn("⚠️ Toolbar buttons not found");
    return;
  }

  btnCreateShipment.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.createShipment, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot_id: Number(lotId) }),
      });
      toast("🚚 New Shipment Created");
      await loadShipmentTable();
      await loadLotHeader();
    } catch (err) {
      toast(err?.message || "Create shipment failed", false);
    }
  });

  btnViewHistory.addEventListener("click", async () => {
    try {
      const res = await jfetch(ENDPOINTS.shipmentHistory);
      if (!res.length) {
        toast("No shipment history found");
      } else {
        toast("📜 Viewing shipment history");
      }
      tableShipment.setData(res);
    } catch (err) {
      toast(err?.message || "Failed to load history", false);
    }
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadLotHeader();
    initPartTable(); // ✅ show part inventory
    initShipmentTable(); // ✅ show shipment list
    initToolbar();
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    toast("Initialization error", false);
  }
});
